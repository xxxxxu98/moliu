## 实施方案：修复 P0-P2 大纲与续写质量问题

基于三轮 Explore agent 的代码定位 + 关键文件逐行确认，方案如下。用户已选定：**P0 单次合并产出单章蓝图**、**P2 新增结尾判断器 AI 调用**。

---

### P0-A：让 AI 单次产出 30 章单章蓝图（核心，解决标题/CBN/CPN/CEN/mustCover 根因）

**① `expand-direction-prompt.ts`（加单章蓝图段）**
- 在 `## 前30章启动包`（:205-264）之后、`## 主要支线`（:266）之前，插入新 section `## 单章蓝图`
- 每章子块（`### 第N章`）字段：`标题 / CBN / CPNs / CEN / mustCover / 禁区 / 章尾钩子 / 爽点类型`
- 调整第 5 条硬约束（:58 "不要展开成100章梗概"）措辞：明确"30章单章蓝图是必需输出，禁止的是整本目录展开到100章"
- 给出 2-3 个单章蓝图示例（与现有块级示例风格一致）
- 强调"标题必须是 6-16 字网文口语标题，禁止'第N章'纯序号"

**② `expanded-outline-parser.ts`（解析单章蓝图）**
- section 注册数组（:455-471）加 `'单章蓝图'`
- 取 body：`const chapterBlueprintSection = sections['单章蓝图']`
- 新写 `parseChapterBlueprintSection(section): ChapterBlueprint[]`，参考 `parseSellingPointSection`（:338）：用 `splitByHeading(section, /^###\s+第?\d+章?/gm)` 切子块，map 出 `{ orderIndex(从标题正则抽/index+1), title, summary(=标题或CBN), CBN, CPNs(extractMultiValueField '推进节点'), CEN, mustCover, forbiddenZones, hookType, hookText, coolPointType }`
- 产物挂到 `outline.chapterBlueprints`（空数组时给 `undefined`，保证向后兼容）

**③ `executable-outline.ts`（类型补字段）**
- `ChapterBlueprint`（:208-220）加 `hookText?: string`（章尾钩子文案，区别于 hookType 枚举）
- 加 `pacingStrategy?: string`（可选，蓝图自带的节奏策略）

**④ `executable-outline-adapter.ts` toChapters blueprint 分支（:586-622）**
- 补 `status: 'outline'`（对齐 algorithm 路径 :559）
- 补 `pacingStrategy: chapter.pacingStrategy ?? 'confront'`（默认值对齐 :575）
- `hook: chapter.hookText ?? chapter.hookType`（优先用钩子文案，而非把 hookType 枚举当文案）

**⑤ `unified-generator.ts` doRequestChatCompletion（:624-752）—— max_tokens 透传**
- `GenerateOptions`（:105-123）加 `maxOutputTokens?: number`
- expandDirection 调用（:390）传 `maxOutputTokens: 16000`（30章蓝图+块级，留足空间）
- 三 provider body 补字段：
  - Gemini（:655-658）：`generationConfig` 加 `maxOutputTokens: options.maxOutputTokens ?? config.generationConfig?.maxOutputTokens`
  - Anthropic（:701-707）：加 `max_tokens: options.maxOutputTokens ?? 16000`（Anthropic 必需，默认 4096 会腰斩）
  - OpenAI 兼容（:739-744）：加 `max_tokens: options.maxOutputTokens`

**⑥ `unified-generator.ts` expandDirection 截断检测（:398-408）**
- 现有 `severelyTruncated` 判断后，加蓝图完整性检测：`chapterBlueprints` 解析后若 `length < 28`（30章允许漏2章），视为蓝图残缺
- 残缺处理：`chapterBlueprints = undefined`（让 toChapters 回退 `splitStartupBlocksToChapters`），并记 warning（不阻断主流程，块级大纲仍可用）
- `inspectOutlineQuality`（outline-reviewer.ts:67）可选加一条 issue：蓝图未产齐

---

### P0-B：续写 chapterTitle 回写 plotOutline（解决落库标题永远"第N章"）

**`ChapterWritingPipeline.ts`（:715-723 persistence.replace 成功后）**
- 在 `await this.persistence.replace(...)` 之后，加 plotOutline chapter 节点 title 回写：
  - 通过 `chapterNumber - 1` 定位 `project.plotOutline` 中 `type === 'chapter' && orderIndex === chapterNumber - 1` 的节点
  - 若节点存在且 `isPlaceholderChapterTitle(node.title)`，调 `this.plotOutlineClient?.updateTitle(node.id, generatedShortTitle)`
- `shouldApplyGeneratedTitle` 条件不变（仅当原 title 是占位时回写），避免覆盖用户手改的标题

**Pipeline deps 扩展**
- `ChapterWritingPipeline` 的 deps/构造加可选 `plotOutlineClient?: { updateTitle(nodeId, title): Promise<void> }`
- 生产环境（useBatchWriter / smartContinue）：注入基于 `useProjectStore().updatePlotNode` 的实现
- harness（continueWriteHarness）：注入内存实现

---

### P1-A：applyOutlines 改合并式（解决覆盖丢 act/subplot）

**`useChapterOutlineGenerator.ts` applyOutlines（:443-479）**
- 改为合并式：
  - 取现有 `projectStore.plotOutline`，保留所有 `type !== 'chapter'` 的节点（act/subplot/foreshadow）
  - 对 `type === 'chapter'` 节点按 `orderIndex` 匹配：现有则更新字段（保留 id/chapterId/parentId），无则追加新节点
  - `projectStore.plotOutline = [...nonChapterNodes, ...mergedChapterNodes]`
