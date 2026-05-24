# 墨流 (Moliu) 智能续写系统优化方案

> 基于 oh-story-claudecode-main 和 webnovel-writer-master 的最佳实践

**版本**: v2.0  
**日期**: 2026-05-24  
**目标**: 构建企业级网文写作辅助系统

---

## 一、现状分析

### 1.1 当前系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Moliu 桌面应用                          │
├─────────────────────────────────────────────────────────────────┤
│  UI 层 (Vue 3 + TypeScript)                                     │
│  ├── AIPanel.vue          - AI 交互面板                        │
│  ├── BatchWritingPanel.vue - 批量写作面板                       │
│  └── Editor components    - 编辑器组件                          │
├─────────────────────────────────────────────────────────────────┤
│  业务层 (Composables)                                           │
│  ├── useChapterWriter.ts  - 单章写作 (1200行)                   │
│  ├── useBatchWriter.ts    - 批量写作                            │
│  └── useChapterCommit.ts  - 章节提交 (已实现框架)               │
├─────────────────────────────────────────────────────────────────┤
│  服务层 (Services)                                             │
│  ├── WritingOrchestrator - 写作编排器                            │
│  ├── DeAIService         - 去AI味服务                            │
│  ├── EnhancedReviewAgent - 审查 Agent                           │
│  └── MemoryOrchestrator  - 记忆管理                             │
├─────────────────────────────────────────────────────────────────┤
│  AI 层 (Agents)                                                │
│  ├── Context Agent        - 上下文提取                           │
│  ├── Reviewer Agent      - 审查 Agent                           │
│  └── Data Agent          - 数据提取 Agent (待实现)               │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 当前流程（5步）

```
TaskBook 生成 → AI 起草 → Blocking 审查 → 去AI味 → 保存
```

### 1.3 存在问题

| 问题 | 描述 | 严重度 |
|------|------|--------|
| 缺乏独立 Reviewer Agent | 审查逻辑散落在各处，无法独立调用 | 🔴 高 |
| 无 CHAPTER_COMMIT 主链 | 写后事实没有统一入口 | 🔴 高 |
| 无 Projection Writers | 状态/记忆/索引散乱更新 | 🟡 中 |
| 缺乏 anti_patterns 回流 | 审查发现问题不会进入后续约束 | 🟡 中 |
| 合同系统不完善 | 缺乏硬性约束和运行时验证 | 🟡 中 |
| 六门禁未集成 | oh-story 的门禁系统缺失 | 🟢 低 |

---

## 二、优化目标

### 2.1 核心指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 续写质量 | 基础 | 企业级 |
| AI 味残留 | 15-20% | <5% |
| 上下文一致性 | 70% | 95% |
| 阻断问题自动修复率 | 0% | 60% |
| 审查可追溯性 | 无 | 完整链路 |

### 2.2 优化原则

1. **合同优先** - 写作前必须解析真实合同
2. **Agent 独立** - 每个子任务由独立 Agent 处理
3. **事实唯一** - 写后事实统一入口 (CHAPTER_COMMIT)
4. **投影规范** - 状态/记忆/索引由 Projection Writers 同步
5. **经验回流** - 审查发现问题进入避雷列表

---

## 三、优化方案

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           优化后系统架构                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│  │   Context   │────▶│    Write    │────▶│   Review    │                  │
│  │   Agent     │     │   (Draft)   │     │   Agent     │                  │
│  └─────────────┘     └─────────────┘     └─────────────┘                  │
│         │                   │                   │                          │
│         ▼                   ▼                   ▼                          │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │                    CHAPTER_COMMIT                            │            │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │            │
│  │  │ Review   │ │Fulfillment│ │Disambigu-│ │Extraction│     │            │
│  │  │ Result   │ │ Result   │ │ation     │ │ Result   │     │            │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │              Projection Writers (5个)                        │            │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │            │
│  │  │ State  │ │ Index  │ │Summary │ │Memory  │ │Vector  │ │            │
│  │  │Writer  │ │Writer  │ │Writer  │ │Writer  │ │Writer  │ │            │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │              anti_patterns.json (经验回流)                   │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 新流程（6步）

