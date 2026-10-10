# 统一实体状态账本（方案）

> 状态：**第 0 阶段（2026-09-23）、第 1 阶段（2026-09-25）、第 2 阶段第一切片（2026-09-25）已落地，第 2 阶段验收与其余阶段待评审**。全部落地后按 `docs/README.md` 维护约定并入正式文档并删除本文。
> 推进 north-star 哪一层：人物状态连续性（死人不复活、在押不自由、革职不理事、人不瞬移）。
> 对应 findings 分类：`state.fate` / `state.custody` / `state.title` / `state.identity` / `state.location`。
> 触发来源：`docs/quality-ledger/CONVERGENCE.md` 升级信号 `persistent-class`（r10 双读后为 state.title、state.custody、state.location 三族持续）。

---

## 1. 为什么要换机制

r4 到 r9 每轮都在给同一族问题打补丁：命运锁、押地账、头衔锚、身份锚、假死在册、禁区文案、提取契约 8/8b/11……补丁越来越多，同类 S1 仍反复出现。章节回放把这件事坐实了。

**实证：r8-S1-05 回放复现（2026-09-23，当前代码）**

- 顾宪诚第 113 章入账「下狱」，第 134 章正文写明「押回相府看管」。
- 用当前代码（含 r9 全部修复）从第 142 章起重写，正文仍让他以「内阁次辅」身份、穿仙鹤补服自由出现在宫内穿堂。回放探针判定复现，置信度 high。
- 起草第 142 章前，命运表里**没有顾宪诚**，禁区自然不会拦。擦掉他在押状态的是两处确定性代码：
  1. 第 119 章记忆里有「崔显磕头领命**戴罪**效力」，说的是崔显。但同章文本也提到顾宪诚，`FATE_RELEASE_PATTERNS` 按**整章共现**匹配，把顾宪诚的「下狱」一起解除了。代码注释写的是「只救它提到的人」，实现并没有做到。
  2. 第 134 章的看管被提取成 `押地:相府书斋`。押地不属于命运态，不能重新建立在押；同章的「防……趁乱**劫狱**」是否定语境，又命中一次解除词。

结论：问题不在「少了哪条锚」，而在于**同一个事实（此人是否在押）散落在多个通道里，各通道的判定互不相认，其中还有正则在做语义判定**。继续加锚只会增加通道数。

## 2. 现状盘点

| 通道 | 数据来源 | 判定方式 | 有无转移规则 | 消费方 |
|------|----------|----------|--------------|--------|
| 命运 `collectCharacterFates` | `state` ∈ 死亡/驾崩/下狱/定罪/去职 | 取最晚值；AI 解除值删除；~~正则章级共现解除~~（第 0 阶段已删） | 仅死亡不可逆 | overlay、禁区、滚纲命运锁、triage |
| 命运禁区 `collectFateForbiddenZones` | 同上 | 模板文案 | 无 | 写手、判官提示词 |
| 押地 `custody` delta | `押地:X` 前缀字符串 | ~~只记录无消费方~~ → 第 0 阶段起作为在押证据并入命运表 | 半套（不校验转移事件） | 命运表、禁区 |
| 头衔 `collectCharacterTitles` | `头衔:X` 前缀字符串 | 取最晚值 | **无**（去职后复现头衔不校验） | overlay |
| 身份 `identity` | 角色卡首句；揭晓 delta `身份:` | 角色卡为正典；只有 `reveal-identity` 才替换 | 揭晓才改公开身份 | 状态卡 |
| 假死 `collectFakedDeathCharacters` | `假死` / `揭晓` | 在册/揭晓 | 半套 | 滚纲、SceneDraft |
| 纪年 `eraLedger` | 提取侧 `era-fact` | 首次年号为正典；~~正则召回~~（2026-10-10 已删） | 年份只向后；异名须改元标注 | 写手、判官 |
| 数字 `collectNumericAnchors` | 记忆文本 | **正则召回** | 无 | 写手提示词 |

## 3. 根因

