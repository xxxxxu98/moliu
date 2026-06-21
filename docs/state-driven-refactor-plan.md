# 状态驱动架构重构方案（State-Driven Refactor Plan）

> 目标：把长篇续写的"幻觉"从概率问题降级为可校验的确定性错误，把连贯性天花板从"几十章"推到"数千章"。
>
> 核心策略：**整合现有 V2 体系 + 补齐 4 个关键拼图**，而非另起炉灶。

---

## 一、执行摘要

### 1.1 问题陈述

当前续写系统存在两类幻觉来源：

1. **概率型幻觉**：LLM 自由发挥，编造与前文矛盾的设定/事件/人物状态。
2. **遗忘型幻觉**：长篇下模型记不住早期细节，导致前后不一致。

现有架构（`useChapterWriter.ts` 生产路径）主要靠"上下文工程"（窗口化大纲、压缩前文、伏笔清单）缓解，本质是**帮模型想起来**——这是一个错误前提，因为模型的记忆不可靠。

### 1.2 核心论点

> **小说的"真相"永远只存在于一个结构化数据库里。LLM 的职责只有三件事：读相关事实、写符合事实的散文、报告事实变化。**

散文是副产物，**真正的产品是每章产出的状态变更声明（CHANGES）**，因为那才是下一章的输入。

```
当前架构：  Prompt(塞记忆) ──→ LLM ──→ 散文（祈祷没编）
重构架构：  State DB ──读──→ LLM ──→ 散文 + 状态变更声明
                ↑                          │
                └─────校验后写回──────────┘
```

### 1.3 关键策略转变

| 维度 | 现状（prompt 驱动） | 目标（状态驱动） |
|------|---------------------|------------------|
| 真相来源 | 模型记忆 + 压缩摘要 | 结构化事实快照（单一真相源） |
| 事实获取 | 事后正则提取（`DataExtractor`） | 事中 AI 主动声明（CHANGES 协议） |
| 防幻觉 | 启发式审查（润色门禁） | 确定性校验门禁（G1-G7） |
| 历史召回 | 窗口化大纲（±5 章） | RAG 向量检索 + 实体图 + 关键词混合 |
| 上下文 | 平铺拼装 | Token 预算 + 位置感知（对抗 Lost-in-the-Middle） |

---

## 二、现状审计

项目已经朝状态驱动架构走了一半，V2 体系是半成品。重构前必须摸清"已有什么"，避免重复造轮子。

### 2.1 已有资产（V2 体系）

| 资产 | 位置 | 状态 |
|------|------|------|
| 6 步流程编排 | `services/writing/WritingOrchestratorV2.ts` | ✅ 可用，需整合 |
| 结构化任务书 | `types/writing-v2.ts` (`WritingTaskBook`) + `taskbook/EnhancedTaskBookBuilder.ts` | ✅ 可用 |
| 三层契约 | `types/writing-v2.ts` (`ChapterContract`/`VolumeContract`) + `contract/ContractManager.ts` | ✅ 可用 |
| 事实提取 | `extraction/DataExtractor.ts`（正则提取 `ExtractedEvent`/`StateDelta`/`EntityDelta`） | ⚠️ 弱，正则启发式 |
| 提交管理 | `commit/ChapterCommitManagerV2.ts` + `ProjectionWriters.ts` | ✅ 可用，缺事务化 |
| 润色门禁 | `polish/SixGatePolishPipeline.ts`（Gate A-F 去AI味） | ✅ 可用，但是润色门禁非一致性门禁 |
| RAG 框架 | `rag-service.ts`（`IVectorStoreService`/`IEmbeddingService` 接口完整） | ⚠️ TF-IDF stub，无真向量 |
| AI Agent | `services/ai/agents/enhanced-{context,reviewer,data}-agent.ts` | ✅ 可用 |
| 投影系统 | `projection/ProjectionSystem.ts` | ✅ 可用 |
| 失败恢复 | `failure-recovery/failure-manager.ts` | ✅ 可用，缺 checkpoint |
| 记忆文件管理 | `memory-manager.ts` + `extract-plot-memory.ts` | ⚠️ 与 V2 重叠 |
| 预检 | `preflight/PreflightService.ts` | ✅ 可用 |
| 上下文构建 | `OutlineContextBuilder.ts`（窗口化大纲） | ✅ 可用，缺预算管理 |
| 窗口化大纲 | `OutlineContextBuilder.buildWindowedOutlineText` | ✅ 优秀，保留 |

