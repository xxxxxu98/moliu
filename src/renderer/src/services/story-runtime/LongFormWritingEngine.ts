import type {
  ContextPack,
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
  WriterRunSummary,
} from '@/types/story-runtime';

import { AIChapterJudge } from './AIChapterJudge';
import { canonicalizeExtractedFacts } from './FactCanonicalizer';
import {
  ChapterCommitService,
  type ChapterCommitPort,
} from './ChapterCommitService';
import { ContextPackBuilder } from './ContextPackBuilder';
import { ContinuityValidator } from './ContinuityValidator';
import {
  collectCharacterTitleAnchors,
  collectTerminalDeathCharacters,
  detectNodeVerbatimOverlapIssues,
  detectOpeningRepetitionIssue,
  healChapterContract,
  isTerminalDeathStatus,
} from './contractHealth';
import { SceneBeatPlanner } from './SceneBeatPlanner';
import { SceneDraftEngine } from './SceneDraftEngine';
import type { WriterAgentStep } from './agent/WriterAgent';
import type { ChapterReviewOutcome } from './agent/WriterToolkit';
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

/** 初稿未过时改稿 agent 的默认 run_checks 预算（不含初稿审查） */
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
  /**
   * Agent 改稿回合(docs/agent-architecture-refactor.md P2):初稿审查未通过时,
   * 由 agent 通过 get_draft/revise_paragraphs/run_checks + 六读工具自主改到通过。
   * 未注入时不整章重写，带着初审结果直接提交（假 AI 单测 / 显式 maxRewriteRounds=0）。
   * 抛错原样冒泡:审查链不可用必须让批量层停章,不能静默回落。
   */
  writerAgent?: WriterAgentStep;
}

