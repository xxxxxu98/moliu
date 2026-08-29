# 正文续写 Agent 化重构方案:多轮工具调用检索循环

> 状态:P0-P2 已实施并验证(P0 spike 10/10 全过;P3 A/B 待跑)
> 日期:2026-08-29(方案定稿)/2026-08-30(P0-P2 落地)
> 范围:`ChapterWritingPipeline → LongFormWritingEngine → SceneDraftEngine` 正文续写主链路
> 关联:`docs/topic-discovery-refactor.md`(重构文档先例)、`docs/development-guidelines.md`

## 实施落地记录(2026-08-30)

- **P1/P2 全部落地**:`unified.service.ts` 抽出 `requestWithGuards` 内核并新增 `chatComplete()`;新增 `services/story-runtime/agent/` 四件套(`AgentLoopRunner`/`BookToolkit`/`DossierBuilder`/`RecordingAgentLoopTransport`);`ContextPackBuilder` 注入 `'research-dossier'` block(critical);`LongFormWritingEngine` 在 plan 之后插入可选检索回合(失败降级、AbortError 冒泡);`ChapterWritingPipeline` 组装 transport(`MOLIU_AGENT_RESEARCH=1` 开关 + `deps.agentResearchTransport` 注入 + trace 包装),harness 在真实冒烟时注入真实 transport。
- **测试**:agent 目录 4 个测试文件 31 用例全绿;全量 `npm test` 1283 过(唯一失败 `storyflow-prune` 为预存问题,HEAD 复现验证,与本次无关)。
- **P0 spike 结果**:真实网关 10 轮检索循环,**10/10 正常 model-finish**(门槛 ≥8),**10/10 把死亡角色周茂的状态查实**(query_entity → status=dead 进 dossier),单轮 10-17 轮查询、9-15 次工具调用、22-36s。协议可行性确认。
- **真实书跑双轮验证(5 章短程,storyflow 闭环)**:
  - **r1(降级路径)**:组装处漏传 toolkit 导致检索回合每章失败——降级机制按设计工作,每章回落纯基底打包,**5/5 章 accepted、首过率 100%**,证明「agent 坏 → 不阻塞写作」的护栏真实有效。事后修复(toolkit 构造挪进 research 闭包)并给 Runner 加了缺参显式守卫(vitest 不做类型检查,这类构造错误 JS 层静默)。
  - **r2(修复后)**:**5/5 章检索回合全部 model-finish**(7-12 轮/6-11 次工具调用/20-37s 每章,六工具全用),trace(`longform-agent-*.jsonl`)记录每轮 + 汇总,`scene-draft` prompt 中确认含 `'research-dossier'` block(stats+content)。工程指标:5/5 accepted、首过率 0.8(1 章字数超限压缩重写)、章均分 87.3。检索回合每章增加约 1-2 分钟(~+20% 墙钟)。
- **实施偏差记录**:方案原定引擎内嵌 research 调用,落地时改为引擎接受 `AgentResearchStep` 接口、由 Pipeline 组装(工具目录/FTS 端口/伏笔目录都在 Pipeline 层);协议违规计数(解析失败+未知工具)合并为单一计数器,仅在成功执行工具后清零——原设计解析成功即清零会让连续未知工具永远凑不满熔断阈值。
- **P3 A/B 命令**(同种子双跑,`MOLIU_STORYFLOW_RUN_SUFFIX` 隔离产物):
  - 基线:`set MOLIU_STORYFLOW_RUN_SUFFIX=ab-base&& npm run smoke:storyflow:real`
  - 实验组:`set MOLIU_AGENT_RESEARCH=1&& set MOLIU_STORYFLOW_RUN_SUFFIX=ab-agent&& npm run smoke:storyflow:real`
  - 对比口径:§11 指标表 + 书审 triage 签名(S1 连续性 Finding / paragraphLengthCV / 首过率 / 墙钟与 token 增幅 / agent 降级率)。

---

## 0. 摘要

把正文续写的上下文准备从「代码确定性一次打包」升级为「基底打包 + 模型自主增量检索的 agent 循环」:

