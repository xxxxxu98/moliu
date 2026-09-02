# Storyflow 全链路 Agent 化重构方案（大纲 + 续写 + 单轨冒烟）

> 状态：**实施中**（P1 落地中；P2–P4 待续，每阶段独立可回归、可回滚）
> 日期：2026-09-02（方案定稿）
> 前置：`docs/agent-loop-refactor.md`（续写检索回合已转正，本方案在其上推进）
> 关联：`docs/north-star.md`（L1/L3/L4/L6 是本方案直接推进的质量层）、`docs/development-guidelines.md` §9.4 / §10.5 / §15 / §16

---

## 0. 一句话

把「一次结构化请求 + 一堆确定性补丁」的生成方式，升级为 **Cursor 式 agent 循环**：模型通过多轮工具调用**读**书籍真源、**暂存写**产物、**调用确定性校验工具**拿到机器反馈、再迭代到通过为止；确定性代码只做格式校验/统计/候选召回与最终提交门（§9.4），冒烟与真实环境**同一条代码路径**（§10.5）。

## 1. 现状诊断（2026-09-02 审计结论）

审计范围：续写主链、大纲主链、冒烟 harness、全仓库死代码。详见本轮三份审计（分叉点 31 处、死代码 60+ 文件、大纲 5 类已知质量问题）。

### 1.1 幻觉的三个结构性来源

| # | 来源 | 现状 | 本方案对策 |
|---|---|---|---|
| A | **该查的没查到**（角色生死/伏笔状态/前情） | 续写侧已有检索回合（`AgentLoopRunner` + 6 只读工具），但 **App 交互路径默认关**（`MOLIU_AGENT_RESEARCH` 环境开关，渲染进程读不到 env） | P1：删开关，生产常开，单一注入点只剩 transport |
| B | **写了没校验就出门**（大纲蓝图复合地点、节点原句照抄、跨章 mustCover、同文 CBN） | 大纲是 5 步 markdown 模板 + 正则解析 + 事后 `repair*` 补丁堆；校验结果模型看不到，靠整份降温重试 | P3：大纲 agent 化，校验器变成**工具**，模型拿到 issue 列表自己改，直到 `validate_outline` 全绿才允许 `finish` |
| C | **修补循环靴带不闭合**（判官拒绝 → 规则拼 hints → 整章重写） | 续写重写由 `buildRevisionPlanFromReport` 规则拼接提示，模型看不到原始判定证据，也不能局部改 | P2：写作 agent 化，判官/字数/排版/引号等全部变成 `run_checks` 工具返回结构化结果，模型可局部 `revise_paragraphs`，commit 仍必须过审查门 |

### 1.2 冒烟 ≠ 真实（§10.5 违规项，按危害排序）

| # | 分叉 | 冒烟 | App | 处置 |
|---|---|---|---|---|
| 1 | 检索回合 | 默认开 | 默认关 | **P1 删开关，常开** |
| 2 | 单章失败后整批策略 | 标 failed 继续下一章 | 结束整批 | P4 抽公共 `ChapterBatchLoop`，策略成为显式参数 |
| 3 | 履约失败 → 蓝图再生 | 无 | 有 | P4 并入公共循环 |
| 4 | 细纲滚动时机 | 默认 pre 一次性滚满 | 后台异步 | P4 统一为「后台异步 + 空章耗尽等待」，冒烟去掉 pre 模式 |
| 5 | 每章重建 Pinia / pipeline | 是 | 否（会话级） | P4 harness 复用同一 pipeline 实例 |
| 6 | 标题/伏笔客户端 | 内存直改 | store + 落盘 | P4 harness 用同一适配器，落盘介质由文件版 electronAPI 承担 |
| 7 | StateDriven L1–L7 降级链 | `forceStoryRuntime` 绕过 | preload 恒有 storyRuntime，**永不可达但每次续写都构造** | **P1 删除整簇**，无 storyRuntime 时显式失败 |
| 8 | 大纲：自动选最高分方向 vs 用户选/`directions[0]` | 分数最高 | UI 默认第 0 张 | P3 UI 默认也按 recommendationScore 排序（生产向冒烟对齐） |
| 9 | 大纲同文 CBN ≥3 章整份重拆 | 有 | 无 | P3 并入 agent 的 `validate_outline` 工具（冒烟独有后处理消失） |
| 10 | continue-write 冒烟宿主 | 系统 Node，可能落内存 runtime | Electron SQLite | P4 与 storyflow 统一走 Electron-as-Node + SQLite 断言 |

