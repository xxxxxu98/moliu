import type {
  ContractPack,
  CoverageSelfAudit,
  ResearchDossier,
  ResearchFinishReason,
  ResearchRunSummary,
  SceneChunk,
  ScenePlan,
  StoryState,
} from '@/types/story-runtime';
import { robustJsonParse } from '@/utils/json-parser';

import {
  BookToolkit,
  type AgentSceneSearchPort,
  type ToolkitForeshadowEntry,
  type ToolCallResult,
} from './BookToolkit';
import { DossierBuilder } from './DossierBuilder';

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 多轮传输通道:一次 send = 一轮(输入完整消息数组,返回模型原始文本) */
export interface AgentLoopTransport {
  send(messages: AgentMessage[], options?: { signal?: AbortSignal }): Promise<string>;
}

export interface AgentRoundLog {
  round: number;
  action: 'tool_call' | 'finish' | 'rejected' | 'parse-error';
  thought?: string;
  tool?: string;
  args?: unknown;
  ok?: boolean;
  summary?: string;
}

export interface AgentLoopOptions {
  /** 检索回合墙钟(ms),默认 240s;触发即优雅降级(产出部分 dossier+gaps) */
  timeoutMs?: number;
  /** 消息累计 token 估算预算,默认 60k */
  tokenBudget?: number;
  /** 连续解析失败上限,默认 3;达到即 protocol-error 降级 */
  maxConsecutiveParseFailures?: number;
  /** 连续无新信息轮数上限,默认 2;达到先注入收尾提示,仍不收尾则 stall */
  stallNoProgressLimit?: number;
  signal?: AbortSignal;
  /** 时钟注入(测试用) */
  now?: () => number;
}

export interface AgentResearchInput {
  chapterNumber: number;
  contracts: ContractPack;
  plan: ScenePlan;
  state: StoryState;
  sceneChunks: SceneChunk[];
  recentScenes: SceneChunk[];
  foreshadowCatalog?: ToolkitForeshadowEntry[];
  searchPort?: AgentSceneSearchPort;
}

export interface AgentLoopResult {
  dossier: ResearchDossier;
  transcript: AgentRoundLog[];
  finishReason: ResearchFinishReason;
}

const WRAP_UP_PROMPT =
  '检索已连续多轮无新信息。请立即收尾:输出 {"action":"finish","coverage":{...}},' +
  '把已确认的信息填进对应清单,确认不了的写入 gaps(说明原因),不要再发起新查询。';

/** 单轮最多并发查询数:v1.1 批量协议,砍模型-网关往返次数(100章实测均11轮/52s,主要开销即往返) */
export const MAX_CALLS_PER_ROUND = 3;

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
}

type AgentDecision =
  | { action: 'finish'; thought?: string; coverage?: CoverageSelfAudit }
  | { action: 'tool_call'; thought?: string; calls: AgentToolCall[] };

function estimateTokens(messages: AgentMessage[]): number {
  return Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/** 宽松解析协议 JSON:剥代码围栏 → 直接 parse → robustJsonParse 兜底 */
function parseDecision(raw: string): AgentDecision | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '');
  let obj: unknown = null;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        obj = JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        obj = null;
      }
    }
  }
  if (obj === null || typeof obj !== 'object') {
    const parsed = robustJsonParse(trimmed, { expectedType: 'object', enableCompletion: true });
    if (parsed.success && parsed.data && typeof parsed.data === 'object') {
      obj = parsed.data;
    }
  }
  if (obj === null || typeof obj !== 'object') return null;

  const record = obj as Record<string, unknown>;
  const thought = typeof record.thought === 'string' ? record.thought : undefined;
  if (record.action === 'finish') {
    const coverageRaw = record.coverage;
    const coverage: CoverageSelfAudit | undefined =
      coverageRaw && typeof coverageRaw === 'object' && !Array.isArray(coverageRaw)
        ? (coverageRaw as CoverageSelfAudit)
        : undefined;
    return { action: 'finish', thought, coverage };
  }
  if (record.action === 'tool_call') {
    // v1.1 批量形式:calls 数组;兼容 v1.0 单查询形式(tool+args)
    const rawCalls = Array.isArray(record.calls) ? record.calls : [record];
    const calls: AgentToolCall[] = [];
    for (const entry of rawCalls) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      if (typeof item.tool !== 'string' || !item.tool) continue;
      calls.push({
        tool: item.tool,
        args:
          item.args && typeof item.args === 'object' && !Array.isArray(item.args)
            ? (item.args as Record<string, unknown>)
            : {},
      });
    }
    if (calls.length === 0) return null;
    return { action: 'tool_call', thought, calls: calls.slice(0, MAX_CALLS_PER_ROUND) };
  }
  return null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 从合同出场名单 + 节拍候选事件参与者推导本章出场角色名(coverage 交叉核对用) */
