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
  MAX_SUPPLEMENT_ROUNDS,
  MAX_WORD_THRESHOLD,
  SUPPLEMENT_STOP_THRESHOLD,
  buildCondensePrompt,
  buildSupplementPrompt,
  buildWordCountShortfallIssue,
  checkWordCount,
  checkWordCountBounds,
  chooseProseAfterCondense,
  clampProseToMaxWords,
} from '@/services/writing/supplement';
import { countWords } from '@/services/writing/utils';
import {
  classifyError,
  backoffDelayMs,
  type ClassifiedError,
} from '@/utils/ai-error-classify';

/** 字数归一外层循环：补字 ↔ 压缩，防止压缩过度后不回补 */
const MAX_WORD_NORMALIZE_CYCLES = 2;

/** 审核失败后的默认最大重写次数（不含初稿） */
export const DEFAULT_MAX_REWRITE_ROUNDS = 2;

/**
 * 步骤级瞬态重试：把单步 AI 调用包一层，瞬态错误（网络/超时/截断/5xx/429）重试 maxRetries 次，
 * 持久错误（schema/审核/4xx）立即抛出。重试仅针对单步，已生成的产物（如 draft）由调用方保留复用。
 * 参考 supplement.ts 的 supplementDraftsWhileShort 重试模式。
 */