- 在 `LongFormWritingEngine.write()` 的节拍规划之后、上下文打包之前,插入一个**检索回合(Research Loop)**;
- 模型通过 **JSON 工具协议**(非原生 function calling,兼容 18 家 provider)自主调用 6 个只读工具查询书籍结构化数据;
- **不设轮数上限**,以三类**收敛型终止条件**收束:模型结构化自审完成、停滞检测、资源安全网(优雅降级);
- 循环产出**滚动蒸馏的研究档案(Dossier)**,写作 prompt 只带档案不带原始对话,防上下文污染;
- 现有审查护栏(事实提取 / ContinuityValidator / AIChapterJudge / 重写循环 / commit)**一寸不动**;
- 特性开关默认关闭,弱模型自动回落现有单打包路径,不破坏既有全绿基线。

---

## 1. 背景与动机

### 1.1 现状:模型零检索、零工具、零多轮

当前写一章的上下文由 `ContextPackBuilder`(`src/renderer/src/services/story-runtime/ContextPackBuilder.ts`)用硬编码规则确定性组装:按合同文本命中选最多 6 人角色设定、近 12 条事件筛相关实体、`selectRecentScenesByChapter` 固定取近 3 章场景,然后 `SceneDraftEngine.draft()` 把全部内容 `JSON.stringify` 进单个 prompt,经 `StructuredAI.generate()` 单次结构化请求完成。模型没有任何「自己去查」的能力。

### 1.2 痛点:确定性打包的天花板

历史审查发现的 S1 级连续性问题,根因几乎全是「该查的没查到 / 查错了」:

| 案例 | 根因 |
|---|---|
| 周茂/崇仁帝死而复活(500 章审查) | 打包规则未把命运状态变化带给写作模型 |
| 严世宽死后重启审判线(100 章质量循环) | 过期大纲节点履约,模型不知道节点已失效 |
| recentScenes 窗口截断(绝症当虫治书审) | 固定窗口裁掉了关键前情 |

规则永远列不全「模型这一章需要什么」。agent 模式让模型发现信息缺口时自己去查,是这类问题的结构性解药,而不是第 N 个补丁。

### 1.3 目标与非目标

**目标**

1. 消灭检索幻觉类 S1 问题(角色状态/伏笔状态/前情节点错误);
2. 检索量由模型按章节复杂度自主决定——简单章快速收敛,复杂章不限量;
3. 对全部 18 家 provider 通用,不依赖原生 function calling;
4. 全链路可观测:每轮工具调用落 trace,可被 triage/书审扫描。

**非目标**

1. 不解决行文幻觉(事实给了仍编造)——那是 judge/审查循环的职责,保持不动;
2. 不给模型任何写权限——状态更新仍走事实提取 → 审查 → commit 链路;
3. 不替换 ContextPackBuilder——它继续打底,agent 只做增量补查;
4. v1 不做 UI 会话界面——先改管线,产品形态会话化另立项。

---

## 2. 核心决策(已对齐)

| # | 决策 | 理由 |
|---|---|---|
| D1 | 多轮对话 + 工具调用,无人为轮数上限 | 硬上限会在模型查到一半时截断,制造「带着不完整上下文写作」的新幻觉源 |
| D2 | 终止靠三类收敛条件,不靠计数 | 自审清单(模型证明覆盖)+ 停滞检测(防死循环)+ 资源安全网(运维必须,触发即优雅降级) |
| D3 | JSON 工具协议,非原生 function calling | 18 家 provider 原生 tool call 兼容性参差;JSON 协议在现有 `StructuredAI` 架构上改动最小,trace/归档全复用 |
| D4 | ContextPackBuilder 打底 + agent 增量补查(混合) | 多数章基底已够,几轮收敛;无界长尾只在复杂章生效,成本可控 |
| D5 | 循环上下文与写作上下文分离,Dossier 是唯一桥 | 防注意力稀释;写作 prompt 保持紧凑,兼容小上下文 provider |
| D6 | 工具全部只读 | 状态写入仍走确定性 commit 链路,审计边界不变 |
| D7 | provider 能力分级:强模型启用,弱模型自动回落 | 弱模型连单次 JSON 都会硬拒,多轮协议只会更糟 |
| D8 | 审查/triage/书审体系不动 | 这是墨流区别于通用 agent 的核心资产 |