function deriveCastNames(input: AgentResearchInput): string[] {
  const names = new Set<string>();
  for (const name of input.contracts.chapter.allowedCharacterNames ?? []) {
    if (name.trim()) names.add(name.trim());
  }
  for (const beat of input.plan.beats) {
    for (const candidate of beat.candidateEvents) {
      for (const participant of candidate.participants) {
        const entity = input.state.entities[participant];
        if (entity?.name) names.add(entity.name);
      }
    }
  }
  return [...names];
}

function buildSystemBrief(input: AgentResearchInput, toolkit: BookToolkit): string {
  const chapter = input.contracts.chapter;
  const recentChapterTitles = [...new Set(input.recentScenes.map(scene => scene.chapterIndex))]
    .sort((a, b) => b - a)
    .slice(0, 3)
    .map(chapterIndex => {
      const scene = input.recentScenes.find(item => item.chapterIndex === chapterIndex);
      return `第${chapterIndex}章《${scene?.title ?? ''}》`;
    })
    .join('、');
  const tools = toolkit
    .listTools()
    .map(tool => `- ${tool.name} ${tool.args} : ${tool.description}`)
    .join('\n');

  return [
    '你是一部连载长篇小说的「写作前研究员」。正文即将撰写以下章节,你负责在动笔前把本章需要的事实核查清楚。',
    '正文起草者只能看到你产出的研究档案,看不到你的查询过程;查漏的直接后果是正文写出与历史矛盾的内容。',
    '',
    `【本章任务】第${chapter.chapterNumber}章《${chapter.title}》`,
    `- 目标:${chapter.goal}`,
    `- 开场(CBN):${chapter.CBN}`,
    `- 推进(CPN):${chapter.CPNs.join(';')}`,
    `- 收尾(CEN):${chapter.CEN}`,
    `- 必须覆盖:${chapter.mustCover.join(';')}`,
    '',
    '【基底上下文已包含,禁止重查】',
    recentChapterTitles
      ? `- 最近 3 章场景全文已在写作上下文(${recentChapterTitles}),read_chapter 禁止用于这三章,只用于读更早的旧章`
      : '- (本章附近无已提交场景)',
    '- 本章合同全文已在上方【本章任务】完整给出,get_contract 无需调用(仅当怀疑合同被截断时才用)',
    '- 相关角色设定摘要、近期事件、未回收伏笔 id 清单已在基底;查询是为了拿到它们的精确状态/原文,不是确认存在',
    '',
    '【你的职责】核查基底没覆盖或需要精确确认的信息,典型场景:',
    '- 出场角色(尤其久未出场者)的当前状态:生死/位置/境界/持有物/已知信息',
    '- 本章到期或涉及伏笔的当前状态与原文表述',
    '- 跨章前情关键节点的原文事实(谁说过什么、发生过什么)',
    '- 时间线先后顺序',
    '',
    '【可用工具】',
    tools,
    '',
    '【协议】每轮只输出一个 JSON 对象,禁止输出 JSON 之外的任何文字。',
    '单个查询:',
    '{"thought":"简述当前要查什么与为什么","action":"tool_call","tool":"工具名","args":{...}}',
    '互相独立的多个查询必须合并到同一轮发出(最多 3 个),减少往返:',
    '{"thought":"...","action":"tool_call","calls":[{"tool":"query_entity","args":{"name":"某人"}},{"tool":"search_scenes","args":{"query":"..."}}]}',
    '信息充分时收尾:',
    '{"thought":"…","action":"finish","coverage":{"castStatesConfirmed":["角色名",...],"foreshadowsChecked":["伏笔id",...],"priorEventsVerified":["第X章 ...",...],"gaps":[{"topic":"...","reason":"..."}]}}',
    '',
    '【收尾要求】',
    '- coverage 如实填写:出场角色状态未确认的,不要写进 castStatesConfirmed',
    '- 确认不了的信息写入 gaps 并说明原因;gaps 内容写作时只能模糊化或绕开,不得虚构',
    '- 不设轮数限制,按需查询;基底已有的信息不要重查,相同参数的查询不要重复发',
  ].join('\n');
}