1. **没有单一真相源**。同一人的「在押」同时存在于命运、押地、头衔、禁区四处，任何一处被擦掉或漏记，其余通道都不会纠正它。
2. **语义判定落在正则上**，违反规范 §9.4。`FATE_RELEASE_PATTERNS` 决定「这个人是否被释放」，这是语义问题；纪年和数字锚用正则召回，无法区分叙述、引语和否定。
3. **只有命运族有转移规则**。押地变更不要求当前在押；头衔在去职后重新出现不要求复职事件；下狱→越狱可以无限循环（r7、r8 中赵恒、周文彬各循环 4-5 次）。
4. **事件有而账无**。r7 周文彬第 188 章枭首，章记忆零死亡入账。契约 8b 靠提示词自检，没有确定性兜底。
5. **属性用字符串前缀编码**（`头衔:`、`押地:`），和命运值共用 `state` 字段，每个消费方各自解析。
6. **章号口径不一致**（第 0 阶段已修）。章记忆 `chapterIndex` 实为 1 基（两条写入路径都传章号），但命运禁区文案、纪年/数字锚、滚纲命运锁、假死在册、`StoryRuntimeClient` 的 legacy 事件、`fate-adjudicate`、`storyflow-triage` 都按 0 基再 `+1`。结果是写手和判官看到的「已于第 N 章下狱」整体晚一章：刚入账的事件被说成「已于本章」。
7. **提取契约只增不减**。每次事故往 FactExtractor 提示词追加一条带日期的条款，契约已到 1-15 加 8b，模型注意力被稀释。

## 4. 目标模型

### 4.1 账本条目

账本按「实体 × 属性」记录，每次变化追加一条，不覆盖：

```ts
/** 账本属性：每个属性一条独立时间线 */
type LedgerAttribute = 'vital' | 'custody' | 'custodyPlace' | 'office' | 'identity' | 'location';

/** 转移类别：由提取侧 AI 规范化给出，确定性代码只认枚举值 */
type TransitionKind =
  | 'death' | 'faked-death' | 'death-revealed-fake'
  | 'arrest' | 'release' | 'bail' | 'escape' | 'recapture' | 'transfer'
  | 'dismiss' | 'appoint' | 'restore'
  | 'reveal-identity' | 'move';

interface LedgerEntry {
  entityId: string;
  attribute: LedgerAttribute;
  value: string;              // 例：vital=alive|dead|faked-dead；custody=free|held|bailed|fugitive
  fromChapter: number;        // 1 基章号，全链路唯一口径
  transition: TransitionKind;
  evidence: { chapter: number; quote: string };
  source: 'extractor' | 'adjudicator' | 'migration';
}
```

第 N 章的状态快照 = 所有 `fromChapter < N` 的条目按属性折叠后的最新值。写手、判官、滚纲、蓝图都只读这一份快照。

### 4.2 属性取值

| 属性 | 取值 | 说明 |
|------|------|------|
| vital | alive / dead / faked-dead | 驾崩归 dead，另记 `office` |
| custody | free / held / bailed / fugitive | bailed 覆盖「保释、候勘、闭门待勘」等中间态 |
| custodyPlace | 关押地全称 | 仅在 custody=held 时有意义 |
| office | 官职/爵位全称，或 `none` | 替代 `头衔:` 前缀 |
| identity | 公开身份 | 化名、身份揭晓 |
| location | 所在地 | 用于瞬移检测，第一期可不启用 |

纪年与数字不是「实体属性」，放第 4 阶段的书级事实账（见 §7），不进本账本。

## 5. 转移规则

合法性由确定性状态机校验，这属于格式层判定：它只检查「某个 transition 枚举能否作用于当前值」，不读正文语义。

| 属性 | 当前值 → 新值 | 必需 transition | 否则 |
|------|---------------|-----------------|------|
| vital | alive → dead | death | 违规 |
| vital | dead → 任意 | 无（不可逆） | 违规，交仲裁（真复活或提取误报） |
| vital | faked-dead → alive | death-revealed-fake | 违规 |
| custody | free → held | arrest / recapture | 违规 |
| custody | held → free | release | 违规 |
| custody | held → bailed | bail | 违规 |
| custody | held → fugitive | escape | 违规 |
| custody | fugitive → held | recapture | 违规 |
| custodyPlace | 变更 | transfer，且 custody=held | 违规（押地变更隐含在押；未在押先报缺口） |
| office | X → none | dismiss | 违规 |
| office | none → Y | appoint / restore | 违规 |

另外两条跨章规则：

