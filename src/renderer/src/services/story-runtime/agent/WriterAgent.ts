/**
 * 章节改稿 agent 回合（docs/agent-architecture-refactor.md P2）。
 *
 * 初稿由 SceneDraftEngine 单次起草并经引擎审查；未通过时不再「规则拼提示 → 整章盲重写」，
 * 而是把 WriterToolkit（get_draft / revise_paragraphs / submit_draft / run_checks）与
 * BookToolkit 六读交给 AgentLoopRunner：模型自己读问题、查事实、局部改稿、复检，
 * blocking=0 才能 finish。落库物恒为最后一次通过审查链的 revision。
 *
 * 约束：本文件不落库、不构造 AI 客户端；transport 与审查端口全部由调用方注入。
 */
import type {
  ContextPack,
  ContractPack,
  SceneChunk,
  SceneDraft,
  StoryState,
} from '@/types/story-runtime';

import {
  AgentLoopRunner,
  renderToolList,
  type AgentFinishReason,
  type AgentLoopOptions,
  type AgentLoopStats,
  type AgentLoopTransport,
  type AgentRoundLog,
  type AgentSession,
} from './AgentLoopRunner';
import { CompositeToolkit, type AgentToolkit } from './AgentToolkit';
import {
  BookToolkit,
  type AgentSceneSearchPort,
  type ToolkitForeshadowEntry,
} from './BookToolkit';
import { WriterToolkit, type ChapterReviewOutcome, type ChapterReviewPort } from './WriterToolkit';
import { CHAPTER_STRUCTURE_RULES, CHAPTER_STYLE_RULES } from '../proseRules';
import { MAX_WORD_THRESHOLD, MIN_WORD_THRESHOLD } from '@/services/writing/supplement';

export interface WriterAgentStepInput {
  chapterNumber: number;
  contracts: ContractPack;
  state: StoryState;
  context: ContextPack;
  /** 全书已提交场景块(read_chapter/search_scenes 数据源) */
  sceneChunks: SceneChunk[];
  initialDrafts: SceneDraft[];
  initialReview: ChapterReviewOutcome;
  reviewPort: ChapterReviewPort;
  /** run_checks 预算 = 旧 maxRewriteRounds(每次审查成本等价一轮重写) */
  maxChecks: number;
  targetWordCount?: number;
  previousChapterEnding?: string;
  allowedAppearanceNames: string[];
  knownCharacterNames: string[];
}

export interface WriterAgentStepResult extends ChapterReviewOutcome {
  drafts: SceneDraft[];
  /** 实际消耗的审查次数(对应旧 rewriteRounds 口径) */
  checksUsed: number;
  finishReason: AgentFinishReason;
  transcript: AgentRoundLog[];
  stats: AgentLoopStats;
  /** 模型改稿后未复检、被回退到上一已审查稿 */
  revertedUnchecked: boolean;
}

export interface WriterAgentStep {
  revise(input: WriterAgentStepInput): Promise<WriterAgentStepResult>;
}

interface WriterFinish {
  summary?: string;
}

/** 改稿回合默认预算:系统任务书含上下文包(可达 2 万 token),每轮全量重发,预算需比检索回合宽 */
export const WRITER_AGENT_DEFAULT_OPTIONS: AgentLoopOptions = {
  timeoutMs: 480_000,
  tokenBudget: 200_000,
  maxConsecutiveParseFailures: 3,
  stallNoProgressLimit: 2,
  maxFinishRejections: 3,
};

const WRITER_WRAP_UP_PROMPT =
  '连续多轮没有实质进展。请立即收尾:若当前稿已通过 run_checks 则输出 {"action":"finish","summary":"..."};' +
  '否则做最后一次针对性 revise_paragraphs 并 run_checks,再 finish。不要再重复读稿或重复查询。';

const WRITER_PROTOCOL_HINT =
  '上一轮输出无法解析。每轮只输出一个 JSON 对象:' +
  '{"thought":"...","action":"tool_call","tool":"工具名","args":{...}} 或 {"action":"tool_call","calls":[...]}(最多 3 个) 或 {"action":"finish","summary":"..."},不要任何多余文字。请重试。';