/** 审查链输入:初稿与每次改稿共用,保证 agent 的 run_checks 与提交门禁同口径 */
interface ReviewContext {
  input: LongFormWriteInput;
  writeInput: LongFormWriteInput;
  contracts: ContractPack;
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

function extractAllowedAppearanceNames(
  entities: Record<string, StoryEntity> | undefined,
  requestedNames: string[] | undefined,
): string[] {
  if (!entities || !requestedNames?.length) return [];
  const requested = new Set(requestedNames.map(name => name.trim()).filter(Boolean));
  const allowed: string[] = [];
  for (const entity of Object.values(entities)) {
    if (entity.kind !== 'character') continue;
    // 死亡族终态角色不可「现身/说话/行动」：白名单是出场许可证，留死者会诱导
    // 写手写出「病危急报/苏醒」类复活钩子（g38f-200chr2 ch184 五连拒死章）。
    // 羁押/去职不在此列——在押解/解任语境出场是合法剧情。
    if (isTerminalDeathStatus(entity.attributes?.status)) continue;
    const names = [entity.name, ...(entity.aliases ?? [])].map(name => name.trim()).filter(Boolean);
    if (!names.some(name => requested.has(name))) continue;
    for (const name of names) {
      if (!allowed.includes(name)) allowed.push(name);
    }
  }
  return allowed;
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
  // 压缩轮目标上限比硬门禁再收紧 10%：模型压字普遍「贴着给的上限」执行
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

function withFulfillmentDomain(report: ContinuityReport): ContinuityReport['checkedDomains'] {
  return report.checkedDomains.includes('fulfillment')
    ? report.checkedDomains
    : [...report.checkedDomains, 'fulfillment'];
}

/**
 * 确定性门禁叠加到语义审查报告：字数区间、排版密度、章界重演。
 * 字数未落入目标区间与 high 级排版问题视为 blocking（驱动重写、用尽轮次仍拒收）；
 * medium 级排版问题只作 warning（不阻断 accept，但进入 issues 供改稿顺手修掉）。
 */
export function applyDeterministicGates(
  semanticReport: ContinuityReport,
  drafts: SceneDraft[],
  ctx: {
    targetWordCount: number;
    previousChapterEnding?: string;
    chapterNumber: number;
    mustCover?: string[];
  }
): ContinuityReport {
  let report = semanticReport;
  const prose = draftsProse(drafts);
  const wordCountIssue = buildWordCountBoundsIssue(prose, ctx.targetWordCount);
  const typesettingIssues = buildTypesettingIssues(prose);
  // 开场重叠（章界重演）写作期防线：确定性比对本章开头与上章结尾
  const openingRepetitionIssue = detectOpeningRepetitionIssue(prose, ctx.previousChapterEnding);
  if (openingRepetitionIssue) {
    console.warn(
      `[LongFormWritingEngine] ch${ctx.chapterNumber} 开场重演上章结尾（相似度过高），判 blocking 驱动重写`
    );
    report = {
      accepted: false,
      issues: [
        ...report.issues.filter(issue => issue.id !== 'chapter-opening-repetition'),
        openingRepetitionIssue,
      ],
      checkedDomains: withFulfillmentDomain(report),
    };
  }
  if (wordCountIssue) {
    report = {
      accepted: false,
      issues: [
        ...report.issues.filter(issue => !issue.id.startsWith('word-count-')),
        wordCountIssue,
      ],
      checkedDomains: withFulfillmentDomain(report),
    };
  }
  const highTypesetting = typesettingIssues.filter(issue => issue.severity === 'high');
  if (highTypesetting.length > 0) {
    report = {
      accepted: false,
      issues: [
        ...report.issues.filter(issue => !issue.id.startsWith('typesetting-density')),
        ...highTypesetting.map((issue, index) => ({
          id: index === 0 ? 'typesetting-density' : `typesetting-density-${index + 1}`,
          domain: 'fulfillment' as const,
          severity: 'blocking' as const,
          message: `${issue.description}。${issue.suggestion}`,
          evidence: issue.evidence ? [issue.evidence] : [],
        })),
      ],
      checkedDomains: withFulfillmentDomain(report),
    };
  } else if (typesettingIssues.length > 0) {
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
      checkedDomains: withFulfillmentDomain(report),
    };
  }
  // 节点原句照抄（prompt 禁抄+judge 规则在长跑尺度漏网，终验 4 处实锤）：
  // warning 级并入，靠下方 requiredIssueIds 机制驱动定向改写
  const verbatimIssues = detectNodeVerbatimOverlapIssues(prose, ctx.mustCover ?? []);
  if (verbatimIssues.length > 0) {
    report = {
      ...report,
      issues: [
        ...report.issues.filter(issue => !issue.id.startsWith('node-verbatim-overlap')),
        ...verbatimIssues,
      ],
      checkedDomains: withFulfillmentDomain(report),
    };
  }
  // 真实历史年号黑名单（格式腐化守卫）：warning 级定向改写，同 verbatim 模式
  const realEraIssues = detectRealEraNameIssues(prose);
  if (realEraIssues.length > 0) {
    report = {
      ...report,
      issues: [
        ...report.issues.filter(issue => !issue.id.startsWith('real-era-name')),
        ...realEraIssues,
      ],
      checkedDomains: withFulfillmentDomain(report),
    };
  }
  return report;
}

/** 真实历史年号黑名单（格式腐化守卫，2026-09-16 r5 全文通读实证）：架空朝代
 *  正文混入明朝年号（r5 八种：天启/弘治/嘉靖/成化/宣德/万历/洪武/天顺；ch69
 *  「万历八年密契」晚于故事当下属未来文件）。年号匹配是格式事实不是语义判定，
 *  属确定性守卫范畴。warning 级并入 requiredIssueIds 驱动定向改写（换成本书
 *  纪年），不 blocking 防死章——改不掉保留最优稿走黄签由 triage 终审。 */
const REAL_MING_ERA_NAMES = [
  '洪武', '建文', '永乐', '洪熙', '宣德', '正统', '景泰', '天顺',
  '成化', '弘治', '正德', '嘉靖', '隆庆', '万历', '泰昌', '天启', '崇祯',
];

export function detectRealEraNameIssues(prose: string): ContinuityIssue[] {
  const hits: string[] = [];
  for (const era of REAL_MING_ERA_NAMES) {
    const idx = prose.indexOf(era);
    if (idx >= 0) {
      hits.push(
        `${era}（…${prose.slice(Math.max(0, idx - 8), idx + era.length + 4).replace(/\s+/g, '')}…）`
      );
    }
  }
  if (hits.length === 0) return [];
  return [
    {
      id: 'real-era-name',
      domain: 'fulfillment',
      severity: 'warning',
      message: `正文混入真实历史年号（本书为架空朝代，年号必须用本书纪年体系）：${hits.slice(0, 4).join('、')}${hits.length > 4 ? ` 等 ${hits.length} 处` : ''}。全部替换为本书既定纪年或模糊化处理（「先帝年间」「十余年前」）`,
      evidence: hits.slice(0, 3),
    },
  ];
}

function shouldRewrite(report: ContinuityReport): boolean {
  if (report.accepted) return false;
  return report.issues.some(
    issue => issue.severity === 'blocking' || issue.severity === 'warning'
  );
}

/** 段落节奏均匀化（AI 腔 CV 低于阈值）是否在报告里——2026-09-05 g38f 实测：
 *  200 章级 41/198、100 章级 30/97 章 CV<0.15，prompt 锚点在长跑尺度不足，
 *  均匀化必须驱动一轮定向改稿而非停留在「顺手修掉」的弱约束。 */
export function uniformDensityIssueIds(report: ContinuityReport): string[] {
  return report.issues
    .filter(
      issue =>
        issue.id.startsWith('typesetting-density') &&
        issue.message.includes('段落节奏均匀化')
    )
    .map(issue => issue.id);
}

/** 节点原句照抄（mustCover ≥12 字逐字入正文）是否在报告里——prompt 禁抄与
 *  judge 规则在长跑尺度漏网（2026-09-12 gemini 终验 4 处终稿实锤），确定性
 *  门禁命中后与均匀化同机制驱动定向改写。 */
export function nodeVerbatimIssueIds(report: ContinuityReport): string[] {
  return report.issues
    .filter(issue => issue.id.startsWith('node-verbatim-overlap'))
    .map(issue => issue.id);
}

/** 真实历史年号混入是否在报告里——与节点照抄同机制驱动定向改写。 */
export function realEraNameIssueIds(report: ContinuityReport): string[] {
  return report.issues
    .filter(issue => issue.id.startsWith('real-era-name'))
    .map(issue => issue.id);
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
              item =>
                !healthReport.prunedMustCover.includes(item) &&
                !healthReport.staleRemovedMustCover.includes(item)
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
    const reviewContext: ReviewContext = { input, writeInput, contracts };

    // 批量层重试可能传入「上一轮失败教训」种子：初稿即带反馈，避免盲目重跑。
    let revisionPlan = buildSeedRevisionPlan(
      writeInput.seedRevisionHints,
      writeInput.targetWordCount
    );
    let rewriteRounds = 0;

    // Step A：初稿 + 补字 → Step B/C：事实提取 + 语义审查 + 确定性门禁
    let drafts = await this.draftChapter(plan, context, reviewContext, revisionPlan, rewriteRounds);
    let { facts, report } = await this.reviewDrafts(drafts, reviewContext);
    let writerSummary: WriterRunSummary | undefined;

    const uniformIssueIdsBefore = uniformDensityIssueIds(report);
    const verbatimIssueIdsBefore = nodeVerbatimIssueIds(report);
    const realEraIssueIdsBefore = realEraNameIssueIds(report);
    // 弱信号驱动的定向改稿（均匀化/节点照抄/真实年号混入）：唯一改稿动因为 warning 级
    // 确定性信号时合并为必须处理，否则 agent 可对 warning 不改稿直接 finish
    const weakSignalIssueIds = [
      ...uniformIssueIdsBefore,
      ...verbatimIssueIdsBefore,
      ...realEraIssueIdsBefore,
    ];
    const weakSignalDriven = !shouldRewrite(report) && weakSignalIssueIds.length > 0;
    if (
      (shouldRewrite(report) || weakSignalIssueIds.length > 0) &&
      maxRewriteRounds > 0 &&
      this.dependencies.writerAgent
    ) {
      // 改稿只走 agent：模型读问题清单、查事实、局部改稿、复检，blocking=0 才 finish。
      // 未注入 writerAgent（假 AI 单测）时不整章重写，带着初审结果直接提交。
      // 均匀化触发的改稿预算加倍至 2 轮：gemini 终验实测 11/196 章 CV<0.14 且
      // 一轮定向修后仍不达标（uniform-cv-survived）——节奏均匀化需要拆段/扩段
      // 的结构操作，一轮往往只改掉高频词，第二轮才动分段。仍非 blocking，
      // 两轮后不达标保留最优稿走黄签（survived 语义不变）。
      const outcome = await this.dependencies.writerAgent.revise({
        chapterNumber: contracts.chapter.chapterNumber,
        contracts,
        state: input.state,
        context,
        sceneChunks: input.sceneChunks ?? input.recentScenes,
        initialDrafts: drafts,
        initialReview: { facts, report },
        reviewPort: { review: candidate => this.reviewDrafts(candidate, reviewContext) },
        maxChecks: weakSignalDriven && uniformIssueIdsBefore.length > 0
          ? Math.max(maxRewriteRounds, 2)
          : maxRewriteRounds,
        requiredIssueIds: weakSignalDriven ? weakSignalIssueIds : undefined,
        targetWordCount: writeInput.targetWordCount,
        previousChapterEnding: input.previousChapterEnding,
        allowedAppearanceNames: extractAllowedAppearanceNames(
          input.state.entities,
          contracts.chapter.allowedCharacterNames
        ),
        knownCharacterNames: extractCharacterNames(input.state.entities),
        terminalFateCharacters: collectTerminalDeathCharacters(input.state),
        characterTitleAnchors: collectCharacterTitleAnchors(input.state),
      });
      drafts = outcome.drafts;
      facts = outcome.facts;
      report = outcome.report;
      rewriteRounds = outcome.checksUsed;
      writerSummary = {
        ...outcome.stats,
        checksUsed: outcome.checksUsed,
        revertedUnchecked: outcome.revertedUnchecked,
      };
      if (outcome.revertedUnchecked) {
        console.warn(
          `[LongFormWritingEngine] ch${contracts.chapter.chapterNumber} 改稿回合结束时存在未复检改动，已回退到最后一次审查稿（${outcome.finishReason}）`
        );
      }
      // survived 语义（照抄 words-overlimit-survived 样板）：定向修后仍命中则保留
      // 最优稿继续走，不升 blocking（那会变成重试耗尽死章），靠日志黄签进 triage。
      if (uniformIssueIdsBefore.length > 0 && uniformDensityIssueIds(report).length > 0) {
        console.info(
          `[LongFormWritingEngine] ch${contracts.chapter.chapterNumber} 段落节奏改稿后仍均匀化（cv 未达标），保留重写稿（uniform-cv-survived，不阻断）`
        );
      }
      if (verbatimIssueIdsBefore.length > 0 && nodeVerbatimIssueIds(report).length > 0) {
        console.info(
          `[LongFormWritingEngine] ch${contracts.chapter.chapterNumber} 节点原句照抄改稿后仍命中（≥12 字重叠），保留改写稿（node-verbatim-survived，不阻断）`
        );
      }
      if (realEraIssueIdsBefore.length > 0 && realEraNameIssueIds(report).length > 0) {
        console.info(
          `[LongFormWritingEngine] ch${contracts.chapter.chapterNumber} 真实历史年号改稿后仍混入，保留改写稿（real-era-survived，不阻断）`
        );
      }
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
      ...(writerSummary ? { writer: writerSummary } : {}),
    };
  }

