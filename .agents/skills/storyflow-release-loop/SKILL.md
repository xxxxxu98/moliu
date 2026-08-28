---
name: storyflow-release-loop
description: Storyflow 可上线验收大循环。把「真实 AI 生成整本书 → 确定性 triage → 导出全书+预检 → AI 逐章通读书审(Findings S1-S4) → 归因四分诊 → 代码修复+vitest 回归 → 两级真实回归(20章快速+100章终验)」串成单一外层闭环，退出条件是内容质量达标而非"没报错"。触发方式：/storyflow-release-loop、「可上线大循环」「验收大循环」「上线验收一轮」「跑到可上线为止」。
---

# Storyflow 可上线验收大循环

定位：`storyflow-auto-loop` 管**运行时**（accepted/重试/耗时），`storyflow-book-review` 管**已成书的内容质量**；
本 skill 是两者的**外层编排**——循环的退出条件不再是 triage 全绿，而是：

```
我的全书通读 Findings S1/S2 清零 + book-precheck 红线清零 + prose.dead-resurrection 恒红=0
+ 读者裁判硬门禁达线（阈值经用户批准冻结后填入；批准前为影子观察）
```

## 第 0 步：前置自检（三条全过才开跑）

```bash
# 1. 反重力网关存活（只查端口监听；裸 HTTP 探测会 403 token_rejected，不可信）
netstat -ano | findstr :8045 | findstr LISTENING

# 2. harness 配置在位（曾因 temp 全量清扫被删导致冒烟秒失败；KEEP_DEFAULT 已加保护）
#    temp/continue-write.real.config.json + temp/continue-write.real.config.example.json
#    若缺：从 example 结构重建 {"enabled":true,"providerId":"<厂商id>"} 并 JSON.parse 验证

# 3. 厂商确认（--list 看 ★；反重力 gemini-3.7-flash-high 的当前 id 要现场核对，勿凭记忆写死）
node scripts/agent-storyflow-real-multi.mjs --list
```

默认参数（2026-08-27 用户拍板）：写作与读者裁判同一反重力通道
（显式 `MOLIU_READER_JUDGE_PROVIDER_ID=<id>`）；规模默认 **100 章级**
（`MOLIU_CHAPTER_COUNT` 可调，首次打通流程用 1~20 章即可）；产物隔离目录命名
`temp/storyflow-matrix-<tag><N>ch/`。

## 第 1 步：真实生成（后台）

```bash
set MOLIU_CHAPTER_COUNT=100&& set MOLIU_READER_JUDGE_PROVIDER_ID=<id>&& set MOLIU_STORYFLOW_MATRIX_DIR=temp\storyflow-matrix-agif100ch&& node scripts/agent-storyflow-real-multi.mjs <id>
```

run_in_background 跑，期间做第 3 步的工具准备。规模联动规则见 auto-loop SKILL.md。
geo-block 已知形态看 auto-loop「已知噪音」，长窗口杀批次→结论是换通道而非加退避。

## 第 2 步：基建层 triage（确定性，不跳过）

```bash
set MOLIU_STORYFLOW_MATRIX_DIR=temp\storyflow-matrix-agif100ch&& node scripts/storyflow-triage.mjs
```

读落盘的 latest.md（CMD 控制台中文必乱码）。要点：
- 判定表与分诊动作继承 auto-loop 第 3 步；`prose.dead-resurrection` 恒红必须处理。
- **重要区分**：trace/run.log 里的 reviewer 告警 ≠ 终稿缺陷。引号未闭合、foreshadow 提前
  点名这类章内问题大多被重写轮兜住了；只有「确定性扫描终稿」（如 dead-resurrection）
  与后续人工取证才能定罪。

## 第 3 步：组装书审目录 + 确定性预检

矩阵书不在 App 注册表（project-store 模拟存储），export-book.mjs 不适用：

