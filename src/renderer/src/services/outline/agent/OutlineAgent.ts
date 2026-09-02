/**
 * 大纲修复 agent 回合（docs/agent-architecture-refactor.md P3）。
 *
 * 分步生成 + 结构补全产出的大纲初稿进入这里后，不再走「审查请求整份重写 → 定点修复 →
 * 补登记 → sanitize」的手写修复链，而是把 OutlineToolkit 交给 AgentLoopRunner：
 * 模型自己读门禁结果、读对应段/章、局部改写、复检，blockers=0 才能 finish。
 * 采用物恒为最后一次 run_checks 过的 revision；出口是否可应用由调用方按 canApply 判定。
 *
 * 约束：本文件不构造 AI 客户端、不落库；transport 由 UnifiedOutlineGenerator 注入，
 * 冒烟与 App 走同一入口（单轨）。
 */
import {
  AgentLoopRunner,
  renderToolList,
  type AgentFinishReason,
  type AgentLoopOptions,
  type AgentLoopStats,
  type AgentLoopTransport,
  type AgentRoundLog,
  type AgentSession,
} from '@/services/story-runtime/agent/AgentLoopRunner';

import type { OutlineDirection } from '../types/direction';
import type { ExecutableOutline } from '../types/executable-outline';
import { OUTLINE_COMPLETENESS_POLICY } from '../validation/outlineCompleteness';
import { OPENING_HOOK_LIMIT } from '../generators/outline-reviewer';
import { OutlineToolkit, type CheckedOutlineRevision, type OutlineCheckOutcome } from './OutlineToolkit';

