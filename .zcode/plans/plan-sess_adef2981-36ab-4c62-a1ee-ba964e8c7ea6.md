# 减少连环重试 + 补字策略优化

## 背景
上一轮 smoke:storyflow:real（target 2000 字）耗时 102 分钟，其中 ch3 单章 34 分钟（3 轮批量层重试 × 每轮引擎层 1+2 次起草 = 27 次 AI 请求）。根因：① 跨章角色名冲突（陈砚 vs 沈砚）触发 fact_conflict，重试无法修复（模型继续写错名）；② target 改 3000 后首稿若仍 ~2000 字会触发 1-3 轮补字。

## 改动一：首稿注入角色名白名单（治本——从源头减少名字漂移）

**文件**: `src/renderer/src/services/story-runtime/SceneDraftEngine.ts`

1. **新增 `SceneDraftOptions.allowedCharacterNames?: string[]`**（types/story-runtime.ts 里 SceneDraftOptions 类型）
2. **LongFormWritingEngine 传入白名单**（LongFormWritingEngine.ts:214 调用 draftEngine.draft 处）：从 `writeInput.state.entities` 提取所有 `kind==='character'` 实体的 `name`，作为 `allowedCharacterNames` 传入。这是完整角色库（未被 context 压缩筛选），覆盖最全。
3. **SceneDraftEngine.draft 注入 prompt**：在 system prompt 的 `CHAPTER_TITLE_PROMPT_RULES` 之后、wordCountRules 之前，新增一段：
   ```
   - 【角色名白名单】本章只能使用以下已登记角色名：陈默、沈砚、郑珪……
     禁止使用白名单外的角色名；如需新角色，必须与白名单内角色互动而非另起新名。
     特别注意：不要把已登记角色的名字写成近义/形近字（如"陈默"不要写成"沈默"）。
   ```
   仅当 `allowedCharacterNames.length >= 2` 时注入（单角色无白名单意义）。

**预期效果**：模型首稿就用对名字 → fact-extraction 不会引入僵尸实体 → chapter-judge 不会报 fact_conflict → 不触发重写/重试。

## 改动二：降低持久错误重试上限（兜底——白名单失效时快速放弃）

**文件**: `src/renderer/src/services/writing/__tests__/continueWriteHarness.ts:958`

- `persistentMaxRetries` 从 `3` 降为 `2`
- 配套：在持久错误重试耗尽的 console.error 里补充提示「review 类错误（角色名冲突/情节未履约）重试意义有限，建议检查大纲角色设定」

**预期效果**：即使白名单没完全拦住名字漂移，最坏情况从 3 轮（27 次请求）降到 2 轮（18 次请求），ch3 式 34 分钟降到 ~22 分钟。

## 改动三：首稿 prompt 强化字数要求（减少补字往返）

**文件**: `src/renderer/src/services/story-runtime/SceneDraftEngine.ts:187-196`（wordCountRules）

当前 wordCountRules 第 3 条是「优先一次写够关键情节」，措辞偏建议。改为更强硬：
```
- 【字数硬要求】必须一次写够 ${minWordCount} 字。当前任务是整章 single-shot 起草，
  不会有后续补字机会，低于 ${minWordCount} 字视为不合格。请充分展开对话、动作、
  感官细节与场景转换，把 ${targetWordCount} 字的篇幅写满。
```

**配套——提高单次补字量**（`LongFormWritingEngine.ts:474-476`）：
```ts
// 当前：additionalWords = min(shortfall || target*0.3, maxSupplement)
// 改为：additionalWords = min(shortfall || target*0.5, maxSupplement)
```
单次补字量从 target*0.3（3000→900字）提到 target*0.5（3000→1500字），减少补字轮次（从最多 3 轮降到 1-2 轮）。

**预期效果**：target=3000 时，首稿更接近 2400+ 字（减少补字触发）；即使触发，1 轮补 1500 字比 2 轮各补 900 字更快。

## 不改动的部分（及原因）
- **不改 FactCanonicalizer 加模糊匹配**：误归一风险高（同姓不同人合并），白名单方案从源头解决更安全。
- **不改 max_tokens**：`unified.service.ts` 明确禁止传 maxTokens，改它影响面太大且可能破坏其他 provider。
- **不改 MIN_WORD_THRESHOLD**：0.8 是经过实测的阈值，降到 0.7 会让正文偏短。
- **不改 ai-error-classify 的 REVIEW_RE**：区分「角色名冲突」vs「情节未履约」需要解析 issue.message 的中文语义，脆弱且维护成本高；降 persistentMaxRetries 已足够兜底。

## 验证方式
改完后由你手动跑 `npm run smoke:storyflow:real`（target 已是 3000），对比：
- ch3 式连环重试是否消除或减少（看 trace 文件数：从 3 个降到 1-2 个）
- scene-draft 调用次数（从 18 次降低）
- 首稿字数是否更接近 2400+（看 summary batch 的 words 字段）
- 总耗时是否从 102 分钟明显下降

## 涉及文件清单
1. `src/renderer/src/types/story-runtime.ts` — SceneDraftOptions 加 allowedCharacterNames 字段
2. `src/renderer/src/services/story-runtime/SceneDraftEngine.ts` — wordCountRules 强化 + 白名单注入
3. `src/renderer/src/services/story-runtime/LongFormWritingEngine.ts` — 传白名单 + 补字量提高
4. `src/renderer/src/services/writing/__tests__/continueWriteHarness.ts` — persistentMaxRetries 3→2