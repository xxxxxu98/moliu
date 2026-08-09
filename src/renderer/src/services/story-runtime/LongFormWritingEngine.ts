import type {
  ContinuityIssue,
  ContinuityReport,
  ExtractedFacts,
  FactExtractor,
  LongFormWriteInput,
  LongFormWriteResult,
  SceneDraft,
  StoryEntity,
  StructuredAI,
} from '@/types/story-runtime';

import { AIChapterJudge } from './AIChapterJudge';
import { canonicalizeExtractedFacts } from './FactCanonicalizer';
import {
  ChapterCommitService,
  type ChapterCommitPort,
} from './ChapterCommitService';
import { ContextPackBuilder } from './ContextPackBuilder';
import { ContinuityValidator } from './ContinuityValidator';
import { enrichRevisionHint, healChapterContract } from './contractHealth';
import { SceneBeatPlanner } from './SceneBeatPlanner';
import { SceneDraftEngine } from './SceneDraftEngine';
import { sanitizeSceneDraftParagraphs } from './stripDraftLeakage';
import {
  buildCondensePrompt,
  buildWordCountShortfallIssue,
  checkWordCountBounds,
  chooseProseAfterCondense,
} from '@/services/writing/supplement';
import {
  classifyError,
  backoffDelayMs,
  type ClassifiedError,
} from '@/utils/ai-error-classify';
import { normalizedSimilarity } from '@/utils/text-similarity';

/** 审核失败后的默认最大重写次数（不含初稿） */
export const DEFAULT_MAX_REWRITE_ROUNDS = 2;

/**
 * 步骤级瞬态重试：把单步 AI 调用包一层，瞬态错误（网络/超时/截断/5xx/429）重试 maxRetries 次，
 * 持久错误（schema/审核/4xx）立即抛出。重试仅针对单步，已生成的产物（如 draft）由调用方保留复用。
 */