- 唯一调用方 `WritingSetupWizard.vue:151` 行为更安全（不再清除 act/subplot），无需改调用方

---

### P1-B：buildAdvanceCbn 序号清洗（防御性，P0 后此路径主流程不走但 harness 重建仍走）

**`executable-outline-adapter.ts`**
- `buildAdvanceCbn`（:433-447）：从 `block.objective` / `block.coolPoints` / `block.mustEvents` 清洗开头的 `^第\d+章` 前缀（复用 chapterBlueprintNormalize 的 stripOpeningCbnPrefix）
- `splitStartupBlocksToChapters` 的 summary/description（:551-553）同样清洗
- 同步修复 `plotOutlineFromLocalProject.ts:110-161`（harness 重建路径）的同源问题

---

### P2-A：补写结尾判断器（解决章末注水）

**新建 ending-closure 判断**
- 新 schema `EndingClosureResult`（schemas.ts）：`{ closed: boolean, reason: string }`
- 新方法（LongFormWritingEngine 或独立 EndingClosureJudge）：`judgeEndingClosure(prose, CEN, mustCover[]): Promise<{closed, reason}>`
- prompt：判断正文是否已完整兑现 CEN 且有明确章尾钩子/收束感

**`LongFormWritingEngine.ts` supplementDraftsWhileShort（:352-470）**
- 循环开头（:367 `check.needsSupplement` 之后）插入：先调 `judgeEndingClosure`，若 `closed && 字数已达目标 80%+`，则 `break`（不再补写）
- 失败容错：判断器 AI 调用失败时降级为原逻辑（按字数补），不阻断

---

### P2-B：事实矛盾硬门禁（解决跨章人物生死矛盾）

**`ContinuityValidator.ts`（:291-298）**
- 严重性映射改为：`type === 'fact_conflict'` 无条件 `blocking`（不依赖 blockingDomains 配置）
- 其余 type 维持现有 blockingDomains 逻辑

**`AIChapterJudge.ts` prompt（:68-75）**
- `fact_conflict` 条目强化："跨章节存在性矛盾（上章已死/已离开的角色本章复活或活动、上章已销毁的物品本章出现）必须报 fact_conflict 且 severity=critical"
- 容错说明：误报不会完全卡死——`shouldRewrite`（LongFormWritingEngine:120-125）会触发重写，重写次数耗尽才拒绝提交

---

### 测试与自检（每项改完即验证）

**补单测（秒级，不打 AI）**
1. `expanded-outline-parser.test.ts`：`buildSampleOutline` 补单章蓝图 markdown 段 + 解析断言（title/CBN/CEN/mustCover 正确抽取）+ 老格式无蓝图段容错 it（chapterBlueprints 为 undefined）
2. `executable-outline-adapter.test.ts`：补 chapterBlueprints 分支 it（makeOutline 传 chapterBlueprints，断言 toChapters 产出 title/status/pacingStrategy/hook）+ buildAdvanceCbn 序号清洗 it
3. `expand-direction-prompt.test.ts`：补 it 断言单章蓝图段存在、第5条约束措辞调整
4. `ContinuityValidator` 测试：fact_conflict 无条件 blocking
5. 新建 ending-closure judge 测试（mock ai）

**自检流程**
1. 每改一个纯函数文件，立即 `npm run test -- <对应 test 文件>` 跑秒级单测
2. 全部纯函数绿后，`npm run test`（vitest run 全量）确保无回归
3. `npm run smoke:storyflow:real` 真实闭环回归（先在 storyflowClosedLoopHarness.ts:145,153 给 generateDirections/expandDirection 加 `trace: { runId: 'storyflow-outline-' + Date.now() }` 以便看大纲 trace）
4. 人工评估：检查 `temp/storyflow.closed-loop.outline.json`（每章 title/CBN/CEN 是否还带模板串）+ `temp/storyflow.closed-loop.prose/chNN.txt`（章末是否还注水、跨章是否还矛盾）

---

### 风险与回退

| 风险 | 缓解 |
|---|---|
| 单次产出 token 爆表（尤其 Anthropic） | max_tokens 透传 + 蓝图<28章残缺回退算法路径 |
| chapterTitle 回写的 plotOutlineClient 注入遗漏某入口 | 设为可选依赖，未注入时降级跳过（不影响续写主流程） |
| 事实矛盾硬门禁误报导致续写卡死 | 依赖现有 shouldRewrite 重试机制，重写耗尽才拒绝 |
| 结尾判断器增加每章延迟（+1次AI调用/补写轮） | 失败降级原逻辑；且只在 needsSupplement 时触发 |

### 改动文件清单（11 个源文件 + 5 个测试文件）
- 源：expand-direction-prompt.ts、expanded-outline-parser.ts、executable-outline.ts、executable-outline-adapter.ts、unified-generator.ts、ChapterWritingPipeline.ts、useChapterOutlineGenerator.ts、plotOutlineFromLocalProject.ts、LongFormWritingEngine.ts、schemas.ts（新增 EndingClosureResult）、ContinuityValidator.ts、AIChapterJudge.ts
- 测试：expanded-outline-parser.test.ts、executable-outline-adapter.test.ts、expand-direction-prompt.test.ts、ContinuityValidator 测试、ending-closure 新测试
- harness：storyflowClosedLoopHarness.ts（加 trace runId + plotOutlineClient 注入）