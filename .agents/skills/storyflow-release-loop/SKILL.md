---
name: storyflow-release-loop
description: Storyflow 可上线验收大循环。把「真实 AI 生成整本书 → 确定性 triage → 导出全书+预检 → AI 逐章通读书审(结构化 findings.json 台账) → 跨轮收敛与升级判定 → 归因四分诊 → 代码修复+vitest 回归 → 三级真实回归(章节回放+20章快速+100章终验)」串成单一外层闭环，退出条件是由台账数据计算的上线判定而非"没报错"或报告自评。触发方式：/storyflow-release-loop、「可上线大循环」「验收大循环」「上线验收一轮」「跑到可上线为止」。
---

# Storyflow 可上线验收大循环

定位：`storyflow-auto-loop` 管**运行时**（accepted/重试/耗时），`storyflow-book-review` 管**已成书的内容质量**；
本 skill 是两者的**外层编排**——循环的退出条件不再是 triage 全绿，而是：

```
我的全书通读 Findings S1/S2 清零 + book-precheck 红线清零 + fate.contradiction-candidate 经 AI 裁决(fate-adjudicate.mjs)确认的 S1=0
+ 读者裁判硬门禁达线（2026-09-13 复冻：大纲≥85 / 均值≥85 / 章节中位≥86 / 最低≥65；
  首轮触线黄签、同 provider 连续两轮红签——中位 87 只有历史最佳轮过线，
  长跑健康分布 85.6-86.3，86 是健康/劣化分离面）
+ ending-audit 完本指标过关（章节完整 + 伏笔无 main 级未回收 + 完本收束：
  closure signals>0 且结局书审 rubric 第 6 项「新钩子收尾」无 S1/S2）+ 前三章盲测通过
```

> **2026-09-23 判定权收归数据**：「可上线」不再由书审报告自行宣布，唯一出口是
> `findings-ledger.mjs validate` 从 findings.json 计算的判定（见第 4 步末「Findings 台账」）。
> 缺任何一项数据（审法、读者裁判、完本、盲测、干预记录）都按未通过处理——缺失 ≠ 通过。
> r9 教训：同一份 S2 清单仅改标签就从 5 变 0；审法与读者裁判缺失照样写了 READY。
> 与 north-star 对齐的两条：S2>0 阻断（验收门 3）；本轮用过 `storyflow-repair-empty`
> 补写即阻断（验收门 1 人工零干预）——补写仍可用来拿到完整书审材料，但该轮判定必为
> NOT READY，要上线判定须零补写重跑。

> **2026-09-02 agent 化重构**：命运事件的「入账」全权归写作侧 AI 提取合同
> （FactExtractor 契约 7-10：死亡/驾崩/下狱/去职/定罪族命运宣告——含一句带过、
> 摘要、群像连坐——必须出 status delta）；triage 的正文词表塔（死亡谓词/条件/
> 台词/别名等七轮补丁）整体退役，改为台账驱动候选（黄签
> `fate.contradiction-candidate` = 台账终端命运 × 后文正文提及），语义终审
> （回忆提及/剧情解释/真复活）由 `fate-adjudicate.mjs` 的 AI 裁决给出带引用结论。
> 词表从此冻结：再冒新语料形态优先改 AI 提取合同，不再加正则。

## 第 0 步：前置自检（三条全过才开跑）

```bash
# 1. 反重力网关存活（只查端口监听；裸 HTTP 探测会 403 token_rejected，不可信）
netstat -ano | findstr :8045 | findstr LISTENING

# 2. harness 配置在位（曾因 temp 全量清扫被删导致冒烟秒失败；KEEP 只保护配置/书审/断点，不含单轮矩阵）
#    temp/continue-write.real.config.json + temp/continue-write.real.config.example.json
#    若缺：从 example 结构重建 {"enabled":true,"providerId":"<厂商id>"} 并 JSON.parse 验证
#    ai-traces 由 temp:clean 按天裁剪 jsonl；整目录删除用 --dir ai-traces，或 npm run temp:clean -- --purge

# 3. 厂商确认（--list 看 ★；反重力 gemini-3.7-flash-high 的当前 id 要现场核对，勿凭记忆写死）
node scripts/agent-storyflow-real-multi.mjs --list
```