允许保留的差异（数据替身）：AI 凭证来源（配置文件）、落盘介质（temp 目录文件版 electronAPI）、trace 录制、vue-router 桩、场景 fixture、vitest 超时墙。

### 1.3 旧架构与死代码

审计结论：**生产执行链只有一条**（`AIPanel/BatchWritingPanel → useChapterWriter/useBatchWriter → WritingOrchestratorV2.run()（仅委托）→ executeSmartContinue → ChapterWritingPipeline → LongFormWritingEngine`），以下全部脱链：

- `WritingOrchestratorV2` 的 step0–step5 / `legacyReview` 及其 eager 构造（Reviewer/Data agent、AntiPatterns、StateDriven）
- `writing/review/*`（ReviewAgent、EnhancedReviewAgent、RevisionHintBuilder）、`writing/polish/*`、`writing/commit/*`（V2 commit/ProjectionWriters）、`writing/projection/*`、`writing/extraction/*`、`writing/taskbook/*`、`writing-task-builder.ts`、`ai/agents/enhanced-reviewer|data-agent.ts`
- StateDriven 整簇：`services/orchestrator|state|context|retrieval|generation`、`commit/CommitTransaction.ts`、`recovery/CheckpointManager`、`backup/GitBackupManager`
- `stores/writing|contract|memory.store.ts`、`composables/new/**`、`composables/index.ts` 的 `createWritingSystem`
- 零引用孤岛：`RetentionPredictor`、`WritingMonitor`、`eight-story-lines-manager`、`ReviewFallbackService`、`anti-ai-v2|enhanced`、`contract-writer-v2`、`market-trends-v2`、`ReaderSignals*`、`ContractManager`
- preload 有暴露无 handler：`ai:generate`、`ai:check`、`ai:stream`、`generation:progress`、`chapter:delete`

**保留**（生产在用）：根目录 `useChapterWriter`、`useBatchWriter`、V2 的 `run/stop/reset`、`smartContinue`、Pipeline + presets、`story-runtime/**`、`enhanced-context-agent`（任务书）、`PreflightService`、`chapterPersistenceAdapters`、`useAIService` 简易续写 Tab、Apply 阶段 `blocking-review`/`report-generator`（用户可见行为，另立项）。

---

## 2. 目标架构

### 2.1 核心抽象：一个循环器，多套工具箱

```
                    ┌──────────────────────────────────────────┐
                    │  AgentLoopRunner（通用：多轮 JSON 工具协议）│
                    │  终止：finish 自审 / 停滞 / 墙钟·token 安全网 │
                    └───────────────┬──────────────────────────┘
                                    │ AgentToolkit 接口（表驱动、只读 or 暂存写）
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
  BookToolkit（已有）        WriterToolkit（P2）         OutlineToolkit（P3）
  6 只读：query_entity      读：继承 BookToolkit          读：get_direction / get_world /
  search_scenes …           写(暂存)：submit_draft /      list_characters / list_foreshadows /
                            revise_paragraphs            get_genre_knowledge
                            校验：run_checks（字数/排版/  写(暂存)：propose_volume /
                            引号/开场重演/判官）          propose_chapters / register_location /
                                                         register_character / plan_foreshadow
                                                         校验：validate_outline（完整性策略 +
                                                         同文 CBN + 跨章 mustCover + 占位）
```

**写工具全部是「暂存写」**：写进 runner 持有的 `StagedArtifact`（内存草稿），**不直接落库**。提交仍由确定性 `ChapterCommitService` / `useProjectCreator.createProject` 完成，且必须通过既有审查门（判官/完整性策略）。模型拿到的是**写权限的体验**，系统保留的是**审计边界**（沿用 agent-loop-refactor D6 的精神，边界从"工具只读"移到"落库只走 commit"）。

