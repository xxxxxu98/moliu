# 安全说明

## 密钥怎么放

厂商 API Key 只应写在本机应用设置里。墨流用 AES-256-GCM 加密后保存，加密密钥由本机环境派生，换一台电脑无法直接解密。

这不能替代操作系统的用户隔离。能读取同一用户进程或内存的人，仍然有机会拿到解密后的密钥。不要把应用数据目录、设置导出或日志当成可以转发的密钥容器。

以下内容不要写进 Git、Issue、Pull Request 或聊天记录：

- API Key、令牌、密码
- `.env`、`temp/continue-write.real.config.json`
- `%APPDATA%/moliu`（或打包后的「墨流」数据目录）里的设置和书稿
- 含密钥的请求日志、`temp/ai-traces/`

发现仓库里已经出现密钥时，先在厂商后台吊销该密钥，再提出删除记录的请求。

## 报告漏洞

请不要开公开 Issue 描述可利用的细节。

优先到 [Security Advisories](https://github.com/xxxxxu98/moliu/security/advisories/new) 提交私人报告。无法使用该入口时，发邮件到 `xxxxxu98@gmail.com`，标题以 `[moliu security]` 开头。

邮件里请包括：影响版本或提交、复现步骤、影响范围，以及你是否已经公开讨论过。请给维护者留出修复时间，再决定是否公开。

## 不在此列的问题

模型生成内容的质量、文风和剧情连续性走普通 Issue。密钥计费、厂商侧封禁和网络可达性由各厂商负责。