### 2.2 关键缺口（本次重构补齐的 4 块拼图）

1. **❌ CHANGES 协议**：现在是 AI 写完正文后用 `DataExtractor` 正则提取，准确率低。要升级为 **AI 主动输出结构化 diff**（天命方案的核心创新）。
2. **❌ 事实快照状态层**：有 `StateDelta` 类型但没人维护全局快照，没有版本化，没有"读字段而非回忆"的单一真相源。
3. **❌ 一致性门禁**：现有 `SixGatePolishPipeline` 是润色门禁（去AI味），缺**事实一致性门禁**（G3: CHANGES vs 快照矛盾，G7: LLM 语义审查）。
4. **❌ 真向量检索**：`RAGService` 用 TF-IDF 模拟，召回质量不足；无场景级切片。

### 2.3 架构债务

- **两条平行路径割裂**：生产用 `useChapterWriter.ts`，V2 是独立 `useWritingOrchestratorV2`，UI（`AIPanel.vue`）只接了生产路径。
- **记忆系统重叠**：`MemoryOrchestrator`、`memory-manager`、`extract-plot-memory`、`DataExtractor` 四套并立。

---

## 三、目标架构：七层状态驱动

```
┌─────────────────────────────────────────────────────────┐
│  L7  恢复层     Checkpoint · 失败恢复 · 中断续写          │
├─────────────────────────────────────────────────────────┤
│  L6  提交层     CHANGES 落库 · RAG 索引更新 · 事务化回写   │
├─────────────────────────────────────────────────────────┤
│  L5  门禁层     G1-G6 确定性 · G7 LLM-as-judge · 自动修复 │
├─────────────────────────────────────────────────────────┤
│  L4  生成层     Planner→TaskBook→Drafter (智能重试循环)   │
├─────────────────────────────────────────────────────────┤
│  L3  上下文层   Token 预算 · 位置感知拼装 · 状态注入      │
├─────────────────────────────────────────────────────────┤
│  L2  检索层     向量 RAG + 实体图 + 关键词 混合检索        │
├─────────────────────────────────────────────────────────┤
│  L1  状态层     事实快照 + CHANGES 协议 + 版本时间线      │
└─────────────────────────────────────────────────────────┘
```

每一层解决一个具体的幻觉/连贯问题。下文逐层详述。

---

## 四、分层详细设计

### L1 状态层：单一真相源（**重构地基**）

**职责**：维护"这本书到目前为止的所有事实"，所有其他层从这里读、向这里写。

#### 4.1.1 15 维事实快照

借鉴天命方案，按中文网文场景裁剪：

```
角色维度  │ 状态(境界/能力/心理) · 位置 · 外貌 · 关系网
剧情维度  │ 冲突进度 · 剧情节点(按章归档) · 伏笔状态(埋设/暗示/回收/逾期)
世界维度  │ 地点状态 · 势力状态 · 世界观硬约束 · 时间线
契约维度  │ 秘密(知情角色列表) · 誓约约束 · 截止约束(倒计时) · 物品流转
```

**核心特性**：
- **强类型**：每个实体（角色/地点/势力）有唯一 ID，描述永远只有一份
- **版本化**：每章一份快照 JSON，绑定章节号，可回放到任意历史状态
- **冲突检测内置**：写入时自动检查 `entity + field` 是否已有不同 value

#### 4.1.2 CHANGES 协议（**最关键创新**）

每章生成时，prompt 协议要求 AI 在正文后输出结构化 diff：

```json
---CHANGES---
{
  "character_state": [
    { "entity": "char_001", "field": "境界", "old": "练气三层",
      "new": "练气四层", "evidence": "掌心灵气漩涡凝聚...", "reason": "突破" }
  ],
  "location": [
    { "entity": "char_001", "from": "青云宗", "to": "万妖谷", "reason": "奉师命下山" }
  ],
  "foreshadow": [
    { "id": "fs_007", "action": "setup", "hint": "断剑嗡鸣" }
  ],
  "relationship": [
    { "from": "char_001", "to": "char_003", "delta": -15, "reason": "被骗" }
  ]
}
```

**关键字段**：
- `evidence`：变化在正文里的出处，门禁可回查
- `old/new`：让 diff 可校验，防止 AI 把没变的东西也写进 CHANGES
- `reason`：留给人看 + 事后审计