### 2.2 幻觉治理三板斧（每板斧都是闭环，不是提示词）

1. **先查再写**：写工具在 dossier `gaps` 未处理时会拒绝（返回 `{ok:false, error:'以下角色状态未确认…'}`），逼模型先 `query_entity`。
2. **写完必检**：`finish` 前必须至少调用一次 `run_checks` / `validate_outline` 且结果 `blocking=0`；否则 runner 拒绝 finish 并回喂 issue 列表（自审有据，不是自报家门）。
3. **提交有门**：暂存产物 → 事实提取 → canonicalize → 判官 → commit 的既有链路一寸不动；agent 只是把「拒绝→重写」从规则拼提示变成模型自己看 issue 改。

### 2.3 单轨原则的落地形态

生产与冒烟共用的入口固定为三个函数（都在 `src/`，脚本只调不复制）：

| 阶段 | 入口 | 冒烟允许注入的差异（仅此） |
|---|---|---|
| 大纲 | `UnifiedOutlineGenerator.expandDirection()`（P3 内部换成 OutlineAgent） | `structuredAI/transport`、trace runId |
| 单章 | `ChapterWritingPipeline.execute()` | `structuredAI`、`agentResearchTransport`、`storyRuntimeApi`、`persistence/memoryClient` 的落盘介质 |
| 批量 | `ChapterBatchLoop.run()`（P4 新抽，`useBatchWriter` 与 harness 共用） | 章槽来源（预建 vs 按需）作为显式 `slotProvider` 端口 |

任何环境变量**只允许影响数据替身**（凭证、章数、字数、超时墙、产物目录），**禁止影响流程分支**。`MOLIU_AGENT_RESEARCH` 即因违反此条被删除。

---

## 3. 分期计划与退出条件

### P1 单轨收敛 + 死代码清理（本轮）

1. 检索回合生产常开：删 `isAgentResearchEnvEnabled` 与所有 `MOLIU_AGENT_RESEARCH` 读写；Pipeline 无注入时恒从 active provider 构造 transport；harness 在 REAL_AI 下恒注入真实 transport；脚本/SKILL 同步。
2. 删除 §1.3 全部死代码；`WritingOrchestratorV2` 只剩 `run/stop/reset`。
3. 移除 StateDriven 降级链：`ChapterWritingPipeline` 在无 storyRuntime 时抛出带上下文的错误（§16.1 显式失败），不再构造 L1–L7。
4. 删 preload 无 handler IPC。
5. 退出：`npm test` 全绿；`npm run lint` 无新增错误；`git grep MOLIU_AGENT_RESEARCH` 为空。

### P2 续写 agent 化（WriterToolkit）

1. `AgentLoopRunner` 泛化：抽 `AgentToolkit` 接口（`listTools/has/call`），`BookToolkit` 实现之；新增 `StagedArtifact` 与「finish 前置条件」钩子。
2. `WriterToolkit`：继承 BookToolkit 六读；新增 `submit_draft` / `revise_paragraphs` / `run_checks`。`run_checks` 复用 `buildWordCountBoundsIssue`、`buildTypesettingIssues`、`detectOpeningRepetitionIssue`、`ContinuityValidator.validate`（含判官）。
3. `LongFormWritingEngine.write()` 的「起草→审查→重写」循环替换为 WriterAgent 回合；事实提取/canonicalize/commit 不动。旧循环保留为 `legacy` 依赖注入路径一轮 A/B 后删除。
4. 退出：100 章真实 A/B（`scripts/agent-ab-compare.mjs` 扩展 writer 维度）：首过率不回归、S1/S2 Findings 下降、重写轮均值下降。

### P3 大纲 agent 化（OutlineToolkit）