- **循环计数**：同一实体 held↔fugitive 往返超过 2 次，产出 `structure.repeat` 信号给滚纲，不拦章。
- **事件有账无**：提取出的 events 摘要里有死亡、下狱、去职类完成体，但同章没有对应条目，记为 `ledger-gap`。是否真缺账交 AI 仲裁；正则只用于召回候选。

违规和缺口都**不在本地放行或拦截**，统一进入仲裁：复用 `fate-adjudicate` 的结构化仲裁框架，AI 结合证据句判定「提取误报 / 正文矛盾 / 合法但缺转移事件」，结果以 `source: 'adjudicator'` 追加条目。

## 6. 读写两侧

**写侧（章后）**

1. FactExtractor 的契约 8、8b、11 和押地账合并为一张「状态转移表」契约：每条 delta 必须给出 `attribute + value + transition + evidence`。条款数减少，不再按事故追加。
2. 账本追加条目，状态机校验，违规和缺口进入仲裁。
3. 仲裁结论回写账本；正文确有矛盾时，按现有返修路径回到写手。

**读侧（章前）**

1. `snapshotAt(N)` 生成一张状态卡：在押名单（含关押地）、已死名单、革职名单、假死在册、身份表。
2. 状态卡替代现有 `overlayCharacterFates`、`overlayCharacterTitles`、命运禁区、身份锚、假死在册这五路注入。
3. 判官拿到同一张卡。候选召回（本章出场的在押、已死人物）可以用名字匹配，出场形态是否违规交判官判定。

## 7. 分阶段落地

每一阶段都以回放用例为验收：`r8-S1-04`（崔显）、`r8-S1-05`（顾宪诚）、`r8-S1-06`（赵恒）、`r7-S1-03`（周文彬）。命令为 `npm run replay:chapter -- run <id>`。

### 第 0 阶段：止血（✅ 2026-09-23 已落地）

- 删除 `FATE_RELEASE_PATTERNS` 章级共现解除，解除只认 AI 规范化值（契约 11 已覆盖获释、越狱、复职、平反）。
- 契约 11 增加「保释族」规范值（保释、候勘、闭门待勘→「保释」），加入 `FATE_RELEASE_STATES`；同时要求逆转 delta 只登给逆转句主语本人，否定、假设、防范语境不算既成逆转。
- `押地:X` 视为在押证据：已在押者刷新关押地，去职或无命运者重建在押，死亡族不动，同章有解除时不反向重锁。禁区文案带「现押于X」。押地也不再被当作「后生活动」去熔断死亡。
- 统一 `chapterIndex` 为 1 基章号：命运禁区、纪年锚、数字锚、情节进度表、滚纲命运锁、假死在册、runtime legacy 事件、`fate-adjudicate.mjs`、`storyflow-triage.mjs` 都去掉多余的 `+1`。
- 回归结果：
  - vitest 全量 1120 条通过，新增双向样本（「崔显戴罪效力」不解除同章顾宪诚；平反、保释 delta 仍能解除）。
  - triage 新增「死亡次章即出场必须命中」用例。旧口径会把死亡后的下一章当成死亡章本身，这一章的出场就漏检了。
  - `r8-S1-05` 回放 recur 1/1 → pass 0/2：一个样本写成押解中，另一个写成软禁在相府书斋。
  - 全部 5 个回放用例各 1 样本均 pass。注意 `r7-S1-03` 的 pass 是剧情分叉（重写后周文彬判了斩立决但未行刑），不证明「事件有而账无」已修，仍归第 3 阶段。`r8-S1-06` 重写中赵恒「开释回府闭门思过」后深夜过访齐王府，不属于用例缺陷，但可能是 S2 口径松动。

遗留风险：删正则后，若提取漏报合法解除，角色会被多锁一段。下一轮书审需关注「合法获释后仍被当在押」类的 S2。

### 第 1 阶段：影子账本（✅ 2026-09-25 已落地）

- 实现：`scripts/state-ledger.mjs`（迁移 + 状态机 + 快照 + 影子差异报告），测试 `npm run test:state-ledger`（11 用例，覆盖 4 个回放用例形态 + r10 实证形态）。
- triage 接线：`ledger.violation-candidate` / `ledger.gap-candidate` / `ledger.legacy-diff` 恒黄候选（不参与 verdict 分级），终审归 fate-adjudicate / 书审 AI。
- r10 两书实证：A 书命中 ch170 周豹枭首 / ch198 萧成昭伏诛两个死亡零入账缺口（r10a-S1-08 根因层）与崔元朗 legacyDiff（r8-S1-05 形态）；B 书命中周元朗在押↔逃亡 3 次往返 structure.repeat 信号。噪音经验：custody 幂等重复登记保留为候选（真实双登记形态）；office 幂等双去职豁免；越狱后再「下狱」迁移保真为 recapture。