export interface OutlineRepairAgentInput {
  rawText: string;
  outline: ExecutableOutline;
  direction: OutlineDirection;
  transport: AgentLoopTransport;
  /** run_checks 预算,默认 12 */
  maxChecks?: number;
  loopOptions?: AgentLoopOptions;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export interface OutlineRepairAgentResult extends OutlineCheckOutcome {
  rawText: string;
  outline: ExecutableOutline;
  /** 是否真的跑了 agent 循环(初稿已通过门禁且零质检问题时直接跳过) */
  agentRan: boolean;
  finishReason: AgentFinishReason;
  transcript: AgentRoundLog[];
  stats: AgentLoopStats;
  checksUsed: number;
  /** 模型改稿后未复检、被回退到上一已校验 revision */
  revertedUnchecked: boolean;
  warnings: string[];
}

interface OutlineFinish {
  summary?: string;
}

/** 大纲回合默认预算:系统任务书含方向卡与规则(数千 token),读段/读章结果较大,预算比章节改稿略宽 */
export const OUTLINE_AGENT_DEFAULT_OPTIONS: AgentLoopOptions = {
  timeoutMs: 600_000,
  tokenBudget: 240_000,
  maxConsecutiveParseFailures: 3,
  // 修大纲前正常要连读几段/几批章,读不算进展;放宽到 4 轮再注入收尾提示
  stallNoProgressLimit: 4,
  maxFinishRejections: 3,
};

export const OUTLINE_AGENT_DEFAULT_MAX_CHECKS = 12;

const OUTLINE_WRAP_UP_PROMPT =
  '连续多轮没有实质进展(没有写入也没有新校验)。请立即收尾:若 run_checks 已 blockers=0 则输出 {"action":"finish","summary":"..."};' +
  '否则针对 blockers 做最后一批修复并 run_checks,再 finish。不要再重复读取。';

const OUTLINE_PROTOCOL_HINT =
  '上一轮输出无法解析。每轮只输出一个 JSON 对象:' +
  '{"thought":"...","action":"tool_call","tool":"工具名","args":{...}} 或 {"action":"tool_call","calls":[...]}(最多 3 个) 或 {"action":"finish","summary":"..."},不要任何多余文字。请重试。';

function formatDirection(direction: OutlineDirection): string {
  const lines = [
    `标题:${direction.title}`,
    `一句话卖点:${direction.oneLiner}`,
    `premise:${direction.premise}`,
    `主角成长路径:${direction.protagonistArc}`,
    `核心冲突:${direction.coreConflict}`,
  ];
  if (direction.coolPointStyle?.length > 0) {
    lines.push(`爽点风格:${direction.coolPointStyle.join('、')}`);
  }
  if (direction.targetEmotions?.length > 0) {
    lines.push(`目标情绪:${direction.targetEmotions.join('、')}`);
  }
  return lines.join('\n');
}

export function buildOutlineBrief(direction: OutlineDirection, toolkit: OutlineToolkit): string {
  const policy = OUTLINE_COMPLETENESS_POLICY;
  return [
    '你是这部长篇网文的总策划兼大纲质检员。大纲初稿已生成但未通过落库门禁,你要把它修到通过,而不是重写一份。',
    '你能按段/按章读大纲、局部改写、追加登记条目、做确定性收缩,并跑与落库门禁完全相同的检查。',
    '采用的只会是最后一次通过 run_checks 的版本:改完不复检等于白改。',
    '',
    '【方向卡】(不得更换主角、核心卖点与题材)',
    formatDirection(direction),
    '',
    '【门禁硬阈值】(run_checks 按这些口径打 blockers)',
    `- 单章蓝图:前 ${policy.startupChapterCount} 章齐全、章号连续;标题 ${policy.titleMinChars}–${policy.titleMaxChars} 字非占位;CBN/CEN ${policy.hookMinChars}–${policy.hookMaxChars} 字;CPNs ${policy.minimumCpns}–${policy.maximumCpns} 条;mustCover 非空`,
    `- 关键角色规划 ≥ ${policy.minimumKeyCharacters} 个,伏笔规划 ≥ ${policy.minimumForeshadows} 条`,
    `- 开篇钩子非空且 ≤ ${OPENING_HOOK_LIMIT} 字,单场景动作钩子`,
    '- 【角色真源】卷纲/支线/伏笔/蓝图里出现的每个具名人物都必须在「关键角色规划」有完整角色块;职位、阵营标签不算姓名。缺人就 append_to_section 补角色块,禁止改名替换卷纲人物',
    '- 【规模真源】总字数/总章数/平均章字数/卷数/每卷章数互相能验算;任何引用章号不得超过总章数',
    '- 章序时间线不得倒退;相邻章开场不得重演上一章结尾',
    '',
    '【内容规则】(qualityIssues 口径,尽量顺手修掉)',
    '- 启动包每条「必出事件」是单章可兑现的独立事件,8–30 字一句话,禁止占位话术(推进主线/待定/略)',
    '- 禁止任何括号(中英文),补充说明用逗号并入句中',
    '- CBN 不得是「承接上章结尾」类模板话术;mustCover 不得跨章(一条只承诺本章能兑现的事)',
    '- 禁区不得整块复制到每一章;金手指首次兑现不晚于第 3 章',
    '',
    '【可用工具】',
    renderToolList(toolkit),
    '',
    '【修复流程】',
    '1. 首条消息已给出初稿的 run_checks 结果。先按 blockers 的 kind/chapterNumber 分组:章级问题(invalid-*/placeholder-title/incomplete-blueprint/chronology/repetition)→ get_chapters 读原稿后 rewrite_chapters;段级问题(opening-hook/character-count/foreshadow-count/inconsistent-story-scale/out-of-range)→ get_section 读正文与模板后 replace_section 或 append_to_section。',
    '2. unknown-character-reference:先 get_overview 看已登记角色与出现该名字的卷/章,再 append_to_section 到「关键角色规划」补完整角色块(姓名必须与引用处逐字一致)。unknown-location-reference:直接 register_locations。',
    '3. 超长标题/CBN/CEN 先 shrink_hooks(零成本);收不进区间的章再 rewrite_chapters 手改。',
    '4. 改章时只给需要改的字段,其余沿用原稿;一批最多 10 章。写入被拒绝时按错误文案修正后重发,不要换别的章绕开。',
    '5. 每批修复后 run_checks;blockers=0 才输出 finish。预算有限(见 checksRemaining),一次尽量把同类问题全修完再复检。',
    '',
    '【协议】每轮只输出一个 JSON 对象,禁止输出 JSON 之外的任何文字。',
    '{"thought":"简述要做什么与为什么","action":"tool_call","tool":"工具名","args":{...}}',
    '互相独立的读取可合并一轮(最多 3 个):{"thought":"...","action":"tool_call","calls":[{"tool":"get_chapters","args":{"from":1,"to":10}},{"tool":"get_section","args":{"name":"关键角色规划"}}]}',
    '写类工具(rewrite_chapters/replace_section/append_to_section/register_locations/shrink_hooks)与 run_checks 每轮只发一个,不要与其他调用合并。',
    '收尾:{"thought":"…","action":"finish","summary":"修了哪些章/段、解决了哪些 blockers"}',
  ].join('\n');
}

function checkToKickoff(checked: CheckedOutlineRevision, checksRemaining: number): string {
  const blockers = checked.completeness.blockers;
  const warnings = checked.completeness.warnings ?? [];
  return JSON.stringify({
    initialCheck: {
      canApply: checked.completeness.canApply,
      blocking: blockers.length,
      checksRemaining,
      blockers: blockers.slice(0, 30).map(blocker => ({
        kind: blocker.kind,
        chapterNumber: blocker.chapterNumber ?? null,
        message: blocker.message.slice(0, 200),
      })),
      blockersOmitted: Math.max(0, blockers.length - 30),
      warnings: warnings.slice(0, 10).map(item => item.message.slice(0, 160)),
      qualityIssues: checked.qualityIssues.slice(0, 20).map(issue => ({
        kind: issue.kind,
        chapterNumber: issue.chapterOrder ?? null,
        detail: issue.detail.slice(0, 200),
      })),
    },
    instruction: '这是初稿的门禁与质检结果。请按【修复流程】开始。',
  });
}

/**
 * 跑一轮大纲修复 agent。初稿已通过门禁且零质检问题时不发任何 AI 请求直接返回。
 * 用户取消(AbortError)与工具致命错误原样上抛;其余收束原因(stall/budget/protocol-error)
 * 都返回最后一次校验过的稿,由调用方按 canApply 做 fail-closed。
 */
export async function runOutlineRepairAgent(
  input: OutlineRepairAgentInput
): Promise<OutlineRepairAgentResult> {
  const toolkit = new OutlineToolkit({
    rawText: input.rawText,
    outline: input.outline,
    maxChecks: input.maxChecks ?? OUTLINE_AGENT_DEFAULT_MAX_CHECKS,
  });
  const initial = toolkit.recordCheck();
  const warnings: string[] = [];

  if (initial.completeness.canApply && initial.qualityIssues.length === 0) {
    return {
      rawText: initial.snapshot.rawText,
      outline: initial.snapshot.outline,
      completeness: initial.completeness,
      qualityIssues: initial.qualityIssues,
      agentRan: false,
      finishReason: 'model-finish',
      transcript: [],
      stats: { rounds: 0, toolCalls: 0, byTool: {}, ms: 0, finishReason: 'model-finish' },
      checksUsed: 0,
      revertedUnchecked: false,
      warnings,
    };
  }

  input.onProgress?.(
    `大纲 agent 开始修复:${initial.completeness.blockers.length} 项 blockers,${initial.qualityIssues.length} 项质检问题`
  );
  const runner = new AgentLoopRunner(input.transport, toolkit, {
    ...OUTLINE_AGENT_DEFAULT_OPTIONS,
    ...input.loopOptions,
    signal: input.signal,
  });
  const session: AgentSession<OutlineFinish> = {
    systemPrompt: buildOutlineBrief(input.direction, toolkit),
    kickoffMessage: checkToKickoff(initial, toolkit.checksRemaining()),
    wrapUpPrompt: OUTLINE_WRAP_UP_PROMPT,
    protocolHint: OUTLINE_PROTOCOL_HINT,
    // get_section 要回喂整段正文(角色段可达万字),默认 3600 字符会截断
    resultClipChars: 24_000,
    parseFinish: record => ({
      summary: typeof record.summary === 'string' ? record.summary : undefined,
    }),
    guardFinish: () => toolkit.guardFinish(),
    progressVersion: () => toolkit.progressVersion(),
    onToolResult: outcome => {
      if (outcome.tool === 'run_checks') {
        const result = outcome.result as { blocking?: number; checksRemaining?: number };
        input.onProgress?.(
          `大纲 agent 第 ${outcome.round} 轮复检:剩余 ${result.blocking ?? '?'} 项 blockers(预算余 ${result.checksRemaining ?? '?'})`
        );
      } else if (outcome.tool.startsWith('get_') === false) {
        input.onProgress?.(`大纲 agent 第 ${outcome.round} 轮:${outcome.tool} 已写入暂存稿`);
      }
    },
  };
  const outcome = await runner.run(session);
  const final = toolkit.resolveFinal();

  if (final.revertedUnchecked) {
    warnings.push(
      `大纲 agent 最后一次改动未复检(收束原因 ${outcome.finishReason}),已回退到 revision ${final.revision}`
    );
  }
  if (outcome.finishReason !== 'model-finish') {
    warnings.push(`大纲 agent 按 ${outcome.finishReason} 收束,剩余 ${final.completeness.blockers.length} 项 blockers`);
  }
  input.onProgress?.(
    `大纲 agent 结束(${outcome.finishReason},${outcome.stats.rounds} 轮):剩余 ${final.completeness.blockers.length} 项 blockers`
  );
  return {
    rawText: final.snapshot.rawText,
    outline: final.snapshot.outline,
    completeness: final.completeness,
    qualityIssues: final.qualityIssues,
    agentRan: true,
    finishReason: outcome.finishReason,
    transcript: outcome.transcript,
    stats: outcome.stats,
    checksUsed: toolkit.checksConsumed(),
    revertedUnchecked: final.revertedUnchecked,
    warnings,
  };
}