默认参数（2026-08-27 用户拍板）：写作与读者裁判同一反重力通道
（显式 `MOLIU_READER_JUDGE_PROVIDER_ID=<id>`）；规模默认 **100 章级**
（`MOLIU_CHAPTER_COUNT` 可调，首次打通流程用 1~20 章即可）；产物隔离目录命名
`temp/storyflow-matrix-<tag><N>ch/`。
**agent 检索回合已生产常开（2026-09-02，docs/agent-architecture-refactor.md P1）**：无环境开关，
冒烟与 App 同链（验收数据见 docs/agent-loop-refactor.md：墙钟 -13%/章、降级率 0%、检索均 4.2 轮）；
长跑放低峰执行，晚高峰网关单轮固定 ~33s 延迟会污染墙钟数据。

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
- 判定表与分诊动作继承 auto-loop 第 3 步；`fate.contradiction-candidate` 黄签候选
  出现时立刻跑第 4 步的 `fate-adjudicate.mjs` 做 AI 终审，真复活按 S1 处理。
- **重要区分**：trace/run.log 里的 reviewer 告警 ≠ 终稿缺陷。引号未闭合、foreshadow 提前
  点名这类章内问题大多被重写轮兜住了；只有「确定性扫描终稿」与 AI 裁决/人工取证才能定罪。

## 第 3 步：组装书审目录 + 确定性预检

矩阵书不在 App 注册表（project-store 模拟存储），export-book.mjs 不适用：

```bash
node .agents/skills/storyflow-release-loop/scripts/assemble-matrix-bookreview.mjs <matrix目录>/<providerId>/<project-store>.json
# 输出 temp/book-review/<slug>-<MMDD>/: outlines.txt + 001..NNN.txt + book.json(含伏笔台账)
node .agents/skills/storyflow-book-review/scripts/book-precheck.mjs "temp/book-review/<slug>-<MMDD>"
```

组装完成后立刻跑**完本收束审计 + 盲测材料导出**（north-star 验收门第 5/6 项基建）：

```bash
node .agents/skills/storyflow-release-loop/scripts/ending-audit.mjs "temp/book-review/<slug>-<MMDD>"
# 输出 ending-metrics.json(章节完整性+伏笔回收率) / ending-review-pack.txt(结局AI书审材料) / blindtest/(前三章脱敏盲测)
npm run test:ending-audit   # 检测器自身回归
```

要点：`integrity.complete=false`（章空洞/末章截断）是工程层问题先归因；伏笔 `resolutionRate`
与 main 级未回收清单是内容层结论——**结局书审读 ending-review-pack.txt 按 rubric 出 S1-S4
Findings，与第 4 步逐章通读合并汇报**；盲测按 blindtest/README.txt 协议请人工评审执行，
结果回填阶段总结。

预检指标口径：引号/直引号/章界复述应恒绿（管线已兜底）；**段落 CV<0.15、CBN 无终止符、
AI 词频**是要人工结合语境看的信号不是 blocker。

## 第 4 步：定向取证 + 命运矛盾 AI 裁决 + AI 通读审查

先跑取证脚本把跨章状态矛盾坐实到原文（输出 UTF-8 文件用 Read 读，别走控制台）：

```bash
node .agents/skills/storyflow-release-loop/scripts/bookreview-extract.mjs "temp/book-review/<目录>"
```

覆盖：回档嫌疑对的「上章尾 vs 下章头」拼接、重点角色出场图谱、数字/名称漂移线索、
读者评分分布（从 closed-loop.summary.json 的 readerEvaluation 取 min/p10/p25/median）。

triage 出现 `fate.contradiction-candidate` 时（或组装出书审目录后主动跑一次），
用 AI 裁决脚本对「台账终端命运 × 后文提及」逐条终审（真复活/回忆/剧情解释/台账误登）：

```bash
node .agents/skills/storyflow-release-loop/scripts/fate-adjudicate.mjs "<matrix目录>/<providerId>/<project-store>.json"
# 输出 temp/fate-adjudication/adjudication-<MMDD>.json：verdict + 置信度 + 原文引用
```

`real-resurrection` 结论直接进书审 Findings S1（带引用）；`flashback/explained` 记
已核实不算；`ledger-error` 说明提取合同仍有漏误，归因到 FactExtractor 契约执行。

