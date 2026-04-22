# 墨流AI写作助手 — 开发文档

> 基于产品需求文档 v1.0，为开发者提供项目架构、模块设计、开发规范与实现指南。
>
> **维护者**：项目团队  
> **版本**：v1.0.0  
> **最后更新**：2026-04-22

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [目录结构](#3-目录结构)
4. [进程模型与IPC通信](#4-进程模型与ipc通信)
5. [核心模块设计](#5-核心模块设计)
6. [开发规范](#6-开发规范)
7. [环境配置](#7-环境配置)
8. [构建与发布](#8-构建与发布)
9. [开发路线图](#9-开发路线图)
10. [参考资料](#10-参考资料)

---

## 1. 项目概述

### 1.1 产品定位

**墨流 (moliu)** 是一款面向网文作者的**超长篇小说AI协作写作工具**，代号 InkFlow。通过创新的三层记忆架构解决大模型在长文本创作中的遗忘与幻觉问题，实现百万字级小说的连贯创作。

### 1.2 核心痛点与解决方案

| 痛点 | 解决方案 |
|------|----------|
| 角色遗忘 | 角色档案系统，每个角色维护独立向量空间 |
| 设定崩坏 | 世界观知识图谱，实体-关系-规则三元组存储 |
| 情节断层 | 伏笔追踪器，关键事件状态标记与自动提醒 |
| 风格漂移 | 文风指纹，提取语言特征向量作为生成约束 |

### 1.3 技术选型

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| **桌面框架** | Electron 41 + Electron Forge | 跨平台桌面应用 |
| **前端框架** | Vue 3 + Composition API | UI 渲染 |
| **编辑器** | TipTap | 富文本 + AI建议渲染 |
| **构建工具** | Vite 5 | 主进程/预加载/渲染进程统一构建 |
| **向量数据库** | LanceDB | 嵌入式，无需独立服务 |
| **LLM 调用** | 统一封装层 | 支持 OpenAI / Anthropic / Google 等标准接口 |
| **文本处理** | LangChain / LlamaIndex | RAG 管道 |
| **存储** | SQLite + 文件系统 | 元数据 + 章节内容 |
| **可视化** | D3.js / ECharts | 关系图谱、时间线 |
| **语言** | TypeScript | 类型安全 |

### 1.4 性能指标

| 指标 | 目标值 |
|------|--------|
| 百万字项目加载时间 | < 3秒 |
| AI 续写响应时间 | < 15秒（标准）/ < 30秒（长上下文） |
| 一致性检查延迟 | < 2秒（本地缓存）/ < 5秒（全量检索） |
| 同时管理项目数 | 无上限（基于本地存储） |

### 1.5 项目数据模型

每本小说对应一个独立的 **Project**（项目），是数据隔离的最小单位：

```typescript
// src/main/types/project.ts
interface Project {
  id: string;
  name: string;                 // 小说名称
  description: string;          // 简介
  genre: GenreTag[];            // 题材标签
  wordCount: number;            // 总字数
  status: 'planning' | 'writing' | 'paused' | 'completed';

  // 层级结构
  volumes: Volume[];           // 分卷
  chapters: Chapter[];         // 章节（挂载在卷下）

  // 全局记忆（随项目生命周期）
  characters: Character[];     // 角色档案
  worldSchema: WorldSchema;    // 世界观知识图谱
  foreshadows: Foreshadow[];   // 伏笔追踪
  plotOutline: PlotNode[];     // 情节大纲树

  // 配置
  modelConfig: ModelConfig;    // 该项目偏好的 AI 模型配置
  createdAt: string;
  updatedAt: string;
}

interface Volume {
  id: string;
  name: string;                // 卷名，如"第一卷 觉醒"
  orderIndex: number;
  summary?: string;            // 卷概要
  memorySnapshot?: MemorySnapshot; // 该卷独立的记忆快照
}

interface Chapter {
  id: string;
  volumeId: string;
  title: string;
  content: string;            // 富文本内容（Slate.js JSON 或 HTML）
  wordCount: number;
  orderIndex: number;
  version: number;             // 版本号，每次保存递增
  status: 'draft' | 'editing' | 'final';
  createdAt: string;
  updatedAt: string;
}
```

**项目列表**（首页中展示）包含所有项目的元信息：名称、字数、状态、更新时间、最近一次编辑位置。

### 1.6 全局配置数据模型

全局配置独立于项目，与应用绑定，包含外观、AI 密钥、应用行为等设置：

```typescript
// src/main/types/settings.ts
interface AppSettings {
  // 外观
  theme: 'light' | 'dark' | 'system';    // 亮色 / 暗色 / 跟随系统
  accentColor: string;                   // 主题色（HEX），默认值 #6366F1（靛蓝）

  // 语言
  locale: 'zh-CN' | 'en-US';            // 中文 / 英文

  // AI 厂商配置（Key 加密存储）
  aiProviders: AIProviderConfig[];

  // 应用行为
  autoSaveInterval: number;             // 自动保存间隔（秒），默认 30
  defaultModel: string;                  // 默认 AI 模型 ID
  streamOutput: boolean;                 // AI 输出是否流式展示
}

interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'moonshot' | 'deepseek' | 'ollama';
  name: string;                         // 显示名称
  apiKey: string;                       // 加密存储的 Key
  baseUrl?: string;                    // 自定义端点（Ollama / 自建服务）
  enabled: boolean;
  priority: number;                     // 路由优先级（数字越小越优先）
  models: string[];                    // 该厂商支持模型列表
  quota?: {
    used: number;                        // 已用额度
    limit?: number;                      // 额度上限
    resetDate?: string;                  // 重置日期
  };
}
```

配置文件的存储位置：
- **Windows**: `%APPDATA%/moliu/config.json`（AES-256 加密 Key 部分）
- **macOS**: `~/Library/Application Support/moliu/config.json`
- **Linux**: `~/.config/moliu/config.json`

---

## 2. 技术架构

### 2.1 三层记忆系统架构

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 3: 全局记忆库 (Global Memory)                         │
│  • 向量数据库 + 结构化知识图谱                                 │
│  • 存储：角色档案、世界观设定、情节大纲、伏笔追踪              │
│  • 容量：无上限（仅受存储限制）                               │
├──────────────────────────────────────────────────────────────┤
│  Layer 2: 工作上下文 (Working Context)                        │
│  • 当前章节 + 前3章 + 相关记忆片段                             │
│  • 动态检索注入，约5K-15K tokens                               │
├──────────────────────────────────────────────────────────────┤
│  Layer 1: 模型原生窗口 (Native Window)                        │
│  • 当前输入 + 即时输出                                         │
│  • 依赖接入模型的实际能力（32K-1M tokens）                    │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron 主进程                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 窗口管理器    │  │  文件系统    │  │  IPC 路由中枢         │  │
│  │ WindowManager │  │  FileSystem  │  │  IpcRouter           │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ AI模型网关    │  │ 向量存储引擎 │  │  数据持久化           │  │
│  │ AIModelGateway│  │ VectorStore  │  │  DataStore           │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ contextBridge (安全桥接)
┌───────────────────────────┴─────────────────────────────────────┐
│                       Electron 渲染进程 (Vue 3)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 导航树组件    │  │ 富文本编辑器  │  │  AI协作面板          │  │
│  │ NavTree      │  │ EditorCore   │  │  AIPanel             │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 角色管理      │  │ 伏笔追踪     │  │  可视化组件          │  │
│  │ CharacterMgr │  │ Foreshadow   │  │  Charts/Graph       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 数据流设计

```
作者输入
   │
   ▼
┌─────────────────────┐
│  富文本编辑器        │  ← 渲染进程
└──────────┬──────────┘
           │ IPC invoke
           ▼
┌─────────────────────┐
│  IPC 路由中枢        │  ← 主进程
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌────────┐  ┌─────────────────────┐
│ 文件系统 │  │  向量存储引擎        │
│ (章节)  │  │  (RAG 检索)          │
└────────┘  └──────────┬──────────┘
                       │ 检索结果
                       ▼
              ┌─────────────────────┐
              │  AI 模型网关        │
              │  (多厂商路由)       │
              └──────────┬──────────┘
                         │ AI 响应
                         ▼
              ┌─────────────────────┐
              │  一致性校验层        │
              │  (冲突检测)         │
              └──────────┬──────────┘
                         │ 校验通过
                         ▼
              ┌─────────────────────┐
              │  返回渲染进程展示    │
              └─────────────────────┘
```

---

## 3. 目录结构

```
moliu/
├── docs/                      # 项目文档
│   ├── prd.md                 # 产品需求文档
│   └── development.md         # 本开发文档
├── src/
│   ├── main/                  # 主进程 (Node.js 环境)
│   │   ├── index.ts           # 主进程入口
│   │   ├── ipc/               # IPC 处理器
│   │   │   ├── file.ipc.ts    # 文件操作
│   │   │   ├── ai.ipc.ts      # AI 模型调用
│   │   │   ├── memory.ipc.ts  # 记忆系统
│   │   │   └── project.ipc.ts # 项目管理
│   │   ├── core/              # 核心业务逻辑
│   │   │   ├── ai/            # AI 模型封装
│   │   │   │   ├── gateway.ts         # 模型网关
│   │   │   │   ├── providers/          # 各厂商适配器
│   │   │   │   │   ├── openai.ts
│   │   │   │   │   ├── anthropic.ts
│   │   │   │   │   ├── google.ts
│   │   │   │   │   ├── moonshot.ts
│   │   │   │   │   └── deepseek.ts
│   │   │   │   └── router.ts           # 模型路由策略
│   │   │   ├── memory/         # 三层记忆系统
│   │   │   │   ├── global.ts            # 全局记忆库
│   │   │   │   ├── working.ts           # 工作上下文
│   │   │   │   └── native.ts            # 原生窗口管理
│   │   │   ├── rag/            # RAG 管道
│   │   │   │   ├── chunker.ts           # 智能分块
│   │   │   │   ├── embedder.ts          # 向量化
│   │   │   │   ├── retriever.ts         # 检索器
│   │   │   │   └── assembler.ts         # 上下文组装
│   │   │   ├── consistency/     # 一致性守护
│   │   │   │   ├── character.ts         # 角色一致性
│   │   │   │   ├── world.ts             # 世界观校验
│   │   │   │   ├── foreshadow.ts        # 伏笔追踪
│   │   │   │   └── style.ts             # 文风检测
│   │   │   └── storage/          # 数据持久化
│   │   │       ├── sqlite.ts            # SQLite 元数据
│   │   │       ├── file.ts              # 文件系统操作
│   │   │       └── vector.ts            # 向量存储 (LanceDB)
│   │   ├── ui/                  # 主进程 UI（系统菜单、托盘等）
│   │   │   ├── menu.ts
│   │   │   └── tray.ts
│   │   └── utils/
│   │       ├── logger.ts
│   │       ├── crypto.ts        # API Key 加密
│   │       └── config.ts
│   ├── preload/                 # 预加载脚本 (contextBridge 安全桥接)
│   │   ├── index.ts             # 预加载入口
│   │   └── api/                 # 暴露给渲染进程的 API
│   │       ├── file.api.ts
│   │       ├── ai.api.ts
│   │       ├── memory.api.ts
│   │       └── project.api.ts
│   └── renderer/                # 渲染进程 (Vue 3 应用)
│       ├── index.html
│       ├── src/
│       │   ├── main.ts          # Vue 入口
│       │   ├── App.vue
│       │   ├── components/      # UI 组件
│       │   │   ├── home/        # 首页组件（创作入口）
│       │   │   │   ├── HomePage.tsx
│       │   │   │   ├── QuickStart.tsx        # 有方向创作入口
│       │   │   │   ├── InspirationPanel.tsx   # 灵感推荐面板
│       │   │   │   ├── StoryNucleus.tsx     # 故事核卡片
│       │   │   │   ├── OutlinePreview.tsx     # 大纲预览卡片
│       │   │   │   └── ProjectList.tsx       # 项目列表
│       │   │   ├── layout/      # 布局组件
│       │   │   │   ├── MainLayout.tsx
│       │   │   │   ├── NavTree.tsx
│       │   │   │   └── StatusBar.tsx
│       │   │   ├── editor/      # 编辑器组件
│       │   │   │   ├── EditorCore.tsx
│       │   │   │   ├── Toolbar.tsx
│       │   │   │   └── AIPanel.tsx
│       │   │   ├── memory/      # 记忆系统 UI
│       │   │   │   ├── CharacterPanel.tsx
│       │   │   │   ├── WorldPanel.tsx
│       │   │   │   └── ForeshadowPanel.tsx
│       │   │   ├── charts/      # 可视化组件
│       │   │   │   ├── RelationGraph.tsx
│       │   │   │   ├── Timeline.tsx
│       │   │   │   └── EmotionCurve.tsx
│       │   │   └── settings/    # 设置相关
│       │   │       ├── SettingsPage.tsx      # 设置页入口
│       │   │       ├── AppearanceSettings.tsx # 主题/外观设置
│       │   │       ├── AIModelConfig.tsx     # AI 厂商配置 & API Key
│       │   │       ├── LanguageSettings.tsx   # 语言设置
│       │   │       └── ProjectSettings.tsx   # 项目级设置
│       │   ├── composables/     # 组合式函数 (Vue)
│       │   │   ├── useIPC.ts
│       │   │   ├── useEditor.ts
│       │   │   ├── useMemory.ts
│       │   │   └── useAI.ts
│       │   ├── stores/          # 状态管理 (Pinia)
│       │   │   ├── project.store.ts
│       │   │   ├── editor.store.ts
│       │   │   ├── memory.store.ts
│       │   │   └── settings.store.ts
│       │   │   └── inspiration.store.ts
│       │   ├── types/           # 类型定义
│       │   │   ├── project.ts
│       │   │   ├── chapter.ts
│       │   │   ├── character.ts
│       │   │   ├── memory.ts
│       │   │   └── ai.ts
│       │   ├── utils/
│       │   │   └── helpers.ts
│       │   └── styles/
│       │       ├── global.css
│       │       └── variables.css
│       └── assets/              # 静态资源
│           └── icons/
└── package.json
```

> **说明**：以上为全量架构的最终目录结构。目前项目处于 MVP 阶段，可先实现核心模块，逐步扩展。

---

## 4. 进程模型与IPC通信

### 4.1 进程职责划分

| 进程 | 环境 | 职责 |
|------|------|------|
| **主进程** | Node.js | 窗口管理、文件系统、AI模型调用、向量化、数据库、IPC路由 |
| **预加载** | Node.js (受限) | 通过 `contextBridge` 安全暴露主进程能力给渲染进程 |
| **渲染进程** | Chromium (纯Web) | UI 渲染、编辑器、用户交互。无 Node.js 访问权。 |

### 4.2 安全架构

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件操作
  loadProject: (id: string) => ipcRenderer.invoke('project:load', id),
  saveChapter: (data: ChapterData) => ipcRenderer.invoke('chapter:save', data),
  listProjects: () => ipcRenderer.invoke('project:list'),

  // AI 操作
  generateText: (params: GenerateParams) => ipcRenderer.invoke('ai:generate', params),
  checkConsistency: (text: string) => ipcRenderer.invoke('ai:check', text),

  // 记忆系统
  searchMemory: (query: string) => ipcRenderer.invoke('memory:search', query),
  updateCharacter: (char: Character) => ipcRenderer.invoke('character:update', char),

  // 事件监听（带清理）
  onAIStream: (callback: (chunk: string) => void) => {
    const handler = (_event: IpcRendererEvent, chunk: string) => callback(chunk);
    ipcRenderer.on('ai:stream', handler);
    return () => ipcRenderer.removeListener('ai:stream', handler);
  },
  onProjectUpdate: (callback: (data: ProjectData) => void) => {
    const handler = (_event: IpcRendererEvent, data: ProjectData) => callback(data);
    ipcRenderer.on('project:update', handler);
    return () => ipcRenderer.removeListener('project:update', handler);
  },
});
```

### 4.3 IPC 通道设计

采用**统一前缀 + 资源 + 操作**的命名约定：

| 通道前缀 | 范围 | 示例 |
|----------|------|------|
| `project:*` | 项目管理 | `project:load`, `project:save`, `project:list` |
| `chapter:*` | 章节管理 | `chapter:create`, `chapter:save`, `chapter:delete` |
| `ai:*` | AI 生成 | `ai:generate`, `ai:stream`, `ai:check` |
| `memory:*` | 记忆系统 | `memory:search`, `memory:index`, `memory:summarize` |
| `character:*` | 角色管理 | `character:create`, `character:update`, `character:search` |
| `settings:*` | 全局配置 | `settings:get`, `settings:set`, `settings:test-connection` |
| `inspiration:*` | 灵感系统 | `inspiration:generate`, `inspiration:refresh` |
| `outline:*` | 大纲生成 | `outline:generate`, `outline:select` |

### 4.4 主进程 IPC 处理器示例

```typescript
// src/main/ipc/ai.ipc.ts
import { ipcMain } from 'electron';
import { AIModelGateway } from '../core/ai/gateway';
import { Result } from '../types/result';

const gateway = AIModelGateway.getInstance();

export function registerAIHandlers(): void {
  ipcMain.handle('ai:generate', async (_event, params: GenerateParams): Promise<Result<string>> => {
    try {
      const result = await gateway.generate(params);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('ai:check', async (_event, text: string): Promise<Result<CheckResult>> => {
    try {
      const result = await gateway.checkConsistency(text);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // 流式生成
  ipcMain.handle('ai:stream', async (event, params: GenerateParams) => {
    const sender = event.sender;
    try {
      await gateway.generateStream(params, (chunk: string) => {
        sender.send('ai:stream', chunk);
      });
      sender.send('ai:done');
    } catch (err) {
      sender.send('ai:error', (err as Error).message);
    }
  });
}
```

### 4.5 IPC 错误处理约定

所有 IPC 响应使用统一的 `Result<T>` 类型，避免 Error 对象跨进程序列化丢失信息：

```typescript
// src/main/types/result.ts
export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## 5. 核心模块设计

### 5.1 AI 模型网关

```typescript
// src/main/core/ai/gateway.ts
class AIModelGateway {
  private static instance: AIModelGateway;
  private providers: Map<Provider, AIProvider>;
  private router: ModelRouter;

  static getInstance(): AIModelGateway {
    if (!this.instance) {
      this.instance = new AIModelGateway();
    }
    return this.instance;
  }

  async generate(params: GenerateParams): Promise<string> {
    const model = this.router.select(params.taskType, params.preferences);
    const provider = this.providers.get(model.provider);
    return provider.generate(params, model);
  }

  async generateStream(
    params: GenerateParams,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const model = this.router.select(params.taskType, params.preferences);
    const provider = this.providers.get(model.provider);
    await provider.generateStream(params, model, onChunk);
  }

  async checkConsistency(text: string): Promise<CheckResult> {
    // 使用长上下文模型进行一致性检查
    const model = this.router.select('consistency-check');
    return this.providers.get(model.provider).check(text, model);
  }
}
```

**模型路由策略**：

| 任务类型 | 推荐模型 | 理由 |
|----------|----------|------|
| 日常续写 | Kimi K2.5 / DeepSeek V4 | 1M+ 上下文，性价比极高 |
| 一致性检查 | Claude Sonnet 4.6 | 1.9% 幻觉率，最可靠的 RAG 表现 |
| 复杂推理 / 大纲设计 | Claude Opus 4 / GPT-5.4 | 多步推理 |
| 快速草稿 | Gemini 3.1 Flash | 速度快，成本低 |

### 5.2 三层记忆系统

#### Layer 3: 全局记忆库

```typescript
// src/main/core/memory/global.ts
interface GlobalMemory {
  // 角色档案
  characters: Character[];
  // 世界观设定（实体-关系-规则三元组）
  worldSchema: KnowledgeGraph;
  // 情节大纲
  plotOutline: PlotNode[];
  // 伏笔追踪
  foreshadows: Foreshadow[];
}

class GlobalMemoryStore {
  private db: SQLite;
  private vectorStore: LanceDB;

  async indexChapter(chapter: Chapter): Promise<void> {
    const chunks = await this.chunker.chunk(chapter.content);
    for (const chunk of chunks) {
      await this.vectorStore.insert({
        embedding: await this.embedder.embed(chunk),
        content: chunk.text,
        metadata: chunk.metadata,
      });
    }
  }

  async search(query: string, topK = 10): Promise<MemoryChunk[]> {
    const queryEmbedding = await this.embedder.embed(query);
    return this.vectorStore.search(queryEmbedding, topK);
  }
}
```

#### Layer 2: 工作上下文

```typescript
// src/main/core/memory/working.ts
class WorkingContext {
  async assemble(currentChapterId: string): Promise<Context> {
    const [prevChapter, prev2Chapter, prev3Chapter] =
      await this.getRecentChapters(currentChapterId, 3);

    const relevantChunks = await this.globalMemory.search(
      currentChapterId,
      topK: 5
    );

    const activeCharacters = this.extractActiveCharacters(
      prevChapter + prev2Chapter + prev3Chapter
    );

    return {
      recentChapters: [prevChapter, prev2Chapter, prev3Chapter].filter(Boolean),
      relevantMemory: relevantChunks,
      characterProfiles: await this.getCharacterProfiles(activeCharacters),
      foreshadowStatus: await this.getForeshadowStatus(currentChapterId),
      authorInstructions: this.getAuthorInstructions(currentChapterId),
    };
  }
}
```

#### Layer 1: 原生窗口

直接利用模型的上下文窗口能力，处理当前输入和即时输出。

### 5.3 RAG 分块策略

```typescript
// src/main/core/rag/chunker.ts
interface Chunk {
  text: string;
  summary_embedding: number[];
  entity_embedding: number[];
  emotion_embedding: number[];
  metadata: {
    characters_present: string[];
    location: string;
    plot_points: string[];
    chapter_id: string;
  };
}

class ChapterChunker {
  async chunk(chapterText: string): Promise<Chunk[]> {
    // 1. 按场景分割
    const scenes = this.splitByScene(chapterText);

    return scenes.map((scene) => ({
      text: scene,
      summary_embedding: this.embed(summary(scene)),
      entity_embedding: this.embed(extract_entities(scene)),
      emotion_embedding: this.embed(extract_emotion(scene)),
      metadata: {
        characters_present: extract_characters(scene),
        location: extract_location(scene),
        plot_points: extract_events(scene),
      },
    }));
  }
}
```

### 5.4 一致性守护

```typescript
// src/main/core/consistency/character.ts
class CharacterConsistencyChecker {
  async check(chapterText: string, chapterId: string): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = [];

    // 1. 提取本章角色行为特征
    const currentTraits = await this.extractTraits(chapterText);

    // 2. 从全局记忆库加载角色档案
    const characters = await this.getCharactersInChapter(chapterId);

    for (const char of characters) {
      // 3. 比对角色档案
      const deviation = this.calculateDeviation(currentTraits[char.id], char.profile);

      if (deviation > char.oocThreshold) {
        issues.push({
          type: 'OOC_RISK',
          character: char.name,
          severity: deviation > char.oocThreshold * 1.5 ? 'HIGH' : 'MEDIUM',
          description: `${char.name} 性格/行为偏离档案：${deviation}%`,
          reference: char.profile,
        });
      }
    }

    return issues;
  }
}
```

### 5.5 伏笔追踪

```typescript
// src/main/core/consistency/foreshadow.ts
interface Foreshadow {
  id: string;
  hint: string;           // 埋下的伏笔原文
  type: 'item' | 'dialogue' | 'event' | 'mystery';
  status: 'buried' | 'hinted' | 'foreshadowed' | 'resolved';
  createdChapter: number;
  suggestedResolutionChapter?: number;
}

class ForeshadowTracker {
  async detectNewForeshadow(chapterText: string, chapterNum: number): Promise<Foreshadow[]> {
    // 使用 AI 识别潜在的伏笔
    const detected = await this.ai.analyze(chapterText, {
      task: 'detect-foreshadow',
      rules: this.detectionRules,
    });

    return detected.map((hint) => ({
      id: generateId(),
      hint,
      type: this.classify(hint),
      status: 'buried',
      createdChapter: chapterNum,
    }));
  }

  async suggestResolution(): Promise<ResolutionSuggestion[]> {
    // 扫描未回收伏笔，在合适时机提示
    const unfulfilled = await this.db.getUnfulfilledForeshadows();
    return unfulfilled
      .filter((f) => this.isGoodTiming(f, currentChapter))
      .map((f) => ({
        foreshadow: f,
        suggestion: `建议在第 ${this.suggestChapter(f)} 章回收伏笔：${f.hint}`,
        priority: this.calculatePriority(f),
      }));
  }
}
```

### 5.6 数据存储设计

```typescript
// src/main/core/storage/sqlite.ts
// SQLite 表结构设计

// 章节表
CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  volume_id TEXT,
  title TEXT,
  content TEXT,
  word_count INTEGER,
  order_index INTEGER,
  version INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

// 角色档案表
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  profile TEXT,         -- JSON: 性格、外貌、背景、能力
  avatar_path TEXT,
  vector_space_id TEXT,  -- 关联向量空间
  created_at TEXT,
  updated_at TEXT
);

// 伏笔表
CREATE TABLE foreshadows (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  hint TEXT NOT NULL,
  type TEXT,
  status TEXT DEFAULT 'buried',
  created_chapter INTEGER,
  resolved_chapter INTEGER,
  created_at TEXT
);

// 项目元数据表
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  word_count INTEGER DEFAULT 0,
  model_config TEXT,     -- JSON: 使用的模型配置
  created_at TEXT,
  updated_at TEXT
);

// 章节版本历史
CREATE TABLE chapter_versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  content TEXT,
  version INTEGER,
  created_at TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id)
);
```

---

### 5.7 首页与灵感推荐系统

#### 5.7.1 首页功能定位

首页（`HomePage`）是用户每次启动应用后的第一个界面，承载三个核心职责：

1. **快速进入已有项目** — 展示项目列表，支持搜索和筛选
2. **发起新项目** — 通过提示词或灵感组合两种路径创建项目
3. **灵感探索** — 无需明确方向时，通过灵感卡片寻找创作起点

#### 5.7.2 创作路径设计

```
首页
│
├── 项目列表区
│   ├── 最近编辑的项目（时间排序）
│   ├── 全部项目（支持按状态/字数筛选）
│   └── 搜索
│
└── 新建项目入口
    ├── 路径A：有方向创作
    │   └── 输入提示词 → 生成 N 套大纲 → 选大纲 → 创建项目 → 编写第一章
    │
    └── 路径B：灵感触发（无明确方向）
        └── 灵感推荐区 → 勾选灵感组合 → 生成故事核 → 选故事核 → 生成大纲 → 创建项目
```

#### 5.7.3 灵感卡片三级粒度

灵感系统采用 **L1 标签 → L2 元素 → L3 故事核** 三级递进粒度，用户可在任意层级触发：

| 层级 | 粒度 | 用户操作 | 示例 |
|------|------|----------|------|
| **L1 题材标签** | 题材/风格 | 多选勾选 | `#修仙` `#热血` `#系统流` `#凡人流` `#异世界` |
| **L2 设定元素** | 具体设定 | 多选勾选 | `主角资质平庸` `有个神秘老爷爷` `退婚羞辱` `家族测试` `宗门崛起` |
| **L3 故事核** | 完整小情节 | 单选采纳 | `主角参加宗门大比，因资质太差被嘲讽，意外激活祖传玉佩，获得上古传承` |

**刷新机制**：

| 档位 | 刷新内容 | 说明 |
|------|----------|------|
| 刷新标签 | 换一批 L1 题材风格组合 | 提供不同题材方向 |
| 刷新元素 | 换一批当前 L1 下的 L2 设定元素 | 同一题材下的不同设定走向 |
| 刷新故事核 | 换一批根据当前 L1+L2 生成的故事核 | 换不同情节方案 |
| 全部刷新 | L1+L2+L3 全部重新生成 | 从头开始探索 |

**L3 故事核的完整结构**：

```typescript
interface StoryNucleus {
  id: string;
  title: string;            // 故事核标题
  premise: string;          // 背景设定（200字）
  conflict: string;         // 核心冲突（100字）
  characters: {             // 核心角色（含性格标签）
    role: string;
    name: string;
    traits: string[];
  }[];
  foreshadows: string[];    // 可埋设的伏笔
  genre_tags: string[];    // 关联的 L1 标签
}
```

#### 5.7.4 大纲生成流程

用户选定故事核后（或直接输入提示词），系统生成 3-5 套完整大纲供选择：

```typescript
interface GeneratedOutline {
  id: string;
  title: string;            // 大纲标题
  synopsis: string;        // 世界观简介（500字）
  structure: {
    act1: string;          // 第一幕：三幕式结构
    act2a: string;         // 第二幕前半
    act2b: string;         // 第二幕后半
    act3: string;          // 第三幕
  };
  characters: Character[]; // 初始角色卡（3-5个）
  foreshadows: string[];  // 伏笔设定
  estimatedWordCount: number; // 预估字数
}
```

**用户选择大纲后**，系统自动完成以下初始化操作：

1. 创建项目记录
2. 将大纲内容注入全局记忆库（世界观、角色、伏笔）
3. 根据结构生成章节目录（可选）
4. 打开第一章编辑页面

#### 5.7.5 IPC 通道扩展

```typescript
// 灵感与大纲生成
interface InspirationAPI {
  // 生成灵感推荐
  generateInspiration: (context?: InspirationContext) => Promise<InspirationPack>;

  // 刷新指定层级的灵感
  refreshInspiration: (level: 'L1' | 'L2' | 'L3' | 'all', context?: Partial<InspirationContext>) => Promise<InspirationPack>;

  // 根据故事核生成多套大纲
  generateOutlines: (storyNucleus: StoryNucleus, count?: number) => Promise<GeneratedOutline[]>;

  // 根据提示词直接生成大纲
  generateOutlinesFromPrompt: (prompt: string, count?: number) => Promise<GeneratedOutline[]>;

  // 创建项目（选定大纲后）
  createProject: (outline: GeneratedOutline, options?: CreateProjectOptions) => Promise<Result<Project>>;

  // 项目列表
  listProjects: () => Promise<ProjectMeta[]>;
  getProject: (id: string) => Promise<Result<Project>>;
}
```

#### 5.7.6 组件设计

```
HomePage
├── Header（顶部工具栏：Logo、设置入口）
├── MainContent
│   ├── ProjectListSection
│   │   ├── ProjectCard[]     # 项目卡片
│   │   └── EmptyState       # 无项目时引导
│   │
│   └── NewProjectSection
│       ├── QuickStart        # 路径A：有方向创作
│       │   ├── PromptInput   # 提示词输入框
│       │   ├── GenerateBtn   # 生成大纲按钮
│       │   └── OutlineSelector # 大纲选择器
│       │       └── OutlineCard[] # 3-5 套大纲卡片
│       │
│       └── InspirationPanel  # 路径B：灵感触发
│           ├── InspirationTags (L1)  # 题材标签流
│           ├── InspirationElements (L2) # 设定元素流
│           ├── StoryNucleusCards (L3) # 故事核卡片流
│           ├── RefreshControls      # 刷新控件
│           └── GenerateBtn         # 生成大纲按钮
│
└── Footer（状态栏：字数统计、版本信息）
```

#### 5.7.7 状态管理扩展

```typescript
// src/renderer/stores/inspiration.store.ts
// 使用 Pinia 组合式风格（setup store）
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useInspirationStore = defineStore('inspiration', () => {
  // State
  const tags = ref<GenreTag[]>([]);
  const elements = ref<SettingElement[]>([]);
  const storyNuclei = ref<StoryNucleus[]>([]);
  const selectedTags = ref<string[]>([]);
  const selectedElements = ref<string[]>([]);
  const selectedNucleus = ref<StoryNucleus | null>(null);
  const generatedOutlines = ref<GeneratedOutline[]>([]);
  const selectedOutline = ref<GeneratedOutline | null>(null);
  const isGenerating = ref(false);
  const generationPhase = ref<'idle' | 'generating-L1' | 'generating-L2' | 'generating-L3' | 'generating-outlines'>('idle');

  // Getters
  const canGenerateOutlines = computed(() => selectedNucleus.value !== null);

  // Actions
  async function refreshTags() { /* ... */ }
  async function refreshElements() { /* ... */ }
  async function refreshNuclei() { /* ... */ }
  async function generateOutlines() { /* ... */ }
  function selectNucleus(nucleus: StoryNucleus) { selectedNucleus.value = nucleus; }
  function selectOutline(outline: GeneratedOutline) { selectedOutline.value = outline; }
  async function createProject() { /* ... */ }

  return {
    tags, elements, storyNuclei, selectedTags, selectedElements,
    selectedNucleus, generatedOutlines, selectedOutline,
    isGenerating, generationPhase, canGenerateOutlines,
    refreshTags, refreshElements, refreshNuclei, generateOutlines,
    selectNucleus, selectOutline, createProject,
  };
});
```

---

### 5.8 设置系统

#### 5.8.1 设置页面结构

设置页作为独立路由或模态面板，承载三个功能模块：

```
设置页 (SettingsPage)
├── 外观设置 (AppearanceSettings)
│   ├── 主题模式切换 (亮色 / 暗色 / 跟随系统)
│   └── 主题色选择器 (预设色板 + 自定义 HEX)
│
├── 语言设置 (LanguageSettings)
│   ├── 语言切换下拉 (中文 / English)
│   └── 切换后即时生效，无需重启
│
└── AI 厂商配置 (AIModelConfig)
    ├── 厂商列表（OpenAI / Anthropic / Google / Kimi / DeepSeek / Ollama / 自定义）
    ├── 每个厂商：
    │   ├── 开关启用/停用
    │   ├── API Key 输入（脱敏展示，仅首尾可见）
    │   ├── 自定义 Base URL（Ollama / 自建服务）
    │   └── 模型列表配置
    ├── 默认模型选择
    └── 用量统计（已用 / 额度上限）
```

#### 5.8.2 API Key 安全机制

```typescript
// src/main/core/utils/crypto.ts
// API Key 加密存储：AES-256-GCM
// 加密密钥由机器指纹（CPU ID + 主板序列号）派生，不存储于配置文件

class KeyCrypto {
  // 加密：存储到配置文件前
  encrypt(plaintext: string): EncryptedPayload {
    const key = this.deriveKey();          // 从机器指纹派生
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64'), authTag: authTag.toString('base64') };
  }

  // 解密：读取配置时
  decrypt(payload: EncryptedPayload): string {
    const key = this.deriveKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload.encrypted, 'base64')), decipher.final()]).toString();
  }
}
```

#### 5.8.3 主题切换实现

```typescript
// src/renderer/styles/themes.css
:root {
  --accent-color: #6366F1;   /* 默认靛蓝 */
  --bg-primary: #FFFFFF;
  --bg-secondary: #F9FAFB;
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --border-color: #E5E7EB;
}

[data-theme="dark"] {
  --bg-primary: #111827;
  --bg-secondary: #1F2937;
  --text-primary: #F9FAFB;
  --text-secondary: #9CA3AF;
  --border-color: #374151;
}
```

主题色支持预设调色板（如靛蓝、青色、紫色、橙色、绿色）和用户自定义 HEX 输入，自定义颜色实时预览。

#### 5.8.4 IPC 通道

```typescript
// src/preload/api/settings.api.ts
interface SettingsAPI {
  // 外观
  getTheme: () => Promise<{ theme: string; accentColor: string }>;
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  setAccentColor: (color: string) => Promise<void>;

  // 语言
  getLocale: () => Promise<'zh-CN' | 'en-US'>;
  setLocale: (locale: 'zh-CN' | 'en-US') => Promise<void>;

  // AI 厂商
  getAIProviders: () => Promise<AIProviderConfig[]>;
  saveAIProvider: (config: AIProviderConfig) => Promise<void>;
  deleteAIProvider: (provider: string) => Promise<void>;
  testAIConnection: (provider: string) => Promise<{ success: boolean; latency?: number; error?: string }>;
  getDefaultModel: () => Promise<string>;
  setDefaultModel: (modelId: string) => Promise<void>;
}
```

#### 5.8.5 AI 连接测试实现

测试连接的底层原理：**用用户填入的 Key 发起一个最小化的 API 调用，根据返回状态码判断 Key 是否有效**。验证只调用列表接口或 `max_tokens=1` 的生成请求，几乎不消耗费用。

```typescript
// src/main/core/ai/connection-tester.ts
interface TestResult {
  success: boolean;
  latency?: number;        // 毫秒
  error?: string;          // 错误信息
  errorType?: 'invalid_key' | 'network_error' | 'quota_exceeded' | 'rate_limited';
}

class AIConnectionTester {
  async test(provider: string, config: AIProviderConfig): Promise<TestResult> {
    const testers: Record<string, (config: AIProviderConfig) => Promise<TestResult>> = {
      openai: this.testOpenAI.bind(this),
      anthropic: this.testAnthropic.bind(this),
      google: this.testGoogle.bind(this),
      moonshot: this.testMoonshot.bind(this),
      deepseek: this.testDeepseek.bind(this),
      ollama: this.testOllama.bind(this),
    };
    return testers[provider]?.(config) ?? Promise.resolve({ success: false, error: '未知厂商' });
  }

  private async testOpenAI(config: AIProviderConfig): Promise<TestResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${config.baseUrl}/v1/models`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });
      if (res.ok) return { success: true, latency: Date.now() - start };
      if (res.status === 401) return { success: false, error: 'API Key 无效', errorType: 'invalid_key' };
      return { success: false, error: `HTTP ${res.status}`, errorType: 'network_error' };
    } catch (e) {
      return { success: false, error: (e as Error).message, errorType: 'network_error' };
    }
  }

  private async testAnthropic(config: AIProviderConfig): Promise<TestResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-20250514',  // 最便宜的模型
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (res.ok) return { success: true, latency: Date.now() - start };
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) return { success: false, error: body.error?.message || 'API Key 无效', errorType: 'invalid_key' };
      if (res.status === 429) return { success: false, error: '请求频率超限', errorType: 'rate_limited' };
      return { success: false, error: body.error?.message || `HTTP ${res.status}`, errorType: 'network_error' };
    } catch (e) {
      return { success: false, error: (e as Error).message, errorType: 'network_error' };
    }
  }

  private async testGoogle(config: AIProviderConfig): Promise<TestResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${config.baseUrl}/v1/models`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });
      if (res.ok) return { success: true, latency: Date.now() - start };
      if (res.status === 401) return { success: false, error: 'API Key 无效', errorType: 'invalid_key' };
      return { success: false, error: `HTTP ${res.status}`, errorType: 'network_error' };
    } catch (e) {
      return { success: false, error: (e as Error).message, errorType: 'network_error' };
    }
  }

  private async testMoonshot(config: AIProviderConfig): Promise<TestResult> {
    return this.testOpenAI(config);  // 同 OpenAI 风格
  }

  private async testDeepseek(config: AIProviderConfig): Promise<TestResult> {
    return this.testOpenAI(config);  // 同 OpenAI 风格
  }

  private async testOllama(config: AIProviderConfig): Promise<TestResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${config.baseUrl}/api/tags`);
      if (res.ok) return { success: true, latency: Date.now() - start };
      return { success: false, error: `HTTP ${res.status}`, errorType: 'network_error' };
    } catch (e) {
      return { success: false, error: (e as Error).message, errorType: 'network_error' };
    }
  }
}
```

---

## 6. 开发规范

### 6.1 TypeScript 规范

- **严格模式**：启用 `strict`、`noImplicitAny`、`strictNullChecks`
- **类型优先**：优先使用 `interface` 定义数据模型，`type` 用于联合/交叉类型
- **禁止 `any`**：不允许使用 `any`，使用 `unknown` 替代并在运行时进行类型守卫
- **泛型约束**：广泛使用泛型提升代码复用性

```typescript
// Good
interface Result<T, E = string> {
  success: boolean;
  data?: T;
  error?: E;
}

// Bad
const result: any = { ... };
```

### 6.2 IPC API 设计规范

1. **通道命名**：`资源:操作`（小写，冒号分隔）
2. **参数验证**：在主进程 handler 中验证所有来自渲染进程的参数
3. **错误处理**：统一使用 `Result<T>` 包装返回值
4. **流式处理**：长耗时操作使用流式 IPC + 事件回调
5. **类型声明**：预加载脚本必须导出完整的 TypeScript 类型声明

```typescript
// src/preload/api/types.ts
export interface ElectronAPI {
  loadProject: (id: string) => Promise<Result<Project>>;
  saveChapter: (data: ChapterData) => Promise<Result<void>>;
  onProjectUpdate: (callback: (data: Project) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

### 6.3 模块组织规范

- **单一职责**：每个模块只负责一个明确的功能域
- **依赖方向**：渲染进程 → 预加载 → 主进程，禁止反向依赖
- **核心业务下沉**：所有业务逻辑（AI调用、RAG、一致性检查）必须在主进程中实现
- **渲染进程纯UI**：渲染进程只负责数据展示和用户交互，不处理业务逻辑

### 6.4 状态管理规范

使用 **Pinia** 进行前端状态管理（Vue 3 官方推荐）：

| Store | 职责 |
|-------|------|
| `projectStore` | 当前项目、章节列表、分卷管理 |
| `editorStore` | 编辑器状态、光标位置、内容变更 |
| `memoryStore` | 角色、伏笔、世界观等记忆数据 |
| `settingsStore` | 用户配置、模型选择、密钥管理 |

```typescript
// src/renderer/stores/project.store.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

interface ProjectState {
  currentProject: Project | null;
  chapters: Chapter[];
  volumes: Volume[];
  wordCount: number;
  setProject: (project: Project) => void;
  addChapter: (chapter: Chapter) => void;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
}

export const useProjectStore = defineStore('project', () => {
  // State
  const currentProject = ref<Project | null>(null);
  const chapters = ref<Chapter[]>([]);
  const volumes = ref<Volume[]>([]);
  const wordCount = ref(0);

  // Actions
  function setProject(project: Project) {
    currentProject.value = project;
  }

  function addChapter(chapter: Chapter) {
    chapters.value.push(chapter);
  }

  function updateChapter(id: string, updates: Partial<Chapter>) {
    const idx = chapters.value.findIndex((c) => c.id === id);
    if (idx !== -1) {
      chapters.value[idx] = { ...chapters.value[idx], ...updates };
    }
  }

  return {
    currentProject,
    chapters,
    volumes,
    wordCount,
    setProject,
    addChapter,
    updateChapter,
  };
});
```

### 6.5 Vue 组件规范

1. **组件拆分**：优先拆分为小而专注的组件，单个组件不超过 300 行
2. **Composables 提取**：复杂逻辑提取到自定义 Composables 中
3. **Props 类型**：所有组件 Props 必须有 TypeScript 接口
4. **cleanup 机制**：使用 IPC 事件监听时，必须在 `onUnmounted` 或 `onBeforeUnmount` 中取消订阅

```typescript
// Good
import { onMounted, onUnmounted } from 'vue';

onMounted(() => {
  const cleanup = window.electronAPI.onProjectUpdate((data) => {
    setProject(data);
  });
  onUnmounted(() => cleanup());
});

// Bad
onMounted(() => {
  window.electronAPI.onProjectUpdate((data) => {
    setProject(data);
  });
  // Missing cleanup!
});
```

### 6.6 命名规范

| 场景 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `chapter-store.ts`, `ai-gateway.ts` |
| 类名 | PascalCase | `AIModelGateway`, `CharacterConsistencyChecker` |
| 接口名 | PascalCase + `I` 前缀（可选） | `ICharacter` 或 `Character` |
| 函数名 | camelCase | `generateText`, `searchMemory` |
| 事件名 | kebab-case | `project:update`, `ai:stream` |
| 常量名 | UPPER_SNAKE_CASE | `MAX_TOKEN_LIMIT`, `DEFAULT_MODEL` |
| TypeScript 类型 | PascalCase | `Result<T>`, `ChapterData` |

### 6.7 安全规范

1. **永远不启用** `nodeIntegration`
2. **永远启用** `contextIsolation`
3. **永远启用** `sandbox`（Electron 20+ 默认）
4. **永远通过** `contextBridge` 暴露 API
5. **永远验证** IPC 参数，不信任渲染进程输入
6. **API Key 加密存储**：使用 AES-256 加密后存于本地配置文件
7. **CSP 策略**：配置严格的 Content Security Policy

```typescript
// BrowserWindow 安全配置
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
  },
});
```

### 6.8 性能规范

1. **百万字项目加载**：分页加载章节，不一次性全量加载
2. **向量检索**：使用 LanceDB 嵌入式向量库，避免独立服务开销
3. **增量索引**：章节变更后增量更新向量索引，而非全量重建
4. **编辑器优化**：使用虚拟滚动处理长文档
5. **防抖/节流**：用户输入触发 RAG 检索时使用防抖

### 6.9 测试规范

- **单元测试**：核心业务逻辑（记忆系统、一致性检查）使用 Jest 单元测试
- **E2E 测试**：使用 Playwright 进行 Electron E2E 测试
- **测试覆盖率**：核心模块覆盖率目标 > 80%

---

## 7. 环境配置

### 7.1 开发环境依赖

```bash
# Node.js 版本
node >= 18.x
npm >= 9.x

# 推荐的 IDE 配置
- VSCode / Cursor
- ESLint + Prettier 插件
- TypeScript 插件
```

### 7.2 第三方依赖规划

#### 7.2.1 UI 组件库选型

要求：**界面简洁大气、现代感强、支持深色模式、中文友好、不过于厚重**。

| 方案 | 优势 | 劣势 | 推荐度 |
|------|------|------|--------|
| **Naive UI** | Vue 3 专属，TypeScript 友好，组件非常丰富（70+），设计语言现代简洁，支持深色模式，中文文档完善，API 一致性好 | 包体积较大，需按需引入或模块化导入控制体积 | **强烈推荐** |
| **Vuetify 3** | Material Design 3 实现，组件齐全，文档丰富 | Material 风格过于标准化，不够轻盈 | 次推荐 |
| **Element Plus** | Vue 3 最大生态，中文友好，组件多 | 风格偏企业后台，视觉偏厚重，不够现代 | 次推荐 |
| **Arco Design Vue** | 字节出品，设计精美，组件丰富 | 偏向企业级应用风格 | 次推荐 |
| **PrimeVue** | 组件最多（80+），风格多样（免费主题 50+） | 文档组织较乱，部分组件学习曲线陡峭 | 次推荐 |
| **Quasar** | 一套代码输出 Web / Mobile / Desktop，生态极强 | 框架感强，与 Vue 3 生态融合度不如其他方案 | 一般 |
| **Headless UI Vue** | Tailwind Vue 官方出品，headless 无样式 | 无预设样式，工作量大 | 次推荐 |

**最终推荐：Naive UI + UnoCSS**。

理由：
- Naive UI 由腾讯前端团队维护，Vue 3 Composition API 原生支持，TypeScript 类型推导完整
- 设计语言简洁现代（参考 Ant Design 4.x 的简洁风格），不是老旧的企业风
- 深色模式原生支持，n-config-provider 切换主题零闪烁
- 组件按需引入（n-button, n-card 等），配合 unplugin-vue-components 自动 Tree-shaking
- 中文文档友好，国内社区活跃，更新稳定

搭配 **UnoCSS**（Atomic CSS 引擎，比 Tailwind 更快更轻量），减少打包体积。

#### 7.2.2 完整依赖清单

```json
{
  "dependencies": {
    // --- 框架与路由 ---
    "vue": "^3.5.13",
    "vue-router": "^4.5.0",
    "pinia": "^2.3.1",

    // --- UnoCSS（Atomic CSS，比 Tailwind 更快更轻） ---
    "unocss": "^0.65.3",

    // --- Naive UI 组件库（按需引入） ---
    "naive-ui": "^2.41.0",
    "lucide-vue-next": "^0.474.0",
    "@vicons/ionicons5": "^0.12.0",

    // --- 富文本编辑器 ---
    "@tiptap/vue-3": "^2.10.4",
    "@tiptap/starter-kit": "^2.10.4",
    "@tiptap/extension-link": "^2.10.4",
    "@tiptap/extension-table": "^2.10.4",
    "@tiptap/extension-placeholder": "^2.10.4",
    "@tiptap/extension-highlight": "^2.10.4",
    "@tiptap/extension-underline": "^2.10.4",
    "@tiptap/extension-character-count": "^2.10.4",

    // --- 国际化 ---
    "vue-i18n": "^10.0.5",

    // --- HTTP ---
    "axios": "^1.7.9",

    // --- 本地存储 ---
    "electron-store": "^10.0.0",

    // --- 工具库 ---
    "uuid": "^11.0.5",
    "dayjs": "^1.11.13",
    "lodash-es": "^4.17.21",
    "zod": "^3.24.2",
    "pinia-plugin-persistedstate": "^4.2.0",

    // --- 动画 ---
    "@vueuse/motion": "^2.2.6",

    // --- Electron ---
    "electron-squirrel-startup": "^1.0.1"
  },

  "devDependencies": {
    "typescript": "~5.7.3",
    "@vitejs/plugin-vue": "^5.2.1",
    "@unocss/preset-icons": "^0.65.3",
    "@unocss/preset-uno": "^0.65.3",
    "@unocss/reset": "^0.65.3",
    "@electron-forge/cli": "^7.11.1",
    "@electron-forge/maker-deb": "^7.11.1",
    "@electron-forge/maker-rpm": "^7.11.1",
    "@electron-forge/maker-squirrel": "^7.11.1",
    "@electron-forge/maker-zip": "^7.11.1",
    "@electron-forge/plugin-auto-unpack-natives": "^7.11.1",
    "@electron-forge/plugin-fuses": "^7.11.1",
    "@electron-forge/plugin-vite": "^7.11.1",
    "@electron-fuses": "^1.8.0",
    "vite": "^5.4.21",
    "vite-plugin-electron": "^0.28.0",
    "vite-plugin-electron-renderer": "^0.14.6",
    "@typescript-eslint/eslint-plugin": "^8.23.0",
    "@typescript-eslint/parser": "^8.23.0",
    "eslint": "^8.57.1",
    "eslint-plugin-import": "^2.32.0",
    "eslint-plugin-vue": "^10.9.0",
    "vue-eslint-parser": "^10.0.3",
    "electron": "41.2.2",
    "@types/electron-squirrel-startup": "^1.0.2",
    "@types/uuid": "^10.0.0",
    "@types/lodash-es": "^4.17.12",
    "unplugin-vue-components": "^32.0.0",
    "unplugin-auto-import": "^0.18.6"
```

#### 7.2.3 Naive UI + UnoCSS 安装步骤

```bash
# 1. 安装核心依赖
npm install vue vue-router pinia naive-ui @vicons/ionicons5 lucide-vue-next
npm install -D unocss @unocss/preset-uno @unocss/preset-icons @unocss/reset

# 2. 安装编辑器
npm install @tiptap/vue-3 @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-table
npm install @tiptap/extension-placeholder @tiptap/extension-highlight @tiptap/extension-underline

# 3. 安装工具库
npm install vue-i18n axios electron-store dayjs lodash-es zod pinia-plugin-persistedstate
npm install @vueuse/motion

# 4. 安装开发工具链
npm install -D vite @vitejs/plugin-vue vite-plugin-electron vite-plugin-electron-renderer
npm install -D typescript @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint eslint-plugin-vue
npm install -D unplugin-vue-components unplugin-auto-import
```

#### 7.2.4 UnoCSS 配置

```typescript
// uno.config.ts
import { defineConfig, presetUno, presetIcons } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/',
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
  },
});
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import Components from 'unplugin-vue-components/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    Components({
      resolvers: [NaiveUiResolver()],
    }),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/auto-imports.d.ts',
    }),
    electron([...]),
  ],
});
```

#### 7.2.5 主题配置（Naive UI）

```typescript
// src/renderer/src/plugins/naive-ui.ts
import {
  create,
  NButton, NCard, NInput, NSelect, NTabs, NSwitch,
  NDialog, NModal, NMessage, NNotification, NDropdown,
  NProgress, NBadge, NTag, NAvatar, NDivider, NScrollbar,
  NDataTable, NForm, NFormItem, NPopconfirm, NTooltip,
  NSpace, NGrid, NGridItem, NCollapse, NCollapseItem,
} from 'naive-ui';

export default create({
  components: [
    NButton, NCard, NInput, NSelect, NTabs, NSwitch,
    NDialog, NModal, NMessage, NNotification, NDropdown,
    NProgress, NBadge, NTag, NAvatar, NDivider, NScrollbar,
    NDataTable, NForm, NFormItem, NPopconfirm, NTooltip,
    NSpace, NGrid, NGridItem, NCollapse, NCollapseItem,
  ],
});
```

```typescript
// src/renderer/src/composables/useTheme.ts
import { darkTheme, type GlobalTheme } from 'naive-ui';
import { ref } from 'vue';

const theme = ref<GlobalTheme | null>(null);

export function useTheme() {
  function setDark() { theme.value = darkTheme; }
  function setLight() { theme.value = null; }
  function setSystem() {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme.value = isDark ? darkTheme : null;
  }
  return { theme, setDark, setLight, setSystem };
}
```

---

### 7.3 必要的环境变量

```bash
# .env.example
# AI 厂商 API Keys（实际密钥通过应用内界面配置，存储加密）

# 开发模式
NODE_ENV=development

# 日志级别
LOG_LEVEL=debug
```

### 7.3 启动开发服务器

```bash
# 安装依赖
npm install

# 启动开发模式
npm run start

# 代码检查
npm run lint
```

---

## 8. 构建与发布

### 8.1 构建命令

| 命令 | 说明 |
|------|------|
| `npm run start` | 启动开发服务器 |
| `npm run package` | 打包应用（生成可运行的应用包） |
| `npm run make` | 构建可分发安装包 |
| `npm run publish` | 发布到 Electron Forge |
| `npm run lint` | ESLint 代码检查 |

### 8.2 构建输出

| 平台 | 格式 |
|------|------|
| Windows | `.exe` (Squirrel) / `.zip` |
| macOS | `.zip` / `.dmg` |
| Linux | `.deb` / `.rpm` / `.zip` |

### 8.3 安全加固

项目已配置 Electron Forge 的 Fuses 插件，启用以下安全加固：

```typescript
// forge.config.ts
new FusesPlugin({
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,                           // 禁止应用作为 Node 运行
  [FuseV1Options.EnableCookieEncryption]: true,              // 启用 Cookie 加密
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // 禁止 Node 选项环境变量
  [FuseV1Options.EnableNodeCliInspectArguments]: false,       // 禁止 CLI 调试参数
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // ASAR 完整性校验
  [FuseV1Options.OnlyLoadAppFromAsar]: true,                  // 仅从 ASAR 加载应用
})
```

---

## 9. 开发路线图

### Phase 1: MVP（2个月）

- [ ] 基础 Electron + Vue 3 项目框架搭建
- [ ] **UI 组件库搭建**（Naive UI + UnoCSS + 主题切换 + 国际化）
- [ ] **首页界面**（项目列表 + 新建入口）
- [ ] **灵感推荐系统**（L1/L2/L3 三级卡片 + 刷新机制）
- [ ] **大纲生成流程**（提示词 → 多套大纲 → 选择 → 创建项目）
- [ ] **设置页**（主题色 + 语言 + API Key 配置 + 连接测试）
- [ ] 富文本编辑器核心（TipTap）
- [ ] 单厂商 AI 接入（OpenAI / Claude）
- [ ] 章节管理（创建、编辑、保存）
- [ ] 角色 / 地点基础档案
- [ ] 项目文件导入导出（.txt / .md）

### Phase 2: 核心功能（3个月）

- [ ] 多厂商切换与密钥管理
- [ ] 向量检索 RAG 系统（集成 LanceDB）
- [ ] 三层记忆系统实现
- [ ] 一致性检查 V1（角色名、基础设定）
- [ ] 伏笔追踪系统

### Phase 3: 长文本优化（3个月）

- [ ] 分层记忆与智能摘要（L1/L2/L3）
- [ ] 百万字性能优化
- [ ] 关系图谱可视化（D3.js / ECharts）
- [ ] 时间线可视化
- [ ] 情感曲线分析

### Phase 4: 生态扩展（2个月）

- [ ] 插件系统（自定义 AI 工作流）
- [ ] 社区分享（世界观模板、角色卡）
- [ ] 协作写作（多人共享项目）
- [ ] API 文档与开放平台

---

## 10. 参考资料

| 资源 | 链接 |
|------|------|
| Electron 官方文档 | https://www.electronjs.org/zh/docs/latest/ |
| Electron Forge | https://www.electronforge.io |
| Vue 3 官方文档 | https://vuejs.org |
| Vite | https://vitejs.dev |
| LanceDB | https://lancedb.com |
| ProseMirror | https://prosemirror.net |
| Slate.js | https://slatejs.org |
| LangChain | https://python.langchain.com |
| LlamaIndex | https://www.llamaindex.ai |
| Electron 安全最佳实践 | https://www.electronjs.org/zh/docs/latest/tutorial/security |
| Vue + Electron 最佳实践 | `electron-best-practices` skill |

---

*本文档与 `prd.md` 配套使用，随产品需求迭代更新。*