```
┌─────────────────────────────────────────────────────────────────┐
│                    新增: Step 0 - 预检                          │
│  检查项目状态、刷新合同树、验证必要文件                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Step 1: Context Agent                        │
│  生成写作任务书（必须使用独立 Agent）                            │
│  输出: WritingTaskBook (CBN/CPNs/CEN/mustCover/forbiddenZones)  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Step 2: AI 起草                               │
│  只根据任务书起草，不加载额外约束                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Step 3: Reviewer Agent                      │
│  必须使用独立 Agent，生成结构化审查 JSON                         │
│  输出: blocking issues / warnings / suggestions                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Step 4: 润色                                │
│  1. 修复非 blocking issues                                      │
│  2. 风格适配（Anti-AI 门禁 A-F）                               │
│  3. 排版优化                                                   │
│  4. 终检                                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Step 5: CHAPTER_COMMIT                       │
│  5.1 Data Agent 提取事实（必须独立）                            │
│  5.2 生成 commit 对象                                           │
│  5.3 判定 accepted/rejected                                    │
│  5.4 触发 Projection Writers                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Step 6: 备份                                 │
│  Git 备份章节内容                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、模块详细设计

### 4.1 Step 0: 预检 (Preflight)

**职责**: 环境验证和合同刷新

```typescript
// 新文件: src/renderer/src/services/writing/preflight/PreflightService.ts

interface PreflightResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  contracts: {
    genre: string;
    volume: VolumeContract;
    chapter: ChapterContract;
  };
}

async function preflight(projectId: string, chapterNumber: number): Promise<PreflightResult> {
  // 1. 验证项目根目录
  // 2. 检查必要文件 (.story-system/state.json)
  // 3. 刷新合同树
  // 4. 验证本章合同 (chapter_{NNN}.review.json)
}
```

**必要文件清单**:

| 文件 | 必须存在 | 缺失行为 |
|------|---------|---------|
| `.webnovel/state.json` | ✅ | 阻断 |
| `设定集/MASTER_SETTING.json` | ✅ | 阻断 |
| `卷合同/volume_{NNN}.json` | ✅ | 阻断 |
| `章节合同/chapter_{NNN}.review.json` | ✅ | 阻断 |

### 4.2 Step 1: Context Agent (任务书生成)

**改进**: 必须使用独立 Agent

```typescript
// 新文件: src/renderer/src/services/ai/agents/enhanced-context-agent.ts

interface ContextAgentInput {
  projectRoot: string;
  chapter: number;
  previousChapterEnding: string;
  recentChaptersFullText: string;
  characters: Character[];
}

interface WritingTaskBook {
  // 硬性约束（优先级最高）
  hardConstraints: {
    goal: string;           // 本章核心目标
    timeAnchor?: string;    // 时间锚点
    chapterSpan?: string;   // 章节跨度
    countdown?: string;    // 倒计时
    chapterEndOpenQuestion?: string;  // 结尾开放问题
  };
  
  // 结构化节点
  CBN: string;             // 开始节点
  CPNs: string[];          // 推进节点
  CEN: string;             // 结束节点
  
  // 必须覆盖 / 禁区
  mustCover: string[];
  forbiddenZones: string[];
  
  // 风格指引
  styleGuidance: {
    reasoning: string[];
    antiPatterns: string[];  // 从 anti_patterns.json 加载
    protagonistOOCAlert: string[];
  };
  
  // 场景补充（仅作参考，不能覆盖章纲）
  dynamicContext?: {
    recentStyle: string;
    characterStates: Record<string, string>;
  };
}

// 输出格式（固定5段）
1. 本章硬性约束
2. CBN/CPNs/CEN 与 mustCover_nodes
3. 本章禁区
4. 风格指引
5. dynamicContext 补充参考
```

### 4.3 Step 2: AI 起草

**改进**: 只根据任务书起草，不加载额外约束

```typescript
// 约束：
// 1. 只加载 WritingTaskBook
// 2. 不加载 core-constraints（已内化到任务书）
// 3. 不加载 anti-ai-guide（已内化到任务书）
// 4. 只输出纯正文，无占位符
// 5. 有结构化节点时围绕 CBN→CPNs→CEN 展开