然后逐章通读 outlines.txt 全部 + **正文全部章节逐章通读（2026-09-15 用户指令：强制，
不得以确定性扫描或抽样替代）**。r4 实证：抽样+命运裁决口径的「S1=0」被全文通读推翻——
口径类断裂（名词典/时序/数字/生死口径横跳）只有逐章人读才暴露。执行方式：并行 spawn
4 个通读 agent 各读 1/4 章段（每 agent 给书审目录+命运线核对清单+rubric），主会话汇总；
汇总报告落盘书审目录 QUALITY-REPORT.md。按 story-review rubric 出 Findings(S1-S4)。
维度：钩子链衔接、爽点兑现、人物一致性、跨章事实与命运状态、章界重演核实、设定复述、
大纲禁区遵守、数字口径漂移、**口径类专项（官职/品级/袍服/年号/关押地/粮价等数字与称谓
的全局一致性——r4 的最大 S1/S2 来源）**。
区分三档结论：终稿实锤 / 过程告警已兜住 / 需再取样核实。
上线判定口径（2026-09-15 对齐）：S1=0 + S2 收敛到批量可修口径类 + 读者裁判达线即可评估
上线；S3 观感级（套路同构/AI 腔词频）记入日常迭代，不阻塞上线。

### Findings 台账（2026-09-23 起每轮强制，替代散文 QUALITY-REPORT 的判定职能）

通读汇总后，除 QUALITY-REPORT.md（给人读）外必须产出结构化台账，落
`docs/quality-ledger/findings/<轮次>-<矩阵tag>.json`（入 git；temp/book-review 3 天裁剪，
放那里跨轮收敛会断档），然后：

```bash
node .agents/skills/storyflow-release-loop/scripts/findings-ledger.mjs validate docs/quality-ledger/findings/<文件>.json
# → temp/findings-ledger/<文件>.verdict.md：schema 错误 + 计算判定 READY/NOT READY + 阻断项
npm run findings:converge
# → docs/quality-ledger/CONVERGENCE.md：跨轮分类收敛矩阵 + 升级信号（见第 5.5 步）
npm run test:findings-ledger   # 台账工具自身回归
```

schema（`findings/v1`，字段口径以 `scripts/findings-lib.mjs` 为准）：

```jsonc
{
  "schemaVersion": "findings/v1", "round": "r10", "book": "书名",
  "reviewedAt": "ISO时间", "matrixDir": "temp/storyflow-matrix-xxx", "chapters": 200,
  "review": { "method": "full-read-4ch", "chaptersRead": 200,
              "writerModel": "...", "reviewerModel": "...", "independentReviewer": false },
  "gates": { "precheckRedlines": 0, "fateRealResurrection": 0,
             "readerJudge": { "outline": 0, "mean": 0, "median": 0, "min": 0, "independentFromWriter": false },
             "ending": { "complete": true, "mainUnresolved": 0, "closureSignals": 1 },
             "humanIntervention": [],   // 无干预也必须显式写 []
             "blindTest": null },       // "pass" | "fail" | null
  "findings": [{
    "id": "r10-S1-01", "severity": "S1", "class": "state.custody",
    "status": "final",                 // final 终稿实锤 | caught 过程已兜住（不计数）| needs-verify（阻断）
    "rootLayer": "blueprint",          // outline|blueprint|extraction|judge|writer|model|infra|unknown
    "chapters": [139, 143], "entity": "崔显",
    "summary": "一句话", "evidence": [{ "chapter": 143, "quote": "正文原句" }],
    "replayCase": "r10-S1-01"          // S1 必建回放用例（第 6 步第 0 级）
  }]
}
```

硬规则：
- **class 只能取固定分类表**（`FINDING_CLASSES`，只增不改名）；确属新形态先归最近类，
  必须新增时同步改 findings-lib.mjs 与本节。`other` 在下一轮前必须清零。
- **终稿 S1/S2 必须附 `{chapter, quote}` 原文证据**，否则 validate 报错。
- **caught（过程已兜住）不是 Finding**：trace 里被重写修掉的告警不计入 S1/S2，也不能把
  终稿问题降档成 caught 来清零——判定只认 final。
- **审法必须如实声明**：只有 `full-read`/`full-read-4ch` 且 chaptersRead=chapters 才能得出
  S1=0；抽样轮写 `sampled`，其计数不进收敛比较。
- 同源审稿（independentReviewer=false）只出警告不阻断；**终验轮建议审稿 agent 与读者裁判
  换独立模型**（是否改为硬门禁待用户拍板）。