/** 渲染给改稿 agent 的上下文块:只取合同/状态/档案/文风,近章原文与检索片段交给工具按需读 */
function renderContextBlocks(context: ContextPack): string {
  const wanted = new Set(['locked-contracts', 'current-state', 'research-dossier', 'style']);
  return context.blocks
    .filter(block => wanted.has(block.kind))
    .map(block => `<${block.kind}>\n${block.content}\n</${block.kind}>`)
    .join('\n\n');
}

export function buildWriterBrief(input: WriterAgentStepInput, toolkit: AgentToolkit): string {
  const chapter = input.contracts.chapter;
  const target = input.targetWordCount ?? 0;
  const wordRules =
    target > 0
      ? [
          `- 目标 ${target} 字,硬性区间 ${Math.floor(target * MIN_WORD_THRESHOLD)}–${Math.ceil(target * MAX_WORD_THRESHOLD)} 字(全文长度口径);区间外 run_checks 必报 blocking`,
        ]
      : [];
  const nameRules =
    input.knownCharacterNames.length >= 2
      ? [`- 【已登记角色名】只能使用:${input.knownCharacterNames.join('、')};不得写成形近/近义字`]
      : [];
  const appearanceRules =
    input.allowedAppearanceNames.length > 0
      ? [`- 【本章出场名单】只有 ${input.allowedAppearanceNames.join('、')} 可现身、说话或行动;其他已登记角色最多被提及`]
      : [];
  const previousEnding = (input.previousChapterEnding ?? '').trim().slice(-200);

  return [
    '你是这部连载长篇的责编兼改稿作者。本章初稿已写好但未通过审查,你要把它改到通过,而不是重新写一本。',
    '你能直接读稿、局部改稿、整章重写、跑与提交门禁完全相同的审查,也能查状态库/旧章原文核实事实。',
    '落库的正文只会是最后一次通过审查的版本:改完不复检等于白改。',
    '',
    `【本章合同】第${chapter.chapterNumber}章《${chapter.title}》`,
    `- 目标:${chapter.goal}`,
    `- 开场(CBN):${chapter.CBN}`,
    `- 推进(CPN):${chapter.CPNs.join(';')}`,
    `- 收尾(CEN):${chapter.CEN}`,
    `- 必须覆盖:${chapter.mustCover.join(';')}`,
    chapter.forbidden?.length ? `- 禁区:${chapter.forbidden.join(';')}` : '- 禁区:(无)',
    ...wordRules,
    ...nameRules,
    ...appearanceRules,
    ...(previousEnding
      ? [`- 【上章结尾原文】「…${previousEnding}」——本章开场必须承接此状态,不得回退到 CBN 字面`]
      : []),
    '',
    '【写作上下文】',
    renderContextBlocks(input.context),
    '',
    '【正文硬规则】(审查会按这些口径打 blocking/warning)',
    ...CHAPTER_STRUCTURE_RULES,
    ...CHAPTER_STYLE_RULES,
    '',
    '【可用工具】',
    renderToolList(toolkit),
    '',
    '【改稿流程】',
    '1. 先 get_draft 拿到带索引的全文,对照首条消息里的问题清单定位到具体段落。',
    '2. 凡涉及事实的问题(角色生死/位置/知情/持有物、前情、伏笔状态),先用 query_entity / search_scenes / read_chapter 核实,再改;不得凭印象改。',
    '3. 优先 revise_paragraphs 局部改(替换/删除/插入段落);只有问题遍布全章时才 submit_draft 整章重写。字数不足用 insertAfter 在合适位置加有效场面,不注水。',
    '4. 改完必须 run_checks;blocking=0 才输出 finish。warning 尽量顺手修掉。',
    '5. 审查预算有限(见 run_checks 返回的 checksRemaining),一次改稿尽量把清单上的问题全部处理完再复检,不要改一处检一次。',
    '',
    '【协议】每轮只输出一个 JSON 对象,禁止输出 JSON 之外的任何文字。',
    '{"thought":"简述要做什么与为什么","action":"tool_call","tool":"工具名","args":{...}}',
    '互相独立的查询可合并一轮(最多 3 个):{"thought":"...","action":"tool_call","calls":[{"tool":"query_entity","args":{"name":"某人"}},{"tool":"get_draft","args":{}}]}',
    '改稿工具(revise_paragraphs/submit_draft/run_checks)每轮只发一个,不要与其他调用合并。',
    '收尾:{"thought":"…","action":"finish","summary":"改了哪些段落、解决了哪些问题"}',
  ].join('\n');
}