async function runStepWithTransientRetry<T>(
  step: (attempt: number) => Promise<T>,
  options: { label: string; maxRetries: number; signal?: AbortSignal }
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await step(attempt);
    } catch (err) {
      lastError = err;
      // 用户取消立即抛
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const classified: ClassifiedError = classifyError(err, options.signal);
      // 非瞬态（持久错误）：不重试，直接抛
      if (!classified.transient || attempt >= options.maxRetries) {
        throw err;
      }
      const delayMs = backoffDelayMs(attempt + 1, 2000, 10_000);
      console.warn(
        `[LongFormWritingEngine] ${options.label} 瞬态失败（${classified.kind}），${delayMs}ms 后重试 ${attempt + 1}/${options.maxRetries}`
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface LongFormWritingEngineDependencies {
  ai: StructuredAI;
  factExtractor: FactExtractor;
  commitPort: ChapterCommitPort;
  planner?: SceneBeatPlanner;
  contextBuilder?: ContextPackBuilder;
  validator?: ContinuityValidator;
}

function draftsProse(drafts: SceneDraft[]): string {
  return drafts.flatMap(draft => draft.paragraphs).join('\n\n');
}

/**
 * 从状态实体表提取角色名白名单（name + aliases），用于注入起草 prompt。
 * 取完整角色库（未被 context 压缩筛选），覆盖面最广，从源头约束模型只用已登记名字。
 */
function extractCharacterNames(
  entities: Record<string, StoryEntity> | undefined,
): string[] {
  if (!entities) return [];
  const names: string[] = [];
  for (const entity of Object.values(entities)) {
    if (entity.kind !== 'character') continue;
    const name = entity.name?.trim();
    if (name) names.push(name);
    for (const alias of entity.aliases ?? []) {
      const trimmed = alias.trim();
      if (trimmed && !names.includes(trimmed)) names.push(trimmed);
    }
  }
  return names;
}

/**
 * 从审核问题生成重写提示；优先 blocking，其次 warning。
 */
export function buildRevisionHintsFromReport(report: ContinuityReport): string[] {
  const ranked = [...report.issues].sort((a, b) => {
    const rank = (issue: ContinuityIssue): number =>
      issue.severity === 'blocking' ? 0 : issue.severity === 'warning' ? 1 : 2;
    return rank(a) - rank(b);
  });

  return ranked
    .slice(0, 8)
    .map(issue => {
      const evidence = issue.evidence
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 2);
      return enrichRevisionHint(issue.message, evidence);
    })
    .filter(Boolean);
}

function shouldRewrite(report: ContinuityReport): boolean {
  if (report.accepted) return false;
  return report.issues.some(
    issue => issue.severity === 'blocking' || issue.severity === 'warning'
  );
}

export class LongFormWritingEngine {
  private readonly planner: SceneBeatPlanner;
  private readonly contextBuilder: ContextPackBuilder;
  private readonly draftEngine: SceneDraftEngine;
  private readonly validator: ContinuityValidator;
  private readonly commitService: ChapterCommitService;

  constructor(private readonly dependencies: LongFormWritingEngineDependencies) {
    this.planner = dependencies.planner ?? new SceneBeatPlanner();
    this.contextBuilder = dependencies.contextBuilder ?? new ContextPackBuilder();
    this.draftEngine = new SceneDraftEngine(dependencies.ai);
    this.validator =
      dependencies.validator ??
      new ContinuityValidator({
        chapterJudge: new AIChapterJudge(dependencies.ai),
        enableDeepSemantic: true,
      });
    this.commitService = new ChapterCommitService(dependencies.commitPort);
  }

  async write(input: LongFormWriteInput): Promise<LongFormWriteResult> {
    const maxRewriteRounds = Math.max(
      0,
      input.maxRewriteRounds ?? DEFAULT_MAX_REWRITE_ROUNDS
    );

    // 写作前再按已兑现事件去重 mustCover/CPN，并二次软化禁区
    const { chapter: healedChapter, report: healthReport } = healChapterContract(
      input.contracts.chapter,
      { state: input.state }
    );
    if (healthReport.notes.length > 0) {
      console.info(
        `[LongFormWritingEngine] ch${healedChapter.chapterNumber} 合同健康度:`,
        healthReport.notes.join('；')
      );
    }
    const contracts = {
      ...input.contracts,
      chapter: healedChapter,
      review: {
        ...input.contracts.review,
        mustCheck: [
          ...new Set([
            ...healedChapter.mustCover,
            ...input.contracts.review.mustCheck.filter(
              item => !healthReport.prunedMustCover.includes(item)
            ),
          ]),
        ],
      },
    };

    const plan = this.planner.plan({
      chapter: contracts.chapter,
      state: input.state,
      overlay: input.overlay,
    });
    const context = this.contextBuilder.build({
      contracts,
      state: input.state,
      overlay: input.overlay,
      recentScenes: input.recentScenes,
      retrievedScenes: input.retrievedScenes,
      styleGuidance: input.styleGuidance,
      maxTokens: input.maxContextTokens,
    });

    const writeInput: LongFormWriteInput = { ...input, contracts };

    let drafts: SceneDraft[] = [];
    let facts: ExtractedFacts = { events: [], deltas: [], evidence: [] };
    let report: ContinuityReport = {
      accepted: false,
      issues: [],
      checkedDomains: [],
    };
    let rewriteRounds = 0;
    // 批量层重试可能传入「上一轮失败教训」种子：初稿即带反馈，避免盲目重跑。
    // 种子只影响首次起草；后续重写循环会用本轮 report 追加新 hints 覆盖。
    let revisionHints: string[] | undefined = writeInput.seedRevisionHints;
    // 连环重写熔断：记录上一轮 blocking issue，用于检测是否「卡在同一问题」。
    // 字数类问题（word-count-short:*）每轮数值变化会干扰判定，比较时排除。
    let prevBlockingIssues: ContinuityIssue[] = [];

    while (true) {
      // Step A：起草 + 补字。瞬态错误（网络/截断）步骤级重试，持久错误冒泡。
      drafts = await runStepWithTransientRetry(
        async (attempt: number) => {
          // 截断/空响应重试时注入引导：让模型这次输出完整 JSON 与全章正文，而非原样盲发。
          // attempt=0 是首次调用，不追加；attempt>=1 是瞬态重试，追加截断引导。
          const draftHints =
            attempt > 0
              ? [
                  ...(revisionHints ?? []),
                  '上次输出被截断或返回了空内容。请务必一次性输出完整的 JSON 对象，paragraphs 数组必须包含完整的正文段落，不要中途停笔，不要返回空字符串。',
                ]
              : revisionHints;
          const d = await this.draftEngine.draft(plan, context, {
            targetWordCount: writeInput.targetWordCount,
            revisionHints: draftHints,
            rewriteRound: revisionHints ? Math.max(1, rewriteRounds) : undefined,
            // 完整角色库（未被 context 压缩筛选），注入 prompt 白名单约束名字一致性
            allowedCharacterNames: extractCharacterNames(input.state.entities),
          });
          // 提交前进补字：避免 SQLite accepted 后仍只有 ~900 字
          return this.padDraftsToTarget(d, writeInput);
        },
        { label: 'draft+pad', maxRetries: 1 }
      );

      // Step B：事实提取 + 规范化 + 校验。瞬态错误步骤级重试，**保留 Step A 已生成的 drafts**
      // （旧痛点：draft 已花钱生成，extract 网络抖一下就让整章作废重新起草）。
      const validated = await runStepWithTransientRetry(
        async (_attempt: number) => {
          const rawFacts = await this.dependencies.factExtractor.extract({
            projectId: input.projectId,
            chapterNumber: contracts.chapter.chapterNumber,
            sceneDrafts: drafts,
            state: input.state,
            overlay: input.overlay,
          });
          // 提取层输出 ≠ 校验契约输入：必须先 canonicalize 再 validate
          const canonical = canonicalizeExtractedFacts({
            facts: rawFacts,
            state: input.state,
            drafts,
            overlay: input.overlay,
          });
          const r = await this.validator.validate({
            contracts,
            state: canonical.stateForValidation,
            drafts,
            facts: canonical.facts,
          });
          return { facts: canonical.facts, report: r };
        },
        { label: 'extract+validate', maxRetries: 2 }
      );
      facts = validated.facts;
      report = validated.report;

      // 字数下限未达标也视为 blocking，驱动重写；用尽轮次后则拒收提交
      const target = writeInput.targetWordCount ?? 0;
      const shortfall = buildWordCountShortfallIssue(draftsProse(drafts), target);
      if (shortfall) {
        report = {
          accepted: false,
          issues: [
            ...report.issues.filter(issue => !issue.id.startsWith('word-count-short:')),
            shortfall,
          ],
          checkedDomains: report.checkedDomains.includes('fulfillment')
            ? report.checkedDomains
            : [...report.checkedDomains, 'fulfillment'],
        };
      }

      if (!shouldRewrite(report) || rewriteRounds >= maxRewriteRounds) {
        break;
      }

      // 连环重写熔断：本轮 blocking issue 与上一轮高度相似 → 判定「卡在同一问题」，
      // 停止重写（仍保持 report.accepted=false，走 rejected 分支，让批次层决定去留）。
      // 字数类问题 id 含动态数字、每轮变化，会误判为「新问题」，比较前排除。
      const currentBlocking = report.issues.filter(
        issue =>
          issue.severity === 'blocking' &&
          !issue.id.startsWith('word-count-short:'),
      );
      if (
        rewriteRounds > 0 &&
        prevBlockingIssues.length > 0 &&
        currentBlocking.length > 0
      ) {
        const stuckCount = currentBlocking.filter(cur =>
          prevBlockingIssues.some(
            prev => normalizedSimilarity(cur.message, prev.message) >= 0.7,
          ),
        ).length;
        const stuckRatio = stuckCount / currentBlocking.length;
        if (stuckRatio >= 0.5) {
          console.warn(
            `[LongFormWritingEngine] 连环重写熔断：本轮 ${stuckCount}/${currentBlocking.length} 个 blocking 问题与上轮高度相似（卡在同一问题），停止重写（仍 rejected 提交）`,
          );
          break;
        }
      }
      prevBlockingIssues = currentBlocking;

      const hints = buildRevisionHintsFromReport(report);
      if (hints.length === 0) {
        break;
      }

      rewriteRounds += 1;
      revisionHints = hints;
      console.info(
        `[LongFormWritingEngine] 审核未通过，开始第 ${rewriteRounds}/${maxRewriteRounds} 次重写`,
        hints.slice(0, 3)
      );
    }

    // 重写循环用尽后：字数不再拒收提交。移除 word-count-short blocking（字数不足已交由重写循环
    // 尝试扩写，仍不达标则尊重 AI 产出），让章节按实际内容质量落库（其他 blocking 仍 rejected）。
    // 偏短的代价是「章节偏短」而非拒收——与偏长「压缩失败直接用」对称，保证正文不被硬凑破坏。
    const issuesWithoutWordCount = report.issues.filter(
      issue => !issue.id.startsWith('word-count-short:')
    );
    report = {
      accepted: !issuesWithoutWordCount.some(issue => issue.severity === 'blocking'),
      issues: issuesWithoutWordCount,
      checkedDomains: report.checkedDomains,
    };

    const { commit, receipt } = await this.commitService.commit({
      projectId: input.projectId,
      state: input.state,
      previousOverlay: input.overlay,
      contracts,
      drafts,
      facts,
      report,
    });
    return {
      plan,
      context,
      drafts,
      facts,
      report,
      commit,
      receipt,
      rewriteRounds,
    };
  }

  /**
   * 字数归一：超长走 AI 整章压缩改写（文气统一）；偏短直接用初稿，不补字追加。
   * 补字会在尾部拼接段落、割裂文气（对称于偏长的硬裁掐断），故统一移除：
   * 字数不足交由重写循环（AI 整章重新生成）处理，重写后仍不达标则直接提交，保证正文质量。
   */
  private async padDraftsToTarget(
    drafts: SceneDraft[],
    input: LongFormWriteInput
  ): Promise<SceneDraft[]> {
    const target = input.targetWordCount ?? 0;
    if (target <= 0 || drafts.length === 0) {
      return drafts;
    }

    const nextDrafts = drafts.map(draft => ({
      ...draft,
      paragraphs: [...draft.paragraphs],
    }));

    // 仅超长走 AI 压缩；偏短直接返回初稿（不补字、不编辑正文，优先质量）
    const bounds = checkWordCountBounds(draftsProse(nextDrafts), target);
    if (bounds.status === 'over') {
      return this.trimDraftsIfOverTarget(nextDrafts, input);
    }
    return nextDrafts;
  }

  /**
   * 超上限时先 AI 压缩改写一轮；压过短回退原文（不裁）；仍超则用压缩稿（不裁）。优先正文质量。
   */
  private async trimDraftsIfOverTarget(
    drafts: SceneDraft[],
    input: LongFormWriteInput
  ): Promise<SceneDraft[]> {
    const target = input.targetWordCount ?? 0;
    if (target <= 0 || drafts.length === 0) {
      return drafts;
    }

    const nextDrafts = drafts.map(draft => ({
      ...draft,
      paragraphs: [...draft.paragraphs],
    }));
    const originalProse = draftsProse(nextDrafts);
    let bounds = checkWordCountBounds(originalProse, target);
    if (bounds.status !== 'over') {
      return nextDrafts;
    }

    // 输出护栏：正文异常膨胀（AI 失控狂输出，实测可达数十万字符）时，
    // 不再把巨型文本发给 AI 压缩（prompt token 爆炸），也不硬裁（掐断正文破坏文气），
    // 直接保留原文落库（偏长但完整，与压缩失败「直接用」对称）。
    const hardClampChars = Math.max(12000, target * 8);
    if (originalProse.length > hardClampChars) {
      console.warn(
        `[LongFormWritingEngine] 正文异常膨胀（${originalProse.length} 字符 > ${hardClampChars}），跳过 AI 压缩，保留原文（偏长但完整，不硬裁）`
      );
      return nextDrafts;
    }

    const outline =
      input.contracts.chapter.goal ||
      input.contracts.chapter.CBN ||
      input.contracts.chapter.CEN;

    let condensedProse: string | null = null;
    try {
      const condensedParagraphs = (await this.dependencies.ai.generate<string[]>({
        purpose: 'scene-draft',
        schemaName: 'CondenseParagraphs',
        system: [
          '你是网文压缩改写引擎。只输出一个 JSON 对象：{"paragraphs":["段落1","段落2"]}',
          `当前约 ${bounds.currentWords} 字，必须压缩到 ${bounds.minWords}–${bounds.maxWords} 字（目标 ${target}）。`,
          `严禁压到低于 ${bounds.minWords} 字；删注水即可，不要压成剧情梗概。`,
          '保留全部关键情节与章末钩子；不要输出 Markdown 代码块或解释。',
        ].join('\n'),
        prompt: buildCondensePrompt({
          existingContent: originalProse,
          targetWordCount: target,
          minWords: bounds.minWords,
          maxWords: bounds.maxWords,
          chapterTitle: input.contracts.chapter.title,
          chapterOutline: outline,
        }),
        parse: value => {
          const record =
            typeof value === 'object' && value !== null && !Array.isArray(value)
              ? (value as Record<string, unknown>)
              : {};
          const raw = record.paragraphs ?? record['段落'] ?? value;
          const paragraphs = sanitizeSceneDraftParagraphs(
            Array.isArray(raw)
              ? raw.filter((item): item is string => typeof item === 'string')
              : typeof raw === 'string'
                ? raw.split(/\n{2,}/u)
                : []
          );
          if (paragraphs.length === 0) {
            throw new Error('压缩改写未返回可用段落');
          }
          return paragraphs;
        },
      })) as string[];

      if (condensedParagraphs.length > 0) {
        condensedProse = condensedParagraphs.join('\n\n');
      }
    } catch (error) {
      console.warn('[LongFormWritingEngine] 超长压缩失败，将硬裁到上限:', error);
    }

    const chosen = chooseProseAfterCondense({
      originalProse,
      condensedProse: condensedProse ?? originalProse,
      target,
    });

    if (chosen.strategy === 'original-kept') {
      console.warn(
        `[LongFormWritingEngine] AI 压缩过度（→${checkWordCountBounds(condensedProse ?? '', target).currentWords} 字），回退原文不再硬裁（优先正文质量）`
      );
    } else if (chosen.strategy === 'condensed-kept') {
      console.info(
        `[LongFormWritingEngine] AI 压缩后仍超上限（${chosen.bounds.currentWords}/${bounds.maxWords}），保留压缩稿不再硬裁（优先正文质量）`
      );
    }

    const paragraphs = sanitizeSceneDraftParagraphs(
      chosen.prose
        .split(/\n{2,}/u)
        .map(part => part.trim())
        .filter(Boolean)
    );
    nextDrafts[0] = {
      ...nextDrafts[0],
      paragraphs: paragraphs.length > 0 ? paragraphs : [chosen.prose],
    };
    nextDrafts.splice(1);
    return nextDrafts;
  }
}