---

## 3. 总体架构

### 3.1 插入位置

`LongFormWritingEngine.write()`(L277 起)现有步骤:

```
healChapterContract (L284)
  → planner.plan (L310)
  → contextBuilder.build (L315)      ← 检索回合插在这之前
  → 重写循环 { draft (L363) → pad → 事实提取 (L399) → 仲裁 → 审查 (L426) → 重写判定 }
  → commitService.commit (L574)
```

**检索回合插在 `planner.plan()` 之后、`contextBuilder.build()` 之前**:节拍计划(ScenePlan)给出了本章出场名单与场景节拍,是模型自审覆盖的天然清单;档案随后作为新 block 注入 ContextPack。

### 3.2 数据流

```
ContractPack ──┐
ScenePlan ─────┤
StoryState ────┼→ AgentLoopRunner ──轮次──→ 模型(JSON: thought/action/tool/args)
recentScenes ──┘       │                        │
                       │                  ┌─────┴─────┐
                       │              tool_call      finish(coverage 自审)
                       │                  │               │
                       │           BookToolkit(6 只读工具)  │
                       │                  │               │
                       │           DossierBuilder ─────────┤
                       │            (每轮确定性蒸馏)        ↓
                       ↓                                     ↓
              停滞检测/资源安全网                    ResearchDossier
                       ↓                             (gaps 显式标记)
                 优雅降级收尾 ────────────────────────────┘
                                     ↓
                 ContextPackBuilder.build(新增 dossier 输入)
                                     ↓
                 ContextPack(新增 'research-dossier' block)
                                     ↓
                 SceneDraftEngine.draft(现有,不改)
```

---

## 4. 工具协议设计

### 4.1 协议格式

每轮模型输出单个 JSON 对象:

```jsonc
{
  "thought": "本章周茂要出场,但他上一次出场是第 312 章,先确认生死与位置",
  "action": "tool_call",            // "tool_call" | "finish"
  "tool": "query_entity",
  "args": { "name": "周茂" }
}
```

收尾时:

```jsonc
{
  "thought": "出场 4 人状态全确认,本章到期伏笔 FS-012 与 FS-031 状态已核对",
  "action": "finish",
  "coverage": {
    "castStatesConfirmed": ["林昭", "周茂", "崇仁帝", "哑仆"],
    "foreshadowsChecked": ["FS-012", "FS-031"],
    "priorEventsVerified": ["第 312 章崇仁帝驾崩", "第 408 章北境兵败"],
    "gaps": [
      { "topic": "哑仆的兵器下落", "reason": "scene_chunks 无命中,原文检索未定位" }
    ]
  }
}
```

`coverage` 是**完成自审清单**——模型必须证明覆盖了再收工,这是杀幻觉的真正杠杆,而非查得多。

### 4.2 工具清单(6 个,全部只读)

| 工具 | 入参 | 返回(截断上限) | 实现落点 |
|---|---|---|---|
| `query_entity` | `name`(支持别名) | 实体卡:身份/生死/境界/位置/持有物/已知信息 + 最近 3 条相关事件 | runner 内存中的 `StoryState`(`entities`/`knowledge`/`inventory`/`events`),别名经 aliases 归一,零额外 IPC |
| `search_scenes` | `query`, `k?`(默认 5), `beforeChapter?` | 场景块摘要 + 章号(每条 ≤300 字) | `StoryRuntimeClient.searchScenes()`(FTS5,L194) |
| `read_chapter` | `chapterNumber`, `focus?`(关键词) | 章首/章尾各 ≤400 字;给 focus 时返回命中窗口 ±200 字 | 章节正文 / `scene_chunks` 按章聚合 |
| `list_foreshadows` | `filter?: "open" \| "due"` | 伏笔 ID/词面/状态/埋设章/回收窗/紧迫度 | `StoryState.openForeshadows` + `foreshadowLifecycle.calculateForeshadowUrgency` |
| `query_timeline` | `character?`, `lastN?`(默认 10) | 时间线条目(过滤后) | `StoryState.timeline` / `events` 过滤 |
| `get_contract` | `nodeId?` | 卷/章合同原文(CBN/CPNs/CEN/mustCover/履约状态) | 内存中的 `ContractPack` |

