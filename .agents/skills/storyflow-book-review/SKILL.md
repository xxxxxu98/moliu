---
name: storyflow-book-review
description: Storyflow 书籍内容质量审查-归因-修复循环。对指定书籍导出大纲与正文,跑确定性预检(引号/钩子链/章界重演/AI词频/段落CV),AI 结合语境产出 Findings,按「代码bug/防线缺口/非代码」归因,代码问题走修复+vitest 回归,最后用真实续写对比指标 diff。触发方式：/storyflow-book-review、「审查这本书」「看看生成质量」「书审一轮」「这书有什么问题」。
---

# Storyflow 书籍质量审查循环

与 `storyflow-auto-loop`(运行时冒烟,triage 管 accepted/重试/耗时)互补:本 skill 审的是
**成书内容质量**——大纲钩子工程、正文文笔、跨章一致性。运行时全绿不代表成书没问题
(2026-08-26《绝症当虫治》10/10 accepted 但审出 2 个 S1 + 1 个真 bug)。

## 循环总览

```
定位书籍 → 导出基线 → 确定性预检 → AI 通读审查(Findings) → 归因分诊
  → 代码bug: 修复+vitest回归 → 清空正文→20章真实续写 → 导出复审 → metrics diff(收工判据)
  → 防线缺口: 评估是否值得加门禁(默认提示,不自动阻断)
  → 非代码: 记录进 memory,不修
```

单会话修复上限 3 轮(与 auto-loop 一致),到限输出阶段总结。

## 真实续写测试协议(2026-08-26 起,标准形态)

每轮代码修复后的验证 = **清空该书全部正文,从第1章真实续写20章**。
用 continue-write real harness(与 App 批量续写同路径),不手写清空脚本:

1. 改 `temp/continue-write.real.config.json`:
   `projectId`/`projectName` 指向目标书、`chapterCount: 20`、`chapterNumber: 1`、
   `providerId` 填目标厂商(如反重力 provider-1787039781123)
2. `npm run smoke:continue-write:real:multi`(后台跑,约 1 章/1-3 分钟)
3. 产物在 `temp/continue-write.real.ch{N}.summary.json` + `temp/ai-traces/*.jsonl`

要点:
- `clearAllChapterContents` 是**内存态清空**,不改 moliu-projects.json——App 里的正文不受影响;
  测试意图是"同一大纲从零重写的产物质量",不是清掉用户数据
- harness 加载的是**项目大纲**(startupPack/plotOutline 派生蓝图),大纲有变则先在 App 重新生成
- better-sqlite3 ABI 报错回退内存 API 是已知形态,不影响流程;真实冒烟后须 `npm test` 重建 ABI
- App 开着不冲突(产物落 temp/),但不要同时手动编辑同一本书

## 第 1 步：定位与导出

书籍数据内嵌在应用注册表 JSON 里(不是文件系统目录):

```bash
node .agents/skills/storyflow-book-review/scripts/export-book.mjs <书名或项目ID>
# 输出 temp/book-review/<slug>-<MMDD>/: outlines.txt + 001.txt..NNN.txt + book.json
```

Windows 下 shell 内联 node -e 打中文易乱码,复杂检查一律落 `.mjs` 脚本文件执行。

## 第 2 步：确定性预检(不要跳过)

```bash
node .agents/skills/storyflow-book-review/scripts/book-precheck.mjs temp/book-review/<目录>
```

产出 metrics.json + 控制台摘要,覆盖:引号配对/直引号、钩子残句与同拍复述、
章界重演(上章尾 vs 本章头 bigram 相似度)、AI 词频、段落 CV、**叙述段过重**
(叙述段中位 ≥140 或 >200 字墙占比 ≥15%——对话段混在全体里会拉低均值拉高
CV 使墙章全绿,须看叙述段单列指标)、场景切分形态。
**阈值只是"要看一眼",不是 blocker**——最终判定必须 AI 通读原文结合语境做
(共现类指标假阳性高,同拍复述阈值 0.55 起步,重演 0.15 起步,先看证据再定性)。