function reviewToKickoff(review: ChapterReviewOutcome, checksRemaining: number): string {
  const issues = [...review.report.issues]
    .sort((a, b) => (a.severity === 'blocking' ? 0 : 1) - (b.severity === 'blocking' ? 0 : 1))
    .slice(0, 12)
    .map(issue => ({
      id: issue.id,
      severity: issue.severity,
      message: issue.message.slice(0, 240),
      evidence: issue.evidence.slice(0, 2).map(item => item.slice(0, 120)),
    }));
  return JSON.stringify({
    initialReview: {
      accepted: review.report.accepted,
      blocking: issues.filter(issue => issue.severity === 'blocking').length,
      checksRemaining,
      issues,
    },
    instruction: '这是初稿的审查结果。请按【改稿流程】开始:先 get_draft。',
  });
}

export interface CreateWriterAgentStepOptions {
  foreshadowCatalog?: ToolkitForeshadowEntry[];
  searchPort?: AgentSceneSearchPort;
  loopOptions?: AgentLoopOptions;
  /** 回合结束回调(trace 汇总用) */
  onSummary?(summary: {
    chapterNumber: number;
    finishReason: AgentFinishReason;
    transcript: AgentRoundLog[];
    stats: AgentLoopStats;
    checksUsed: number;
    revertedUnchecked: boolean;
  }): void;
}

/** 组装改稿回合:WriterToolkit + BookToolkit 六读 → AgentLoopRunner.run */
export function createWriterAgentStep(
  transport: AgentLoopTransport,
  options: CreateWriterAgentStepOptions = {}
): WriterAgentStep {
  return {
    async revise(input) {
      const writer = new WriterToolkit({
        initialDrafts: input.initialDrafts,
        initialReview: input.initialReview,
        reviewPort: input.reviewPort,
        maxChecks: input.maxChecks,
        targetWordCount: input.targetWordCount,
      });
      const book = new BookToolkit({
        chapterNumber: input.chapterNumber,
        contracts: input.contracts,
        state: input.state,
        sceneChunks: input.sceneChunks,
        foreshadowCatalog: options.foreshadowCatalog,
        searchPort: options.searchPort,
      });
      const toolkit = new CompositeToolkit([writer, book]);
      const runner = new AgentLoopRunner(transport, toolkit, {
        ...WRITER_AGENT_DEFAULT_OPTIONS,
        ...options.loopOptions,
      });
      const session: AgentSession<WriterFinish> = {
        systemPrompt: buildWriterBrief(input, toolkit),
        kickoffMessage: reviewToKickoff(input.initialReview, writer.checksRemaining()),
        wrapUpPrompt: WRITER_WRAP_UP_PROMPT,
        protocolHint: WRITER_PROTOCOL_HINT,
        // get_draft 要回喂整章全文,默认 3600 字符会截断
        resultClipChars: 20_000,
        parseFinish: record => ({
          summary: typeof record.summary === 'string' ? record.summary : undefined,
        }),
        guardFinish: () => writer.guardFinish(),
        progressVersion: () => writer.progressVersion(),
      };
      const outcome = await runner.run(session);
      const final = writer.resolveFinal();
      const result: WriterAgentStepResult = {
        drafts: final.drafts,
        facts: final.facts,
        report: final.report,
        checksUsed: writer.checksConsumed(),
        finishReason: outcome.finishReason,
        transcript: outcome.transcript,
        stats: outcome.stats,
        revertedUnchecked: final.revertedUnchecked,
      };
      options.onSummary?.({
        chapterNumber: input.chapterNumber,
        finishReason: outcome.finishReason,
        transcript: outcome.transcript,
        stats: outcome.stats,
        checksUsed: result.checksUsed,
        revertedUnchecked: result.revertedUnchecked,
      });
      return result;
    },
  };
}