interface DraftOptions {
  taskBook: WritingTaskBook;
  targetWordCount: number;
  writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
}

async function draft(options: DraftOptions): Promise<string> {
  // 使用 PromptBuilder 构建起草 prompt
  // 支持流式输出
}
```

### 4.4 Step 3: Reviewer Agent (审查)

**改进**: 必须使用独立 Agent，输出结构化 JSON

```typescript
// 新文件: src/renderer/src/services/ai/agents/enhanced-reviewer-agent.ts

interface ReviewerAgentInput {
  projectRoot: string;
  chapter: number;
  chapterFile: string;  // 正文文件路径
  contracts: {
    chapter: ChapterContract;
    volume: VolumeContract;
    antiPatterns: string[];
  };
}

// 强制输出格式（JSON Schema）
interface ReviewerOutput {
  blocking: boolean;  // true = 阻断
  issues: Array<{
    type: 'continuity' | 'contract' | 'anti_ai' | 'logic' | 'pace';
    severity: 'critical' | 'high' | 'medium' | 'low';
    location: string;
    description: string;
    evidence: string;
    suggestion: string;
  }>;
  metrics: {
    wordCount: number;
    dialogueRatio: number;
    antiAIFix: number;
    hookQuality: number;
    coolPointDensity: number;
  };
  antiPatternIssues: Array<{
    pattern: string;
    count: number;
    severity: 'high' | 'medium' | 'low';
  }>;
}

// 审查维度（6维）
enum ReviewDimension {
  CONTINUITY = 'continuity',        // 连续性
  CONTRACT = 'contract',           // 合同符合度
  ANTI_AI = 'anti_ai',             // 去AI味
  LOGIC = 'logic',                // 逻辑一致性
  PACE = 'pace',                   // 节奏
  HOOK = 'hook',                   // 钩子
}
```

**审查维度详解**:

| 维度 | 权重 | 检查内容 | 阻断条件 |
|------|------|---------|---------|
| 连续性 | 20% | 前章衔接、角色出场、地点一致性 | 角色严重OOC |
| 合同符合度 | 25% | mustCover/forbiddenZones | 违反禁区 |
| 去AI味 | 20% | 7种模式、禁用词 | 高严重度AI味 |
| 逻辑一致性 | 15% | 因果关系、时间线 | 严重逻辑漏洞 |
| 节奏 | 10% | 对话比例、段落长度 | 节奏崩坏 |
| 钩子 | 10% | 章首钩子、章尾钩子 | 无章尾钩子 |

### 4.5 Step 4: 润色 (Polish)

**改进**: 集成 oh-story 的六门禁系统

```typescript
// 新文件: src/renderer/src/services/writing/polish/PolishPipeline.ts

interface PolishPipeline {
  // Gate A: 禁用词替换
  gateA_ReplaceBannedWords(): FixResult;
  
  // Gate B: 句式去套路
  gateB_RemovePatterns(): FixResult;
  
  // Gate C: 心理描写外化
  gateC_ExternalizePsychology(): FixResult;
  
  // Gate D: 节奏打碎
  gateD_BreakRhythm(): FixResult;
  
  // Gate E: 对话去腔调
  gateE_NaturalizeDialogue(): FixResult;
  
  // Gate F: 结尾去升华
  gateF_RemoveSummingUp(): FixResult;
}

