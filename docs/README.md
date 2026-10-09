# 墨流文档

> 项目文档入口。保持精简，避免过时方案文档堆积。

## 文档清单

| 文档 | 用途 |
|------|------|
| [north-star.md](./north-star.md) | **项目终极目标** — 可投稿网文八层质量目标 + 生产验收门，一切开发围绕此目标 |
| [development-guidelines.md](./development-guidelines.md) | **开发规范唯一权威源（SSOT）** — 代码风格、目录结构、IPC、测试等 |
| [reference-projects.md](./reference-projects.md) | 参考开源网文项目功能映射（编写网文功能前必看） |
| [prd.md](./prd.md) | 产品需求与产品定位 |
| [../LICENSE](../LICENSE) | 墨流源代码的 MIT 协议 |
| [../NOTICE](../NOTICE) | 随仓库分发的第三方 Skill 协议与版权 |
| [quality-ledger/](./quality-ledger/) | 可上线大循环 findings 台账与跨轮收敛表（`npm run findings:converge` 生成） |
| [unified-state-ledger.md](./unified-state-ledger.md) | 统一实体状态账本方案（第 0 阶段已落地，其余待评审；全部落地后并入正式文档） |

## Agent 入口

根目录入口文件均指向 `development-guidelines.md`，无需在入口内复制大段规范：

- `CLAUDE.md` — Claude Code / Codex / ZCode
- `.cursorrules` — Cursor
- `.github/copilot-instructions.md` — GitHub Copilot

## 快速开始

```bash
npm install
npm run start      # 开发模式
npm run test       # 单元测试
npm run lint       # ESLint
npm run package    # 打包
npm run make       # 构建安装包
```

## 维护约定

1. **规范变更**只改 `development-guidelines.md`，入口文件保持短摘要即可。
2. **不要**把一次性重构方案、调试日志、临时 QA 产物放进 `docs/`。
3. 规划类文档若已落地实现，应及时删除或并入上述正式文档，避免双源真相。
