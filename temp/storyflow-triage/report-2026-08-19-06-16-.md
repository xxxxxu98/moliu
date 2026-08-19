# Storyflow 冒烟质量报告

- 生成时间：2026-08-19T06:16:10.704Z
- 数据源：D:\project\2026\moliu\temp\storyflow-matrix

| 模型 | 工程结果 | 判定 | 章节 | 首过率 | 读者大纲分 | 读者章节均分/最低 |
|---|---|---|---:|---:|---:|---:|
| gemini-3.6-flash-high | 通过 | passed-with-repairs | 20/20 | 95% | - | -/- |
| gemini-3.7-flash-high | 通过 | passed-with-repairs | 20/20 | 85% | - | -/- |

## gemini-3.6-flash-high

质量问题/空响应均被章内压缩或重试兜住，最终通过

| 级别 | 签名 | 章节 | 次数 | 证据 |
|---|---|---:|---:|---|
| 黄 | model.empty-response | - | 25 | trace storyflow-provider-1787044972770-reader-1787116049928.jsonl seq1 reader-outline-judge 响应 2 字符 |
| 黄 | reader.evaluation-error | - | 25 | 大纲读者评审失败：[
  {
    "origin": "number",
    "code": "too_big",
    "maximum": 1,
    "inclusive": true,
    "path": [
      "confidence"
    ],
    "message": "T |
| 黄 | quality.review-other | 1 | 1 | 【改为】正文必须情节兑现该节点，不可只在内心独白里带过。 |
| 黄 | quality.review-other | 3 | 1 | 【改为】正文必须情节兑现该节点，不可只在内心独白里带过。 |
| 黄 | quality.node-unfulfilled | 3 | 1 | 未履约节点：陆远当场揭穿陈升贪墨三万两饷银的真实去向 |
| 黄 | quality.review-other | 10 | 1 | 段落节奏均匀化：15 段平均 203 字、变异系数 0.10，长短段缺乏交错。关键台词/冲突爆点独立成短段，铺垫叙述用长段；多人对话每个说话人单独成段 |
| 黄 | quality.node-unfulfilled | 10 | 1 | 未履约节点：获得徐宏全力支持并拿到粮饷账册调阅权 |
| 黄 | quality.node-unfulfilled | 18 | 1 | 未履约节点：徐宏在首辅前力保陆远。 |
| 黄 | quality.dialogue-quotes | 18 | 1 | 对话未使用中文引号：4 处提示语后直接接台词，全章没有一对引号。人物说出口的台词一律用成对中文引号“”包起来；换人说话另起一段（证据：崔明按刀凑上前凝视着油纸上的签押，脸色阴沉如铁："上面盖着户部清吏司私印，还有陈升手下账房的暗号！周林这帮人杀了大理寺档头，还想把脏水泼到死人身上。"李松也急切） |
| 黄 | quality.review-other | 18 | 1 | 段落过密：超长段 0 个，长段占比 60%，最长 420 字。请调整分段：每段约 3～5 句、180～280 字；优先合并过碎短段；对话换人换行；忌整章大段与一句一段 |

## gemini-3.7-flash-high

质量问题/空响应均被章内压缩或重试兜住，最终通过

| 级别 | 签名 | 章节 | 次数 | 证据 |
|---|---|---:|---:|---|
| 黄 | model.empty-response | - | 25 | trace storyflow-provider-1787039781123-reader-1787116519266.jsonl seq1 reader-outline-judge 响应 2 字符 |
| 黄 | reader.evaluation-error | - | 25 | 大纲读者评审失败：[
  {
    "origin": "number",
    "code": "too_big",
    "maximum": 1,
    "inclusive": true,
    "path": [
      "confidence"
    ],
    "message": "T |
| 黄 | infra.transient.etimedout | - | 3 | Error: connect ETIMEDOUT |
| 黄 | quality.words-overlimit-survived | 3 | 1 | 压缩后仍 3688/3540，保留压缩稿 |
| 黄 | quality.words-overlimit | 3 | 1 | 当前 3688 / 上限 3540 / 目标 3000 |
| 黄 | quality.review-other | 13 | 1 | 【改为】正文必须情节兑现该节点，不可只在内心独白里带过。 |
| 黄 | quality.dialogue-quotes | 13 | 1 | 对话未使用中文引号：4 处提示语后直接接台词，全章没有一对引号。人物说出口的台词一律用成对中文引号“”包起来；换人说话另起一段（证据：赵元极猛地抬头，指着沈淮厉声怒骂："无耻小贼！你身为文书抄录，常年接触河工勘合，正是你勾结外间不法奸商，伪造假提单分批蚕食！大理寺严刑拷打钱庄账房，屈打成招得来） |
| 黄 | quality.review-other | 20 | 1 | 【改为】正文必须情节兑现该节点，不可只在内心独白里带过。 |
