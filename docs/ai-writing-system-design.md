# AI 辅助小说写作系统设计文档

> 创建日期：2026-04-24
> 文档版本：v1.0

---

## 一、项目背景与目标

### 1.1 问题陈述

当前项目（墨流）在用户生成小说大纲并创建项目后，用户不知道如何继续将大纲写成完整的小说。现有编辑器仅提供基础的续写和建议功能，缺乏系统化的 AI 写作辅助流程。

### 1.2 设计目标

1. **降低门槛**：让小白用户也能轻松写出完整小说
2. **提升效率**：减少重复操作，享受 AI 带来的便利
3. **保证质量**：通过技术手段减少 AI 幻觉和上下文丢失问题
4. **灵活控制**：支持从全托管到精细干预的多种写作模式

---

## 二、产品功能设计

### 2.1 完整的 AI 辅助写作流程

```
阶段 1: 大纲生成
  └── QuickStart / InspirationPanel ──▶ 3 个大纲备选 ──▶ 创建项目

阶段 2: 章节目录生成（自动化）
  └── 解析 AI 大纲 ──▶ 提取章节结构 ──▶ 生成章节目录 ──▶ 展示在左侧导航

阶段 3: 单章写作（半自动化）
  └── 选择章节 ──▶ [一键续写] ──▶ AI 生成 2000-5000 字 ──▶ 人工润色

阶段 4: 批量写作（自动化）
  └── [一键写完本书] ──▶ 队列系统 ──▶ 断点续写 ──▶ 进度展示
```

### 2.2 核心功能列表

#### 2.2.1 章节目录自动生成

| 功能点 | 描述 | 优先级 |
|--------|------|--------|
| 从大纲提取章节 | 解析 AI 生成的大纲，自动提取章节结构 | P0 |
| 章节目录编辑 | 支持用户手动调整章节顺序和标题 | P1 |
| 卷结构管理 | 支持多卷结构，每卷包含多个章节 | P0 |

#### 2.2.2 单章写作辅助

| 功能点 | 描述 | 优先级 |
|--------|------|--------|
| 一键续写 | 点击按钮自动续写当前章节指定字数 | P0 |
| 字数控制 | 支持选择续写 1000/2000/3000/5000 字 | P1 |
| 前情摘要 | 自动提取上一章结尾作为前情提示 | P0 |
| 续写历史 | 保留历史续写记录，支持撤销 | P2 |

#### 2.2.3 批量写作系统

| 功能点 | 描述 | 优先级 |
|--------|------|--------|
| 一键写完本书 | 自动按顺序写完所有章节 | P0 |
| 写作队列管理 | 管理待写章节队列，支持暂停/继续 | P0 |
| 断点续写 | 中断后可从断点继续，无需重头开始 | P1 |
| 进度展示 | 实时显示当前章节/总章节进度 | P1 |

#### 2.2.4 上下文管理

| 功能点 | 描述 | 优先级 |
|--------|------|--------|
| 分层上下文架构 | Level 1-4 分层注入上下文 | P0 |
| Token 预算控制 | 始终保持 < 20KB tokens | P1 |
| 动态角色提取 | 根据章节内容动态提取相关角色 | P1 |

#### 2.2.5 记忆锚定系统

| 功能点 | 描述 | 优先级 |
|--------|------|--------|
| 角色一致性检查 | 角色档案注入，防止性格崩塌 | P0 |
| 战力体系检查 | 防止越级战斗等问题 | P1 |
| 伏笔追踪器 | 自动追踪伏笔埋设和揭示状态 | P1 |
| 前后呼应检查 | 生成后自动检查一致性 | P2 |

#### 2.2.6 写作前准备向导

| 功能点 | 描述 | 优先级 |
|--------|------|--------|
| 核心角色设定 | 引导用户完善主角和配角设定 | P1 |
| 世界观确认 | 引导用户确认世界观设定 | P1 |
| 写作风格选择 | 支持多种预设风格 + 自定义 | P1 |
| 字数目标设定 | 设置目标字数和章节数量 | P1 |

---

## 三、技术架构设计