**与现有 `DataExtractor` 的关系**：CHANGES 是 AI 主动声明的"权威 diff"，`DataExtractor` 降级为"兜底补充提取器"——当 AI 漏报状态变化时，正则提取做补充。

#### 4.1.3 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 状态类型定义 | `services/state/types.ts` | 15 维快照 + CHANGES schema |
| 状态快照存储 | `services/state/StateSnapshotStore.ts` | 读写快照、版本管理、冲突检测 |
| CHANGES 协议 | `services/state/ChangesProtocol.ts` | 解析/校验/序列化 CHANGES |
| CHANGES 应用器 | `services/state/ChangesApplier.ts` | 把 CHANGES 合并到快照（事务化） |
| 快照构建器 | `services/state/SnapshotBuilder.ts` | 从现有项目数据初始化快照 |

#### 4.1.4 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 存储 | IndexedDB（electron-renderer）+ 内存缓存 | 无需引入主进程数据库；事务保证一致性 |
| Schema 校验 | Zod | 端到端类型安全，CHANGES 校验复用同一份 schema |
| 版本 | 每章一份快照 JSON（不可变） | 简单可回放 |
| 实体解析 | ID 优先 + 别名表 + LLM 兜底 | "黑衣人" → 别名匹配 → 找不到则标"新实体待登记" |

---

### L2 检索层：找到相关而非灌入全部

**职责**：按当前章节需要，从历史中检索相关片段，而不是全量灌入。

#### 4.2.1 三路混合检索

```
                    ┌─ 向量检索 (语义相关)
当前章大纲/角色/冲突 ─┼─ 实体图检索 (涉及哪些实体的历史段落)
                    └─ 关键词检索 (BM25，精确匹配)
                          │
                    重排序 (Reciprocal Rank Fusion)
                          │
                    Token 预算内 Top-K
```

#### 4.2.2 关键设计：场景级切片

不按整章做向量，按**场景**（一次地点变换/一次对话回合）切。一个 3000 字章节能切成 5-8 个场景，每个自包含，召回粒度精细。

#### 4.2.3 现有资产处置

- `rag-service.ts` 的接口（`IVectorStoreService`/`IEmbeddingService`/`RAGService`）**保留**，是优秀的抽象
- `InMemoryVectorStore` + `SimpleEmbeddingService`（TF-IDF）**替换**为：
  - `SQLiteVectorStore`（sqlite-vec 或纯 JS 余弦相似度，无需外部服务）
  - 可插拔 embedding（默认 TF-IDF 兜底 + 可选 API embedding）

#### 4.2.4 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 实体图索引 | `services/retrieval/EntityGraph.ts` | 实体 → 出现章节倒排 |
| 场景切片器 | `services/retrieval/SceneChunker.ts` | 章节正文 → 场景片段 |
| 混合检索器 | `services/retrieval/HybridRetriever.ts` | 三路检索 + RRF 重排 |
| BM25 | `services/retrieval/BM25.ts` | 关键词检索 |

---

### L3 上下文层：智能拼装 prompt

**职责**：把 L1 状态 + L2 检索结果 + 大纲，组装成最优 prompt。

#### 4.3.1 Token 预算管理器

```
总预算 (按模型 context window 动态计算, 留 30% 给输出)
    ├─ 状态快照        20%  (权威事实表, 固定优先)
    ├─ 当前章+邻章细纲 15%  (CBN/CPNs/CEN)
    ├─ 检索召回片段     35%  (RAG 结果)
    ├─ 写作规范         15%  (去AI味/对话格式/钩子)
    └─ 缓冲             15%  (用户自定义指令/History)
```

超限时按**优先级淘汰**，不是简单截断。

#### 4.3.2 位置感知注入（对抗 Lost in the Middle）

```
[开头] 状态快照 + 当前章细纲 + 硬约束  ← 模型最关注
[中段] 检索召回的历史片段               ← 容忍衰减
[结尾] 写作规范 + 输出格式要求 + CHANGES 协议 ← 模型最关注
```

#### 4.3.3 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| Token 估算器 | `services/context/TokenEstimator.ts` | 中英文混合 token 估算 |
| 上下文组装器 | `services/context/ContextAssembler.ts` | 预算管理 + 位置感知拼装 |
| 优先级策略 | `services/context/PriorityPolicy.ts` | 各类信息的优先级与淘汰规则 |

#### 4.3.4 现有资产处置