设计约束:

- 每个工具返回都有确定性 token 上限,超限截断并标注 `truncated: true`;
- 工具结果以 `{"ok": true, "result": ...}` 或 `{"ok": false, "error": "未找到实体: X"}` 包装,错误也是有效信息(引导模型换查法或记入 gaps);
- 工具注册表用表驱动(名称 → schema → handler),新增工具零改动 runner。

### 4.3 消息序列

```
[system]  检索任务书:本章合同摘要 + ScenePlan 出场名单/节拍 + 工具协议说明 + 自审清单要求
[user]    开始检索。当前基底上下文已含:近 3 章场景、合同全文、6 人角色设定摘要。
          你的职责是补查基底之外或需要确认的状态,不是重复基底。
[assistant] {"thought":..., "action":"tool_call", ...}     ← 模型轮
[user]    {"ok":true, "result":{...}}                      ← 工具结果轮
...                                                       ← 依模型需要继续
[assistant] {"action":"finish", "coverage":{...}}          ← 收尾
```

注意 system 任务书里明确「基底已含什么」——这是 D4 混合模式的落地:模型知道不用重查基底已有的东西,简单章一两轮即收敛。

---

## 5. AgentLoopRunner 设计

新文件:`src/renderer/src/services/story-runtime/agent/AgentLoopRunner.ts`

```ts
export interface AgentLoopTransport {
  send(
    messages: AgentMessage[],                    // {role:'system'|'user'|'assistant', content:string}
    options?: { signal?: AbortSignal }
  ): Promise<string>;                            // 返回模型原始文本(应为协议 JSON)
}

export interface AgentLoopResult {
  dossier: ResearchDossier;
  transcript: AgentRoundLog[];                   // 每轮 thought/tool/args/result 摘要,供 trace
  finishReason: 'model-finish' | 'stall' | 'budget' | 'protocol-error';
}

export class AgentLoopRunner {
  constructor(
    private readonly transport: AgentLoopTransport,
    private readonly toolkit: BookToolkit,
    private readonly options?: AgentLoopOptions  // 超时/预算/停滞阈值,全部可注入便于测试
  ) {}
  async research(input: ResearchInput): Promise<AgentLoopResult>;
}
```

### 5.1 终止三件套(D2 的落地)

**① 模型自审完成**:模型输出 `action: "finish"` 且 `coverage` 通过 schema 校验。runner 做轻量交叉核对(如 `castStatesConfirmed` 与 ScenePlan 出场名单比对),缺项不阻断——只把缺项并入 `dossier.gaps`,交给后续 judge 兜底。**自审是质量杠杆,不是硬门禁**:v1 不因缺项强制续跑,避免为凑清单空转。

**② 停滞检测**:

- 查询签名 = `tool` + 归一化 `args`(排序 key、去空白)。同签名重复出现即拒绝执行,返回 `{"ok":false,"error":"重复查询,请换角度或收尾"}`;
- 连续 2 轮拒绝且无新档案条目 → 注入一次「收尾提示」消息(「请基于已获信息收尾,无法确认的记入 gaps」);
- 收尾提示后仍无 finish → runner 主动终止,`finishReason: 'stall'`,dossier 照常产出。

**③ 资源安全网**(触发语义一律是**优雅降级**,产出 dossier + gaps 标记,绝不拦腰截断):

- 墙钟:`AGENT_RESEARCH_TIMEOUT_MS`(默认 240s,经 `utils/env.ts readPositiveIntEnv` 读,**渲染进程禁裸读 process.env**);
- token 预算:累计输入+输出 token 超 `AGENT_RESEARCH_TOKEN_BUDGET`(默认 60k)即降级收尾;
- 协议容错:连续 3 轮解析失败(非合法 JSON / schema 不符)→ `protocol-error` 降级;
- 轮数不作为策略限制——上述安全网隐含的理论上限(如 token 预算 ÷ 最小轮均耗)只在模型病态循环时才会触及,触及即按停滞语义处理。

### 5.2 降级路径(D7 的落地)