### 3.1 分层上下文架构

```
Level 1: 项目级设定（始终注入）~2KB
  - 世界观设定（地点、规则、势力）
  - 核心角色档案（主角+关键配角 3-5 人）
  - 核心伏笔（未揭示的 5-7 条）
  - 故事主线（100-200 字）

Level 2: 卷级上下文（动态加载）~3KB
  - 本卷的大纲概述
  - 本卷涉及的角色（+5-10 人）
  - 本卷核心事件
  - 与其他卷的关联（钩子）

Level 3: 章级上下文（动态加载）~4KB
  - 章节大纲（200-500 字）
  - 本章角色（当前场景出现的人物）
  - 前情提要（上一章结尾 300 字）
  - 章节伏笔（本章埋设的伏笔）

Level 4: 创作上下文（每次生成时）~8KB
  - 已写内容 + 当前光标位置
  - 本次创作指令（如：续写 3000 字）
  - 风格要求（如：文笔华丽/简洁有力）

总量控制：始终保持 < 20KB tokens，留 80% 给 AI 输出
```

### 3.2 核心服务架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      WritingOrchestrator                          │
│                      写作编排器（核心）                             │
│  ─────────────────────────────────────────────────────────────── │
│  • manageWritingQueue()     管理写作队列                          │
│  • pause/resume            暂停/恢复                              │
│  • checkpoint             断点保存                                │
└─────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ ContextManager│     │ ContentEngine │     │ QualityChecker│
│ 上下文管理器  │     │  内容生成引擎 │     │  质量检查器   │
│ ─────────────│     │ ─────────────│     │ ─────────────│
│ • Level 1-4  │     │ • 分段生成    │     │ • 一致性检查  │
│ • 动态注入    │     │ • 流式输出    │     │ • 逻辑校验    │
│ • Token 控制  │     │ • 字数控制    │     │ • 伏笔追踪    │
└───────────────┘     └───────────────┘     └───────────────┘
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PromptBuilder                                │
│                      Prompt 构建器                                │
│  ─────────────────────────────────────────────────────────────── │
│  • buildChapterPrompt()     构建章节生成 Prompt                    │
│  • injectCharacterContext() 注入角色上下文                         │
│  • injectWorldContext()     注入世界观上下文                       │
│  • injectForeshadowContext()注入伏笔上下文                         │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 数据模型设计

#### 3.3.1 章节数据扩展

```typescript
interface Chapter {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  status: 'planning' | 'writing' | 'completed' | 'revised';
  volumeId: string;
  orderIndex: number;

  // 新增字段
  outline?: string;           // 章节大纲
  previousSummary?: string;    // 前情摘要
  writingHistory?: string[];   // 续写历史
  isGenerated?: boolean;       // 是否 AI 生成
  generatedAt?: string;       // AI 生成时间
  lastModifiedAt?: string;     // 最后修改时间
}
```

#### 3.3.2 写作任务队列

```typescript
interface WritingTask {
  id: string;
  chapterId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  progress: number;           // 0-100
  generatedContent: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface WritingQueue {
  projectId: string;
  tasks: WritingTask[];
  currentTaskId: string | null;
  isPaused: boolean;
  startedAt?: string;
  completedAt?: string;
}
```

#### 3.3.3 写作配置

```typescript
interface WritingConfig {
  // 字数设置
  targetWordCount: number;       // 目标总字数
  wordsPerChapter: number;      // 每章目标字数
  chapterCount: number;          // 章节数量

  // 风格设置
  writingStyle: 'concise' | 'elegant' | 'humorous' | 'ancient' | 'custom';
  customStyleDescription?: string;

  // AI 设置
  temperature: number;            // 创造性 0-1
  maxTokensPerChapter: number;   // 每章最大 token

  // 上下文设置
  includePreviousChapter: boolean;
  includeCharacterProfiles: boolean;
  includeWorldSetting: boolean;
  includeForeshadows: boolean;
}
```

---

## 四、Prompt 模板设计

### 4.1 章节生成 Prompt

