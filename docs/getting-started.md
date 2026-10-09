# 入门

> 从克隆到跑起桌面应用、测试和打包。架构见 [`architecture.md`](./architecture.md)。

## 准备

- Git
- Node.js 20 或更高版本，npm 10 或更高版本。当前开发环境是 Node.js 22。
- 一个可用的模型 API Key，或本机正在运行的 Ollama。

克隆仓库后在项目根目录执行：

```bash
npm install
npm start
```

`npm start` 会启动 Electron Forge 的开发模式，并打开墨流窗口。首次启动没有作品是正常的。到设置页添加厂商、模型、接口地址和 API Key，再用首页的新建作品进入写作台。

密钥保存在本机应用数据里，不会写回仓库。开发模式的数据目录是用户目录下的 `moliu`，Windows 上通常为 `%APPDATA%/moliu`。

## 原生模块

故事运行时使用 `better-sqlite3`。Electron 和系统 Node 的 ABI 不同，测试脚本会在 `npm test` 前尝试为两边各准备一份二进制，产物放在 `prebuilds/`，该目录不入库。

安装优先下载官方预编译包。下载失败时会从源码编译。Windows 上编译需要 Visual Studio 生成工具和「使用 C++ 的桌面开发」工作负载。

只想手动准备二进制时：

```bash
node scripts/rebuild-better-sqlite3.mjs
```

## 常用命令

| 命令 | 作用 |
|------|------|
| `npm start` | 开发模式 |
| `npm test` | Vitest 单元测试 |
| `npm run test:watch` | 测试监听模式 |
| `npm run lint` | 对 `src/` 和 `scripts/` 运行 ESLint |
| `npm run package` | 打出未封装的应用目录 |
| `npm run make` | 生成安装包 |

安装包目标：Windows 使用 Squirrel，macOS 使用 zip，Linux 使用 deb 和 rpm。图标本目录使用 `resources/` 下的图标。

`npm test` 不访问真实模型。需要网络的只有你在应用里亲自发起的生成，以及下面的维护者冒烟。

## 维护者冒烟

真实续写、选题和书审会调用你自己的模型，并在 `temp/` 写下大纲和正文。这些文件已经忽略，不要提交。

1. 复制 `temp/continue-write.real.config.example.json` 为 `temp/continue-write.real.config.json`。
2. 让 `useAppDefaultProvider` 保持 `true`，复用应用里已经保存的默认模型；或在副本里写上本机的厂商信息。
3. 运行对应脚本，例如：

```bash
npm run smoke:continue-write:real
npm run triage:storyflow
```

`package.json` 的 `scripts` 列出了全部冒烟和清理命令。`temp/` 的清理用 `npm run temp:stats` 和 `npm run temp:clean`。

参考项目不在本仓库里。需要对照时按 [`reference-projects.md`](./reference-projects.md) 自行克隆，克隆结果不要放回本仓库。

## 排错

- 窗口能开但无法生成：先在设置里测试连接，确认 Key、模型名和 Base URL。
- 测试报找不到 `better_sqlite3.node`：重新执行上面的原生模块命令，并确认 Node 与 Electron 两个 ABI 都编译成功。
- 换电脑后原来的 Key 不可用：加密密钥跟机器环境绑定，需要在新机器上重新填写。
