# GitHub Copilot 指令（入口文件）

> 本文件为 GitHub Copilot 提供项目开发规范入口。
> 完整规范见唯一权威源：`docs/development-guidelines.md`

## ⚠️ 前置要求（每次编码任务）

1. **完整阅读** `docs/development-guidelines.md` —— 项目唯一开发规范
2. **检查相关技能**：`.agents/skills/` 目录下的技能文件
3. **参考已有实现**：先在 `src/` 搜索相似功能复用
4. **始终用中文回答**

## 🚫 红线规则

- 禁止 Options API → 必须用 Composition API + `<script setup lang="ts">`
- 禁止隐式 `any` → 必须显式声明类型
- 禁止 `ipcRenderer.send/on` → 必须用 `ipcRenderer.invoke` + `ipcMain.handle`
- 禁止在渲染进程直接调用 Node.js API → 经 preload `contextBridge` 暴露
- 禁止 `v-html` 渲染用户输入
- 禁止硬编码 API 密钥 → 用 `src/main/crypto.ts` 加密存储

## 🎯 技术栈

Electron 41 + Vue 3 (Composition API) + TypeScript 5.7 + Naive UI + Pinia + UnoCSS + TipTap。

## 📝 命名 & 提交

- 组件 `PascalCase`；Composable 用 `use` 前缀；Store 用 `.store.ts` 后缀
- IPC 通道用 `domain:action`（如 `chapter:save`）
- Git 提交用约定式格式：`feat: / fix: / docs: / refactor: / test: / chore:`

## 📚 完整规范

详细规则、示例、目录结构、测试规范等全部以
**`docs/development-guidelines.md`** 为准（唯一权威源，SSOT）。