  /** Step A：整章起草 + 补字。瞬态错误（网络/截断）步骤级重试，持久错误冒泡。 */
  private async draftChapter(
    plan: ScenePlan,
    context: ContextPack,
    ctx: ReviewContext,
    revisionPlan: RevisionPlan | undefined,
    rewriteRounds: number
  ): Promise<SceneDraft[]> {
    const { input, writeInput, contracts } = ctx;
    return runStepWithTransientRetry(
      async (attempt: number) => {
        // 截断/空响应重试时注入引导：让模型这次输出完整 JSON 与全章正文，而非原样盲发。
        // attempt=0 是首次调用，不追加；attempt>=1 是瞬态重试，追加截断引导。
        const draftRevisionPlan =
          attempt > 0
            ? ({
                mode: revisionPlan?.mode ?? 'repair',
                hints: [
                  ...(revisionPlan?.hints ?? []),
                  '上次输出被截断或返回了空内容。请务必一次性输出完整的 JSON 对象，paragraphs 数组必须包含完整的正文段落，不要中途停笔，不要返回空字符串。',
                ],
                ...(revisionPlan?.minWords ? { minWords: revisionPlan.minWords } : {}),
                ...(revisionPlan?.maxWords ? { maxWords: revisionPlan.maxWords } : {}),
              } satisfies RevisionPlan)
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
            contracts.chapter.allowedCharacterNames
          ),
          // 死亡族终态禁令：起草 prompt 显式列出死者，禁止任何存活形态出场
          terminalFateCharacters: collectTerminalDeathCharacters(input.state),
          // 头衔锚（契约 14）：正文称谓必须与最近入账头衔一致
          characterTitleAnchors: collectCharacterTitleAnchors(input.state),
          // 纪年锚：正文纪年与近章既成纪年连续（r5 实证五套纪年互斥）
          eraAnchors: input.eraAnchors,
          // 数字锚：既成大额数字显式名录（r6 实证长程数字漂移）
          numericFacts: input.numericFacts,
          // 身份锚：出场角色身份与角色卡一致（r6 实证同一角色前后两身份）
          characterIdentityAnchors: input.characterIdentityAnchors,
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
  }

  /**
   * Step B/C：事实提取 → canonicalize → 语义审查 → 确定性门禁叠加。
   * 初稿与 agent 的 run_checks 全部走这一个函数——审查口径唯一。
   */
  private async reviewDrafts(
    drafts: SceneDraft[],
    ctx: ReviewContext
  ): Promise<ChapterReviewOutcome> {
    const { input, writeInput, contracts } = ctx;

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
    const facts: ExtractedFacts = canonical.facts;

    // Step C：只重试连续性/语义审查。耗尽后标记为 review_unavailable，
    // 让批量层停止当前章，而不是重新起草整章。
    let report: ContinuityReport;
    try {
      report = await runStepWithTransientRetry(
        async (_attempt: number) =>
          this.validator.validate({
            contracts,
            state: canonical.stateForValidation,
            drafts,
            facts: canonical.facts,
            payoffCandidates: writeInput.payoffCandidates,
            // 上章结尾给判官做「重置登场」在场连续性判定（ch8→9 类断裂根治）
            prevChapterTail: input.previousChapterEnding,
            // 纪年/数字跨章一致性（判官侧第二道，与写作侧锚同源）：
            // 锚外年号=自创年号、既成数值无勘误改写=数字蒸发
            eraAnchors: input.eraAnchors ?? [],
            numericFacts: input.numericFacts ?? [],
          }),
        { label: 'semantic-review', maxRetries: 2 }
      );
    } catch (error) {
      if (isAbortLike(error)) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        detail.includes('[review-unavailable]')
          ? detail
          : `[review-unavailable] 语义审查不可用：${detail}`,
        { cause: error }
      );
    }

    return {
      facts,
      report: applyDeterministicGates(report, drafts, {
        targetWordCount: writeInput.targetWordCount ?? 0,
        previousChapterEnding: input.previousChapterEnding,
        chapterNumber: contracts.chapter.chapterNumber,
        mustCover: contracts.chapter.mustCover,
      }),
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
