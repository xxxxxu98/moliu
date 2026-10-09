# 墨流文档

> 项目文档入口。对外说明以根目录 README 为首页，实现现状以架构文档为准，规范只维护一份。

## 给人看的文档

| 文档 | 用途 |
|------|------|
| [../README.md](../README.md) | 仓库首页：项目是什么、能做什么、如何启动 |
| [getting-started.md](./getting-started.md) | 环境、运行、测试、打包、维护者冒烟 |
| [architecture.md](./architecture.md) | 当前实现的进程、数据和写作主链 |
| [north-star.md](./north-star.md) | 可投稿网文的八层质量目标和生产验收门 |
| [development-guidelines.md](./development-guidelines.md) | 开发规范唯一权威源 |
| [reference-projects.md](./reference-projects.md) | 参考开源网文项目。仓库不随墨流分发，需要时自行克隆 |
| [prd.md](./prd.md) | 产品愿景。其中未落地的能力以架构文档为准 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Issue 与 Pull Request 流程 |
| [../SECURITY.md](../SECURITY.md) | 密钥存放和漏洞报告 |
| [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | 讨论区行为约定 |
| [../LICENSE](../LICENSE) | 墨流源代码的 MIT 协议 |
| [../NOTICE](../NOTICE) | 随仓库分发的第三方 Skill 协议与版权 |

## 内部设计记录

这些文档记录方案或验收过程，不代表全部已经上线：

| 文档 | 用途 |
|------|------|
| [quality-ledger/](./quality-ledger/) | 可上线大循环 findings 台账与跨轮收敛表（`npm run findings:converge` 生成） |
| [unified-state-ledger.md](./unified-state-ledger.md) | 统一实体状态账本方案 |

## Agent 入口

根目录入口文件均指向 `development-guidelines.md`，无需在入口内复制大段规范：

- `CLAUDE.md` — Claude Code / Codex / ZCode
- `.cursorrules` — Cursor
- `.github/copilot-instructions.md` — GitHub Copilot

## 快速开始

```bash
npm install
npm start             # 开发模式
npm test              # 单元测试
npm run lint          # ESLint
npm run package       # 打包
npm run make          # 构建安装包
```

步骤和排错见 [getting-started.md](./getting-started.md)。

## 维护约定

1. **规范变更**只改 `development-guidelines.md`，入口文件保持短摘要即可。
2. **行为变更**要同步架构文档或入门文档。愿景写在 `prd.md`，不要把未实现的能力写成现状。
3. **不要**把一次性重构方案、调试日志、临时 QA 产物放进 `docs/`。
4. 规划类文档若已落地实现，应及时删除或并入上述正式文档，避免双源真相。