- `OutlineContextBuilder.ts` **保留**，窗口化大纲是 L3 的一个策略
- `prompt-builder.ts` 的 `buildMemorySection` **重写**为预算感知版本

---

### L4 生成层：结构化规划 + 智能重试

**职责**：把"模糊大纲"翻译成"可校验执行清单"，再写散文 + CHANGES。

#### 4.3 三阶段生成

```
1. Planner   ─→ 从状态快照 + 大纲推导本章"必须发生什么" (输出 TaskBook)
2. Drafter   ─→ 按 TaskBook 写散文 + CHANGES (可携带上次审查反馈)
3. (循环)    ─→ 失败回到 2, 携带 RevisionHints (最多 3 次)
```

#### 4.4 现有资产处置

- `EnhancedTaskBookBuilder` **保留强化**，作为 Planner
- `WritingOrchestratorV2.step2_Draft` **扩展**，注入 CHANGES 协议要求
- 新增 `DrafterRetryLoop`，整合现有 `WritingPipeline.executeDraftWithRetry` 的逻辑

#### 4.5 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| CHANGES 注入器 | `services/generation/ChangesPromptInjector.ts` | 在 draft prompt 里要求输出 CHANGES |
| 重试循环 | `services/generation/DrafterRetryLoop.ts` | 审查失败 → 修复 → 重起草 |
| 模型路由 | `services/generation/ModelRouter.ts` | Planner/Drafter/Gate 用不同模型 |

---

### L5 门禁层：**防幻觉的真正心脏**

**职责**：生成是概率，门禁是确定性。所有幻觉在这里收敛。

#### 4.5.1 七道闸门（按成本从低到高，前面的挡掉就不进后面的）

```
G1 协议解析        CHANGES 格式合规? 字段齐全?              [成本: 0]
G2 引用校验        提到的实体 ID 真实存在?                  [成本: 0]
G3 结构一致性      CHANGES 与状态快照矛盾? (境界跳变/位置瞬移) [成本: 0]
G4 描写一致性      外貌/地点描写 vs 档案?                    [成本: 0]
G5 蓝图出场        大纲要求的角色/事件都出现了?              [成本: 0]
G6 未知实体检测    新实体数量/龙套数量阈值?                  [成本: 0]
G7 LLM 语义审查    逻辑漏洞/人设 OOC/隐含矛盾?              [成本: 1 次调用]
```

#### 4.5.2 失败处理决策树

```
未通过
  ├─ 可自动修复 (AI味/段落过长) ──→ 自动修复 ──→ 重审 G7
  ├─ 需重写 (一致性/出场缺失/逻辑) ──→ 带 RevisionHints 重起草
  └─ 反复失败 ──→ 降级严格度 / 人工介入
```

#### 4.5.3 现有资产处置

- `SixGatePolishPipeline` **保留**，重定位为"润色门禁"（Gate A-F 去AI味），在 L5 之后执行
- `review/blocking-review.service.ts` **保留**，作为 G7 的基础
- `review/ReviewAgent.ts` **降级**为 G7 的 fallback 启发式
- 新建 `ConsistencyGatePipeline`，承载 G1-G6 确定性门禁

#### 4.5.4 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 门禁类型 | `services/gates/types.ts` | GateResult / GateSeverity / GateConfig |
| 协议解析门禁 | `services/gates/Gate1Protocol.ts` | CHANGES 格式校验 |
| 引用校验门禁 | `services/gates/Gate2Reference.ts` | 实体 ID 存在性 |
| 结构一致性门禁 | `services/gates/Gate3Consistency.ts` | CHANGES vs 快照矛盾（**核心**） |
| 描写一致性门禁 | `services/gates/Gate4Description.ts` | 外貌/地点 vs 档案 |
| 蓝图出场门禁 | `services/gates/Gate5Blueprint.ts` | 大纲要求出场校验 |
| 未知实体门禁 | `services/gates/Gate6Entity.ts` | 新实体/龙套计数 |
| LLM 语义门禁 | `services/gates/Gate7Semantic.ts` | LLM-as-judge 找茬 |
| 门禁流水线 | `services/gates/ConsistencyGatePipeline.ts` | 串联 G1-G7 |

---

### L6 提交层：事务化状态回写

**职责**：只有通过所有门禁的章节才能提交。提交是事务，保证状态与正文一致。

#### 4.6.1 事务流程