// 执行顺序
function polish(content: string, config: PolishConfig): string {
  let result = content;
  
  // 1. 修复非 blocking issues（来自 Reviewer）
  result = applyFixes(result, nonBlockingFixes);
  
  // 2. 风格适配（按需执行门禁）
  if (config.enableGateA) result = gateA_ReplaceBannedWords(result);
  if (config.enableGateB) result = gateB_RemovePatterns(result);
  if (config.enableGateC) result = gateC_ExternalizePsychology(result);
  if (config.enableGateD) result = gateD_BreakRhythm(result);
  if (config.enableGateE) result = gateE_NaturalizeDialogue(result);
  if (config.enableGateF) result = gateF_RemoveSummingUp(result);
  
  // 3. 排版优化
  result = applyTypesetting(result);
  
  // 4. Anti-AI 终检
  result = finalAntiAICheck(result);
  
  return result;
}
```

**六门禁详解**:

| 门禁 | 检查内容 | 严重度 |
|------|---------|--------|
| A | 禁用词替换 (眼中闪过、嘴角勾起、缓缓地...) | 必须 |
| B | 句式去套路 ("...带着..."、"像XX一样") | 必须 |
| C | 心理外化 ("他很紧张" → "他的手在抖") | 必须 |
| D | 节奏打碎 (连续排比、长句) | 按需 |
| E | 对话去腔调 (书面语 → 口语) | 按需 |
| F | 结尾去升华 (总结/感慨 → 悬念/动作) | 必须 |

### 4.6 Step 5: CHAPTER_COMMIT (提交链)

**改进**: 完整的提交-投影架构

```typescript
// 新文件: src/renderer/src/services/writing/commit/ChapterCommitChain.ts

interface ChapterCommit {
  id: string;
  chapter: number;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: string;
  
  // 输入 artifacts
  reviewResult: ReviewerOutput;
  fulfillmentResult: FulfillmentResult;
  disambiguationResult: DisambiguationResult;
  extractionResult: ExtractionResult;
  
  // 判定结果
  reasons: string[];
  blockingCount: number;
  missedNodes: string[];
  pendingItems: string[];
}

// 判定规则
function determineStatus(commit: ChapterCommitInput): 'accepted' | 'rejected' {
  // 1. blocking_count > 0 → rejected
  // 2. missed_nodes 非空 → rejected
  // 3. pending_items 包含严重歧义 → rejected
  // 4. 否则 → accepted
}

// ============================================================
// Projection Writers (5个)
// ============================================================

interface ProjectionWriters {
  // 1. State Writer - 更新项目状态
  state: {
    updateChapterStatus: (chapter: number, status: string) => void;
    updateCharacterStates: (deltas: StateDelta[]) => void;
    updatePlotProgress: (progress: PlotProgress) => void;
  };
  
  // 2. Index Writer - 更新索引
  index: {
    updateChapterIndex: (chapter: number, metadata: ChapterMetadata) => void;
    updateWordCount: (total: number) => void;
    updateCoolPointIndex: (points: CoolPoint[]) => void;
  };
  
  // 3. Summary Writer - 更新摘要
  summary: {
    updateChapterSummary: (chapter: number, summary: string) => void;
    updateVolumeSummary: (volume: number, summary: string) => void;
  };
  
  // 4. Memory Writer - 更新记忆
  memory: {
    addChapterMemory: (memory: ChapterMemory) => void;
    updateCharacterArc: (arc: CharacterArc) => void;
    updatePlotThread: (thread: PlotThread) => void;
  };
  
  // 5. Vector Writer - 更新向量存储（可选）
  vector: {
    embedChapter: (chapter: number, content: string) => Promise<void>;
  };
}

// Projection 状态
interface ProjectionStatus {
  state: 'done' | 'pending' | 'failed' | 'skipped';
  index: 'done' | 'pending' | 'failed' | 'skipped';
  summary: 'done' | 'pending' | 'failed' | 'skipped';
  memory: 'done' | 'pending' | 'failed' | 'skipped';
  vector: 'done' | 'pending' | 'failed' | 'skipped';
}
```

### 4.7 Step 6: Data Agent (数据提取)

**改进**: 独立 Agent 提取事实

```typescript
// 新文件: src/renderer/src/services/ai/agents/enhanced-data-agent.ts

interface DataAgentInput {
  projectRoot: string;
  chapter: number;
  chapterFile: string;
}

// 必须生成 3 个 JSON 文件
interface ExtractionResult {
  // 顶层字段（不是嵌套）
  acceptedEvents: Array<{
    event_id: string;
    chapter: number;
    event_type: 'promise' | 'threat' | 'revelation' | 'death' | ...;
    subject: string;
    payload: Record<string, any>;
  }>;
  stateDeltas: Array<{
    entity_id: string;
    field: string;
    from: string;
    to: string;
  }>;
  entityDeltas: Array<{
    entity: string;
    change: string;
  }>;
  entitiesAppeared: string[];
  scenes: Array<{
    location: string;
    time: string;
    participants: string[];
  }>;
  summaryText: string;
}