/**
 * Agent 检索循环执行器(docs/agent-loop-refactor.md §5)。
 *
 * 终止三件套(不设轮数上限):
 * 1. 模型自审完成——action=finish 带 coverage,runner 交叉核对出场名单,缺项并入 gaps(不阻断);
 * 2. 停滞检测——同签名重复查询拒绝执行,连续无新信息先注入收尾提示,仍不收尾则 stall 收束;
 * 3. 资源安全网——墙钟/token 预算/连续解析失败触发优雅降级(产出部分 dossier+gaps,不拦腰截断)。
 */
export class AgentLoopRunner {
  constructor(
    private readonly transport: AgentLoopTransport,
    private readonly toolkit: BookToolkit,
    private readonly options?: AgentLoopOptions
  ) {}

  async research(input: AgentResearchInput): Promise<AgentLoopResult> {
    // vitest 不做类型检查,构造漏参(如只传 transport)在 JS 层静默通过;
    // 显式守卫让这类错误在日志里一眼可辨,而不是深埋到 buildSystemBrief 才炸
    if (!this.toolkit) {
      throw new Error('AgentLoopRunner 缺少 toolkit(构造函数第二参数)');
    }
    const opts = {
      // 08-30 100章实测:240s/60k 下 budget 降级占比过高;放宽让「预算收尾」回归异常路径本位
      timeoutMs: 300_000,
      tokenBudget: 80_000,
      maxConsecutiveParseFailures: 3,
      stallNoProgressLimit: 2,
      ...this.options,
    };
    const now = opts.now ?? Date.now;
    const startedAt = now();
    const dossierBuilder = new DossierBuilder();
    const transcript: AgentRoundLog[] = [];
    const byTool: Record<string, number> = {};
    let toolCalls = 0;
    let rounds = 0;

    const messages: AgentMessage[] = [
      { role: 'system', content: buildSystemBrief(input, this.toolkit) },
      { role: 'user', content: '开始检索。请给出你的第一批查询。' },
    ];
    const seenSignatures = new Set<string>();
    // 协议违规 = 解析失败 + 未知工具;只在「产出有效进展」(成功执行一次工具/finish)后清零
    let consecutiveProtocolViolations = 0;
    let consecutiveNoProgress = 0;
    let wrapUpInjected = false;
    let coverageAudit: CoverageSelfAudit | undefined;
    let finishReason: ResearchFinishReason = 'model-finish';

    while (true) {
      if (opts.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      // 资源安全网(前置检查,本轮不再发请求)
      const elapsed = now() - startedAt;
      const estTokens = estimateTokens(messages);
      if (elapsed > opts.timeoutMs || estTokens > opts.tokenBudget) {
        finishReason = 'budget';
        break;
      }

      rounds += 1;
      let raw: string;
      try {
        raw = await this.transport.send(messages, { signal: opts.signal });
      } catch (error) {
        // 用户取消冒泡;传输级失败(重试已在 transport 内做尽)按优雅降级收束
        if (isAbortError(error) || opts.signal?.aborted) throw error;
        finishReason = 'protocol-error';
        transcript.push({
          round: rounds,
          action: 'parse-error',
          summary: `transport 失败:${clip(error instanceof Error ? error.message : String(error), 160)}`,
        });
        break;
      }
      messages.push({ role: 'assistant', content: raw });

      const decision = parseDecision(raw);
      if (!decision) {
        consecutiveProtocolViolations += 1;
        transcript.push({ round: rounds, action: 'parse-error', summary: clip(raw, 120) });
        if (consecutiveProtocolViolations >= opts.maxConsecutiveParseFailures) {
          finishReason = 'protocol-error';
          break;
        }
        messages.push({
          role: 'user',
          content:
            '上一轮输出无法解析。每轮只输出一个 JSON 对象:' +
            '{"thought":...,"action":"tool_call","tool":...,"args":{...}} 或 {"action":"tool_call","calls":[...]}(最多3个独立查询) 或 {"action":"finish","coverage":{...}},不要任何多余文字。请重试。',
        });
        continue;
      }

      if (decision.action === 'finish') {
        dossierBuilder.recordCoverage(decision.coverage);
        coverageAudit = decision.coverage;
        transcript.push({ round: rounds, action: 'finish', thought: decision.thought });
        finishReason = 'model-finish';
        break;
      }

      if (wrapUpInjected) {
        // 收尾提示后仍发起查询:按停滞收束
        transcript.push({
          round: rounds,
          action: 'rejected',
          thought: decision.thought,
          tool: decision.calls.map(call => call.tool).join(','),
          summary: '收尾提示后仍发起新查询',
        });
        finishReason = 'stall';
        break;
      }

      // 批量分流:未知工具 / 重复签名 / 可执行
      const unknownTools = decision.calls.filter(call => !this.toolkit.has(call.tool));
      const skippedDuplicates: string[] = [];
      const freshCalls: AgentToolCall[] = [];
      for (const call of decision.calls) {
        if (!this.toolkit.has(call.tool)) continue;
        const signature = `${call.tool}|${stableStringify(call.args)}`;
        if (seenSignatures.has(signature)) {
          skippedDuplicates.push(call.tool);
          continue;
        }
        seenSignatures.add(signature);
        freshCalls.push(call);
      }

      // 全部未知:按协议违规处理
      if (freshCalls.length === 0 && unknownTools.length > 0) {
        consecutiveProtocolViolations += 1;
        transcript.push({
          round: rounds,
          action: 'rejected',
          thought: decision.thought,
          tool: unknownTools.map(call => call.tool).join(','),
          summary: '未知工具',
        });
        if (consecutiveProtocolViolations >= opts.maxConsecutiveParseFailures) {
          finishReason = 'protocol-error';
          break;
        }
        messages.push({
          role: 'user',
          content: `未知工具 "${unknownTools.map(call => call.tool).join(',')}"。可用:${this.toolkit.toolNames().join('/')}。请重新选择。`,
        });
        continue;
      }

      // 全部重复:按无进展处理(停滞检测)
      if (freshCalls.length === 0) {
        consecutiveNoProgress += 1;
        transcript.push({
          round: rounds,
          action: 'rejected',
          thought: decision.thought,
          tool: skippedDuplicates.join(','),
          summary: '重复查询(相同参数)',
        });
        messages.push({
          role: 'user',
          content: '该查询已执行过(相同参数)。请换查询角度,或输出 action=finish 收尾。',
        });
        if (consecutiveNoProgress >= opts.stallNoProgressLimit && !wrapUpInjected) {
          wrapUpInjected = true;
          messages.push({ role: 'user', content: WRAP_UP_PROMPT });
        }
        continue;
      }

      const versionBefore = dossierBuilder.version();
      const resultsPayload: Array<Record<string, unknown>> = [];
      for (const call of freshCalls) {
        let result: ToolCallResult;
        try {
          result = await this.toolkit.call(call.tool, call.args);
        } catch (error) {
          result = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        toolCalls += 1;
        byTool[call.tool] = (byTool[call.tool] ?? 0) + 1;
        if (result.ok) {
          recordToolResult(dossierBuilder, call.tool, result.result, rounds);
        }
        transcript.push({
          round: rounds,
          action: 'tool_call',
          thought: decision.thought,
          tool: call.tool,
          args: call.args,
          ok: result.ok,
          summary: result.ok ? undefined : clip(result.error, 120),
        });
        resultsPayload.push(
          result.ok
            ? { tool: call.tool, ok: true, result: result.result }
            : { tool: call.tool, ok: false, error: result.error }
        );
      }
      if (skippedDuplicates.length > 0) {
        resultsPayload.push({ skipped: skippedDuplicates, reason: '重复查询,未执行' });
      }

      // 批量结果合并为一条消息(上限防膨胀;错误信息也是有效输入,引导模型换查法或记 gaps)
      messages.push({
        role: 'user',
        content: clip(JSON.stringify({ results: resultsPayload }), 3600),
      });
      // 成功执行即证明协议通道可用,清零协议违规计数
      consecutiveProtocolViolations = 0;

      if (dossierBuilder.version() > versionBefore) {
        consecutiveNoProgress = 0;
      } else {
        consecutiveNoProgress += 1;
        if (consecutiveNoProgress >= opts.stallNoProgressLimit && !wrapUpInjected) {
          wrapUpInjected = true;
          messages.push({ role: 'user', content: WRAP_UP_PROMPT });
        }
      }
    }

    // coverage 交叉核对:出场名单未确认者并入 gaps(不阻断,judge 兜底)
    if (finishReason === 'model-finish') {
      const confirmed = new Set(
        coverageAudit?.castStatesConfirmed?.map(name => name.trim()) ?? []
      );
      for (const castName of deriveCastNames(input)) {
        if (!confirmed.has(castName)) {
          dossierBuilder.recordGaps([
            {
              topic: `出场角色「${castName}」的当前状态未在检索回合确认`,
              reason: 'coverage 自审未列出,写作时须与状态库对齐',
            },
          ]);
        }
      }
    }
    if (finishReason !== 'model-finish') {
      dossierBuilder.recordGaps([
        {
          topic: `检索回合提前收束(${finishReason})`,
          reason: '档案可能不完整,涉及跨章状态处须保守处理',
        },
      ]);
    }

    const stats: ResearchRunSummary = {
      rounds,
      toolCalls,
      byTool,
      ms: now() - startedAt,
      finishReason,
    };
    return { dossier: dossierBuilder.build(stats), transcript, finishReason };
  }
}

/** 按工具类型把结构化结果蒸馏进档案(确定性,不花 AI 调用) */
function recordToolResult(
  builder: DossierBuilder,
  tool: string,
  result: unknown,
  round: number
): void {
  if (!result || typeof result !== 'object') return;
  const record = result as Record<string, unknown>;
  if (tool === 'query_entity') {
    const attributes = isRecord(record.attributes) ? record.attributes : {};
    const statusLine = Object.entries(attributes)
      .slice(0, 6)
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(';');
    builder.recordEntitySnapshot({
      id: String(record.id ?? ''),
      name: String(record.name ?? ''),
      kind: String(record.kind ?? 'character'),
      statusLine: statusLine || '(无关键属性)',
      sourceRounds: [round],
    });
    return;
  }
  if (tool === 'search_scenes' || tool === 'read_chapter') {
    if (tool === 'search_scenes' && Array.isArray(result)) {
      for (const hit of result.slice(0, 5)) {
        if (!isRecord(hit)) continue;
        builder.recordSceneRef({
          chapter: Number(hit.chapterIndex ?? 0),
          summary: String(hit.title ?? '') + (hit.summary ? `:${hit.summary}` : ''),
        });
      }
      return;
    }
    if (tool === 'read_chapter') {
      builder.recordSceneRef({
        chapter: Number(record.chapter ?? 0),
        summary: `原文片段:${String(record.excerpt ?? '').slice(0, 60)}`,
      });
      return;
    }
    return;
  }
  if (tool === 'list_foreshadows' && Array.isArray(result)) {
    for (const entry of result) {
      if (!isRecord(entry)) continue;
      builder.recordForeshadowCheck({
        id: String(entry.id ?? ''),
        hint: String(entry.hint ?? ''),
        status: String(entry.status ?? 'unknown'),
        ...(typeof entry.note === 'string' ? { note: entry.note } : {}),
      });
    }
    return;
  }
  if (tool === 'query_timeline' && Array.isArray(result)) {
    for (const fact of result) {
      if (typeof fact === 'string') builder.recordTimelineFact(fact);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
