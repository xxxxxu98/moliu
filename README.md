# 墨流 (Moliu)

仓库地址：<https://github.com/xxxxxu98/moliu>

桌面端 AI 网文创作助手。模型密钥由你自己准备，墨流在本机完成选题、大纲和章节续写，并用写作合同、事实账本和章节评审把长篇连续性留在书里。

当前版本可以用来写作和继续开发。它还没有达到 [`docs/north-star.md`](docs/north-star.md) 里的生产验收门：盲测和完本收束仍是缺口。

## 现在能做什么

- 管理书架，按卷和章节写作，正文用 TipTap 编辑。
- 做选题发现，并维护大纲、角色、世界观、伏笔、情绪目标、矛盾、爽点和故事线。
- 接入多家模型厂商，也支持 Ollama 本地模型。密钥只保存在本机，用 AES-256-GCM 加密。
- 按章节合同写作：组装上下文、提取事实、做连续性校验、评审章节，再把结果写入 SQLite。
- 用工作记忆、情景记忆和语义记忆三层编排，把近章状态和设定约束送进下一次生成。

完整的进程和数据划分见 [`docs/architecture.md`](docs/architecture.md)。

## 现在还没有的能力

- 不提供、不代理任何厂商 API Key。调用费用和配额由你自己的账号承担。
- 没有向量检索，也没有独立的知识图谱数据库。[`docs/prd.md`](docs/prd.md) 里的这些设计是方向，不是当前实现。
- 书稿、冒烟正文和真实密钥配置不进入版本库。`temp/` 只保留一份配置模板。

## 技术栈

Electron 41、Vue 3、TypeScript 5.7、Vite 5、Pinia、Naive UI、UnoCSS、TipTap、better-sqlite3、Electron Forge。版本以 `package.json` 为准。

## 环境

- Node.js >= 20，npm >= 10。日常开发在 Node.js 22 上验证。
- 能访问你所配置的模型 API。Ollama 走本机地址。
- `better-sqlite3` 是原生模块。安装时优先用官方预编译包；拉不到时会从源码编译，Windows 需要 Visual Studio 生成工具。

## 快速开始

```bash
npm install
npm start
```

启动后在设置里填写厂商、模型和 API Key。开发模式的应用数据在本机用户目录的 `moliu` 下，Windows 一般是 `%APPDATA%/moliu`。不要把这个目录提交进仓库。打包后的数据目录名以产品名「墨流」为准。

```bash
npm test          # 单元测试。会先准备 better-sqlite3 的双 ABI 二进制
npm run lint      # ESLint
npm run package   # 打包应用目录
npm run make      # 生成安装包（Windows Squirrel，macOS zip，Linux deb/rpm）
```

环境、测试和打包的说明见 [`docs/getting-started.md`](docs/getting-started.md)。

## 文档

| 文档 | 读者 |
|------|------|
| [docs/getting-started.md](docs/getting-started.md) | 想在本机跑起来 |
| [docs/architecture.md](docs/architecture.md) | 想知道代码现在怎么分层 |
| [docs/north-star.md](docs/north-star.md) | 想知道质量目标 |
| [docs/prd.md](docs/prd.md) | 想看产品愿景 |
| [docs/development-guidelines.md](docs/development-guidelines.md) | 要改代码 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 要提 Issue 或 Pull Request |
| [SECURITY.md](SECURITY.md) | 要报告密钥或漏洞问题 |
| [docs/README.md](docs/README.md) | 文档总索引 |

## 参与贡献

问题和改动请先看 [CONTRIBUTING.md](CONTRIBUTING.md)，再到 [Issues](https://github.com/xxxxxu98/moliu/issues) 讨论。讨论、Issue 和文档使用中文。

这个仓库是桌面应用，`package.json` 里的 `private: true` 用来避免被误发到 npm。

## 协议

墨流自己的源代码、文档和配置模板以 [MIT](LICENSE) 授权，版权所有 (c) 2026 春秋。

`.agents/skills/` 里有随仓库分发的第三方 Agent Skill，协议以 [NOTICE](NOTICE) 和各目录内的许可证为准。