interface FulfillmentResult {
  plannedNodes: string[];     // 来自章纲
  coveredNodes: string[];     // 已覆盖
  missedNodes: string[];      // 遗漏
  extraNodes: string[];       // 额外增加
}

interface DisambiguationResult {
  pending: Array<{
    id: string;
    question: string;
    status: 'pending' | 'resolved' | 'ignored';
  }>;
  resolved: Array<{
    id: string;
    answer: string;
  }>;
}
```

---

## 五、经验回流机制

### 5.1 anti_patterns.json

```typescript
// 项目根目录: .webnovel/anti_patterns.json

interface AntiPatternsRegistry {
  patterns: Array<{
    id: string;
    pattern: string;           // 正则或关键词
    source: 'review' | 'manual';
    firstFound: string;        // 首次发现章节
    frequency: number;         // 出现频率
    severity: 'high' | 'medium' | 'low';
    autoFix?: string;          // 自动修复建议
  }>;
  lastUpdated: string;
}

// 回流规则
// 1. Reviewer 发现中高严重度 AI 味问题 → 加入 anti_patterns.json
// 2. 写入时检查频率，超过阈值才加入
// 3. Context Agent 加载 anti_patterns 到任务书
```

### 5.2 回流流程

```
Reviewer Agent
    │
    ├── 发现 AI 味问题
    │       │
    │       ▼
    │   中高严重度?
    │       │
    │   是 ─┴─ 写入 anti_patterns.json
    │               │
    │               ▼
    │       Context Agent 下次加载
    │               │
    │               ▼
    │       注入到 WritingTaskBook.antiPatterns
    │               │
    │               ▼
    │       起草时自动避开
```

---

## 六、文件结构变更

### 6.1 新增目录

```
src/renderer/src/services/writing/
├── preflight/                    # 新增: 预检服务
│   ├── PreflightService.ts
│   └── types.ts
├── commit/                       # 增强: 提交链
│   ├── ChapterCommitChain.ts      # 重写
│   ├── ProjectionWriters.ts       # 新增
│   ├── types.ts
│   └── commit-service.ts
├── polish/                        # 增强: 润色管道
│   ├── PolishPipeline.ts          # 新增（六门禁）
│   ├── GateA.ts
│   ├── GateB.ts
│   ├── GateC.ts
│   ├── GateD.ts
│   ├── GateE.ts
│   ├── GateF.ts
│   └── Types.ts
├── review/                        # 增强: 审查
│   ├── EnhancedReviewerAgent.ts   # 重写
│   └── ReviewSchema.ts            # 新增
├── agents/                        # 增强: Agents
│   ├── enhanced-context-agent.ts  # 新增
│   ├── enhanced-reviewer-agent.ts # 新增
│   ├── enhanced-data-agent.ts     # 新增
│   └── types.ts
└── anti-patterns/                 # 新增: 经验回流
    ├── AntiPatternsRegistry.ts
    └── registry.json
```

### 6.2 新增类型文件

```typescript
// src/renderer/src/types/writing-v2.ts

// 扩展现有类型
interface WritingTaskBook {
  hardConstraints: HardConstraints;
  cbn: string;
  cpns: string[];
  cen: string;
  mustCover: string[];
  forbiddenZones: string[];
  styleGuidance: StyleGuidance;
  dynamicContext?: DynamicContext;
}

interface ChapterCommit {
  id: string;
  chapter: number;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: string;
  artifacts: {
    reviewResult: ReviewerOutput;
    fulfillmentResult: FulfillmentResult;
    disambiguationResult: DisambiguationResult;
    extractionResult: ExtractionResult;
  };
  projectionStatus: ProjectionStatus;
}

