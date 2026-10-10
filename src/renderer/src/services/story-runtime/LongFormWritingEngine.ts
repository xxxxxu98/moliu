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
import { buildInPlaceExpandPrompt, IN_PLACE_EXPAND_SCHEMA } from './inPlaceExpand';
import {
  buildCondensePrompt,
  buildSupplementPrompt,
  buildWordCountBoundsIssue,
  checkWordCountBounds,
  chooseProseAfterCondense,
} from '@/services/writing/supplement';
import { countWords } from '@/services/writing/utils';
import { isPlaceholderChapterTitle } from '@/services/writing/chapterTitle';
import { buildTypesettingIssues, splitIntoSentences } from '@/services/writing/typesetting';
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

/**
 * 边缘超写句边界裁剪：从倒数第二段起删段尾完整句，末段（CEN 钩子承载段）不动，
 * 对话段（引号承载）跳过——删半轮对话比删叙述句更伤。只删到句号为止，
 * 不掐断句子，与「不硬裁（掐断正文破坏文气）」的既有取舍不冲突。
 * 2026-10-01 p1reg20 ch10 实证：3549/3540（超 9 字）两轮 AI 压缩仍差一点，
 * 靠整章重写兜底是五连拒成洞的最贵路径；9～170 字级擦边超写删 1～2 句即可落回限内。
 * 返回 null = 无法在不动末段/不掐断句子的前提下落回限内（调用方保持原逻辑）。
 */