```
BEGIN
  1. 解析 CHANGES, 写入状态快照 (新版本号 = 当前章号)
  2. 新章节文本切片, 更新 RAG 向量索引
  3. 更新实体图倒排索引
  4. Git commit (复用 GitBackupManager)
  5. 持久化章节正文
COMMIT (任一步失败回滚)
```

#### 4.6.2 现有资产处置

- `ChapterCommitManagerV2` **保留扩展**，加事务化
- `ProjectionWriters` **保留**，作为事务的各个 writer

#### 4.6.3 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 提交事务 | `services/commit/CommitTransaction.ts` | 事务编排 + 回滚 |
| 索引同步 | `services/commit/IndexSyncWriter.ts` | RAG + 实体图索引更新 |

---

### L7 恢复层：长篇必须有

**职责**：写 200 章中途崩溃是必然事件，这层保证可恢复。

#### 4.7.1 能力

- **Checkpoint**：每章提交后写检查点，崩溃后从最近检查点恢复
- **失败状态机**：复用现有 `failure-recovery`
- **可重放**：状态快照版本化，任意章节可"时光倒流"重写

#### 4.7.2 现有资产处置

- `failure-recovery/failure-manager.ts` **保留扩展**，加 checkpoint

#### 4.7.3 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 检查点管理 | `services/recovery/CheckpointManager.ts` | 检查点写入/恢复 |
| 会话状态 | `services/recovery/SessionState.ts` | 写作会话持久化 |

---

## 五、单章数据流（完整闭环）

```
[读] 加载第 N 章状态快照 (L1)
       │
[检] 按本章大纲检索历史片段 (L2) ──→ Top-K 相关场景
       │
[组] 预算管理 + 位置感知拼装 (L3) ──→ 完整 prompt (含 CHANGES 协议要求)
       │
[划] Planner 生成 TaskBook (L4) ──→ 可校验执行清单
       │
[写] Drafter 生成 散文 + CHANGES (L4)
       │
[审] G1-G6 确定性门禁 (L5) ──┐
       │                    │ 失败→重写/修复
[审] G7 LLM 语义审查 (L5) ──┘
       │ 通过
[润] SixGatePolishPipeline 去AI味 (现有)
       │
[提] 提交事务: 快照更新 + RAG 索引 + Git (L6)
       │
[记] 写 checkpoint (L7)
       │
       ↓ 下一章
```

---

## 六、现有模块处置矩阵

| 现有模块 | 命运 | 说明 |
|---------|------|------|
| `useChapterWriter.ts`（生产路径） | **保留** | 作为 UI 适配层，内部切换到新编排器 |
| `WritingOrchestratorV2.ts` | **扶正为主入口** | 整合新门禁 + CHANGES |
| `orchestrator/WritingOrchestrator.ts` | **废弃** | 与 V2 重复 |
| `orchestrator/WritingPipeline.ts` | **吸收** | 重试循环逻辑迁入 L4 |
| `memory/MemoryOrchestrator.ts` | **降级** | 被 L1 StateSnapshotStore 取代 |
| `memory-manager.ts` | **保留** | 文件持久化能力复用 |
| `extract-plot-memory.ts` | **降级** | 被 CHANGES 协议 + 兜底提取取代 |
| `extraction/DataExtractor.ts` | **保留降级** | 作为 CHANGES 的兜底补充提取器 |
| `contract/ContractManager.ts` | **吸收** | 契约并入 L1 状态层 |
| `review/ReviewAgent.ts` | **降级** | 作为 G7 的 fallback 启发式 |
| `review/blocking-review.service.ts` | **保留** | 作为 G7 基础 |
| `review/EnhancedReviewAgent.ts` | **保留** | 作为 G7 实现 |
| `polish/SixGatePolishPipeline.ts` | **保留** | 重定位为润色门禁，在 L5 之后 |
| `commit/ChapterCommitManagerV2.ts` | **保留扩展** | 加事务化 |
| `commit/ProjectionWriters.ts` | **保留** | 作为事务 writer |
| `OutlineContextBuilder.ts` | **保留** | 窗口化大纲是 L3 策略 |
| `prompt-builder.ts` | **部分重写** | buildMemorySection 改预算感知 |
| `rag-service.ts` | **保留接口换实现** | 替换 stub 为真向量 |
| `taskbook/EnhancedTaskBookBuilder.ts` | **保留强化** | L4 Planner |
| `failure-recovery/` | **保留扩展** | L7 基础 |
| `preflight/PreflightService.ts` | **保留** | L4 Step 0 |
| `enhanced-foreshadow-tracker.ts` | **吸收** | 伏笔状态并入 L1 |
| `services/ai/agents/enhanced-*-agent.ts` | **保留** | L4/L5/L6 复用 |