interface ProjectionStatus {
  state: 'done' | 'pending' | 'failed' | 'skipped';
  index: 'done' | 'pending' | 'failed' | 'skipped';
  summary: 'done' | 'pending' | 'failed' | 'skipped';
  memory: 'done' | 'pending' | 'failed' | 'skipped';
  vector: 'done' | 'pending' | 'failed' | 'skipped';
}
```

---

## 七、实施计划

### 7.1 Phase 1: 基础架构 (Week 1-2)

| 任务 | 负责人 | 状态 |
|------|--------|------|
| 重构 useChapterWriter 为 6 步流程 | - | 待开发 |
| 实现 PreflightService | - | 待开发 |
| 实现 EnhancedContextAgent | - | 待开发 |
| 实现 EnhancedReviewerAgent | - | 待开发 |

### 7.2 Phase 2: 提交链 (Week 3-4)

| 任务 | 负责人 | 状态 |
|------|--------|------|
| 重写 ChapterCommitManager | - | 待开发 |
| 实现 Projection Writers | - | 待开发 |
| 实现 EnhancedDataAgent | - | 待开发 |
| 实现 anti_patternsRegistry | - | 待开发 |

### 7.3 Phase 3: 润色增强 (Week 5-6)

| 任务 | 负责人 | 状态 |
|------|--------|------|
| 实现六门禁润色管道 | - | 待开发 |
| 集成 oh-story 去AI味技法 | - | 待开发 |
| 实现震惊分层写法检测 | - | 待开发 |
| 实现对话五级递进检测 | - | 待开发 |

### 7.4 Phase 4: 测试与调优 (Week 7-8)

| 任务 | 负责人 | 状态 |
|------|--------|------|
| 单元测试 | - | 待开发 |
| 集成测试 | - | 待开发 |
| 端到端测试 | - | 待开发 |
| 性能优化 | - | 待开发 |

---

## 八、验收标准

### 8.1 功能验收

| 功能 | 验收条件 | 测试方法 |
|------|---------|---------|
| 6步流程 | 全流程可执行 | E2E 测试 |
| Preflight | 必要文件缺失时阻断 | 单元测试 |
| Context Agent | 生成符合 Schema 的任务书 | 断言测试 |
| Reviewer Agent | 输出符合 Schema 的 JSON | 断言测试 |
| CHAPTER_COMMIT | accepted/rejected 判定正确 | 边界测试 |
| Projection Writers | 5个 Writer 都正确执行 | Mock 测试 |
| anti_patterns 回流 | 审查问题进入避雷列表 | 集成测试 |

### 8.2 质量验收

| 指标 | 目标值 | 测量方法 |
|------|--------|---------|
| AI 味残留 | <5% | DeAIService.detect() |
| 上下文一致率 | >95% | 审查报告统计 |
| 阻断问题自动修复率 | >60% | 端到端测试 |
| 流程执行时间 | <30s | 性能测试 |

---

## 九、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| Agent 调用失败 | 流程中断 | 实现 fallback 机制 |
| 投影写入失败 | 状态不一致 | 实现幂等重试 |
| anti_patterns 膨胀 | 上下文过长 | 频率阈值 + 优先级 |
| 审查过严 | 阻断率过高 | 可配置的严格度 |

---

## 十、附录

### A. 参考资料

| 来源 | 关键内容 |
|------|---------|
| webnovel-writer/SKILL.md | 6步流程、合同优先、CHAPTER_COMMIT |
| webnovel-writer/webnovel-review/SKILL.md | Reviewer Agent、投影写入 |
| oh-story/story-deslop/SKILL.md | 六门禁 A-F |
| oh-story/story-long-write/references/anti-ai-writing.md | 去AI味三遍法 |
| oh-story/story-long-write/references/hook-techniques.md | 章尾钩子13式 |

### B. 术语表

| 术语 | 定义 |
|------|------|
| CHAPTER_COMMIT | 章节提交对象，写后事实的统一入口 |
| Projection Writer | 投影写入器，负责更新各类状态 |
| anti_patterns | AI 写作反模式，审查发现问题后加入避雷列表 |
| CBN/CPNs/CEN | 章节开始节点、推进节点、结束节点 |
| blocking | 阻断性问题，必须修复才能继续 |
| Gate A-F | 六门禁，润色管道的检查点 |