**严重度锚定样例**（判档有分歧时对照，均取自历史全读轮终稿实锤）：

| 档 | 判据 | 锚定样例 |
|---|---|---|
| S1 | 读者可感知的事实矛盾/结构断裂，会弃书或骂吃书 | r7 周文彬 ch188 枭首 → ch190 活着被劫出；r8 崔显下狱后三章自由理政无释放交代；r8 主角假死后 48 章零登场、结局按真死追尊；r7 章内「3200 锭×50 两×16 箱」写成「八万两」 |
| S2 | 局部口径漂移，细读可察觉但不毁主线 | r8 顾宪诚首辅/次辅横跳（同章并用）；r7 押地诏狱↔刑部移监缺桥；设定数字（兵力三千/三万）前后不一 |
| S3 | 观感级，不构成事实错误 | AI 腔词频（此刻/缓缓）、勘验动作重复、段落 CV 偏低 |
| S4 | 优化建议 | 可加强的物证细节、节奏建议 |

判档口径：同一问题跨多章出现按最严重一处定档；「过程告警已被重写修掉」不定档（caught）。

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
| 误报6 | 只要/便会型条件句 | 「只要统领手腕稍一用力，顾衡的头颅便会当场落地」(刀架脖颈未死) | 假设标记补 只要\|便会(双侧同源)；误报致死进状态摘要→下章 fact_conflict 连拒 5 次→stalled 中止 14/100，triage 会误判 model-capability，先查章记忆提取层 |
| 结构 | 误报终态在实体上持久残留 | 命运表已熔断清空、评审仍读到 死亡 | overlayCharacterFates 清除"不在命运表+有后生活动"的残留状态（读取侧不变量：活人不能带死状态） |
| 结构2 | 死亡终态被三路洗白（轻态覆盖/解除误擦/越狱熔断） | 严开礼 ch179 撞柱气绝入账死亡→ch187 越狱 delta 被 drop-pass 当"后生活动"熔断死亡→ch195 下狱重登；叠加 overlay"保守跳过"让判官全程只读到旧"下狱"，ch186 复活越狱一次过审（2026-09-12 g38f 200 章实证） | 死亡族三重保护(轻态不覆盖+解除delta不生效+解除词共现不擦) + drop-pass 状态转移(越狱/获释族)不算活动 + overlay 死亡优先级顶掉残留轻态 + collectFateForbiddenZones 接线(此前零调用死代码) + fate-adjudicate 死亡条目取最早优先裁(不被终态视图顶掉) |
| 结构3 | 防线生效后无恢复环→"响亮成洞"；新守卫误报→fail-closed 拖死整轮 | r4 双向实证：齐王 ch136 下狱、ch187 过期节点令其率兵攻午门，判官按命运禁区五连拒成洞（防线对但纯重试修不好）；首轮启动时截断残句守卫误杀「拍在督粮官眼前。」类介词完整句，大纲展开修复轮被两条"模型眼里没病"的误报拖死 4 分钟即败 | ①蓝图再生接入闭环 harness 与补写路径（此前只在 App useBatchWriter），记账谓词扩展"触发禁区/fact_conflict"归因蓝图；②新守卫词集必须带"完整句负例"测试（介词引导方位句/谓语句尾不判悬垂）；③洞后可走 storyflow-repair-empty.mjs 定点补写（ch187 实测二次过审且合规） |

同族守卫：triage 死亡扫描的求刑守卫（「斩杀X以谢天下」）、解除词表保释/候勘系、
解除章覆盖语义；伏笔防线的蓝图词面校验（findLockedForeshadowViolations，2-gram 覆盖）
+ roll 修复回路接入。超时预算公式 `章数×2min+60`（200min 级全量实测校准）。

### 权限边界（扩展清单版，护栏照旧）

免打扰自动修+留痕：infra 重试分类、解析软兜底、prompt 措辞强化、triage/precheck 规则回写、
防线归一化守卫、测试/脚本自身 bug、**顺带的结构小修**（如 memory 字段规范化）。
必须停下问用户：reviewer 判定 schema、质量门阈值与任何「让指标变绿」式改动、大纲合同
生成规则（含滚动续纲过期节点 reconcile）、运行时 CV/AI味自动重写触发器、上章不可回退
确定性断言(B1)、裁判硬门禁数值冻结。