**最大动作**：合并两条平行路径（生产 + 重构），让 `WritingOrchestratorV2` 成为唯一入口，`useChapterWriter` 瘦身为 UI 适配层。

---

## 七、实施任务清单（按依赖排序）

### 阶段 0：地基（无外部依赖）

- [ ] T1.1 创建 `services/state/types.ts`：15 维快照 + CHANGES schema（Zod）
- [ ] T1.2 创建 `services/state/ChangesProtocol.ts`：CHANGES 解析/校验/序列化
- [ ] T1.3 创建 `services/state/StateSnapshotStore.ts`：快照读写、版本管理、冲突检测
- [ ] T1.4 创建 `services/state/ChangesApplier.ts`：CHANGES → 快照合并（事务化）
- [ ] T1.5 创建 `services/state/SnapshotBuilder.ts`：从现有项目数据初始化快照
- [ ] T1.6 L1 单元测试

### 阶段 1：门禁（依赖 L1）

- [ ] T2.1 创建 `services/gates/types.ts`：GateResult / GateConfig
- [ ] T2.2 实现 G1 协议解析门禁
- [ ] T2.3 实现 G2 引用校验门禁
- [ ] T2.4 实现 G3 结构一致性门禁（**核心**）
- [ ] T2.5 实现 G4 描写一致性门禁
- [ ] T2.6 实现 G5 蓝图出场门禁
- [ ] T2.7 实现 G6 未知实体门禁
- [ ] T2.8 实现 G7 LLM 语义门禁
- [ ] T2.9 创建 `ConsistencyGatePipeline.ts`：串联 G1-G7
- [ ] T2.10 L5 单元测试

### 阶段 2：上下文（依赖 L1）

- [ ] T3.1 创建 `services/context/TokenEstimator.ts`
- [ ] T3.2 创建 `services/context/PriorityPolicy.ts`
- [ ] T3.3 创建 `services/context/ContextAssembler.ts`
- [ ] T3.4 L3 单元测试

### 阶段 3：检索（依赖 L1）

- [ ] T4.1 创建 `services/retrieval/SceneChunker.ts`
- [ ] T4.2 创建 `services/retrieval/BM25.ts`
- [ ] T4.3 创建 `services/retrieval/EntityGraph.ts`
- [ ] T4.4 创建 `services/retrieval/HybridRetriever.ts`
- [ ] T4.5 替换 `rag-service.ts` 的 stub 实现
- [ ] T4.6 L2 单元测试

### 阶段 4：生成（依赖 L1, L3, L5）

- [ ] T5.1 创建 `services/generation/ChangesPromptInjector.ts`
- [ ] T5.2 创建 `services/generation/DrafterRetryLoop.ts`
- [ ] T5.3 创建 `services/generation/ModelRouter.ts`

### 阶段 5：提交（依赖 L1, L2）

- [ ] T6.1 创建 `services/commit/CommitTransaction.ts`
- [ ] T6.2 创建 `services/commit/IndexSyncWriter.ts`
- [ ] T6.3 扩展 `ChapterCommitManagerV2` 加事务化

### 阶段 6：恢复（依赖 L6）

- [ ] T7.1 创建 `services/recovery/CheckpointManager.ts`
- [ ] T7.2 创建 `services/recovery/SessionState.ts`
- [ ] T7.3 扩展 `failure-manager.ts` 加 checkpoint

### 阶段 7：整合（依赖全部）

- [ ] T8.1 重构 `WritingOrchestratorV2` 串联 L1-L7
- [ ] T8.2 `useChapterWriter` 瘦身为 UI 适配层
- [ ] T8.3 端到端集成测试

---

## 八、关键技术风险与缓解

### 8.1 实体解析（Entity Resolution）

**风险**：AI 写"黑衣人"，是新角色还是已存在角色？

**缓解**：三层策略
1. ID 显式引用（prompt 要求 AI 用 `[char_001]` 标记）
2. 别名表匹配（"黑衣人" → 候选列表 → 上下文消歧）
3. 兜底：标"新实体待登记"，G6 控制数量

### 8.2 隐式状态变化

**风险**：情绪流转、关系渐变难以写成 CHANGES。

