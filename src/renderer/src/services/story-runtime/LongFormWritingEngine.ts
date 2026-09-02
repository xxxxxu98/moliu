import type {
  ContinuityIssue,
  ContinuityReport,
  ContractPack,
  ExtractedFacts,
  FactExtractor,
  LongFormWriteInput,
  LongFormWriteResult,
  ResearchDossier,
  ResearchRunSummary,
  RevisionPlan,
  SceneChunk,
  SceneDraft,
  ScenePlan,
  StoryEntity,
  StoryState,
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
import { detectOpeningRepetitionIssue, enrichRevisionHint, healChapterContract } from './contractHealth';
import { SceneBeatPlanner } from './SceneBeatPlanner';
import { SceneDraftEngine } from './SceneDraftEngine';
import { sanitizeSceneDraftParagraphs } from './stripDraftLeakage';
import {
  buildCondensePrompt,
  buildSupplementPrompt,
  buildWordCountBoundsIssue,
  checkWordCountBounds,
  chooseProseAfterCondense,
} from '@/services/writing/supplement';
import { isPlaceholderChapterTitle } from '@/services/writing/chapterTitle';
import { buildTypesettingIssues } from '@/services/writing/typesetting';
import {
  classifyError,
  retryBackoffDelayMs,
  type ClassifiedError,
} from '@/utils/ai-error-classify';
import { normalizedSimilarity } from '@/utils/text-similarity';

/** 审核失败后的默认最大重写次数（不含初稿） */
export const DEFAULT_MAX_REWRITE_ROUNDS = 1;

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
      // 限流走独立退避（15/30/60s 封顶 10s 内的短退避在账户级 429 下只会连吃 429）
      const delayMs = retryBackoffDelayMs(classified.kind, attempt + 1, 2000, 10_000);
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
  validator?: Pick<ContinuityValidator, 'validate'>;
  /**
   * Agent 检索回合(docs/agent-loop-refactor.md §3.1):节拍规划之后、上下文打包
   * 之前执行。未注入时行为与旧版完全一致。失败在引擎内降级为纯基底打包
   * (AbortError 除外,用户取消必须冒泡)。
   */
  research?: AgentResearchStep;
}

export interface AgentResearchStepInput {
  chapterNumber: number;
  contracts: ContractPack;
  plan: ScenePlan;
  state: StoryState;
  /** 全书已提交场景块(read_chapter/search_scenes 数据源);缺省退化为 recentScenes */
  sceneChunks: SceneChunk[];
  recentScenes: SceneChunk[];
}

export interface AgentResearchStep {
  research(input: AgentResearchStepInput): Promise<ResearchDossier>;
}

