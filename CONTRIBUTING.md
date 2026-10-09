# 参与贡献

感谢你愿意改进墨流。动手前先看两份文档：

- [`docs/north-star.md`](docs/north-star.md)：这个改动推进哪一层质量目标。回答不了的功能先不要做。
- [`docs/development-guidelines.md`](docs/development-guidelines.md)：编码、测试、IPC 和目录归属的唯一规范。

本机怎么跑起来见 [`docs/getting-started.md`](docs/getting-started.md)。当前代码怎么分层见 [`docs/architecture.md`](docs/architecture.md)。

讨论、Issue、Pull Request 和文档使用中文。

## 开始之前

1. 搜索 [已有 Issue](https://github.com/xxxxxu98/moliu/issues)，避免重复。
2. 较大的功能或重构先开 Issue，写清它对应北极星的哪一层。
3. 从默认分支拉出自己的分支：

| 类型 | 分支 |
|------|------|
| 功能 | `feature/简短描述` |
| 修复 | `fix/简短描述` |
| 重构 | `refactor/简短描述` |
| 文档 | `docs/简短描述` |

## 提交说明

使用约定式提交：

```text
<type>(<scope>): <subject>
```

`type` 用 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`chore`。标题写为什么改，范围写模块名，例如 `fix(story-runtime): 修复章节提交后事实未落库`。

## 改代码时必须守住的边界

- Vue 使用 Composition API 和 `<script setup lang="ts">`。
- 类型显式声明，不留隐式 `any`。
- 渲染进程不直接调用 Node.js API，经 preload 的 `contextBridge` 暴露。
- IPC 使用 `ipcRenderer.invoke` 和 `ipcMain.handle`，通道名用 `domain:action`。
- 不使用 `v-html` 渲染用户输入。
- 不把 API Key、`.env`、本机设置文件写进仓库。密钥走 `src/main/crypto.ts`。
- 不在 AI 请求里设置 `max_tokens` 或 `maxTokens`。
- 不用正则或前端规则做生死、意图、履约、冲突这类语义判定。格式校验和统计可以放在确定性代码里，语义终审交给模型。
- 修复要带能复现原问题的回归测试。
- 新文件先归位：类型进 `types/`，测试进就近 `__tests__/`，脚本进 `scripts/`。

其余细则以开发规范为准。

## 提交前检查

```bash
npm test
npm run lint
```

只改文档时，不必为了走流程去跑整套测试。改到写作、运行时、存储或 IPC 时，测试是必须的。

真实模型冒烟会消耗你自己的 API 额度，也会在 `temp/` 写下正文。这些产物不要提交。配置方法见入门文档的「维护者冒烟」。

## Pull Request

标题格式：`[TYPE] 简短描述`，例如 `[FIX] 修复章节事实未落库`。

描述里写清：

- 做了什么，为什么做
- 推进了北极星的哪一层；纯工程改动写「不直接推进质量层，原因是……」
- 怎么验证
- 关联的 Issue

不要在 PR 里放 API Key、书稿正文或 `temp/` 下的冒烟产物。