**缓解**：
- CHANGES 只抓显式变化
- 隐式变化靠 G7 LLM 审查 + 周期性"全量复盘"（每 N 章让 LLM 重读快照找漏掉的变化）

### 8.3 门禁误报

**风险**：G3 可能误判（"他握紧拳头" 被当成"状态变化"）。

**缓解**：
- CHANGES 要求 `evidence` 字段，门禁回查正文是否真有支撑
- 误报率高的规则降级为 warning 不 blocking

### 8.4 创意被约束扼杀

**风险**：太严的门禁让小说变机械。

**缓解**：门禁分两类
- **硬约束**（世界观规则、已确立事实）不可违反
- **软约束**（节奏、爽点密度）只告警不阻断

### 8.5 CHANGES 协议 AI 不遵守

**风险**：AI 不输出 CHANGES 或格式错误。

**缓解**：
- prompt 里强约束 + 示例
- G1 门禁拦截，格式错直接打回重写
- 兜底：`DataExtractor` 正则提取补齐

### 8.6 向量库引入复杂度

**风险**：sqlite-vec 等需原生依赖，electron 打包复杂。

**缓解**：
- 默认纯 JS 余弦相似度（小数据集够用）
- 接口已抽象（`IVectorStoreService`），后续可平滑换 sqlite-vec / Chroma

---

## 九、验收标准

### 9.1 功能验收

1. 写一章后，状态快照自动更新（境界/位置/伏笔等）
2. 故意写"主角境界从练气一层直接到元婴" → G3 拦截
3. 故意写"未登记的新角色"超过阈值 → G6 拦截
4. 续写时 prompt 里能看到检索到的历史相关片段
5. 中途中断后能从 checkpoint 恢复

### 9.2 性能验收

1. 单章生成耗时不超过现有流程的 1.5 倍（门禁 + 检索的额外成本）
2. 快照读写 < 50ms（IndexedDB）
3. 检索召回 < 200ms

### 9.3 质量验收

1. 连续写 50 章后，角色境界/位置/关系无矛盾
2. 伏笔埋设/回收状态可追溯
3. 长篇（200+章）下 token 消耗不超过现有流程

---

## 十、里程碑

| 里程碑 | 内容 | 价值 |
|--------|------|------|
| **M1** | L1 状态层 + L5 门禁（G3 一致性） | 防幻觉能力质变，可独立验证 |
| **M2** | L3 上下文层 + L4 CHANGES 注入 | 生成质量提升 |
| **M3** | L2 检索层 | 长篇召回质量提升 |
| **M4** | L6 提交 + L7 恢复 | 长篇稳定性 |
| **M5** | 整合 + UI 对接 | 端到端可用 |

**M1 是最关键的里程碑**——它用最小改动验证"门禁 + 状态快照"思路是否有效。如果 M1 work，后面都是工程量；如果不 work，及时止损。

---

## 十一、实现完成总结

> **状态**：M1-M5 全部实现，所有 7 层 + 整合层均已编码并通过单元测试。

### 11.1 文件清单（新增）

| 层 | 模块 | 路径 |
|----|------|------|
| L1 | types | `services/state/types.ts` |
| L1 | ChangesProtocol | `services/state/ChangesProtocol.ts` |
| L1 | StateSnapshotStore | `services/state/StateSnapshotStore.ts` |
| L1 | ChangesApplier | `services/state/ChangesApplier.ts` |
| L1 | SnapshotBuilder | `services/state/SnapshotBuilder.ts` |
| L2 | SceneChunker | `services/retrieval/SceneChunker.ts` |
| L2 | BM25Index | `services/retrieval/BM25.ts` |
| L2 | EntityGraph | `services/retrieval/EntityGraph.ts` |
| L2 | HybridRetriever | `services/retrieval/HybridRetriever.ts` |
| L3 | TokenEstimator | `services/context/TokenEstimator.ts` |
| L3 | PriorityPolicy | `services/context/PriorityPolicy.ts` |
| L3 | ContextAssembler | `services/context/ContextAssembler.ts` |
| L4 | DrafterRetryLoop | `services/generation/DrafterRetryLoop.ts` |
| L5 | types + G1-G6 | `services/gates/types.ts` + `services/gates/deterministic-gates.ts` |
| L5 | Gate7Semantic | `services/gates/Gate7Semantic.ts` |
| L5 | ConsistencyGatePipeline | `services/gates/ConsistencyGatePipeline.ts` |
| L6 | CommitTransaction | `services/commit/CommitTransaction.ts` |
| L7 | RecoveryManager | `services/recovery/RecoveryManager.ts` |
| 整合 | StateDrivenWritingOrchestrator | `services/orchestrator/StateDrivenWritingOrchestrator.ts` |