1. `OutlineToolkit`：读方向卡/世界观/角色/伏笔/题材知识；暂存写卷纲/蓝图/地点/角色/伏笔；`validate_outline` 封装 `outlineCompleteness` + `detectDuplicateChapterCbn` + `sanitizeChapterBlueprintMustCover` + 复合地点拆分检查。
2. `UnifiedOutlineGenerator.expandDirection()` 内部换成 OutlineAgent；`generateDirections` 暂不动。旧 5 步 + `repair*` 补丁堆在 A/B 后删除。
3. UI 方向卡默认按 `recommendationScore` 排序（消除分叉 #8）。
4. 退出：20 本大纲 A/B：完整性阻断项为 0 的比例 ≥95%、同文 CBN=0、复合地点=0。

### P4 批量循环单轨

1. 抽 `services/writing/batch/ChapterBatchLoop.ts`：暂停/完结/失败策略/蓝图再生/跑道滚动全部在内；`useBatchWriter` 与 `continueWriteHarness` 只提供端口。
2. continue-write 冒烟并入 Electron-as-Node 宿主并断言 SQLite。
3. `storyflow-release-loop` SKILL 更新为新入口；triage 新增 `agent-writer-*` / `agent-outline-*` 签名。

---

## 4. 实施记录

> 随各阶段落地滚动追加（保留日期戳）。

- **2026-09-02 P1 启动**：三份审计完成；基线 `npm test` 108 文件 / 1267 用例全绿（44s）。
- **2026-09-02 P1 落地**（退出条件全部满足）：
  - P1.1 检索回合常开：删 `isAgentResearchEnvEnabled` 与 4 个冒烟脚本 / SKILL / 闭环测试里的 `MOLIU_AGENT_RESEARCH`；`ChapterWritingPipelineDeps.agentResearchTransport` 改为 `AgentLoopTransport | null`（`null` = 假 AI 单测显式跳过，未注入 = 从 active provider 构造）；harness 在 `REAL_AI` 下恒注入真实 transport。`git grep MOLIU_AGENT_RESEARCH` 仅剩两份文档的历史记录。
  - P1.2 叶子死代码：删 `writing/{polish,commit,projection,extraction,taskbook,contract,anti-patterns,monitor}`、`review/{ReviewAgent,EnhancedReviewAgent,RevisionHintBuilder,types}`、`memory/ReaderSignals*`、`RetentionPredictor`、`eight-story-lines-manager`、`anti-ai-v2|enhanced`、`contract-writer-v2`、`market-trends-v2`、`writing-task-builder`、`review/ReviewFallbackService`、`ai/agents/enhanced-{reviewer,data}-agent`、`stores/{writing,contract,memory}.store`、`composables/new/**`、`composables/index.ts`、`renderer/src/index.ts` 及对应测试与陈旧 mock。
  - P1.3 `WritingOrchestratorV2` 重写为 260 行纯委托（`run/stop/reset` + 响应式状态），不再 eager 构造任何 agent / registry / orchestrator。
  - P1.4 StateDriven 整簇删除：`services/{orchestrator,state,context,retrieval,generation,gates,recovery,commit}`、`writing/backup/GitBackupManager`；仍被生产用的纯类型（`ChapterPersistenceClient`/`MemoryClient`/`Gate*`）迁至 `types/chapter-pipeline.ts`。Pipeline 无 storyRuntime 时 `fail('storyRuntime 不可用：…')` 显式失败；`failure-manager` 删除无人调用的 checkpoint 桥。顺带修复：任务书降级提示此前只进 StateDriven 路径，LongForm 路径读的是原始 `input.userInstructions`，现改为传入合并后的有效指令。
  - P1.5 preload 删 `ai:generate` / `ai:check` / `ai:stream` / `generation:progress` / `chapter:delete` / `project:update`（渲染侧监听）六个无 handler 或无消费者的暴露。
  - 回归：`npm test` 88 文件 / 957 用例全绿（删除的 20 个测试文件全部只覆盖死代码）；`tsc --noEmit` 对本轮触碰文件无新增错误（仓库预存的 type error 与 eslint 配置缺失不在本轮范围）。