```bash
node .agents/skills/storyflow-release-loop/scripts/assemble-matrix-bookreview.mjs <matrix目录>/<providerId>/<project-store>.json
# 输出 temp/book-review/<slug>-<MMDD>/: outlines.txt + 001..NNN.txt + book.json
node .agents/skills/storyflow-book-review/scripts/book-precheck.mjs "temp/book-review/<slug>-<MMDD>"
```

预检指标口径：引号/直引号/章界复述应恒绿（管线已兜底）；**段落 CV<0.15、CBN 无终止符、
AI 词频**是要人工结合语境看的信号不是 blocker。

## 第 4 步：定向取证 + AI 通读审查

先跑取证脚本把跨章状态矛盾坐实到原文（输出 UTF-8 文件用 Read 读，别走控制台）：

```bash
node .agents/skills/storyflow-release-loop/scripts/bookreview-extract.mjs "temp/book-review/<目录>"
```

覆盖：回档嫌疑对的「上章尾 vs 下章头」拼接、重点角色出场图谱、数字/名称漂移线索、
读者评分分布（从 closed-loop.summary.json 的 readerEvaluation 取 min/p10/p25/median）。

然后逐章通读 outlines.txt 全部 + 正文（长跑至少抽读后半部若干章——文风衰减集中在尾部），
按 story-review rubric 出 Findings(S1-S4)。维度：钩子链衔接、爽点兑现、人物一致性、
跨章事实与命运状态、章界重演核实、设定复述、大纲禁区遵守、数字口径漂移。
区分三档结论：终稿实锤 / 过程告警已兜住 / 需再取样核实。

## 第 5 步：归因四分诊（继承 book-review，附加本循环实测根因库）

| 类别 | 动作 | 本循环已验证的实例 |
|---|---|---|
| 代码 bug | 修+vitest 回归挂受害样本 | 提交管线漏接死亡规则提取（ProjectionWriters 只映射 stateDeltas，处决整章 characterStateChanges=[]→禁入空转→死人复活重启审判线）；shrinkHookText 剥终止符不补回 |
| 防线缺口 | 归一化/守卫类直接修；阻断类先报 | hookText 泄漏（邻行"- 爽点类型：x"被当文案吞入）→ sanitizeHookText 守卫接入 parser+roller 双生产点；forbiddenZones slice 前 fate 条目排后会被静默截掉→改排前 |
| prompt 措辞 | 直接修，注意与既有指令冲突检查 | FactExtractor 生死事件必检契约；CBN/CEN 终止符要求 |
| 非代码 | 记 memory 不修；用户裁决走 deslop/换模型 | 现代词出戏群（贴现率/翻车/克）、清代花翎混宋明礼制 |

**关键排查手法（2026-08-27 实战沉淀）**：S1 类断裂先查 chapterMemories 里对应章节的
`characterStateChanges` 是否为空/垃圾——提取层断供时，下游命运门禁、禁入名单、陈旧度裁剪
全线空转，表现为"防线都在却拦不住"。不要先去改 prompt。

### 死亡提取防线六轮反噬演化史（加确定性规则的必修课）

每一轮"修漏报"都可能引入新误报语境，**每个受害原文样本必须进测试库（漏报+误报双向）**：

| 轮次 | 形态 | 例句 | 守卫 |
|---|---|---|---|
| 漏报 | 处决完成体与主语隔十余字 | 「着即斩立决！…严世宽等贪官的头颅滚落高台」 | 句级结果扫描(人头落地/头颅滚落/当场毙命/气绝) |
| 误报1 | 祈使威胁 | 「给我杀了顾青舟！」 | 祈使窗口 + 悬赏守卫 |
| 误报2 | 裸判词当事实 | 「判斩立决，午时三刻行刑」 | AI提取契约改"完成体证据" + 输出闸 sanitizeUnconfirmedDeathDeltas |
| 误报3 | 修辞转喻 | 「承载着无数人头落地的勘合」 | 勘合/文书/传闻等名词邻近豁免 |
| 误报4 | 假设盘算 | 「杀了陆承安不过是交差抵罪…照样人头落地」 | 假设标记守卫(双侧同源) |
| 误报5 | 条件句+动词循环窄窗 | 「今夜若是强行在此处杀了陆云铮」 | 动词循环 ±30 字假设检测 |
| 结构 | 误报终态在实体上持久残留 | 命运表已熔断清空、评审仍读到 死亡 | overlayCharacterFates 清除"不在命运表+有后生活动"的残留状态（读取侧不变量：活人不能带死状态） |