function isAbortLike(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function draftsProse(drafts: SceneDraft[]): string {
  return drafts.flatMap(draft => draft.paragraphs).join('\n\n');
}

/**
 * 提取近几章的结尾句，用于起草 prompt 的跨章收尾去重约束。
 * 2026-08-21 玄幻 200 章冒烟发现：76/200 章结尾是同一句式的变体复读
 * （如「毅然迎向深渊之下更为凶险的苍溟杀局」连刷 27 章）。单章门禁与章内
 * 台词去重都看不到跨章重复，必须在起草时把「最近写过的收尾」摆到模型眼前。
 * 只取每章最后 ~40 字：比对收尾句式足够，塞全文会挤占上下文预算。
 */
export function extractRecentEndingSnippets(
  scenes: SceneChunk[],
  chapterNumber: number,
  maxChapters = 3
): Array<{ chapterIndex: number; ending: string }> {
  const byChapter = new Map<number, SceneChunk[]>();
  for (const scene of scenes) {
    if (!Number.isInteger(scene.chapterIndex) || scene.chapterIndex <= 0) continue;
    if (scene.chapterIndex >= chapterNumber) continue;
    const list = byChapter.get(scene.chapterIndex) ?? [];
    list.push(scene);
    byChapter.set(scene.chapterIndex, list);
  }
  return [...byChapter.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, maxChapters)
    .map(([chapterIndex, list]) => {
      // 同章多 scene 时取 order 最大的末段文本
      const tailScene = [...list].sort((a, b) => b.order - a.order)[0];
      const ending = (tailScene?.text ?? '').trim().slice(-40).replace(/\s+/g, ' ');
      return { chapterIndex, ending };
    })
    .filter(item => item.ending.length > 0);
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

function extractAllowedAppearanceNames(
  entities: Record<string, StoryEntity> | undefined,
  requestedNames: string[] | undefined,
): string[] {
  if (!entities || !requestedNames?.length) return [];
  const requested = new Set(requestedNames.map(name => name.trim()).filter(Boolean));
  const allowed: string[] = [];
  for (const entity of Object.values(entities)) {
    if (entity.kind !== 'character') continue;
    const names = [entity.name, ...(entity.aliases ?? [])].map(name => name.trim()).filter(Boolean);
    if (!names.some(name => requested.has(name))) continue;
    for (const name of names) {
      if (!allowed.includes(name)) allowed.push(name);
    }
  }
  return allowed;
}

export function buildRevisionPlanFromReport(
  report: ContinuityReport,
  targetWordCount?: number
): RevisionPlan {
  const hints = buildRevisionHintsFromReport(report);
  const hasOverIssue = report.issues.some(issue => issue.id.startsWith('word-count-over'));
  const hasShortIssue = report.issues.some(issue => issue.id.startsWith('word-count-short'));
  const bounds = targetWordCount && targetWordCount > 0
    ? checkWordCountBounds('', targetWordCount)
    : null;
  const mode: RevisionPlan['mode'] = hasOverIssue
    ? 'compress'
    : hasShortIssue
      ? 'expand'
      : 'repair';
  // 压缩轮给模型的目标上限比硬门禁再收紧 10%：模型压字普遍「贴着给的上限」执行，
  // 传硬门禁上限会压出 3540-3600 的擦边稿（40 章实测 3 章压缩后仍超限保留）。
  // 收紧后即使执行打折也落在硬门禁内；硬门禁本身不动（审查范围不变）。
  const maxWordsForMode =
    mode === 'compress' && bounds
      ? Math.max(Math.round(bounds.maxWords * 0.9), Math.round(bounds.minWords * 1.05))
      : bounds?.maxWords;

  return {
    mode,
    hints,
    ...(bounds ? { minWords: bounds.minWords, maxWords: maxWordsForMode } : {}),
  };
}

function buildSeedRevisionPlan(
  hints: string[] | undefined,
  targetWordCount?: number
): RevisionPlan | undefined {
  const normalized = (hints ?? []).map(hint => hint.trim()).filter(Boolean).slice(0, 8);
  if (normalized.length === 0) return undefined;
  const combined = normalized.join('\n');
  const bounds = targetWordCount && targetWordCount > 0
    ? checkWordCountBounds('', targetWordCount)
    : null;
  const mode: RevisionPlan['mode'] = /字数严重超限|word-count-over|超过上限/u.test(combined)
    ? 'compress'
    : /字数严重不足|word-count-short|低于下限/u.test(combined)
      ? 'expand'
      : 'repair';
  // 与 buildRevisionPlanFromReport 同口径：压缩轮目标上限收紧 10%，硬门禁不变
  const maxWordsForMode =
    mode === 'compress' && bounds
      ? Math.max(Math.round(bounds.maxWords * 0.9), Math.round(bounds.minWords * 1.05))
      : bounds?.maxWords;
  return {
    mode,
    hints: normalized,
    ...(bounds ? { minWords: bounds.minWords, maxWords: maxWordsForMode } : {}),
  };
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
  private readonly validator: Pick<ContinuityValidator, 'validate'>;
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

    // Agent 检索回合:模型自主多轮补查基底之外的缺口,产出 dossier 注入 ContextPack。
    // 任何失败(含 stall/budget 降级后的传输硬错)都回落纯基底打包,不阻塞写作主链。
    let dossier: ResearchDossier | undefined;
    let researchSummary: ResearchRunSummary | undefined;
    if (this.dependencies.research) {
      try {
        dossier = await this.dependencies.research.research({
          chapterNumber: contracts.chapter.chapterNumber,
          contracts,
          plan,
          state: input.state,
          sceneChunks: input.sceneChunks ?? input.recentScenes,
          recentScenes: input.recentScenes,
        });
        researchSummary = dossier?.stats;
      } catch (error) {
        if (isAbortLike(error)) throw error;
        console.warn(
          `[LongFormWritingEngine] ch${contracts.chapter.chapterNumber} 检索回合失败,回落纯基底打包:`,
          error instanceof Error ? error.message : error
        );
        dossier = undefined;
      }
    }

    const context = this.contextBuilder.build({
      contracts,
      state: input.state,
      overlay: input.overlay,
      recentScenes: input.recentScenes,
      retrievedScenes: input.retrievedScenes,
      styleGuidance: input.styleGuidance,
      maxTokens: input.maxContextTokens,
      ...(dossier ? { dossier } : {}),
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
    let revisionPlan = buildSeedRevisionPlan(
      writeInput.seedRevisionHints,
      writeInput.targetWordCount
    );
    // 连环重写熔断：记录上一轮 blocking issue，用于检测是否「卡在同一问题」。
    // 字数类问题（word-count-short:*）每轮数值变化会干扰判定，比较时排除。
    let prevBlockingIssues: ContinuityIssue[] = [];

    while (true) {
      // Step A：起草 + 补字。瞬态错误（网络/截断）步骤级重试，持久错误冒泡。
      drafts = await runStepWithTransientRetry(
        async (attempt: number) => {
          // 截断/空响应重试时注入引导：让模型这次输出完整 JSON 与全章正文，而非原样盲发。
          // attempt=0 是首次调用，不追加；attempt>=1 是瞬态重试，追加截断引导。
          const draftRevisionPlan =
            attempt > 0
              ? {
                  mode: revisionPlan?.mode ?? 'repair',
                  hints: [
                    ...(revisionPlan?.hints ?? []),
                    '上次输出被截断或返回了空内容。请务必一次性输出完整的 JSON 对象，paragraphs 数组必须包含完整的正文段落，不要中途停笔，不要返回空字符串。',
                  ],
                  ...(revisionPlan?.minWords ? { minWords: revisionPlan.minWords } : {}),
                  ...(revisionPlan?.maxWords ? { maxWords: revisionPlan.maxWords } : {}),
                } satisfies RevisionPlan
              : revisionPlan;
          const d = await this.draftEngine.draft(plan, context, {
            targetWordCount: writeInput.targetWordCount,
            revisionPlan: draftRevisionPlan,
            rewriteRound: draftRevisionPlan ? Math.max(1, rewriteRounds) : undefined,
            // 跨章收尾去重：把最近几章的结尾句摆到模型眼前（详见 extractRecentEndingSnippets）
            recentEndingSnippets: extractRecentEndingSnippets(
              input.recentScenes,
              contracts.chapter.chapterNumber
            ),
            // 上章结尾仲裁：CBN 是规划语句，与上章正文事实冲突时以后者为准
            previousChapterEnding: input.previousChapterEnding,
            // 完整角色库（未被 context 压缩筛选），注入 prompt 白名单约束名字一致性
            knownCharacterNames: extractCharacterNames(input.state.entities),
            allowedAppearanceNames: extractAllowedAppearanceNames(
              input.state.entities,
              contracts.chapter.allowedCharacterNames,
            ),
            futureReveals: contracts.chapter.futureReveals ?? [],
            // 大纲链路的章节标题已是正式标题，模型再拟一个也会被 pipeline 丢弃
            existingChapterTitle: isPlaceholderChapterTitle(contracts.chapter.title)
              ? undefined
              : contracts.chapter.title,
          });
          // 提交前进补字：避免 SQLite accepted 后仍只有 ~900 字
          return this.padDraftsToTarget(d, writeInput);
        },
        { label: 'draft+pad', maxRetries: 1 }
      );

      // Step B：事实提取单独重试。审查失败时保留 drafts 和 facts，不重复付费提取。
      // 命运宣告入账全权归 AI 提取合同（2026-09-02 agent 化重构：确定性候选网
      // 与仲裁槽退役，词表打地鼠打法终止——见 docs/agent-loop-refactor.md）。
      const rawFacts = await runStepWithTransientRetry(
        async (_attempt: number) =>
          this.dependencies.factExtractor.extract({
            projectId: input.projectId,
            chapterNumber: contracts.chapter.chapterNumber,
            sceneDrafts: drafts,
            state: input.state,
            overlay: input.overlay,
          }),
        { label: 'fact-extraction', maxRetries: 2 }
      );
      const canonical = canonicalizeExtractedFacts({
        facts: rawFacts,
        state: input.state,
        drafts,
        overlay: input.overlay,
        // 章号传给 canonicalize：新角色实体的 introducedInChapter 记录实际章号
        chapterNumber: contracts.chapter.chapterNumber,
      });
      facts = canonical.facts;

      // Step C：只重试连续性/语义审查。耗尽后标记为 review_unavailable，
      // 让批量层停止当前章，而不是重新起草整章。
      try {
        report = await runStepWithTransientRetry(
          async (_attempt: number) => this.validator.validate({
            contracts,
            state: canonical.stateForValidation,
            drafts,
            facts: canonical.facts,
            payoffCandidates: writeInput.payoffCandidates,
            // 上章结尾给判官做「重置登场」在场连续性判定（ch8→9 类断裂根治）
            prevChapterTail: input.previousChapterEnding,
          }),
          { label: 'semantic-review', maxRetries: 2 }
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        if (error instanceof Error && error.name === 'AbortError') throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          detail.includes('[review-unavailable]')
            ? detail
            : `[review-unavailable] 语义审查不可用：${detail}`,
          { cause: error }
        );
      }

      // 字数未落入目标区间也视为 blocking，驱动重写；用尽轮次后仍拒收提交。
      const target = writeInput.targetWordCount ?? 0;
      const wordCountIssue = buildWordCountBoundsIssue(draftsProse(drafts), target);
      const typesettingIssues = buildTypesettingIssues(draftsProse(drafts));
      // 开场重叠（章界重演）写作期防线：确定性比对本章开头与上章结尾
      const openingRepetitionIssue = detectOpeningRepetitionIssue(
        draftsProse(drafts),
        input.previousChapterEnding,
      );
      if (openingRepetitionIssue) {
        console.warn(
          `[LongFormWritingEngine] ch${contracts.chapter.chapterNumber} 开场重演上章结尾（相似度过高），判 blocking 驱动重写`
        );
        report = {
          accepted: false,
          issues: [
            ...report.issues.filter(issue => issue.id !== 'chapter-opening-repetition'),
            openingRepetitionIssue,
          ],
          checkedDomains: report.checkedDomains.includes('fulfillment')
            ? report.checkedDomains
            : [...report.checkedDomains, 'fulfillment'],
        };
      }
      if (wordCountIssue) {
        report = {
          accepted: false,
          issues: [
            ...report.issues.filter(issue => !issue.id.startsWith('word-count-')),
            wordCountIssue,
          ],
          checkedDomains: report.checkedDomains.includes('fulfillment')
            ? report.checkedDomains
            : [...report.checkedDomains, 'fulfillment'],
        };
      }
      if (typesettingIssues.some(issue => issue.severity === 'high')) {
        report = {
          accepted: false,
          issues: [
            ...report.issues.filter(issue => !issue.id.startsWith('typesetting-density')),
            ...typesettingIssues
              .filter(issue => issue.severity === 'high')
              .map((issue, index) => ({
                id: index === 0 ? 'typesetting-density' : `typesetting-density-${index + 1}`,
                domain: 'fulfillment' as const,
                severity: 'blocking' as const,
                message: `${issue.description}。${issue.suggestion}`,
                evidence: issue.evidence ? [issue.evidence] : [],
              })),
          ],
          checkedDomains: report.checkedDomains.includes('fulfillment')
            ? report.checkedDomains
            : [...report.checkedDomains, 'fulfillment'],
        };
      } else if (typesettingIssues.length > 0) {
        // medium 级排版问题（段落节奏均匀化等 AI 腔信号）不阻断 accept，
        // 但作为 warning 进入 issues → revisionHints 驱动下一次重写自我修正。
        // 没有其它 blocking 问题时不会触发重写，只在重写已发生时附带修掉。
        report = {
          ...report,
          issues: [
            ...report.issues.filter(issue => !issue.id.startsWith('typesetting-density')),
            ...typesettingIssues.map((issue, index) => ({
              id: index === 0 ? 'typesetting-density' : `typesetting-density-${index + 1}`,
              domain: 'fulfillment' as const,
              severity: 'warning' as const,
              message: `${issue.description}。${issue.suggestion}`,
              evidence: issue.evidence ? [issue.evidence] : [],
            })),
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
          !issue.id.startsWith('word-count-'),
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
        // 阈值 0.4：当 40% 以上的 blocking 问题与上轮高度相似即认定「卡在同一问题」提前熔断，
        // 避免措辞略变（相似度 <0.7）就烧满重写轮次。
        if (stuckRatio >= 0.4) {
          console.warn(
            `[LongFormWritingEngine] 连环重写熔断：本轮 ${stuckCount}/${currentBlocking.length} 个 blocking 问题与上轮高度相似（卡在同一问题），停止重写（仍 rejected 提交）`,
          );
          break;
        }
      }
      prevBlockingIssues = currentBlocking;

      const nextRevisionPlan = buildRevisionPlanFromReport(report, writeInput.targetWordCount);
      if (nextRevisionPlan.hints.length === 0) {
        break;
      }

      rewriteRounds += 1;
      revisionPlan = nextRevisionPlan;
      console.info(
        `[LongFormWritingEngine] 审核未通过，开始第 ${rewriteRounds}/${maxRewriteRounds} 次 ${revisionPlan.mode} 重写`,
        revisionPlan.hints.slice(0, 3)
      );
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
      ...(researchSummary ? { research: researchSummary } : {}),
    };
  }

  /**
   * 字数归一：超长走 AI 整章压缩改写（文气统一）；偏短走 append-only 补字（在初稿末尾
   * 续写增量，不重写既有段落，文气衔接优于整章重写压缩）。二者对称：
   * - 超 long → 整章压缩（保留情节、压缩冗余）
   * - 偏 short → 追加续写（保留既有正文、补足篇幅）
   * 补字失败（网络/解析）时保留初稿不抛错，与超长压缩失败「回退原文」对称。
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

    const bounds = checkWordCountBounds(draftsProse(nextDrafts), target);
    if (bounds.status === 'over') {
      return this.trimDraftsIfOverTarget(nextDrafts, input);
    }
    if (bounds.status === 'short') {
      return this.padDraftsIfUnderTarget(nextDrafts, input, bounds);
    }
    return nextDrafts;
  }

  /**
   * 偏短时 AI append-only 补字：在原文末尾续写增量段落，不重写既有正文。
   * 与 trimDraftsIfOverTarget（超长整章压缩）对称：偏长压、偏短补。
   *
   * 策略：
   * - 用 buildSupplementPrompt（outputFormat:'json'，supplement.ts 注释明确为本路径准备）
   *   构造续写提示词，锚定原文结尾片段，让 AI 从断点处自然接续。
   * - 最多补至 maxWords（target × MAX_WORD_THRESHOLD）；单轮补字失败（网络/解析）保留初稿不抛错，
   *   与超长压缩失败「回退原文」对称。
   * - 最多 2 轮：快模型常系统性欠写 10-20%，一轮常补不足；两轮兜底。
   *   每轮用追加后的正文重新算 shortfall，避免重复补超。
   * - 输出护栏：单轮补字异常膨胀（模型把 JSON 骨架当正文）时丢弃该轮，避免垃圾正文入库。
   *
   * @param bounds 入口已算好的字数边界（status==='short'），避免重复计算
   */
  private async padDraftsIfUnderTarget(
    drafts: SceneDraft[],
    input: LongFormWriteInput,
    bounds: ReturnType<typeof checkWordCountBounds>
  ): Promise<SceneDraft[]> {
    const target = input.targetWordCount ?? 0;
    const maxPadRounds = 2;
    const nextDrafts = drafts.map(draft => ({
      ...draft,
      paragraphs: [...draft.paragraphs],
    }));
    const outline =
      input.contracts.chapter.goal ||
      input.contracts.chapter.CBN ||
      input.contracts.chapter.CEN;
    // 补字与起草共用同一套硬约束：只给「结尾片段 + 章大纲」时，补字会拉来未登场角色、
    // 踩禁区或写出与本章前文冲突的事实，代价是整章重写（实测 ch5 因此白烧一轮）。
    const chapterBeats = [
      input.contracts.chapter.CBN,
      ...(input.contracts.chapter.CPNs ?? []),
      input.contracts.chapter.CEN,
    ]
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    const allowedAppearanceNames = extractAllowedAppearanceNames(
      input.state.entities,
      input.contracts.chapter.allowedCharacterNames,
    );

    let currentBounds = bounds;
    for (let round = 1; round <= maxPadRounds; round += 1) {
      if (currentBounds.status !== 'short') break;

      const additionalWords = Math.max(
        currentBounds.minWords - currentBounds.currentWords,
        Math.ceil(target * 0.3),
      );
      const maxSupplement = currentBounds.maxWords - currentBounds.currentWords;
      if (maxSupplement <= 0) break;

      const currentProse = draftsProse(nextDrafts);
      const prompt = buildSupplementPrompt({
        existingContent: currentProse,
        targetWordCount: target,
        additionalWords: Math.min(additionalWords, maxSupplement),
        round,
        maxRounds: maxPadRounds,
        chapterTitle: input.contracts.chapter.title,
        chapterOutline: outline,
        pendingBeats: chapterBeats,
        allowedAppearanceNames,
        forbiddenZones: input.contracts.chapter.forbidden ?? [],
        outputFormat: 'json',
      });

      let supplementParagraphs: string[];
      try {
        supplementParagraphs = (await this.dependencies.ai.generate<string[]>({
          purpose: 'scene-draft',
          schemaName: 'SupplementParagraphs',
          system: [
            '你是网文补字续写引擎。从原文结尾处自然续写，只输出一个 JSON 对象：{"paragraphs":["段落1","段落2"]}',
            `当前约 ${currentBounds.currentWords} 字，需补足至 ${currentBounds.minWords}–${currentBounds.maxWords} 字（目标 ${target}）。`,
            '只输出新增的续写段落，不要重复原文已有内容；段落之间文气连贯，禁止把已写过的场面换措辞重写。',
            '不要输出 Markdown 代码块或任何解释文字。',
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
                  : [],
            );
            if (paragraphs.length === 0) {
              throw new Error('补字未返回可用段落');
            }
            return paragraphs;
          },
        })) as string[];
      } catch (error) {
        console.warn(
          `[LongFormWritingEngine] 第 ${round} 轮补字失败，保留初稿（偏短但完整）:`,
          error,
        );
        break;
      }

      const delta = supplementParagraphs.join('\n\n');
      // 输出护栏：单轮补字异常膨胀（模型把 JSON 骨架当正文）时丢弃该轮。
      const maxDeltaChars = Math.max(6000, Math.ceil(target * 3));
      if (delta.length === 0 || delta.length > maxDeltaChars) {
        console.warn(
          `[LongFormWritingEngine] 第 ${round} 轮补字输出异常（${delta.length} 字符），丢弃该轮`,
        );
        break;
      }

      nextDrafts[0] = {
        ...nextDrafts[0],
        paragraphs: [...nextDrafts[0].paragraphs, ...supplementParagraphs],
      };
      currentBounds = checkWordCountBounds(draftsProse(nextDrafts), target);
      if (currentBounds.status !== 'short') break;
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
      console.warn('[LongFormWritingEngine] 超长压缩失败，保留完整原稿并交由字数门禁:', error);
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