export function trimEdgeOverflowToBound(prose: string, maxWords: number): string | null {
  const paragraphs = prose
    .split(/\n{2,}/u)
    .map(part => part.trim())
    .filter(Boolean);
  if (paragraphs.length < 2) return null;

  const totalWords = (): number => countWords(paragraphs.filter(Boolean).join('\n\n'));
  for (let i = paragraphs.length - 2; i >= 0 && totalWords() > maxWords; i -= 1) {
    if (/["“”\u201C\u201D「」『』]/u.test(paragraphs[i])) continue;
    let sentences = splitIntoSentences(paragraphs[i]);
    while (sentences.length > 0 && totalWords() > maxWords) {
      sentences = sentences.slice(0, -1);
      paragraphs[i] = sentences.join('');
    }
    if (totalWords() <= maxWords) break;
  }
  const cleaned = paragraphs.filter(Boolean);
  if (cleaned.length === 0 || countWords(cleaned.join('\n\n')) > maxWords) return null;
  return cleaned.join('\n\n');
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
    /** 本章全部合同节点（CBN/CEN/mustCover）：节点原句照抄确定性检测（判官零报实证） */
    contractNodes?: string[];
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
  // 节点原句照抄（2026-09-20 r8 实证：13 处蓝图 CBN/CEN 逐字漏入终稿，判官 17 轮
  // 零报——逐字比对非语言模型所长；旧防线只查 mustCover 且仅 warning，r8 漏入
  // 几乎全在 CBN/CEN）：CBN/CEN 是读者直读的钩子句，漏入升 blocking 驱动重写
  const hookVerbatimIssues = detectNodeVerbatimOverlapIssues(
    prose,
    ctx.contractNodes ?? [],
    12,
    'blocking'
  );
  if (hookVerbatimIssues.length > 0) {
    console.warn(
      `[LongFormWritingEngine] ch${ctx.chapterNumber} CBN/CEN 原句照抄 ${hookVerbatimIssues.length} 处，判 blocking 驱动重写`
    );
    report = {
      accepted: false,
      issues: [
        ...report.issues.filter(issue => !issue.id.startsWith('node-verbatim-overlap')),
        ...hookVerbatimIssues,
      ],
      checkedDomains: withFulfillmentDomain(report),
    };
  }
  if (wordCountIssue) {
    // 擦边超写（word-count-over-edge，2026-10-01 p1reg20 ch10 实证：超 9 字被
    // blocking 五连拒成洞）是 warning：进 issues 供改稿顺手修，不置 accepted:false
    report = {
      accepted: wordCountIssue.severity === 'warning' ? report.accepted : false,
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
  // 节点照抄的 mustCover 通道已并入上方 contractNodes blocking 检测（r8 实证
  // warning 定向改写通道兜不可靠，13 处终稿漏入；LCS≥12 极严误杀成本仅一轮重写）
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
 *  纪年），不 blocking 防死章——改不掉保留最优稿走黄签由 triage 终审。
 *  2026-09-29 补崇德（清太宗年号，reg20 ch17 自创年号「崇德」恰与真实年号撞名，
 *  双重出戏：既是自创纪年污染又自带真实朝代锚点）；唐宋清高频年号一并补齐。
 *  词面歧义甄别（fail-closed 误报比漏报致命）：「上元」（上元节）与「绍兴」
 *  （地名/绍酒）在古风正文合法高频，禁入黑名单；只收无日常词面冲突的纯年号。 */
const REAL_MING_ERA_NAMES = [
  '洪武', '建文', '永乐', '洪熙', '宣德', '正统', '景泰', '天顺',
  '成化', '弘治', '正德', '嘉靖', '隆庆', '万历', '泰昌', '天启', '崇祯',
  // 清代（含崇德）
  '崇德', '顺治', '康熙', '雍正', '乾隆', '嘉庆', '道光', '咸丰', '同治', '光绪', '宣统',
  // 唐宋高频（架空古风书最易混入；已剔除上元/绍兴等词面歧义项）
  '贞观', '开元', '天宝', '靖康', '淳熙', '至元', '洪宪',
];

/** 需年份上下文才判定的真实年号（词面歧义族，2026-09-30 r16 实证扩容）：
 * 「大业」有「共图大业/大业未成」日常词面，「建武」可入人名——裸收会大面积
 * 误报；仅当年号后紧跟年份标记（X年/初年/末年/年间）才判格式腐化。
 * r16 全文通读实证：ch35 暗账「大业三年四月，江宁河银分拨」、ch106 冶印
 * 「工部内库天字七号，建武五年冬炼」、ch185「大业初年老祖宗传下来的受命
 * 之宝」——隋/东汉双真实年号与架空大雍构成平行纪年（time.era S2）。 */
const CONTEXTUAL_REAL_ERA_PATTERNS: Array<{ era: string; re: RegExp }> = [
  { era: '大业', re: /大业(?:[元一二三四五六七八九十百零\d]+年|初年|末年|年间)/u },
  { era: '建武', re: /建武(?:[元一二三四五六七八九十百零\d]+年|初年|末年|年间)/u },
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
  for (const { era, re } of CONTEXTUAL_REAL_ERA_PATTERNS) {
    const match = re.exec(prose);
    if (match) {
      const idx = match.index;
      hits.push(
        `${era}（…${prose.slice(Math.max(0, idx - 8), idx + match[0].length + 4).replace(/\s+/g, '')}…）`
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

/** 陈旧节拍改写的最小 AI 形状（结构性类型，测试可 mock）。
 *  parse 入参是 unknown：真实链路的 RawText schema 会传结构化包装对象
 *  （2026-10-01 ch3 实证），实现方负责解包或返回 ''。 */
interface SalvageAI {
  generate<T>(input: {
    purpose: string;
    schemaName: string;
    system: string[];
    prompt: string;
    parse: (raw: unknown) => T;
  }): Promise<T>;
}

/**
 * 「裁而不弃」：被陈旧度门禁裁除的 mustCover 节拍交 AI 改写为合法形态
 * （2026-09-30 r16 S2-41/52 实证：裁而不改写 = 节拍静默蒸发——钱半江 ch103/113
 * 节点点名在押角色被裁后 25 章零出场、三司会审宣判 payoff 整体跳过，章节照常
 * 通过无任何痕迹）。返回改写后的节拍行；AI 失败返回 []（fail-open：保留原
 * 裁剪行为——裁剪本身仍是防 fact_conflict 拒稿的正确防线）。
 *
 * 形状防御（2026-10-01 ch3 五连拒实证）：RawText schema 在真实链路上返回
 * {rawText/RawText/text} 结构化包装对象而非裸字符串（mock 测试恰好返回真
 * 字符串，形状缺口测试内不可见）——String(对象)＝"[object Object]"（15 字，
 * 骗过 ≥8 滤网）直接回填 mustCover 成非语义节点，判官整章死锁。parse 侧
 * 解包 + 行级 CJK 过滤双保险。
 */
export async function salvageStaleMustCover(
  ai: SalvageAI,
  details: Array<{ item: string; offender: string }>,
  chapterNumber: number,
  entities: Record<string, { name?: string; attributes?: Record<string, unknown> }>,
): Promise<string[]> {
  if (details.length === 0) return [];
  const terminalCharacters = details
    .map(({ offender }) => {
      const status = String(
        Object.values(entities).find(entity => entity?.name === offender)?.attributes?.status ?? ''
      );
      return status ? `${offender}（${status}）` : offender;
    })
    .filter(Boolean);
  try {
    const rewritten = await ai.generate<string>({
      purpose: 'outline-repair-bp',
      schemaName: 'RawText',
      system: [
        '你是网文章节大纲修复员。下列 mustCover 节拍点名了已进入命运终态的角色，原样执行会与既成状态冲突（fact_conflict 拒稿），但直接删除会让关键剧情节拍静默蒸发。',
        '把每个节拍改写为合法等价形态，必须保留节拍的核心信息量与主线推进作用：',
        '- 在押/下狱角色：狱中受审、押解途中、狱中密信、商帮/部属/家眷代理人代行、他人转述其指令；公堂宣判类节拍本身合法（在押形态受审即正确形态，只需把「自由身行动」改为「在押受审/押解到庭」）',
        '- 死亡/驾崩角色：遗物、遗诏、生前密信被起获，他人回忆/追述/翻案',
        '- 去职角色：除非节拍明写复职过程，否则以其继任者/原部属接管该职能',
        '禁止把节拍弱化成一句提及或直接删除。输出：每行一条改写后节拍，行数与输入一致，不要编号不要解释。',
      ],
      prompt: JSON.stringify({ chapterNumber, terminalCharacters, prunedNodes: details.map(({ item }) => item) }),
      parse: (raw: unknown) => {
        if (typeof raw === 'string') return raw;
        // RawText schema 真实链路返回结构化包装对象：解包已知的文本键
        if (raw && typeof raw === 'object') {
          const record = raw as Record<string, unknown>;
          for (const key of ['rawText', 'RawText', 'text', 'content', 'result']) {
            const value = record[key];
            if (typeof value === 'string' && value.trim()) return value;
          }
        }
        return '';
      },
    });
    const salvaged = (typeof rewritten === 'string' ? rewritten : '')
      .split(/\r?\n/)
      .map(line => line.trim())
      // 行级防御：节拍必须含 CJK 且非 "[object …]" 骨架（对象被 String 的残留形态）
      .filter(line =>
        line.length >= 8 &&
        /[\u4e00-\u9fa5]/u.test(line) &&
        !/^\[object\b/u.test(line)
      )
      .slice(0, details.length);
    if (salvaged.length > 0) {
      console.info(
        `[LongFormWritingEngine] ch${chapterNumber} 陈旧节拍改写回填 ${salvaged.length}/${details.length} 条`
      );
    }
    return salvaged;
  } catch (error) {
    console.warn(
      `[LongFormWritingEngine] ch${chapterNumber} 陈旧节拍改写失败，保留裁剪（节拍蒸发风险，triage 跟进）：`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
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

/** 叙述段过重（叙述段中位字数超阈值）是否在报告里——2026-09-27 新维度：
 *  对话段与叙述段混在同一总体时，对话短段拉低均值拉高 CV，「全章叙述段
 *  都是 200 字墙」在均值/CV/绝对长度三处门禁全部漏检；叙述段单列后与
 *  均匀化同机制驱动定向拆段改稿。 */
export function narrativeDensityIssueIds(report: ContinuityReport): string[] {
  return report.issues
    .filter(
      issue =>
        issue.id.startsWith('typesetting-density') &&
        issue.message.includes('叙述段过重')
    )
    .map(issue => issue.id);
}

/** 节点原句照抄（mustCover ≥12 字逐字入正文）是否在报告里——prompt 禁抄与
 *  judge 规则在长跑尺度漏网（2026-09-12 gemini 终验 4 处终稿实锤），确定性
 *  门禁命中后与均匀化同机制驱动定向改写。 */
export function nodeVerbatimIssueIds(report: ContinuityReport): string[] {
  return report.issues
    .filter(
      issue =>
        issue.id.startsWith('node-verbatim-overlap') ||
        issue.message.includes('节点原句照抄') ||
        issue.message.includes('节点抄用')
    )
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
    const { chapter: healedChapterBase, report: healthReport } = healChapterContract(
      input.contracts.chapter,
      { state: input.state }
    );
    let healedChapter = healedChapterBase;
    if (healthReport.notes.length > 0) {
      console.info(
        `[LongFormWritingEngine] ch${healedChapter.chapterNumber} 合同健康度:`,
        healthReport.notes.join('；')
      );
    }
    // 裁而不弃（2026-09-30 r16 S2-41/52 实证：节拍静默蒸发）：陈旧度裁剪把点名
    // 终态角色的节拍整句裁除后写手从未见过——章节照常通过却节拍蒸发（钱半江
    // ch103/113 节点被裁后 25 章零出场、三司会审宣判 payoff 整体跳过）。把被裁
    // 节拍交 AI 改写为合法形态回填 mustCover；改写失败仅告警（fail-open，保留
    // 原裁剪行为——裁剪本身仍是防 fact_conflict 拒稿的正确防线）。
    if ((healthReport.staleRemovedDetails ?? []).length > 0) {
      const salvaged = await salvageStaleMustCover(
        this.dependencies.ai,
        healthReport.staleRemovedDetails,
        healedChapter.chapterNumber,
        input.state.entities ?? {}
      );
      if (salvaged.length > 0) {
        healedChapter = {
          ...healedChapter,
          mustCover: [...(healedChapter.mustCover ?? []), ...salvaged],
        };
      }
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
    const narrativeIssueIdsBefore = narrativeDensityIssueIds(report);
    const verbatimIssueIdsBefore = nodeVerbatimIssueIds(report);
    const realEraIssueIdsBefore = realEraNameIssueIds(report);
    // 弱信号驱动的定向改稿（均匀化/叙述段过重/节点照抄/真实年号混入）：唯一改稿
    // 动因为 warning 级确定性信号时合并为必须处理，否则 agent 可对 warning
    // 不改稿直接 finish
    const weakSignalIssueIds = [
      ...uniformIssueIdsBefore,
      ...narrativeIssueIdsBefore,
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
        maxChecks:
          weakSignalDriven && (uniformIssueIdsBefore.length > 0 || narrativeIssueIdsBefore.length > 0)
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
        // 词汇档位（全书唯一）：改稿与起草同一口径，防改稿回合把术语密度改飘
        vocabularyTier: writeInput.vocabularyTier,
        creativeCompass: writeInput.creativeCompass,
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
      if (narrativeIssueIdsBefore.length > 0 && narrativeDensityIssueIds(report).length > 0) {
        console.info(
          `[LongFormWritingEngine] ch${contracts.chapter.chapterNumber} 叙述段过重改稿后仍未达标（中位字数超标），保留改写稿（narrative-heavy-survived，不阻断）`
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
            // 未闭合悬念承接（2026-10-01 P1.1 悬念账本）：近章 CEN 摆到眼前，
            // 本章必须接住至少一条
            recentChapterCliffhangers: input.recentChapterCliffhangers,
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
          // 期限承诺（契约 17）：待兑现清单，越期必须兑现或显式改期
          timePromises: input.timePromises,
          // 时间轴（storyClock 轻量版）：近章时间标记，流逝必须连续
          timelineMarks: input.timelineMarks,
          // 作者正典（locked 规则）：起草侧显式约束块
          authorCanon: input.authorCanon,
          // 身份锚：出场角色身份与角色卡一致（r6 实证同一角色前后两身份）
          characterIdentityAnchors: input.characterIdentityAnchors,
          // 假死纪律：假死角色隐匿活动合法+公开现身需揭晓（r8 实证假死被当死亡锁死主角）
          fakedDeathCharacters: input.fakedDeathCharacters,
          // 命运状态正典（2026-09-24 g38f 500ch S1/S2）：每角色最新命运状态
          fateStatusAnchors: input.fateStatusAnchors,
          // 实体状态卡（unified-state-ledger 第 2 阶段）：在场时替换正典块
          stateCard: input.stateCard,
          // 词汇档位（全书唯一）：起草与改稿同一口径（proseRules SSOT 渲染）
          vocabularyTier: writeInput.vocabularyTier,
          sceneBeats: contracts.chapter.sceneBeats,
          creativeCompass: writeInput.creativeCompass,
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
            timePromises: input.timePromises ?? [],
            timelineMarks: input.timelineMarks ?? [],
            breathBeatRequired: input.breathBeatRequired ?? false,
            mentionEvidence: input.mentionEvidence ?? [],
            authorCanon: input.authorCanon ?? [],
            // 假死例外（判官侧）：假死=活着隐匿中，活体活动不报复活冲突
            fakedDeathCharacters: input.fakedDeathCharacters ?? [],
            stateCard: input.stateCard ?? [],
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
        // 节点原句照抄确定性检测（判官 17 轮零报实证：逐字比对非模型所长，
        // 由代码兜）：CBN/CEN 与 mustCover 一并送检
        contractNodes: [
          String(contracts.chapter.CBN ?? '').trim(),
          String(contracts.chapter.CEN ?? '').trim(),
          ...(contracts.chapter.mustCover ?? []),
        ].filter(Boolean),
      }),
    };
  }

  /**
   * 字数归一：超长走 AI 整章压缩；偏短先把全文放回上下文扩写一次，仍短再 append-only 补字。
   * 字数上限不变。扩写失败或没有变长时保留初稿，再走补字。
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
      const expanded = await this.expandDraftInPlace(nextDrafts, input);
      const expandedBounds = checkWordCountBounds(draftsProse(expanded), target);
      if (expandedBounds.status === 'over') {
        return this.trimDraftsIfOverTarget(expanded, input);
      }
      if (expandedBounds.status === 'short') {
        return this.padDraftsIfUnderTarget(expanded, input, expandedBounds);
      }
      return expanded;
    }
    return nextDrafts;
  }

  /**
   * 偏短时先整章扩写一次：已有全文留在上下文里，只在原情节内补场面。
   * 没变长、解析失败或异常膨胀时退回原文，交给后面的 append-only 补字。
   */
  private async expandDraftInPlace(
    drafts: SceneDraft[],
    input: LongFormWriteInput,
  ): Promise<SceneDraft[]> {
    const target = input.targetWordCount ?? 0;
    if (target <= 0 || drafts.length === 0) return drafts;
    const original = draftsProse(drafts);
    const bounds = checkWordCountBounds(original, target);
    if (bounds.status !== 'short') return drafts;
    const beats = [
      ...(input.contracts.chapter.sceneBeats ?? []),
      input.contracts.chapter.CBN,
      ...(input.contracts.chapter.CPNs ?? []),
      input.contracts.chapter.CEN,
    ]
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    try {
      const paragraphs = (await this.dependencies.ai.generate<string[]>({
        purpose: 'scene-draft',
        schemaName: IN_PLACE_EXPAND_SCHEMA,
        system: [
          '你是长篇小说的场景作者。下面这份稿偏短。在原有情节内部补对话、动作和感官，输出完整章节。',
          '不要新开支线，不要把已写过的场面换措辞再写一遍，不要把章末悬念当场解释掉。',
          '只输出一个 JSON 对象：{"paragraphs":["段落1","段落2"]}',
        ].join('\n'),
        prompt: buildInPlaceExpandPrompt({
          paragraphs: drafts.flatMap(draft => draft.paragraphs),
          target,
          minWords: bounds.minWords,
          maxWords: bounds.maxWords,
          title: input.contracts.chapter.title,
          beats,
        }),
        parse: value => {
          const record =
            typeof value === 'object' && value !== null && !Array.isArray(value)
              ? (value as Record<string, unknown>)
              : {};
          const raw = record.paragraphs ?? value;
          const next = sanitizeSceneDraftParagraphs(
            Array.isArray(raw)
              ? raw.filter((item): item is string => typeof item === 'string')
              : typeof raw === 'string'
                ? raw.split(/\n{2,}/u)
                : [],
          );
          if (next.length === 0) {
            throw new Error('整章扩写未返回可用段落');
          }
          return next;
        },
      })) as string[];
      const expandedProse = paragraphs.join('\n\n');
      const hardClampChars = Math.max(12000, target * 8);
      if (
        drafts.length !== 1 ||
        expandedProse.length <= original.length ||
        expandedProse.length > hardClampChars
      ) {
        return drafts;
      }
      const first = drafts[0];
      if (!first) return drafts;
      return [{ ...first, paragraphs }];
    } catch (error) {
      console.warn(
        '[LongFormWritingEngine] 整章扩写失败，改走末尾补字:',
        error instanceof Error ? error.message : error,
      );
      return drafts;
    }
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

    const condenseOnce = async (content: string): Promise<string | null> => {
      try {
        const condensedParagraphs = (await this.dependencies.ai.generate<string[]>({
          purpose: 'scene-draft',
          schemaName: 'CondenseParagraphs',
          system: [
            '你是网文压缩改写引擎。只输出一个 JSON 对象：{"paragraphs":["段落1","段落2"]}',
            `当前约 ${countWords(content)} 字，必须压缩到 ${bounds.minWords}–${bounds.maxWords} 字（目标 ${target}）。`,
            `严禁压到低于 ${bounds.minWords} 字；删注水即可，不要压成剧情梗概。`,
            '保留全部关键情节与章末钩子；不要输出 Markdown 代码块或解释。',
          ].join('\n'),
          prompt: buildCondensePrompt({
            existingContent: content,
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

        return condensedParagraphs.length > 0 ? condensedParagraphs.join('\n\n') : null;
      } catch (error) {
        console.warn('[LongFormWritingEngine] 超长压缩失败，保留完整原稿并交由字数门禁:', error);
        return null;
      }
    };

    const firstPass = await condenseOnce(originalProse);
    let chosen = chooseProseAfterCondense({
      originalProse,
      condensedProse: firstPass ?? originalProse,
      target,
    });

    // 第二轮压缩（2026-09-29 reg20 实测：单轮只压掉 ~10%，三章 3600–4100 仍超上限
    // 3540 就放弃了）。仍超且第一轮确有缩短时对压缩稿再压一轮；塌方/无效则保持
    // 第一轮结果，总轮数硬上限 2 防循环。门控取「有任何缩短」而非 ≥5%——
    // r15fix-reg20 ch8 实证：3613→3567（-1.3%）的边缘超写恰是最需要补刀的场景，
    // 5% 门槛把它拦在第二轮外，叠判官语义矛盾五连拒成洞。
    if (chosen.strategy === 'condensed-kept') {
      const firstLen = countWords(firstPass ?? '');
      if (firstLen > 0 && firstLen < countWords(originalProse)) {
        const secondPass = await condenseOnce(chosen.prose);
        if (secondPass) {
          const secondChosen = chooseProseAfterCondense({
            originalProse: chosen.prose,
            condensedProse: secondPass,
            target,
          });
          if (secondChosen.strategy !== 'original-kept') {
            chosen = secondChosen;
            if (secondChosen.strategy === 'condensed') {
              console.info(
                `[LongFormWritingEngine] 第二轮压缩后落回目标区间（${secondChosen.bounds.currentWords} 字）`
              );
            }
          }
        }
      }
    }

    // 边缘超写确定性裁剪（2026-10-01 p1reg20 ch10 实证）：两轮 AI 压缩后仍超、
    // 且超限量 ≤ 上限 5% 时，删段尾完整句落回限内——比整章重写兜底便宜三个
    // 数量级，且不掐断句子（与「不硬裁」取舍不冲突的是掐断，不是删完整句）
    const afterCondenseBounds = checkWordCountBounds(chosen.prose, target);
    if (
      afterCondenseBounds.status === 'over' &&
      afterCondenseBounds.currentWords - afterCondenseBounds.maxWords <=
        Math.ceil(afterCondenseBounds.maxWords * 0.05)
    ) {
      const edgeTrimmed = trimEdgeOverflowToBound(
        chosen.prose,
        afterCondenseBounds.maxWords
      );
      if (edgeTrimmed) {
        console.info(
          `[LongFormWritingEngine] 边缘超写句裁剪：${afterCondenseBounds.currentWords}→${countWords(edgeTrimmed)} 字（上限 ${afterCondenseBounds.maxWords}）`
        );
        chosen = {
          prose: edgeTrimmed,
          strategy: 'condensed',
          bounds: checkWordCountBounds(edgeTrimmed, target),
        };
      }
    }

    if (chosen.strategy === 'original-kept') {
      console.warn(
        `[LongFormWritingEngine] AI 压缩过度（→${checkWordCountBounds(firstPass ?? '', target).currentWords} 字），回退原文不再硬裁（优先正文质量）`
      );
    } else if (chosen.strategy === 'condensed-kept') {
      console.info(
        `[LongFormWritingEngine] 两轮压缩后仍超上限（${chosen.bounds.currentWords}/${bounds.maxWords}），保留压缩稿不再硬裁（优先正文质量）`
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