同族守卫：triage 死亡扫描的求刑守卫（「斩杀X以谢天下」）、解除词表保释/候勘系、
解除章覆盖语义；伏笔防线的蓝图词面校验（findLockedForeshadowViolations，2-gram 覆盖）
+ roll 修复回路接入。超时预算公式 `章数×2min+60`（200min 级全量实测校准）。

### 权限边界（扩展清单版，护栏照旧）

免打扰自动修+留痕：infra 重试分类、解析软兜底、prompt 措辞强化、triage/precheck 规则回写、
防线归一化守卫、测试/脚本自身 bug、**顺带的结构小修**（如 memory 字段规范化）。
必须停下问用户：reviewer 判定 schema、质量门阈值与任何「让指标变绿」式改动、大纲合同
生成规则（含滚动续纲过期节点 reconcile）、运行时 CV/AI味自动重写触发器、上章不可回退
确定性断言(B1)、裁判硬门禁数值冻结。

## 第 6 步：两级真实回归

第一级（每轮代码修复后）：同配置全新小规模矩阵（推荐 20 章），不依赖 App 注册表项目——
这是标准「App 内清空续写 20 章」协议在本循环的等价替代（矩阵书在 project-store 里）：

```bash
set MOLIU_CHAPTER_COUNT=20&& ... set MOLIU_STORYFLOW_MATRIX_DIR=temp\storyflow-matrix-<tag>reg&& node scripts/agent-storyflow-real-multi.mjs <id>
node scripts/storyflow-triage.mjs   # MOLIU_STORYFLOW_MATRIX_DIR 指向新目录
node .agents/skills/storyflow-book-review/scripts/book-precheck.mjs "<组装出的新书审目录>"
```

通过标准：目标签名消失（如死亡登记进 chapterMemories、钩子带终止符）、无新增红项、
verdict/首过率不劣化。快速回归通过 ≠ 完成。

第二级（收官终验）：修复面覆盖写作管线行为时，全量（100 章级）重 roll 一轮 +
按首轮同一份 Findings 清单逐项核销终审。

## 第 7 步：阶段总结格式（每轮必写）

```
## 第 N 轮
- 对象：<书名/矩阵目录/章数/耗时>
- 工程层：<accepted、首过率、裁判分概览>
- 书审：<S1 xN / S2 xN / S3 xN 一句话各>（终稿实锤 / 已兜住 分开列）
- 根因：<提取断供/守卫缺失/措辞缺口…对应文件:行>
- 修复：<文件+一句话+测试结果>
- 待批：<暂停点类事项清单及建议>
- 回归：<两级结果/diff 摘要>
- 下一步：<继续 / 终验 / 停止原因>
```

## 本机环境噪音（见到不当故障）

- CMD 无 unix 工具、中文必乱码：复杂检查一律落 .mjs 落盘执行，报告用 Read 读 UTF-8 文件
- findstr 多模式用多个 /c:""；grep 语法的 \| 在 findstr 是字面量
- tsc TS6305/SQLite ABI main 侧测试失败=存量噪音；better-sqlite3 双 ABI 由 pretest 与
  ensure-electron-sqlite-abi 自动管理
- reader judge 未配独立第二模型时 independentFromWriter=false + self-evaluation-fallback
  黄签是预期行为（作者=裁判同通道时如实标记）