- **2026-09-02 P2.1 落地**（runner 泛化，行为零变化）：
  - 新增 `agent/AgentToolkit.ts`：`AgentToolkit` 接口（`listTools/has/toolNames/call`）、`ToolDescriptor.dedupe`（依赖暂存状态的工具设 `false` 以允许改稿后同参重跑）、共享参数读取器、`CompositeToolkit`（组合多个工具箱，构造期检测工具名冲突）。`BookToolkit implements AgentToolkit`，私有 helper 改用共享实现。
  - 新增 `agent/StagedArtifact.ts`：暂存写容器，`set/update` 递增 revision，`markVerified/isVerified` 实现「改稿即失效」的校验账本。
  - `AgentLoopRunner` 拆为通用内核 `run<TFinish>(session)` + 适配器 `research()`。`AgentSession` 钩子：`systemPrompt/kickoffMessage/parseFinish/guardFinish/onToolResult/progressVersion/wrapUpPrompt/protocolHint`。新增 finish 前置条件通道：`guardFinish` 返回字符串即拒绝并回喂，连续拒绝达 `maxFinishRejections`（默认 3）按 `stall` 收束；有实质进展时计数清零。`research()` 输出与旧实现逐字段一致（原 10 个 runner 用例不改一行全绿）。
  - 新增 `AgentLoopRunner.generic.test.ts` 8 用例：写完必检拒绝/放行、改稿失效重检、拒绝上限 stall、finish 载荷非法纠偏、同参重复写被停滞检测拦截、CompositeToolkit 路由与冲突、StagedArtifact.update。
- **2026-09-02 P2.2 落地**（续写 agent 化，生产常开）：
  - **设计取舍**：初稿仍由 `SceneDraftEngine` 单次整章起草（百章打磨过的结构化 prompt，首过率是既有资产），**agent 从「初稿审查未通过」起接管**——旧路径是「规则从 report 拼 hints → 整章盲重写 → 再审」，新路径是模型自己读问题、查事实、局部改稿、复检。初稿即通过时零额外开销（与旧行为完全一致）。
  - 新增 `agent/WriterToolkit.ts`：`get_draft`（带索引全文）/ `revise_paragraphs`（替换、删除、insertAfter）/ `submit_draft`（整章替换）/ `run_checks`（走注入的 `ChapterReviewPort`）。校验账本：`run_checks` 把当前 revision 标记已审查，改稿即失效；`guardFinish()` 在「未审查 / 未通过且预算未尽」时拒绝 finish；`resolveFinal()` **只返回最后一次通过审查链的 revision**——模型改完不复检的改动被丢弃，保证落库物与审查物逐字一致。审查链抛错包成 `AgentToolFatalError` 冒泡（含 `[review-unavailable]`，批量层停章语义不变）。
  - 新增 `agent/WriterAgent.ts`：`WriterAgentStep` 端口、`createWriterAgentStep(transport)` 工厂（WriterToolkit + BookToolkit 六读经 `CompositeToolkit` 组合）、`buildWriterBrief()`（合同 + 上下文块（合同/状态/档案/文风；近章原文与检索片段交给工具按需读）+ 正文硬规则 + 改稿流程 + 协议）。默认预算 480s / 200k token（任务书含上下文包，每轮全量重发）。
  - 新增 `proseRules.ts`：`CHAPTER_STRUCTURE_RULES` / `CHAPTER_STYLE_RULES` 从 `SceneDraftEngine` 抽出为 SSOT，起草与改稿共用同一份「什么是合格正文」（prompt 文本零变化）。
  - `LongFormWritingEngine`：抽 `draftChapter()` / `reviewDrafts()`（事实提取 → canonicalize → 判官 → `applyDeterministicGates()` 叠加字数/排版/章界重演），初稿、legacy 重写、agent `run_checks` 三处共用同一审查函数。新增 deps `writerAgent?: WriterAgentStep`；有则走 agent（`maxChecks = maxRewriteRounds`，`rewriteRounds = checksUsed`），无则走 legacy 循环（保留供 A/B，验收后删）。结果新增 `writer?: WriterRunSummary`（含 `checksUsed` / `revertedUnchecked`）。
  - `ChapterWritingPipeline`：与检索回合共用同一 transport 构造 `writerAgent`（trace 汇总 `kind:'writer'` 落同一 JSONL）；`agentResearchTransport: null` 的假 AI 单测仍走 legacy。App 与真实冒烟单轨。
  - 测试：`WriterToolkit.test.ts` 7 用例、`engineWriterAgent.test.ts` 5 用例（agent 改稿通过 / 初稿即过零开销 / 不复检反复 finish → stall 回退拒收 / run_checks 期间审查链不可用冒泡 / 端口口径）。全量 `npm test` 91 文件 / 977 用例全绿。
  - **未做（留给 P2.3 A/B）**：doc §2.2 「写工具在 dossier gaps 未处理时拒绝」未硬实现——coverage 交叉核对几乎每章都会产出 gaps，硬拒会把改稿回合卡死；现以任务书「涉及事实先查再改」+ 六读工具可用替代。100 章 A/B 后按 Findings 决定是否收紧。