## 第 3 步：AI 通读审查

读 outlines.txt 全部 + 正文逐章通读,输出 Findings(S1-S4),维度至少覆盖:
钩子链衔接、爽点兑现、人物一致性、跨章事实(重点:recurring 道具的每次枚举是否漂移)、
章界重演(预检报告的 at 列表逐个核实)、设定/规则复述、大纲禁区遵守。
正文审查基准可复用全局 story-review skill 的 rubric;本 skill 聚焦工程归因,两者可连用。

## 第 4 步：归因分诊(核心)

| 类别 | 判据 | 动作 |
|---|---|---|
| 代码 bug | 有确定性错误行为(硬截断产出残句、正则吞句、作用域错误) | 修 + 回归用例挂真实受害样本 |
| 防线缺口 | 行为无错但该拦未拦(引号无校验、跨章事实不在 G3 范围) | 评估成本;默认做归一化/修补类,阻断类先提示 |
| 指令缺口 | prompt 没说清(CBN 复述未被禁止、状态仲裁规则缺失) | 补 system 指令,注意与既有指令不冲突 |
| 非代码 | 模型文风、大纲公式重复、超纲发挥 | 记 memory,不修;用户要改走 story-deslop/重排大纲 |

修复护栏(继承 auto-loop):质量门阈值、判定 schema、「让指标变绿」类改动必须人工确认。
修复完跑受影响目录 vitest;上轮经验:全量 `npx vitest run src/renderer` 约 45s,
main 侧 SQLite ABI 失败为存量噪音(stash 验证法区分)。

## 第 5 步：清空续写 → 复审 → diff

按「真实续写测试协议」跑完 20 章后,把产物从 summary 导出再预检:

```bash
# summary 里的 prose 字段即正文;用 node 脚本落盘到新目录(勿覆盖基线),或临时从 App 导出
node .agents/skills/storyflow-book-review/scripts/book-precheck.mjs <新目录>
node .agents/skills/storyflow-book-review/scripts/book-precheck.mjs --diff <旧基线> <新目录>
```

收工判据:目标指标改善、无恶化项、新增章节无红项。AI 还要抽读新章节确认
指标外的质量(指标只测得出指标内的事——每轮至少抽 2 章通读)。
注意:diff 只对"同章数范围"有意义,基线 10 章 vs 新 20 章时,对比指标率而非绝对数。

## 第 6 步：知识回写

- 新失败模式 → 加进 book-precheck.mjs 检查项(下轮降级为确定性)
- 分诊表未覆盖场景 → 更新本文件
- 跨会话结论(某模型文风特征、某类题材易犯错误)→ auto-memory

## 阶段总结格式

```
## 第 N 轮
- 对象:<书名/目录/章数>
- 预检:<红项摘要>
- Findings:<S1/S2 数 + 一句话>
- 归因:<bug xN / 缺口 xN / 指令 xN / 非代码 xN>
- 修复:<文件 + 测试结果>
- 待续写验证:<diff 时应改善的指标>
```

## 已知形态库(见到先对照,别从头诊断)

- 钩子残句 24-26 字:旧 shrinkHookText 硬切;已修(2026-08-26),新产物不应再出现
- 整章 ASCII 直引号+丢闭引号:已加 normalizeStraightQuotes/repairUnterminatedDialogueQuotes
- 每章 1 场景块:段落归一化 \n\n 与 SCENE_BREAK \n{3,} 不匹配所致;recentScenes 已改按章取
- 章界重演:CBN 复述型 + 履约校验强制覆盖;看 CBN 是否推进型
- recurring 道具跨章漂移(药方成分/价格变体):防线缺口,尚无确定性检查
- 「他知道」「此刻」类心理套话、瞬间/如同高频:非代码,deslop 管辖