async function runStepWithTransientRetry<T>(
  step: () => Promise<T>,
  options: { label: string; maxRetries: number; signal?: AbortSignal }
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await step();
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

    while (true) {
      // Step A：起草 + 补字。瞬态错误（网络/截断）步骤级重试，持久错误冒泡。
      drafts = await runStepWithTransientRetry(
        async () => {
          const d = await this.draftEngine.draft(plan, context, {
            targetWordCount: writeInput.targetWordCount,
            revisionHints,
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
        async () => {
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

    // commit 前硬字数兜底：循环内已注入字数 blocking，但补字失败/重写轮次耗尽等路径
    // 可能导致最终 drafts 仍 short（实测 ch1 重写后 countWords 1183 < min 1700 却被 accepted）。
    // 此处独立判定，不再依赖 issue 注入是否命中，short 即强制注入 blocking，
    // 让 ChapterCommitService.commit 走 rejected 分支（兑现「用尽轮次则拒收」的注释承诺）。
    const finalTarget = writeInput.targetWordCount ?? 0;
    const finalShortfall = buildWordCountShortfallIssue(draftsProse(drafts), finalTarget);
    if (finalShortfall) {
      console.warn(
        `[LongFormWritingEngine] 字数兜底拦截：${finalShortfall.evidence.join(' ')}，拒收提交`
      );
      report = {
        accepted: false,
        issues: [
          ...report.issues.filter(issue => !issue.id.startsWith('word-count-short:')),
          finalShortfall,
        ],
        checkedDomains: report.checkedDomains.includes('fulfillment')
          ? report.checkedDomains
          : [...report.checkedDomains, 'fulfillment'],
      };
    }

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
   * 字数归一：不足则补段，超出则压缩（AI）+ 硬裁兜底。
   * 压缩若压得过短会回退原文硬裁，并再补一轮，避免「超长→压缩塌方→直接提交」。
   */
  private async padDraftsToTarget(
    drafts: SceneDraft[],
    input: LongFormWriteInput
  ): Promise<SceneDraft[]> {
    const target = input.targetWordCount ?? 0;
    if (target <= 0 || drafts.length === 0) {
      return drafts;
    }

    let nextDrafts = drafts.map(draft => ({
      ...draft,
      paragraphs: [...draft.paragraphs],
    }));

    for (let cycle = 0; cycle < MAX_WORD_NORMALIZE_CYCLES; cycle += 1) {
      nextDrafts = await this.supplementDraftsWhileShort(nextDrafts, input);
      const bounds = checkWordCountBounds(draftsProse(nextDrafts), target);
      if (bounds.status === 'ok') {
        return nextDrafts;
      }
      if (bounds.status === 'over') {
        nextDrafts = await this.trimDraftsIfOverTarget(nextDrafts, input);
        const after = checkWordCountBounds(draftsProse(nextDrafts), target);
        if (after.status === 'ok') {
          return nextDrafts;
        }
        if (after.status === 'short') {
          console.warn(
            `[LongFormWritingEngine] 压缩/硬裁后字数不足（${after.currentWords}/${after.minWords}），开始回补`
          );
          continue;
        }
        return nextDrafts;
      }
      // 补字后仍 short：跳出外层循环，交由 word-count blocking 驱动重写/拒收
      break;
    }

    return nextDrafts;
  }

  /**
   * 结尾闭合判断：正文是否已充分收尾（CEN 兑现 + 章尾钩子落地）。
   * 用于补写决策——已闭合时即使字数略不足也不再硬塞注水段。
   * 失败容错：AI 异常时返回 {closed:false}，降级为原按字数补写逻辑，不阻断主流程。
   */
  private async judgeEndingClosure(
    prose: string,
    chapterTitle: string,
    CBN: string | undefined,
    CEN: string | undefined,
    mustCover: string[],
  ): Promise<{ closed: boolean; reason: string }> {
    try {
      const result = await this.dependencies.ai.generate<{ closed: boolean; reason: string }>({
        purpose: 'chapter-judge',
        schemaName: 'EndingClosureResult',
        system: [
          '你是网文章节结尾审查员。判断当前正文是否已经形成完整、有收束感的章末，不需要再补写。',
          '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
          '判断标准（全部满足才算 closed=true）：',
          '1. 本章核心冲突/事件（CEN 对应的章尾钩子）已在正文中有可见场面兑现或落到明确转折',
          '2. 正文最后一段已给出章末该有的悬念/压迫/反转/收束，而非突兀中断或仍是中段叙述',
          '3. 不存在明显未写完的半截场景（如对话停在对方开口前、追逐停在半路）',
          '反例（closed=false）：正文停在一个动作中途、CEN 钩子完全没体现、结尾是无关日常闲笔',
          'JSON 字段：{"closed":true,"reason":"CEN已兑现且章末留有悬念"}',
        ].join('\n'),
        prompt: JSON.stringify({
          chapterTitle,
          CBN: CBN ?? '',
          CEN: CEN ?? '',
          mustCover,
          wordCount: prose.length,
          proseTail: prose.slice(-600),
        }),
        parse: value => {
          const record =
            typeof value === 'object' && value !== null && !Array.isArray(value)
              ? (value as Record<string, unknown>)
              : {};
          const closed = record.closed === true;
          const reason =
            typeof record.reason === 'string' && record.reason.trim()
              ? record.reason.trim().slice(0, 80)
              : (closed ? '已闭合' : '未闭合');
          return { closed, reason };
        },
      });
      return result;
    } catch {
      // 判断器失败时降级：不阻断补写，按原字数逻辑继续
      return { closed: false, reason: '判断器失败，降级按字数补写' };
    }
  }

  private async supplementDraftsWhileShort(
    drafts: SceneDraft[],
    input: LongFormWriteInput
  ): Promise<SceneDraft[]> {
    const target = input.targetWordCount ?? 0;
    const nextDrafts = drafts.map(draft => ({
      ...draft,
      paragraphs: [...draft.paragraphs],
    }));
    let prose = draftsProse(nextDrafts);
    let rounds = 0;
    // 同一轮补字连续失败计数（AI 偶发返回非 JSON 时重试，避免直接放弃导致字数不足）
    let consecutiveFailures = 0;
    const MAX_SUPPLEMENT_ATTEMPTS = 3;

    while (rounds < MAX_SUPPLEMENT_ROUNDS) {
      const check = checkWordCount(prose, target);
      if (!check.needsSupplement) {
        break;
      }

      // 结尾闭合判断：正文已完整收尾（CEN 兑现 + 章末钩子落地）且字数达 SUPPLEMENT_STOP_THRESHOLD 时，
      // 不再补写，避免在自然章末后硬塞注水段（实测「陈默冷笑，他早已料到」类尾巴）。
      //
      // 优化：字数 ≥85% 目标时直接收尾（break），跳过 judgeEndingClosure 的 AI 调用——
      // 首稿已写到 85% 说明模型基本写完，再花一次 AI 往返判断"结尾是否闭合"性价比低。
      // 仅在 80%-85% 的窄灰区才调 closure 判断（此时字数擦边，需 AI 辅助决策）。
      // 判断器失败时返回 closed=false，降级为原按字数补写逻辑。
      const fastCloseThreshold = Math.floor(target * 0.85);
      if (check.currentWords >= fastCloseThreshold) {
        break; // ≥85%：信任模型已写完，直接收尾
      }
      if (check.currentWords >= Math.floor(target * SUPPLEMENT_STOP_THRESHOLD)) {
        const closure = await this.judgeEndingClosure(
          prose,
          input.contracts.chapter.title,
          input.contracts.chapter.CBN,
          input.contracts.chapter.CEN,
          input.contracts.chapter.mustCover,
        );
        if (closure.closed) {
          break;
        }
      }

      const maxSupplement = Math.ceil(target * MAX_WORD_THRESHOLD) - check.currentWords;
      if (maxSupplement <= 0) {
        break;
      }

      // 单次补字量取 target 的 50%（原 30%）：target=3000 时一轮补 1500 字而非 900 字，
      // 把「最多 3 轮补字」压缩到 1-2 轮，减少 scene-draft 往返。
      const additionalWords = Math.min(
        check.shortfall || Math.ceil(target * 0.5),
        maxSupplement
      );
      const round = rounds + 1;
      const prompt = buildSupplementPrompt({
        existingContent: prose,
        targetWordCount: target,
        additionalWords,
        round,
        maxRounds: MAX_SUPPLEMENT_ROUNDS,
        chapterTitle: input.contracts.chapter.title,
        chapterOutline:
          input.contracts.chapter.goal ||
          input.contracts.chapter.CBN ||
          input.contracts.chapter.CEN,
        pendingBeats: [
          ...input.contracts.chapter.CPNs,
          ...input.contracts.chapter.mustCover,
          input.contracts.chapter.CEN,
        ],
        outputFormat: 'json',
      });

      try {
        const deltaParagraphs = (await this.dependencies.ai.generate<string[]>({
          purpose: 'scene-draft',
          schemaName: 'SupplementParagraphs',
          system: [
            '你是网文补充续写引擎。只输出一个 JSON 对象：{"paragraphs":["段落1","段落2"]}',
            '从原文结尾自然续写，不要重复已有内容，不要输出 Markdown 代码块或解释。',
            `本次约补充 ${additionalWords} 字。`,
          ].join('\n'),
          prompt,
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
              throw new Error('补充续写未返回可用段落');
            }
            return paragraphs;
          },
        })) as string[];

        if (!deltaParagraphs.length) {
          break;
        }
        // 输出护栏（Bug 7 修复）：单轮补充输出异常膨胀（模型把 JSON 骨架当正文，
        // 实测一轮返回 32 万字符）时丢弃本轮并停止补字，避免垃圾正文入库、
        // 以及后续压缩把巨型文本塞进 prompt 造成的 token 爆炸。
        const deltaChars = deltaParagraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
        const maxDeltaChars = Math.max(6000, Math.ceil(target * 3));
        if (deltaChars > maxDeltaChars) {
          console.warn(
            `[LongFormWritingEngine] 补充输出异常膨胀（${deltaChars} 字符 > ${maxDeltaChars}），丢弃本轮并停止补字`
          );
          break;
        }
        nextDrafts[nextDrafts.length - 1].paragraphs.push(...deltaParagraphs);
        prose = draftsProse(nextDrafts);
        rounds = round;
        consecutiveFailures = 0;
        if (countWords(prose) <= check.currentWords) {
          break;
        }
      } catch (error) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_SUPPLEMENT_ATTEMPTS) {
          console.warn(
            `[LongFormWritingEngine] 第 ${round} 轮补字连续失败 ${consecutiveFailures} 次，停止补字:`,
            error
          );
          break;
        }
        console.warn(
          `[LongFormWritingEngine] 第 ${round} 轮补字失败（${consecutiveFailures}/${MAX_SUPPLEMENT_ATTEMPTS} 次尝试），重试:`,
          error
        );
      }
    }

    return nextDrafts;
  }

  /**
   * 超上限时先 AI 压缩一轮；压过短则回退原文硬裁；仍超则硬裁到 maxWords。
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

    // 输出护栏（Bug 7 修复）：正文异常膨胀（如补充轮混入 JSON 骨架，实测 36 万字符）时，
    // 不再把巨型文本发给 AI 压缩（prompt token 爆炸），直接硬裁到上限。
    const hardClampChars = Math.max(12000, target * 8);
    if (originalProse.length > hardClampChars) {
      console.warn(
        `[LongFormWritingEngine] 正文异常膨胀（${originalProse.length} 字符 > ${hardClampChars}），跳过 AI 压缩直接硬裁`
      );
      const clamped = clampProseToMaxWords(originalProse, bounds.maxWords);
      const clampedParagraphs = sanitizeSceneDraftParagraphs(
        clamped
          .split(/\n{2,}/u)
          .map(part => part.trim())
          .filter(Boolean)
      );
      nextDrafts[0] = {
        ...nextDrafts[0],
        paragraphs: clampedParagraphs.length > 0 ? clampedParagraphs : [clamped],
      };
      nextDrafts.splice(1);
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

    if (chosen.strategy === 'original-clamp') {
      console.warn(
        `[LongFormWritingEngine] 压缩过度（→${checkWordCountBounds(condensedProse ?? '', target).currentWords}），回退原文硬裁到 ${bounds.maxWords}`
      );
    } else if (chosen.strategy === 'condensed-clamp') {
      console.info(
        `[LongFormWritingEngine] 压缩后仍超上限，硬裁至 ${bounds.maxWords}`
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