```markdown
# 角色设定
## 当前章节主角
- 姓名：{character.name}
- 身份：{character.role}
- 性格特点：{character.personality}
- 当前状态：{character.currentStatus}
- 说话风格：{character.speakingStyle}

## 本章出场角色
{chapterCharacters.map(c => `- ${c.name}: ${c.briefDescription}`).join('\n')}

# 世界观约束
## 修炼体系
{worldRules.map(r => `- ${r.name}: ${r.description}`).join('\n')}

## 地理设定
{locations.filter(l => l.inThisChapter).map(l => `- ${l.name}: ${l.description}`).join('\n')}

# 前情概要
{previousChapterSummary}

# 当前章节任务
## 章节标题
{chapter.title}

## 章节大纲
{chapter.outline}

## 本章需要埋设/揭示的伏笔
{foreshadowingRequirements}

# 写作要求
1. 字数要求：{targetWordCount} 字
2. 风格要求：{writingStyle}
3. 禁止事项：
   - 不要让角色做出与其性格设定不符的行为
   - 不要打破已建立的战力体系
   - 不要忘记之前章节的关键道具和事件
4. 必须做到：
   - 保持对话自然，符合角色性格
   - 场景描写生动，代入感强
   - 合理推进剧情，完成本章任务
```

### 4.2 续写 Prompt 模板

```markdown
# 续写指令
请续写以下小说内容，要求：
1. 字数：{targetWordCount} 字
2. 承接上文风格和情节
3. 不要重复已写内容

# 已写内容
{existingContent}

# 续写要求
{additionalInstructions || '无'}
```

---

## 五、UI/UX 设计

### 5.1 页面结构

```
项目编辑器
├── 左侧导航栏
│   ├── 章节目录（可折叠）
│   ├── 大纲面板
│   ├── 角色面板
│   ├── 世界观面板
│   └── 伏笔面板
│
├── 中央编辑器
│   ├── 工具栏
│   │   ├── 章节标题
│   │   ├── 保存状态
│   │   └── 快捷操作
│   ├── 编辑区域
│   └── 续写悬浮按钮
│
└── 右侧 AI 面板
    ├── 续写模式
    ├── 建议模式
    ├── 记忆模式
    └── 批量写作（新增）
```

### 5.2 关键交互

#### 5.2.1 一键续写

- 编辑器底部固定悬浮按钮
- 点击后显示字数选择下拉
- 流式输出显示在编辑器末尾
- 支持暂停/继续

#### 5.2.2 批量写作

- 新增"批量写作"标签页
- 显示整体进度条
- 章节队列列表
- 暂停/继续/终止按钮

#### 5.2.3 写作前向导

- 创建项目后首次进入编辑器时弹出
- 分步骤引导用户确认设定
- 可跳过，直接进入编辑

---

## 六、API 设计

### 6.1 新增 API 端点

#### 章节生成

```typescript
// POST /api/projects/:projectId/chapters/generate-outlines
// 根据大纲生成章节目录
interface GenerateChapterOutlinesRequest {
  outline: GeneratedOutline;
  chapterCount?: number;
  wordsPerChapter?: number;
}

interface GenerateChapterOutlinesResponse {
  chapters: Array<{
    title: string;
    outline: string;
    orderIndex: number;
  }>;
}
```

#### 章节续写

```typescript
// POST /api/projects/:projectId/chapters/:chapterId/continue
// 续写指定章节
interface ContinueChapterRequest {
  existingContent: string;
  targetWordCount: number;
  context: {
    previousSummary?: string;
    characterProfiles?: Character[];
    worldSetting?: WorldSetting;
    foreshadows?: Foreshadow[];
  };
}

interface ContinueChapterResponse {
  content: string;
  wordCount: number;
}
```

#### 批量写作

```typescript
// POST /api/projects/:projectId/writing/batch
// 开始批量写作
interface StartBatchWritingRequest {
  startChapterId?: string;  // 从指定章节开始
  chapterIds?: string[];     // 指定章节列表
}

// GET /api/projects/:projectId/writing/status
// 获取写作状态
interface WritingStatusResponse {
  isWriting: boolean;
  currentChapterId: string | null;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  tasks: WritingTask[];
}

// POST /api/projects/:projectId/writing/pause
// 暂停写作

// POST /api/projects/:projectId/writing/resume
// 继续写作

// POST /api/projects/:projectId/writing/stop
// 停止写作
```

