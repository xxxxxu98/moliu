# 墨流 (Moliu) — AI 编程入口规范

> 本文件是 **Claude Code / Codex / ZCode** 等 AI 编程工具的统一入口。
> 完整规范见唯一权威源：[`docs/development-guidelines.md`](docs/development-guidelines.md)

---

## ⚠️ 强制前置动作（每次编码任务开始前）

1. **完整阅读** [`docs/development-guidelines.md`](docs/development-guidelines.md) —— 项目唯一开发规范
2. **检查相关技能**：查看 `.agents/skills/` 目录下的技能文件（如 `vue-best-practices`、`electron`、`frontend-design` 等）
3. **编写网文功能前**：查阅 [`docs/reference-projects.md`](docs/reference-projects.md)，参考 `reference/` 下的开源 AI 网文项目（webnovel-writer、oh-story），借鉴架构思路与提示词
4. **参考已有实现**：动手前先在 `src/` 中搜索相似功能，复用既有模式
5. **始终用中文回答**

> 说明：本文件只摘录"红线规则"以确保关键约束在上下文截断时也不丢失。
> 详细规则、示例、目录结构、命名约定等**全部以 `docs/development-guidelines.md` 为准**。

---

## 🚫 红线规则（违反即驳回）

- ❌ **禁止 Options API**：Vue 组件必须用 Composition API + `<script setup lang="ts">`
- ❌ **禁止隐式 `any`**：必须显式声明类型（`tsconfig` 已开 `strict`）
- ❌ **禁止 `ipcRenderer.send/on`**：必须用 `ipcRenderer.invoke` + `ipcMain.handle`（异步）
- ❌ **禁止在渲染进程直接调用 Node.js API**：必须经 preload `contextBridge` 暴露
- ❌ **禁止 `v-html` 渲染用户输入**（XSS 风险）
- ❌ **禁止硬编码 API 密钥**：必须用 `src/main/crypto.ts` 加密存储
- ❌ **禁止提交** `node_modules/` `.vite/` `out/` `dist/` `.env` 及敏感信息

---

## 🎯 核心技术栈（版本以 `package.json` 为准）

| 层级 | 技术 |
|------|------|
| 桌面 | Electron 41 + Electron Forge 7 |
| 前端 | Vue 3 (Composition API) + TypeScript 5.7 |
| 构建 | Vite 5 |
| 状态 | Pinia 3（store 文件 `.store.ts` 后缀） |
| UI | Naive UI 2.44（已配 `NaiveUiResolver` 自动导入） |
| 样式 | UnoCSS（原子化） |
| 编辑器 | TipTap 3 |
| AI | multi-ai-sdk |
| 测试 | Vitest 4 + happy-dom |

---

## 📂 关键目录约定

```
src/
├── main.ts / preload.ts              # Electron 主进程 + 预加载
├── main/services/                    # 主进程服务（AI client、crypto）
└── renderer/src/
    ├── components/  (common/editor/home/memory)
    ├── composables/                 # use 前缀
    ├── services/    (ai/outline/review/writing)
    ├── stores/                      # Pinia（.store.ts 后缀）
    └── types/  pages/  router/  utils/  locales/
```

**路径别名**：`@` 与 `@renderer` → `src/renderer/src`；`@main` → `src/main`

---

## 📝 命名速记

| 类型 | 规范 | 示例 |
|------|------|------|
| Vue 组件 | PascalCase | `UserProfile.vue` |
| TS 文件 | camelCase | `userService.ts` |
| Store | `.store.ts` 后缀 | `project.store.ts` |
| Composable | `use` 前缀 | `useChapterWriter()` |
| IPC 通道 | `domain:action` | `chapter:save`、`ai:generate-outline` |
| 布尔变量 | is/has/can/should 前缀 | `isValid` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |

---

## 🔧 Git 提交

约定式提交格式：

```
<type>(<scope>): <subject>
```

- **type**：`feat` `fix` `docs` `style` `refactor` `perf` `test` `chore`
- **分支**：`feature/` `fix/` `refactor/` `docs/` `release/v*`
- **PR 标题**：`[TYPE] 简短描述`

---

## 🧪 测试

- 测试文件：`__tests__/` 目录下，`*.test.ts` / `*.spec.ts`
- 命令：`npm run test` / `test:watch` / `coverage`
- 覆盖率：Services 80% / Composables 70% / Utils 90% / 全局 60%

---

## 🎨 代码风格（Prettier）

```
semi: true      singleQuote: true   tabWidth: 2
printWidth: 100 trailingComma: es5  arrowParens: avoid
endOfLine: lf   bracketSpacing: true
```

---

## 📚 相关文档

- 完整开发规范：[`docs/development-guidelines.md`](docs/development-guidelines.md) **← 唯一权威源**
- **参考项目：[`docs/reference-projects.md`](docs/reference-projects.md)** ← 编写网文功能前必看（`reference/` 下的开源 AI 网文项目功能映射）
- 产品需求：[`docs/prd.md`](docs/prd.md)
- AI 写作系统设计：[`docs/ai-writing-system-design.md`](docs/ai-writing-system-design.md)
- 技能集成说明：[`docs/skills-integration.md`](docs/skills-integration.md)
- 优化方案：[`docs/optimization/`](docs/optimization/)