```
provider 未启用 agent(allowlist 外) ──────────→ 跳过检索回合,现路径原样
transport 构造失败 / 首轮即协议错误 ────────────→ 跳过,现路径原样
循环中途 protocol-error / stall / budget ──────→ 用已产出的部分 dossier 继续(优于无)
```

任何降级都在 trace 里记 `finishReason`,triage 可统计各 provider 的降级率,作为能力分级的数据依据。

---

## 6. ResearchDossier:滚动蒸馏档案(D5 的落地)

新文件:`src/renderer/src/services/story-runtime/agent/DossierBuilder.ts`

**蒸馏是确定性的,不花 AI 调用**:工具结果本身是结构化的,DossierBuilder 按类型归并去重:

```ts
export interface ResearchDossier {
  entitySnapshots: { name: string; statusLine: string; sourceRounds: number[] }[];
  foreshadowChecks: { id: string; status: string; urgency: string }[];
  priorSceneRefs: { chapter: number; summary: string }[];
  timelineFacts: string[];
  gaps: { topic: string; reason: string }[];        // 显式信息缺口,写作时模型知道"这里不确定"
  stats: { rounds: number; toolCalls: number; byTool: Record<string, number>;
           ms: number; finishReason: string };
}
```

关键规则:

- **去重覆盖**:同一实体后查覆盖前查(带 `sourceRounds` 留痕);
- **写作 prompt 只渲染 dossier,不渲染对话记录**——最终进入 ContextPack 的 block 是 dossier 的紧凑文本形态(目标 ≤1200 token);
- `gaps` 单独成节并以「以下信息未能确认,写作时不得虚构具体细节,须模糊化或绕开」的指令渲染——把「不知道」变成受控信息而不是幻觉素材。

---

## 7. 多轮通道:UnifiedAIService 扩展

现状核实:`UnifiedAIService`(`src/renderer/src/services/ai/unified.service.ts`)**没有**公开多轮方法;多轮 `client.chat(messages)` 只在底层 `multi-ai-sdk` 的 `AIClient` 上(L661 等内部调用形态)。`complete()`(L358)固定 `[system, user]` 两条消息走 `streamChatText`(L510)。

改造:

1. **抽取重试内核**:把 `complete()` 里的 `parseMaxTokensCap` 降级重试(L425-437)、`parseAllowedTemperature`(L441-451)、`isTransientError`/`classifyError`/`retryBackoffDelayMs` 瞬态重试(L465-471)、流式截断校验(`sawStreamEnd`/`hitLengthCap`/空闲 watchdog)抽成私有方法 `requestWithGuards(messages, opts)`,`complete()` 与新方法共用——**护栏逻辑零重复**;
2. **新增公开方法**:

```ts
async chatComplete(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { temperature?: number; signal?: AbortSignal; jsonMode?: boolean }
): Promise<string>;
```

内部直接走 `client.chat`(SDK 已支持完整 Message 数组)或扩展 `streamChatText` 接受 assistant 轮,取实现成本低者;`streamChatText` 的签名从 `'system' | 'user'` 放宽为含 `'assistant'`。

`ChapterWritingPipeline` 侧新增 `createAgentLoopTransportFromActiveProvider(signal?)`(与 L113 的 `createStructuredAIFromActiveProvider` 并排),温度档:检索回合 `temperature: 0.2`(与辅助请求一致)。

---

## 8. 与现有管线的集成点(精确到文件)

| 文件 | 改动 |
|---|---|
| `src/renderer/src/types/story-runtime.ts` | `ContextBlockKind` 增 `'research-dossier'`;`ContextPackInput` 增 `dossier?: ResearchDossier`;新类型 `ResearchDossier`/`AgentMessage` 等 |
| `src/renderer/src/services/story-runtime/ContextPackBuilder.ts` | `build()` 开头注入 dossier block(`critical: true`,参与既有 token 预算裁剪,超限时优先于 recent-scenes 保留) |
| `src/renderer/src/services/story-runtime/LongFormWritingEngine.ts` | `write()` 在 L310 与 L315 之间插入可选 research 步骤;依赖注入新增 `research?: { runner, enabled }`,保持构造向后兼容 |
| `src/renderer/src/services/writing/ChapterWritingPipeline.ts` | 新增 `createAgentLoopTransportFromActiveProvider()`;组装 `AgentLoopRunner`(toolkit 以 `StoryRuntimeClient` + 内存 state 构造);特性开关判定 |
| `src/renderer/src/services/ai/unified.service.ts` | §7 的重试内核抽取 + `chatComplete()` |
| **新** `services/story-runtime/agent/AgentLoopRunner.ts` | §5 |
| **新** `services/story-runtime/agent/BookToolkit.ts` | §4.2 工具注册表 |
| **新** `services/story-runtime/agent/DossierBuilder.ts` | §6 |
| **新** `services/story-runtime/agent/RecordingAgentLoopTransport.ts` | trace 包装(见 §9) |

