# 墨流

桌面端 AI 小说创作助手。

## 开发

```bash
npm install
npm start
npm test
```

厂商 API Key 只保存在本机应用设置中。可上线大循环先把
`temp/continue-write.real.config.example.json` 复制为
`temp/continue-write.real.config.json`，再填写本机厂商。
`temp/` 下的书稿和冒烟产物不进入版本库。

## 协议

墨流源代码以 [MIT](LICENSE) 授权，版权归 春秋（2026）。

仓库中另有第三方 Agent Skill，协议见 [NOTICE](NOTICE)。