- **2026-09-02 P3 落地**（大纲修复 agent 化，生产常开）：
  - **设计取舍**：5 步 Markdown 生成（`expand-direction-steps`）保留为初稿工序；**agent 接管的是初稿之后的全部修复**——旧路径是 `reviewAndFixOutline` 整节盲改 × `repairUnregisteredCharacters` 单点补丁 × 多轮 `sanitize/repair*` 串联，每一步都无法看到彼此的结果；新路径是模型在同一份暂存稿上按需读节/读章、局部改、`run_checks` 复检、合格才 finish。确定性能修的（超长钩子 `shrink_hooks`、未登记地点 `register_locations`）保留为工具，不让模型猜。
  - 新增 `outline/agent/OutlineToolkit.ts`：暂存物 `StagedArtifact<OutlineSnapshot>`（原文 Markdown + 解析后的 `ExecutableOutline`，每次写都重解析，解析失败或结构计数意外归零直接拒写）。读：`get_overview` / `get_section`（附节模板）/ `get_chapters`（分页 ≤40 章，报缺章）。写：`rewrite_chapters`（部分字段沿用原稿，逐章格式预检，整批原子）/ `replace_section` / `append_to_section` / `register_locations` / `shrink_hooks`。校验：`run_checks` = `inspectOutlineCompleteness`（阻断项）+ `inspectOutlineQuality`（警告），`dedupe:false`；`guardFinish()` 未检 / 未通过且预算未尽即拒绝；`resolveFinal()` 只采用最后一次校验过的 revision。
  - 新增 `outline/agent/OutlineAgent.ts`：`runOutlineRepairAgent()`——初稿已合格且零质检问题时零请求短路；否则任务书 = 方向卡 + 门禁政策阈值 + 章蓝图格式硬规则 + 工具表 + 修复流程。默认预算 8 轮 / 360s / 240k token（大纲 40 章一页约 12k 字）。返回 `completeness` 由调用方 fail-closed。
  - `UnifiedOutlineGenerator.expandDirection()`：5 步生成 → `sanitizeOutlineHookLengths` 确定性预清洗 → `runOutlineRepairAgent` → 门禁不通过则失败并给出阻断项。删除 `outline-reviewer.ts` 的 `reviewAndFixOutline/buildOutlineReviewPrompt`（仅留 `inspectOutlineQuality`）与 `outline-completer.ts` 的 `repairUnregisteredCharacters`；`requestChatCompletion` 升级为接受 `AgentMessage[]`（Gemini `assistant→model`、Anthropic 多轮 content blocks、OpenAI 兼容原样），trace purpose `outline-review → outline-agent`。UI 与冒烟共用 `generator.expandDirection`，天然单轨。
  - 测试：`OutlineToolkit.test.ts` 17 用例、`OutlineAgent.test.ts` 5 用例（零请求短路 / 读-改-补角色-检-finish 主路径 / 改后不复检反复 finish → stall 回退 / AbortError 上抛 / transport 持久失败 protocol-error）。outline + story-runtime agent 套件 28 文件 / 328 用例全绿。
  - **未做**：`generateDirections` 未 agent 化（单轮、无修复需求）；UI 方向卡按 `recommendationScore` 排序（分叉 #8）留给 P4 一并处理；P3 退出条件「20 本大纲 A/B」待与 P2.3 的 100 章 A/B 合并跑。