**不动的文件**:`SceneDraftEngine.ts`(dossier 经 ContextPack 自然到达)、`ChapterCommitService`、事实提取/仲裁/validator/judge 全家、`GroundedRetriever`/`HybridRetriever`(继续为基底检索服务)。

**超时墙联动**:引擎级墙钟须计入检索回合预算(历史教训:超时墙须含评审预算),`AGENT_RESEARCH_TIMEOUT_MS` 默认值与 `AI_SINGLE_REQUEST_TIMEOUT_MS` 的关系在 P2 实测后定稿。

---

## 9. 观测:trace 与 triage 衔接

复用 `RecordingStructuredAI` 的机制(`AiTraceRecord` 落 `temp/ai-traces/${runId}.jsonl`,`__rawResponse` 约定):

- `RecordingAgentLoopTransport` 把**每轮**记为一条 trace:`purpose: 'agent-research'`,`prompt` = 该轮输入尾部(最近 2 条消息),`rawResponse` = 模型协议 JSON;
- 循环结束追加一条汇总记录:`dossier.stats` + `finishReason` 全量 JSON;
- `StructuredAIRequest.purpose` 联合类型增 `'agent-research'`(trace 兼容);
- triage 脚本(`scripts/triage-storyflow*.mjs`)新增扫描签名:`agent-research-degenerate`(stall/protocol-error 占比 >50%)、`agent-research-runaway`(单章 toolCalls > P99×3)——发现新失败模式照既有流程写回分类规则;
- 书审循环受益:出现连续性 Finding 时可直接翻 trace 看「模型当时查没查、查到什么」,归因从「猜」变「看记录」。

---

## 10. 测试方案

沿用现有 fake AI 惯例(就近 `__tests__`,`implements` 注入):

| 层级 | 文件 | 内容 |
|---|---|---|
| 单元 | `story-runtime/__tests__/AgentLoopRunner.test.ts` | 剧本化 FakeTransport:2 轮工具 + finish 正常路;同签名重复→拒绝→收尾提示→stall;token 预算触发→优雅降级;连续 3 轮解析失败→protocol-error;coverage 缺项→并入 gaps 不阻断 |
| 单元 | `story-runtime/__tests__/BookToolkit.test.ts` | 6 工具对内存 state 的确定性返回、别名归一、截断上限、错误包装 |
| 单元 | `services/ai/__tests__/`(就近) | `chatComplete` 多轮消息透传 + 复用降级重试(parseMaxTokensCap 场景回放) |
| 集成 | `writing/__tests__/continueWriteHarness.ts` 扩展 | `AgentResearchFakeTransport`(固定 2-3 轮剧本);harness 不变量(`assertHarnessInvariants`)在开关开/关两态都过 |
| 回归 | 既有全部测试 | **开关默认关,行为零变化,全量绿是 P2 退出条件** |
| 真实 | `scripts/agent-storyflow-real-smoke.mjs` 加 `MOLIU_AGENT_RESEARCH=1` | 反重力 gemini3.7 单章灰度 → A/B 双跑 |

A/B 双开直接用现有 `MOLIU_STORYFLOW_RUN_SUFFIX` 机制,同 provider 并行不互踩。

---

## 11. 验收标准与 A/B 协议

**工程门禁**(沿用可上线大循环口径):全绿、无超时、无熔断异常、trace 完整落盘。

**效果门禁**(A/B:同大纲同种子,agent 路径 vs 现路径,≥1 本 100 章):

