# smoke:storyflow:real 测试评估结论 + 修复方案

## 一、测试结果总览

全链路真实 AI 闭环（deepseek-v4-flash，提示词「现代社畜穿越古代朝堂」）运行 **1299 秒（21.6 分钟）**，大纲阶段全优，**第 1 章续写成功且正文质量出色**，但**第 2 章起失败**（"缺少第 2 章"）。根因为测试 harness 的 Pinia 篡改 bug，**非生产代码缺陷**。

## 二、各环节评估结论

### ✅ 大纲生成（direction + expand + review）— 优秀
- **方向生成**（86s）：3 个差异化方向（《账房谋国》92 / 《给皇帝写周报》88 / 《算法乾坤》85），卖点具体、长篇承载力分析到位、脑洞保留好。
- **大纲展开**（252s，26272 字）：故事定位、核心驱动、金手指、四幕结构、3 卷纲、30 章单章蓝图、10+ 角色、伏笔规划全部完整产出。
- **单章蓝图质量极高**：前 5 章 CBN/CPNs/CEN/mustCover/禁区逐章承接，标题口语化（"睁眼成了小账房""拿我当替罪羊？""假账上的水印"），章尾钩子有张力。
- **审查修正**（212s）：初稿质检发现问题，发起二次修正请求并成功。
- **开篇钩子**："一睁眼，手边搁着户部亏空账册。"（15 字，符合 ≤30 字硬约束）。

### ✅ 大纲应用与数据落盘 — 完整（一处轻微瑕疵）
- title/synopsis/volumes(3卷)/characters(12角色)/chapters(30章) 全部落盘。
- plotOutline 章节节点正确携带 CBN；前 5 章标题落位正确。
- **轻微瑕疵**：`genres` 字段被污染（混入「目标读者」「核心情绪」等非题材词），因 adapter 把 `styleKeywords + targetReaders + coreEmotions` 合并去重。不影响续写（题材仅用于展示），但应修正。
- **轻微瑕疵**：plotOutlineChapters 的 orderIndex 从 7 开始（前 6 位被 act/subplot 节点占用）。这是全局 orderIndex 设计，不影响 project.chapters 匹配，但易引起误解。

### ✅ 续写请求提示词 — 完整且高质量
- chapterBeats 正确携带 CBN→CPN-1/2/3→CEN 完整节点链。
- locked-contracts（2467字）含 premise/genres/style/world-rules/volume/chapter 合同全部到位。
- system prompt 含字数硬约束（2400-3450字）、角色名白名单（12角色）、章末约束、状态衔接、禁止复读、手机排版规范。
- writingRules（single-shot-chapter / endOnCEN / forbidPlotRestart）、titleHints、candidateEvents 结构完整。

### ✅ 第 1 章正文质量 — 达到主流网文连载水准
- 24 段、3214 字，符合字数区间。
- **开场有画面感与感官细节**（日头、纸糊窗棂、墨香、霉味），穿越者认知错位写得到位。
- **金手指（天算眼）具象化**为 Excel 表格浮现，创意落地好。
- **悬念层层递进**：假账异常 → 庞守敬敲打 → 前任主事之死 → 书箱被塞密账 → 神秘小厮传话。
- 章尾钩子（二十万两烂泥坑）有力，符合 CEN 收束。
- 文笔流畅、对话自然、无 AI 腔模板痕迹。

### ❌ 第 2 章失败 — 测试 harness 的 Pinia 篡改 bug

**根因链路**（100% 确认，非生产代码 bug）：
1. `runChapter(ch1)` → `hydrateProjectStoreForSmartContinue()` → `setActivePinia(createPinia())` 建立 **Pinia-A**（含 30 章）
2. `onChapterHydrated()` → `injectSettingsStore(cfg)` → `storyflowClosedLoopHarness.ts:151` 的 `createPinia()` 建立 **Pinia-B**（仅 settingsStore，**无 chapters**），**篡改 active 为 Pinia-B**
3. `createChapterPersistenceClient()`（continueWriteHarness.ts:803）→ `useProjectStore()` 捕获的是 **Pinia-B**（空 store）
4. ch1 pipeline 完成，`syncProjectFromStore()`（857行）读 Pinia-B 的空 `sortedChapters` → **`project.chapters = []`**
5. ch2 `runChapter` → 759行 `project.chapters.find(item => item.orderIndex + 1 === 2)` 在空数组里找不到 → **"缺少第 2 章"**

