# 架构说明

> 本文描述仓库里已经落地的结构。产品愿景见 [`prd.md`](./prd.md)，质量目标见 [`north-star.md`](./north-star.md)。

墨流是 Electron 桌面应用。渲染进程负责界面和写作编排，主进程负责文件系统、SQLite、密钥和模型请求。两边只通过 preload 暴露的 invoke 接口通信。

## 进程

| 层 | 入口 | 职责 |
|----|------|------|
| 主进程 | `src/main.ts`、`src/main/` | 窗口、IPC、`electron-store`、AI 客户端、密钥加密、故事运行时数据库 |
| 预加载 | `src/preload.ts` | 用 `contextBridge` 把能力交给渲染进程 |
| 渲染进程 | `src/renderer/src/` | Vue 3 界面、大纲、写作管线、记忆编排、运行时调用 |

渲染进程不直接使用 Node.js API。

## 数据放在哪里

开发模式下，应用数据在本机用户目录的 `moliu` 中（Windows 一般为 `%APPDATA%/moliu`）。打包后的目录名跟随产品名「墨流」。

| 数据 | 位置 | 用途 |
|------|------|------|
| 应用设置与加密后的 API Key | electron-store 的 `moliu-settings` | 界面配置。密钥经 `src/main/crypto.ts` 加密 |
| 书架、章节正文和侧栏资料 | electron-store 的 `moliu-projects` | 编辑器直接读写的作品数据 |
| 记忆文件 | `userData/projects/{id}` | 章节记忆的文件备份 |
| 长篇运行时 | `userData/story-runtime/` 下按项目分开的 SQLite | 合同、事实、提交和恢复所依据的正式记录 |

章节写作提交以 SQLite 为准。`moliu-projects` 里的正文和侧栏是编辑器数据，不能单独当成运行时的事实来源。

`temp/` 只给本机冒烟和书审使用，除配置模板外不入库。

## 界面

路由在 `src/renderer/src/router/index.ts`。

- `/home`：书架和选题发现。
- `/project/:id`：写作台。左侧是章节、大纲、角色、世界观、伏笔，以及情绪、矛盾、爽点、故事线。中间是编辑器，右侧是 AI 面板。
- `/settings`：模型、语言、外观和通用设置。

## 写作主链

一次长篇续写大致经过这些模块：

1. **大纲**：`src/renderer/src/services/outline/` 生成和滚动更新可执行大纲。
2. **记忆编排**：`src/renderer/src/services/writing/memory/` 把设定、近章状态和未闭环信息打成记忆包。这是进程内的三层编排（工作、情景、语义），不是向量数据库。
3. **章节管线**：`src/renderer/src/services/writing/ChapterWritingPipeline.ts` 把界面状态和运行时调用串起来。
4. **故事运行时**：`src/renderer/src/services/story-runtime/` 负责合同、上下文包、场景草稿、事实提取、连续性校验、章节评审和提交。主进程的 SQLite 实现在 `src/main/services/story-runtime/`。

运行时把「这一章必须写到什么、不能违反什么」放进合同，写完后再提取事实并评审。通过后才提交。这样换模型或缩短上下文时，书的状态仍然在本地账本里。

## 模型接入

`src/main/services/ai-client.ts` 通过 `multi-ai-sdk` 调用厂商。已接入的名称以该文件的 `SUPPORTED_PROVIDERS` 为准，其中包括 OpenAI、Anthropic、Gemini、Moonshot、DeepSeek、通义千问、智谱、Ollama，以及若干 OpenAI 兼容端点。

请求里不设置输出 token 上限。密钥不出现在仓库和日志约定里，说明见 [`../SECURITY.md`](../SECURITY.md)。

## 维护者质量回路

`.agents/skills/storyflow-*` 和 `scripts/` 里的冒烟、分诊、书审脚本，给维护者检查长篇生成质量。它们调用真实模型，配置和产物都留在本机。读者安装应用时不需要跑这些脚本。

## 和愿景的差别

[`prd.md`](./prd.md) 中的向量检索、知识图谱和多模型投票还没有对应实现。[`reference-projects.md`](./reference-projects.md) 把外部仓库只当作设计参考，那些仓库不随墨流分发。