### 11.2 测试覆盖

| 层 | 测试文件 | 通过数 |
|----|----------|--------|
| L1 | `__tests__/state.test.ts` | 34/34 |
| L2 | `__tests__/retrieval.test.ts` | 23/23 |
| L3 | `__tests__/context.test.ts` | 21/21 |
| L4 | `__tests__/generation.test.ts` | 11/11 |
| L5 | `__tests__/gates.test.ts` | 25/25 |
| L6+L7 | `__tests__/recovery.test.ts` | 18/18 |
| 整合 | `__tests__/integration.test.ts` | 7/7 |
| **总计** | **7 个测试文件** | **139/139** |

TypeScript 编译：新增代码零错误（预存在的 `DraftAgent.ts` 等老文件错误与本次重构无关）。

### 11.3 关键设计决策

1. **CHANGES 协议**：用 `---CHANGES---` 分隔符 + JSON 载荷，容错处理 markdown 包裹、尾随逗号、部分坏条目。
2. **冲突检测分级**：critical（死人复活、state 不符）→ 严格阻断；high → 人工复核；low/info → 警告。
3. **门禁短路**：G1 协议失败时直接终止后续门禁，避免基于坏数据产生误导结论。
4. **三路混合检索 + RRF 重排**：向量 + 实体图 + BM25 互补，向量不可用时降级为两路。
5. **位置感知注入**：状态快照放开头、CHANGES 协议放结尾，规避 Lost-in-the-Middle。
6. **注入式适配器**：所有外部依赖（AI/Git/Persistence/LLM-judge）通过接口注入，避免层间硬耦合。
7. **事务化提交**：state_apply → rag_index → git_backup → persistence，任一步失败回滚。
8. **三层恢复**：post_commit 检查点 > 会话状态 > 快照最新版本，崩溃后自动续写。

### 11.4 使用示例

```typescript
import { StateDrivenWritingOrchestrator } from '@/services/orchestrator';

// 1. 注入 AI 起草客户端（实现 DrafterClient 接口）
const drafter = {
  async draft(prompt: string, params: any) {
    return await yourAI.chat(prompt, params);
  },
};

// 2. 可选：注入 Git 备份、章节持久化
const gitBackup = { async backup(ch, content, title) { ... } };
const persistence = { async save(id, content) { ... } };

// 3. 创建编排器
const orchestrator = new StateDrivenWritingOrchestrator(
  drafter, gitBackup, persistence,
  { enableSemanticGate: true, maxRetries: 3 },
);

// 4. 初始化（每个项目一次）
await orchestrator.initialize(project);

// 5. 写一章
const result = await orchestrator.writeChapter(project, chapter, 3000, {
  currentChapterOutline: chapter.outline,
  writingRules: '...',
  blueprint: { mustCover: ['...'], requiredCharacters: ['林动'] },
});

if (result.success) {
  console.log(`第 ${result.chapter} 章完成，${result.attempts} 次尝试`);
}

// 6. 批量写作
const results = await orchestrator.writeBatch(project, chapters, {
  onProgress: (done, total) => console.log(`${done}/${total}`),
});

// 7. 崩溃恢复
const recovery = orchestrator.recover();
if (recovery.canRecover) {
  console.log(`从第 ${recovery.resumeChapter} 章继续（${recovery.source}）`);
}
```

### 11.5 与现有代码的关系

- **不破坏现有路径**：`WritingOrchestratorV2` 完全不动，作为稳定回退。
- **新入口可选启用**：`useChapterWriter` 可在配置里选择用 V2 还是新编排器。
- **数据兼容**：snapshot 从现有 `Project` 直接构建（`SnapshotBuilder`），不需要数据迁移。
- **API 抽象**：复用现有 `IVectorStoreService` / `IEmbeddingService` / `GitBackupManager` 接口。

### 11.6 后续可优化点（不阻塞当前里程碑）

- LLM 客户端测试 stub（目前用 mock 注入）
- 向量库热加载（避免冷启动重索引）
- L7 检查点存储换 IndexedDB（容量比 localStorage 大）
- 门禁的规则可视化编辑器（让用户调整阈值）
- 多项目并发支持（store 缓存已支持，需 UI 调度）