**为什么 ch1 仍"成功"**：759行的 `chapter` 变量在 hydrate 前已捕获（ch1 还在闭包里）；persistence.replace 在 Pinia-B 上是 no-op（updateChapter 找不到 id），但 `output.success` 为 true，测试误判 ch1 成功。实际上 ch1 正文**没有真正落库**。

### ⚠️ 次要问题：fact-extraction 超时（8分钟）
ch1 的首次 fact-extraction 被 Aborted（480s），重试 50s 成功。deepseek-v4-flash 处理长正文的事实提取响应极慢，拖慢单章 ~5 分钟。这是模型/请求层面的性能问题，值得观察但不阻断功能。

## 三、生产环境与主流网文门槛评估

| 维度 | 结论 |
|------|------|
| 大纲生产 | **达标**。方向→展开→审查链路完整，30 章蓝图可直接驱动续写 |
| 续写提示词 | **达标**。合同/状态/上下文/约束全部正确流入 |
| 正文文笔 | **达标**。第1章文笔、画面感、悬念、钩子达到主流男频权谋网文开篇水平 |
| 情节连贯性 | **第1章达标**（无法验证跨章，因 ch2 起失败）|
| 批量续写稳定性 | **当前不达标**（仅完成 1/5 章），但根因为测试 harness bug，非生产缺陷 |
| 生产代码 | **无此 bug**（已验证 ChapterWritingPipeline/WritingOrchestratorV2 不 reset Pinia）|

## 四、修复方案（让 5 章闭环跑通）

### 核心修复：`injectSettingsStore` 不再新建 Pinia

**文件**：`src/renderer/src/services/writing/__tests__/storyflowClosedLoopHarness.ts`（150-169行）

**改动**：`injectSettingsStore` 当前无条件 `createPinia()`。改为：仅当没有 active Pinia 时才创建；若已有 active（如 hydrate 之后），复用之。

```ts
function injectSettingsStore(cfg: ResolvedRealAiConfig): void {
  // 复用当前 active Pinia（每章 hydrate 后已 setActivePinia）；
  // 仅在完全没有 active Pinia 时（如开题中心首次调用）才新建。
  // 此前无条件 createPinia() 会把 hydrate 刚设好的 chapters store 冲掉，
  // 导致 createChapterPersistenceClient 捕获空 store → syncProjectFromStore 清空 chapters → 第2章"缺少第 2 章"。
  if (!getActivePinia()) {
    setActivePinia(createPinia());
  }
  const settings = useSettingsStore();
  // ...其余不变
}
```
需 import `getActivePinia`。

### 验证修复正确性
修复后 active Pinia 在 `onChapterHydrated` 时保持为 hydrate 建立的 **Pinia-A**（含 30 章），persistence 捕获 Pinia-A，syncProjectFromStore 读到完整 chapters，ch2~ch5 可正常匹配。

### 可选改进（不阻断，建议后续）
1. **genres 污染**：`mapExecutableOutlineToGeneratedOutline` 的 genres 合并应剔除 targetReaders/coreEmotions（adapter 改 ~3 行）。
2. **fact-extraction 超时**：观察 deepseek-v4-flash 在 fact-extraction 的稳定性，必要时调整该请求的超时/重试策略。

## 五、修复后重跑计划
应用核心修复后，重跑 `npm run smoke:storyflow:real`（预计 70-110 分钟跑完 5 章），重点验证：
- ch2~ch5 全部 accepted
- 每章 prose ≥ 300 字（断言）
- 跨章 mustCover 去重、状态衔接、chapterTitle 回写
- 落盘 prose/*.txt 5 个文件供人工阅读评估连贯性

**请确认是否应用核心修复并重跑测试。**