### 第 2 阶段：读侧接管（🟡 第一切片 2026-09-25 已落地，验收待回放+回归）

- 已落地：TS 正典实现 `src/renderer/src/services/writing/stateLedger.ts`。**2026-10-10 起默认开启**（`MOLIU_STATE_CARD=0` 退回旧通道）。开启时：状态卡替换命运正典块；禁区、runtime 实体命运/头衔（`applyLedgerSnapshotToEntities`）、假死名单、公开身份都读同一份快照。起草提示词里的终态禁令、头衔锚、假死纪律、身份锚在状态卡在场时不再各出一块。
- 公开身份：角色卡首句是正典。只有更早章节带 `reveal-identity` 的揭晓才替换。未标揭晓的「身份:」字符串不入账。判官与写作侧读同一份状态卡。
- 未做（验收前须补）：4 个回放用例验收、20 章快速回归对照。
- 验收口径（原目标）：4 个回放用例全部 pass，20 章快速回归 S1=0，且 `state.*` 类 S2 不高于基线；状态卡替代五路 overlay 注入。

### 第 1 阶段：影子账本（原规格存档，已按上节落地）

- 新增纯函数 `buildLedgerFromMemories(memories)`，把现有 `state` 字符串（含 `头衔:`、`押地:` 前缀）迁移成条目，`source: 'migration'`。
- 生产链路不接管，只在 triage 和 book-review 中输出「账本快照 vs 现有锚」差异报告，以及违规、缺口清单。
- 验收：在 4 个回放用例的起始章上，快照给出正确状态（顾宪诚在押、崔显在押、赵恒革职、周文彬死亡）。周文彬死亡零入账，影子期应报为 `ledger-gap`。

### 第 3 阶段：写侧契约重构

- 2026-10-10 起读侧认提取枚举：`StateDelta.transition` / `CharacterStateChange.transition`。账本仅在枚举与 `state` 同一族时采用（在押可标 `recapture`；公开身份揭晓只认 `reveal-identity`）；对不上的枚举丢弃，旧字符串记忆照旧迁移。
- 未做：把契约 7–14 收成一张短表并退役旧锚函数。那些条款是历次漏账反例，未做整书对照前不删，避免提示词一短就回到「事件有而账无」。契约 20 只追加身份揭晓，不替换 7–14。
- 验收仍是：100 章终验里 `state.*` 类 S1、S2 为 0。

### 第 4 阶段：书级事实账（纪年、数字）

- 数字正典已落地（2026-10-10）：同一对象首次确立的数值为准，只有勘误标注才覆盖。`collectNumericAnchors` 已退役。
- 纪年结构化路径已落地（2026-10-10）：提取侧 `era-fact` 写入 `Project.eraLedger`。首次年号是正典，同一年号的年份只向后走，另一个年号只有 `revision: "correct"`（正文写出改元）才替换，并在注入行里保留旧年号。起草和判官只读 `formatEraAnchorLines`。
- `collectEraAnchors` 与中文年份正则已删除。账为空时起草走「未确立年号」，禁止发明年号。
- 验收仍是：100 章终验里 `time.era`、`number.ledger` 为 0。

## 8. 与收敛循环的衔接

- `findings-ledger.mjs converge` 里 `state.*` 各类的逐轮计数，是本方案是否见效的唯一口径。
- 每次在本方案范围内修复，都必须先有回放用例复现，修完回放转 pass，再跑快速回归。
- 如果第 2 阶段后 `state.*` 仍出现 `persistent-class` 信号，说明问题在写手遵循度而非账本，转向评估换模型或加强判官，不再往账本上补规则。

## 9. 待决问题

1. 第 1 阶段影子账本何时启动（建议下一轮 20 章快速回归之后）。
2. `location` 瞬移检测是否纳入第一期。r8 的 `state.location` 已持续两轮，但误报风险较高。
3. 账本持久化位置：放 `project.json` 的新字段，还是只在 runtime SQLite。建议放 runtime，project 只存迁移源，避免双写。
