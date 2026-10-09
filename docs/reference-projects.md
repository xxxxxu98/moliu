# 参考项目（Reference Projects）

> 参考项目不随墨流仓库分发。需要对照实现时，按下面的 GitHub 地址自行克隆到本机任意目录。
> **编写网文相关功能时，应优先查阅这些项目的对应实现，借鉴设计思路与提示词。**
>
> ⚠️ 仅作参考与启发，**不要直接复制其代码或依赖，也不要把克隆下来的仓库放回本仓库**（技术栈不同：墨流为 Electron + Vue + TS，参考项目多为 Claude Code 插件 / Python；webnovel-writer 为 GPL v3）。重点学习：架构思路、提示词工程、网文领域知识。

---

## 参考项目速览

| 项目 | 上游仓库 | 技术形态 | 核心价值 |
|------|----------|----------|----------|
| [webnovel-writer](#1-webnovel-writer) | https://github.com/lingfengQAQ/webnovel-writer | Claude Code 插件 + Python (RAG) | 长篇连载的设定/伏笔一致性管理、追读力系统 |
| [oh-story-claudecode](#2-oh-story-claudecode) | https://github.com/worldwonderer/oh-story-claudecode | Claude Code skill 包 | 网文全流程（扫榜/拆文/写作/去AI味）+ 丰富的领域知识库 |

---

## 1. webnovel-writer

> 目标：**让 AI 写长篇时不乱编、不忘事**，自动管理角色设定、剧情伏笔、世界观规则。
> - GitHub：`lingfengQAQ/webnovel-writer`
> - 协议：GPL v3
> - 当前版本：v6.0.0

### 与墨流的功能映射

| webnovel-writer 模块 | 参考路径 | 对应墨流功能 |
|---------------------|----------|------------|
| **Story System 主链**（合同种子 + 运行时合同 + 章节提交 + 事件审计） | `webnovel-writer/skills/webnovel-write/`、`docs/architecture/` | `services/story-runtime/`（ContractPack / 事实提取 / 判官 / 提交收据） |
| **追读力系统**（Hook / Cool-point / 微兑现 / 债务追踪） | `references/reading-power-taxonomy.md` | `services/outline/prompts/system/core-principles.ts`（追读力 / 钩子 / 爽点原则）、`services/story-runtime/proseRules.ts` |
| **长期记忆闭环**（写前注入 + 写后沉淀） | `docs/memory/`、`skills/webnovel-write/` | `services/writing/memory/`、`memory-manager.ts` |
| **Agents**（context-agent / data-agent / reviewer / deconstruction-agent） | `webnovel-writer/agents/*.md` | `services/story-runtime/agent/`（AgentLoopRunner + Book/Writer/Outline Toolkit） |
| **RAG 检索**（embedding + rerank，BM25 回退） | `docs/guides/rag-and-config.md`、`scripts/` | 墨流暂无，可作未来方向参考 |
| **题材模板**（37 个内置网文题材） | `genres/`、`references/genre-profiles.md` | `config/`、`data/inspirations.ts` |
| **审查报告** | `references/review-schema.md`、`webnovel-writer/skills/webnovel-review/` | `services/writing/review/`、`services/review/` |
| **只读 Dashboard**（实体图谱/追读力可视化） | `webnovel-writer/dashboard/` | `components/common/OutlineVisualizer.vue` 等 |
| **预检 Preflight** | `webnovel-writer/skills/`（preflight 命令） | `services/writing/preflight/PreflightService.ts` |

### 重点查阅建议

- 想做**伏笔/设定一致性** → 看 Story System 主链设计（`.story-system/` 为真源、`.webnovel/*` 为投影）
- 想做**追读力/爽点** → 看 `references/reading-power-taxonomy.md`
- 想做**记忆系统** → 看 `docs/memory/`
- 想做**审查/质量评估** → 看 `references/review-schema.md` + `review/`

---

## 2. oh-story-claudecode

> 覆盖长篇与短篇网文的**扫榜、拆文、写作、去 AI 味**全流程。
> - GitHub：`worldwonderer/oh-story-claudecode`
> - 协议：MIT

### Skills 清单（8 个）

| Skill | 路径 | 用途 |
|-------|------|------|
| `story-long-write` | `skills/story-long-write/` | 长篇写作：大纲、人物、正文 |
| `story-long-analyze` | `skills/story-long-analyze/` | 长篇拆文：黄金三章、爽点、节奏 |
| `story-long-scan` | `skills/story-long-scan/` | 长篇扫榜：起点/番茄/晋江趋势 |
| `story-short-write` | `skills/story-short-write/` | 短篇写作：情绪设计、反转、精修 |
| `story-short-analyze` | `skills/story-short-analyze/` | 短篇拆文：叙事结构、情绪曲线 |
| `story-short-scan` | `skills/story-short-scan/` | 短篇扫榜：知乎盐言/番茄风口 |
| `story-deslop` | `skills/story-deslop/` | **去 AI 味**：检测并清除 AI 写作痕迹 |
| `browser-cdp` | `skills/browser-cdp/` | 浏览器抓取（CDP 复用登录态） |

### 与墨流的功能映射

| oh-story 知识库 | 参考路径 | 对应墨流功能 |
|----------------|----------|------------|
| **去 AI 味**（预防 + 三遍去AI法 + 改写范例库 + 禁用词表） | `skills/story-deslop/references/`、`skills/story-long-write/references/anti-ai-writing.md` | `services/writing/de-ai-service.ts`、`services/writing/anti-ai-rules.md` |
| **钩子技法**（章尾 13 式 / 章首 7 式 / 段落级钩子） | `skills/story-long-write/references/hook-techniques.md` | `services/outline/prompts/system/core-principles.ts`、`services/story-runtime/proseRules.ts` |
| **情绪设计**（6 种弧形模板 + 期待感管理） | `skills/story-long-write/references/emotional-arc-design.md` | `services/outline/prompts/system/core-principles.ts`（情绪节拍段） |
| **大纲排布**（五步大纲法 + 节点设计 + 升级感） | `skills/story-long-write/references/outline-arrangement.md` | `services/outline/` |
| **人物设计**（设定 + 关系映射 + 动机链 + 群像） | `skills/story-long-write/references/character-design.md` | `config/character-roles.ts` |
| **冲突设计**（与墨流 references 同名） | — | `services/outline/prompts/system/core-principles.ts`（冲突升级段） |
| **爽点设计** | `skills/story-long-write/references/` | `services/outline/prompts/system/core-principles.ts`（爽点密度段） |
| **题材框架**（长篇八节点 / 8 大题材开头模板） | `skills/story-long-write/references/genre-frameworks-unified.md`、`genre-opening-database.md` | `data/inspirations.ts`、`config/` |
| **质量检查**（通用 + 长篇/短篇专项 + 毒点排查） | `skills/story-long-write/references/quality-checklist.md` | `services/writing/review/` |
| **对话/反转/风格模块** | `skills/story-long-write/references/dialogue-mastery.md`、`reversal-toolkit.md`、`style-modules.md` | `services/writing/` |

### 重点查阅建议

- 想做**去 AI 味** → 看 `story-deslop`（三遍去AI法、禁用词表）
- 想做**钩子/爽点/情绪** → 看 `story-long-write/references/`（这是最丰富的知识库）
- 想做**大纲生成** → 看 `outline-arrangement.md` + `genre-frameworks-unified.md`
- 想做**拆文/市场分析** → 看 `story-long-analyze` + `story-long-scan`

---

## 使用规范

### ✅ 应该做的

1. **编写网文功能前**，先按本文的上游仓库对照对应模块的实现与提示词
2. **借鉴设计思路**：架构分层、状态管理、提示词工程、领域模型
3. **对比差异**：墨流是 Electron 桌面应用，参考项目多为 CLI/插件，注意适配
4. 在代码注释中标注参考来源（如 `// 参考自 webnovel-writer 的追读力系统设计`）

### ❌ 不应该做的

1. ❌ 直接复制参考项目的代码（技术栈不同，且涉及 GPL v3 协议传染性）
2. ❌ 引入参考项目的依赖（Python 包、Claude 插件机制）
3. ❌ 把参考项目的内容当作墨流的运行时数据

### 协议注意

- **oh-story-claudecode**：MIT（宽松，可自由借鉴思路）
- **webnovel-writer**：**GPL v3**（传染性协议！墨流为 MIT，**切勿直接复制其代码**，只能学习思路与独立实现）

---

> **维护**：新增参考项目时，只在本文件补充上游地址和功能映射表，不要把上游仓库提交进墨流。
> 墨流自研代码始终遵循 [`development-guidelines.md`](./development-guidelines.md)。文档索引见 [`README.md`](./README.md)。