- **2026-09-02 P3.5 outline 旧栈死代码清理**（49 文件 / 17,600 行）：
  - 审计口径：从生产/冒烟根做 import 图 BFS，barrel `export *` 不算可达；`story-runtime/**`、`src/main/**` 零引用 outline。存活主链是 `generators/`（UnifiedOutlineGenerator 系），不是 `generator/`（oh-story 式 master/volume/chapter 三段生成器）。
  - 删除：`index.ts`（总 barrel，无消费者）、`generator/**`、`knowledge/**`、`workflow/**`、`analytics/**`、`contract/**`（更旧的手写契约）、`contracts/{validator,hard-fails,chapter-commit}`、`processor/{incremental-writeback,timeline-manager}`、`prompts/{master,chapter,writing,core,techniques,templates,validators,references}/**` 与 `prompts/volume/volume-outline-prompt`、`schemas/{index,volume.schema,chapter-brief.schema}`、`types/index.ts`、`validation/` 除 `outlineCompleteness.ts` 外全部。这些模块**零单测**，删除不减少覆盖。
  - 收窄两个 barrel：`prompts/index.ts` 只留 ProOutliner 卷工具用的 `buildVolumeBeatPrompt/buildTimelinePrompt`；`contracts/index.ts` 只留 `story-contract/volume-contract`。顺带修正 `prompts/system/core-principles.ts` 一个解析到不存在目录的 type-only import 路径（`../contracts` → `../../contracts`）。`docs/reference-projects.md` 中指向已删文件的映射改指 `core-principles.ts` / `proseRules.ts` / `story-runtime/agent/`。
  - 回归：outline + composables + components 27 文件 / 326 用例全绿；`vite build` 渲染进程通过（无未解析 import）；`tsc` 无新增 TS2307/2305。
  - **保留待产品决策**：`processor/outline-post-processor` + `parser/{remark-parser,markdown-extractor}`（约 4,300 行）仅服务 QuickStart / InspirationPanel 的旧 `generateOutlines()` 入口，冒烟不经过；`prompts/volume/*` + `contracts/*` 仅服务 ProOutliner 卷节拍/时间线。两者下线后可再删。
- **2026-09-02 P2.3 准备**（A/B 仪表就位，真实跑受阻）：
  - `storyflowClosedLoopHarness` summary 的 `batch[]` 新增 `writer` 字段（`finishReason/checksUsed/revertedUnchecked/rounds/toolCalls/byTool/ms`，初稿即通过为 `null`）。
  - `scripts/agent-ab-compare.mjs` 重写：参数化实验组/基线后缀与同窗口大小；新增「改稿回合」维度（触发率、触发后接受率、model-finish、回退未复检、均复检/轮数/工具/耗时）；trace 汇总按 `response.kind` 把检索回合与改稿回合分流（此前 writer 汇总会被误计入检索统计）。
  - **阻塞**：3 章快速回归（`MOLIU_RUN_SUFFIX=p2writer`，缓存大纲）全部请求被上游拒绝 `400 FAILED_PRECONDITION: User location is not supported for the API use.`（`provider-1787039781123` → 127.0.0.1:8045 → Gemini），与代码无关；换出口或换厂商后重跑。命令：`$env:MOLIU_RUN_SUFFIX='p2writer'; $env:MOLIU_CHAPTER_COUNT='20'; $env:MOLIU_OUTLINE_CACHE='<ExecutableOutline JSON>'; npm run smoke:storyflow:real`，随后 `node scripts/agent-ab-compare.mjs p2writer <基线后缀> --window=20`。注意 `MOLIU_OUTLINE_CACHE` 要的是裸 `ExecutableOutline`，`temp/storyflow-checkpoints/*.outline.json` 是带 `{version,prompt,…,outline}` 的检查点包，需先取 `.outline`。