| 指标 | 判据 |
|---|---|
| S1 连续性 Finding 数(死而复活/状态幻觉/过期节点履约) | agent 路径显著下降(目标:→0 或降幅 ≥70%) |
| paragraphLengthCV 等 AI 味指标 | 不回归(防 dossier 污染文风) |
| 首过率 / 重写轮数 | 不回归 |
| 平均检索轮数 / 每章 toolCalls | 观测项(预期简单章 ≤3 轮,无长尾爆炸) |
| 墙钟与 token 成本增幅 | ≤ +35%(基底打底应使多数章快速收敛) |
| 降级率(stall/protocol-error 占比) | 强模型 allowlist 内 <5% |

效果门禁不达标的处置:先查 trace 归因(协议表述问题?工具返回质量问题?基底已含信息表述不清?)再迭代,而非直接回退——这正是 trace 体系的价值。

---

## 12. 实施计划

### Phase 0 — 协议可行性 spike(0.5 天,可选但强烈建议)

独立脚本(不接管线):拿真实书籍 state + 6 工具的手工桩,验证反重力 gemini3.7 对 JSON 工具协议的遵循度(能否稳定输出协议 JSON、coverage 是否像样)。**退出条件**:10 次循环 ≥8 次正常 finish。不达标则调整协议表述(如给 few-shot 示例)再进 P1。

### Phase 1 — 核心组件(纯增量,不碰现有链路)

`unified.service.ts` 重试内核抽取 + `chatComplete()`;`agent/` 三件套(Runner/Toolkit/DossierBuilder)。
**测试**:§10 单元层全绿;`npm test` 全量绿(现有行为零变化)。

### Phase 2 — 管线集成 + 灰度

类型扩展、ContextPackBuilder 注入、Engine 插入步骤、Pipeline 组装、trace 包装、超时墙联动、smoke 脚本开关。
**退出条件**:全量测试绿(开关两态);`MOLIU_AGENT_RESEARCH=1` 真实单章灰度通过;trace 里能看到完整工具轮次。

### Phase 3 — A/B 验收

100 章双跑(现有 RUN_SUFFIX 机制)→ §11 指标对比 → triage 扫描规则落地。
**退出条件**:效果门禁达标,出「agent 路径转正 / 继续迭代」结论。

### Phase 4 — 推广(转正后)

provider allowlist 逐步放开(以各家的降级率数据为准);可选:UI 侧 trace 可视化(作者可见 AI 查了什么);可选:检索回合扩展到书审/修复循环。

---

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 上下文污染:多轮结果稀释注意力,文风回归 AI 腔 | D5 档案隔离;paragraphLengthCV 入验收门禁 |
| 弱模型协议遵循差 | D7 分级回落;降级率入 triage 观测 |
| 网关抖动(geo-block/502 风暴)烧在无界循环上 | 复用瞬态重试内核;墙钟+token 安全网;历史运维经验全部适用 |
| 成本长尾 | 基底打底使多数章快速收敛;toolCalls P99 入观测 |
| 破坏现有全绿基线 | 开关默认关;P2 以「开关关=行为零变化」为硬门禁 |
| 模型把 gaps 当素材继续编 | gaps 渲染带「不得虚构」指令;judge 循环兜底 |
| 协议漂移(各家 JSON 稳健性差异) | schema 宽松解析 + 3 轮容错降级;Phase 0 提前暴露 |

---

## 14. 开放问题(待拍板,不阻塞 P0-P2)

1. **dossier 是否给 judge/reviewer 看**:审查时知道「模型查过什么、漏了什么」,归因更准。倾向 v2 开放,judge prompt 加一节 dossier 摘要。
2. **写作中途补查**:draft 阶段发现缺口时允许再触发一轮小检索(Cursor 式半程回查)。倾向 v2,先让前置回合跑稳。
3. **检索回合是否前移到 planner 之前**:研究先于节拍规划,可能产出更好的节拍。v1 保持 plan→research(出场名单是自审清单的锚),v2 可 A/B 对比。
4. **provider allowlist 初版范围**:建议仅反重力 gemini3.7 一家,以 Phase 2/3 数据再扩。
