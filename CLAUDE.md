# 墨流 (Moliu) — AI 编程入口规范

> 本文件是 **Claude Code / Codex / ZCode** 等 AI 编程工具的统一入口。
> 完整规范见唯一权威源：[`docs/development-guidelines.md`](docs/development-guidelines.md)

---

## ⚠️ 强制前置动作（每次编码任务开始前）

1. **完整阅读** [`docs/north-star.md`](docs/north-star.md) —— 项目终极目标（可投稿网文八层质量目标）。**一切代码围绕此目标**，动手前先回答「这个改动推进了哪一层」
2. **完整阅读** [`docs/development-guidelines.md`](docs/development-guidelines.md) —— 项目唯一开发规范
2. **检查相关技能**：查看 `.agents/skills/` 目录下的技能文件（如 `vue-best-practices`、`electron`、`frontend-design` 等）
3. **编写网文功能前**：查阅 [`docs/reference-projects.md`](docs/reference-projects.md)，按其中的上游仓库借鉴架构思路与提示词
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
- ❌ **禁止向 AI 请求添加 `max_tokens` / `maxTokens`**：永远不要在请求体或 SDK options 中限制输出上限
- ❌ **禁止前端用规则/正则做语义判定**（生死/意图/履约/冲突等语义判断）：确定性代码只做格式校验、统计指标与候选召回，语义终审交 AI 结构化仲裁或生成侧自标注；例外必须注释说明"为什么规则够用"并配双向回归样本（见 `docs/development-guidelines.md` §9.4）
- ❌ **禁止提交** `node_modules/` `.vite/` `out/` `dist/` `.env` 及敏感信息
- ❌ **禁止冒烟与真实环境双轨**：冒烟必须走生产同一代码路径（数据可 mock，流程不可 mock），差异收敛到单一注入点并在脚本头注释声明（见规范 §10.5）
- ❌ **禁止新文件乱放**：新文件先回答「属于哪个模块哪一层」，按类型归位（类型进 types/、测试进 __tests__/、脚本进 scripts/），根目录不放业务代码（见规范 §3.2）
- ❌ **禁止无注释文件**：每个文件必须有文件头注释（职责一句话 + 关键约束），导出符号必须有 JSDoc；目标注释率约 30%，禁止废话注释与注释掉的死代码（见规范 §11.4）
- ❌ **禁止死代码与静默吞错**：注释掉的代码/不可达分支直接删除；catch 必须处理或带上下文重抛，关键流程失败必须用户可见（见规范 §15、§16）

---

## 🔁 真实冒烟自动循环护栏（storyflow-auto-loop）

- ❌ **禁止自动放宽质量门**：reviewer 判定 schema、合同 mustCover/forbidden、字数区间等判定标准的任何放宽必须人工确认——让测试变绿 ≠ 修复
- ❌ **禁止对 stalled 失败继续 patch**：triage 判定 `model-capability-suspect`（同章质量拒绝 ≥3 轮）时立即停止修代码，产出「换模型 / 调合同」结论上报
- ⚠️ **单会话修复→回归上限 3 轮**：超限输出阶段总结停止，循环协议见 `.agents/skills/storyflow-auto-loop/SKILL.md`

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
- 命令：`npm run test` / `test:watch`
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

完整清单见 [`docs/README.md`](docs/README.md)。

- 项目终极目标：[`docs/north-star.md`](docs/north-star.md) ← **一切开发围绕此目标**
- 开发规范：[`docs/development-guidelines.md`](docs/development-guidelines.md) **← 唯一权威源**
- 参考项目：[`docs/reference-projects.md`](docs/reference-projects.md) ← 编写网文功能前必看
- 产品需求：[`docs/prd.md`](docs/prd.md)