---

## 七、实现计划

### Phase 1: 基础架构 (P0)
1. [ ] 创建 `WritingOrchestrator` 服务
2. [ ] 创建 `ContextManager` 服务
3. [ ] 创建 `PromptBuilder` 服务
4. [ ] 实现分层上下文注入逻辑
5. [ ] 实现 Token 预算控制

### Phase 2: 单章写作 (P0)
6. [ ] 实现 `useChapterWriter` composable
7. [ ] 实现一键续写功能
8. [ ] 实现前情摘要自动提取
9. [ ] 实现流式输出
10. [ ] 优化 AIPanel 续写界面

### Phase 3: 章节目录 (P0)
11. [ ] 实现章节目录自动生成
12. [ ] 实现章节结构与大纲关联
13. [ ] 实现卷管理功能
14. [ ] 更新左侧导航 UI

### Phase 4: 批量写作 (P1)
15. [ ] 实现 `WritingQueue` 数据结构
16. [ ] 实现 `useBatchWriter` composable
17. [ ] 实现断点续写功能
18. [ ] 实现批量写作 UI
19. [ ] 实现暂停/继续/终止功能

### Phase 5: 记忆锚定 (P1)
20. [ ] 实现角色一致性检查
21. [ ] 实现战力体系检查
22. [ ] 实现伏笔追踪系统
23. [ ] 实现前后呼应检查

### Phase 6: 写作向导 (P2)
24. [ ] 设计写作前向导 UI
25. [ ] 实现风格选择功能
26. [ ] 实现字数目标设置
27. [ ] 实现角色/世界观确认

### Phase 7: 质量优化 (P2)
28. [ ] 实现生成后质量检查
29. [ ] 实现续写历史管理
30. [ ] 实现撤销/重做功能
31. [ ] 性能优化和缓存

---

## 八、技术选型

### 8.1 前端技术栈
- Vue 3 + TypeScript
- Pinia (状态管理)
- TailwindCSS (样式)
- Naive UI (组件库)

### 8.2 后端技术栈
- Electron (桌面应用)
- Node.js
- SQLite (本地存储)

### 8.3 AI 集成
- 统一的 AI Provider 接口
- 支持 OpenAI / Claude / 通义等
- Function Calling 模式
- 流式输出 (SSE)

---

## 九、风险与挑战

| 风险 | 描述 | 应对措施 |
|------|------|---------|
| 上下文超限 | 超长篇小说可能超出上下文 | 分层注入 + Token 控制 |
| 生成质量不稳定 | AI 输出质量参差不齐 | 多次生成 + 用户选择 |
| 伏笔遗漏 | AI 忘记埋设伏笔 | 伏笔追踪 + 提醒 |
| 战力崩塌 | AI 忘记战力设定 | 战力检查 + 约束 |
| 用户流失 | 操作复杂导致用户放弃 | 简化流程 + 向导 |

---

## 十、版本规划

| 版本 | 目标 | 预计时间 |
|------|------|---------|
| v2.0 | 单章续写 + 章节目录 | 2 周 |
| v2.1 | 批量写作 + 断点续写 | 2 周 |
| v2.2 | 记忆锚定系统 | 2 周 |
| v2.3 | 写作向导 + 质量优化 | 2 周 |

---

## 附录

### A. 术语表

| 术语 | 定义 |
|------|------|
| Outline | 大纲，小说的整体结构 |
| Chapter | 章节，小说的基本单位 |
| Volume | 卷，多个章节的集合 |
| Foreshadow | 伏笔，为后续剧情做铺垫 |
| Context | 上下文，AI 理解的背景信息 |
| Token | Token，AI 处理的最小单位 |

### B. 参考资料

1. AI 小说写作最佳实践
2. 上下文窗口优化策略
3. 网络小说写作技巧