## 第 5.5 步：升级判定（每轮修复前必做，决定本轮修什么）

`npm run findings:converge` 后读 `docs/quality-ledger/CONVERGENCE.md` 的升级信号，
**信号优先于逐条 Findings 修复**——逐形态补防线是过去多轮「一直修修补补」的根因：

| 信号 | 含义 | 本轮动作 |
|---|---|---|
| `persistent-class` | 同一类连续 2 个全读轮出现 S1，上轮针对它的修复无效 | 禁止再对该类加同层补丁；改机制（该类属 state.* 时走统一状态账本，见 docs/unified-state-ledger.md） |
| `upstream-root` | 最新全读轮 S1 过半根因在大纲/蓝图层 | 本轮不加写作侧/判官侧防线，修复预算全部投大纲/蓝图层（其规则改动按权限边界先报用户） |
| `shape-shift` | 最新轮 S1 过半是新类 | 暂停逐形态修复，先归纳共性根因再动手 |
| `unverified-zero` / `review-downgrade` | S1 归零但审法或规模不可比 | 不得宣布收敛；下一轮同口径全读复核 |

没有信号时按第 5 步四分诊正常修复。每条修复必须能指向 Finding id，修完在第 6 步第 0 级
用对应回放用例证明。

## 第 6 步：三级真实回归

第零级（每次修复后先跑，分钟级）：**章节回放**。把 S1 固化为回放用例——取成书
project-store 截断到「写第 N 章之前」，用当前代码只重跑 N..N+W-1 章（走
runContinueWriteChapters，与矩阵同一入口），再由 AI 探针判定缺陷是否复现。
200 章才暴露的后半本问题（在押回潮、皇统过渡）不必等 1000 分钟重跑，20 章快速回归
也复现不了它们。

```bash
# 建用例：spec 写文件（中文探针走文件，规避命令行编码），字段见脚本头注释
node scripts/storyflow-replay-chapter.mjs make --spec temp/replay-specs/<id>.json
# 跑单个 / 全部用例（默认每用例 2 个样本，样本间从同一快照重开）
npm run replay:chapter -- run <id> --samples 2
npm run replay:chapter -- run all
# 结果：temp/replay-cases/<id>/runs/<时间戳>/result.json + 各样本正文 sN-chNNN.txt
#       temp/replay-cases/_last-suite.json 汇总
```

spec 写法要点：`fromChapter` 取缺陷首次出现章（跨章缺陷往前取到状态成立后一章，
`window` 覆盖到暴露章）；`probe.context` 只写回放起点前已成立的台账事实，
`probe.question` 必须是「是 = 缺陷复现」的问题，并把合理交代（释放/越狱/回忆）排除在外。
判定：`pass`=所有样本未复现且全部提交；`recur`=任一样本复现；`hole`=未复现但有章未提交
（修复把问题变成了成洞，同样不算修好）。已知快照差异（人物表与后续蓝图为终局版本、
已回收伏笔按计划章回退）由执行器打印，读结果时考虑。

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
- 书审：<审法 + S1 xN / S2 xN / S3 xN 一句话各>（只列终稿实锤；caught 另列不计数）
- 台账：<findings.json 路径 + validate 计算判定 READY/NOT READY + 阻断项>
- 升级信号：<converge 输出的信号及本轮据此选择的修复方向>
- 根因：<提取断供/守卫缺失/措辞缺口…对应文件:行 + Finding id>
- 修复：<文件+一句话+测试结果>
- 待批：<暂停点类事项清单及建议>
- 回归：<回放用例 pass/recur/hole + 两级矩阵结果/diff 摘要>
- 下一步：<继续 / 终验 / 停止原因>
```

「可上线」只能引用 validate 的计算判定，不得在报告里自行宣布。

## 本机环境噪音（见到不当故障）

- CMD 无 unix 工具、中文必乱码：复杂检查一律落 .mjs 落盘执行，报告用 Read 读 UTF-8 文件
- findstr 多模式用多个 /c:""；grep 语法的 \| 在 findstr 是字面量
- tsc TS6305/SQLite ABI main 侧测试失败=存量噪音；better-sqlite3 双 ABI 由 pretest 与
  ensure-electron-sqlite-abi 自动管理
- reader judge 未配独立第二模型时 independentFromWriter=false + self-evaluation-fallback
  黄签是预期行为（作者=裁判同通道时如实标记）
