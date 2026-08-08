# 三项优化实施计划

## 背景
基于 smoke:storyflow:real 真实闭环实测暴露的三个稳定性问题，按推荐方案实施。三项改动互相独立，可分批验证。

---

## 建议 1：空响应重试注入引导（不降温、不切模型）

### 问题根因（已确认）
- `realStructuredAI.ts:92` temperature 是固定三元表达式，与重试无关
- 空响应/截断时 `parseStructuredJson` 抛异常 → 进入 `continueWriteHarness.ts:997` 的 catch 分支 → `finalResult = null`
- 第 1004 行 `if (finalResult?.output.gateResult)` 判空失败 → `seedRevisionHints` 保持 `undefined`
- 下一轮原样重发，存在二次空响应风险
- 同理，引擎内 `runStepWithTransientRetry`（maxRetries:1）的 step 闭包也无重试感知

### 改动点

**A. 批次层：`continueWriteHarness.ts:997-1013`**
在 catch 分支（`finalResult = null` 后），检测错误是否属于 truncated/空响应类，若是则注入固定引导种子：
```ts
// catch 分支后、第 1003 行 if 之前：
if (!finalResult && lastError) {
  const classified = classifyError(new Error(lastError), options.signal);
  if (classified.kind === 'truncated') {
    seedRevisionHints = [
      '上一轮 AI 返回了空内容或被截断的 JSON。请务必一次性输出完整的 JSON 对象，'
      + 'paragraphs 数组必须包含完整的正文段落，不要在中途停笔，不要返回空字符串。'
    ];
  }
}
```
保留原有 `if (finalResult?.output.gateResult)` 逻辑不变（它处理 review/wordcount 类有 gateResult 的失败）。

**B. 步骤级：`LongFormWritingEngine.ts:55-85` + `234-247`**
扩展 `runStepWithTransientRetry` 的 step 签名，让闭包能感知重试：
- 签名从 `step: () => Promise<T>` 改为 `step: (attempt: number) => Promise<T>`
- 第 65 行调用改为 `await step(attempt)`
- draft 步骤闭包改为 `async (attempt: number) => {...}`，当 `attempt >= 1` 时往 `revisionHints` 追加截断引导：
  ```ts
  const draftHints = attempt > 0 && (lastError 包含 truncated/空)
    ? [...(revisionHints ?? []), '上次输出被截断，请保证一次性输出完整 JSON 与全章正文。']
    : revisionHints;
  ```
  （此处需在闭包内捕获上一次错误，或在 `runStepWithTransientRetry` 内把 lastError 传给 step——采用把 `attempt` 传入即可，引导文案固定，不依赖具体错误文本）

### 验证
重跑 smoke:storyflow:real，确认：
- 空响应后下一轮 prompt 的 revisionHints 含截断引导（查 trace）
- 不再出现连续 2 次空响应

---

## 建议 2：连环重写熔断（停止重写仍 rejected）

### 问题根因（已确认）
- `LongFormWritingEngine.ts:296-311` 重写循环每轮独立调 `buildRevisionHintsFromReport(report)`，**无跨轮 issue 比较**
- 若两轮 issue 完全一样，仍盲目重写第二轮
- 实测 CH5 跑了 4 轮 draft（11 步、11.53 min），是 CH4 的 2.3 倍

### 改动点

**A. 新增相似度工具函数**
项目中无现成可复用的文本相似度函数（`incremental-writeback.ts:234` 有 private 方法但不可复用）。
新建 `src/renderer/src/utils/text-similarity.ts`，导出 `normalizedSimilarity(a: string, b: string): number`（基于归一化编辑距离，0-1）：
- 归一化：去标点、去数字、去空白后比较（issue.message 含动态数字如字数会干扰）
- 简单实现：`1 - levenshtein(normalize(a), normalize(b)) / max(len)`，长度差异大时用包含关系兜底
- 参考已有 `incremental-writeback.ts:234-243` 的逻辑，提取为独立导出函数

**B. `LongFormWritingEngine.ts` 主循环加熔断**
在第 227 行 `let rewriteRounds = 0;` 附近新增状态：
```ts
let prevBlockingIssues: ContinuityIssue[] = [];
```
在第 296 行 `if (!shouldRewrite(report) ...)` **之前**插入熔断判定：
```ts
// 连环重写熔断：本轮 blocking issue 与上一轮高度相似 → 判定"卡在同一问题"，停止重写
const currentBlocking = report.issues.filter(
  i => i.severity === 'blocking' && !i.id.startsWith('word-count-short:')
);
if (rewriteRounds > 0 && prevBlockingIssues.length > 0 && currentBlocking.length > 0) {
  const stuckCount = currentBlocking.filter(cur =>
    prevBlockingIssues.some(prev =>
      normalizedSimilarity(cur.message, prev.message) >= 0.7
    )
  ).length;
  const stuckRatio = stuckCount / currentBlocking.length;
  if (stuckRatio >= 0.5) {
    console.warn(
      `[LongFormWritingEngine] 连环重写熔断：本轮 ${stuckCount}/${currentBlocking.length} `
      + `个 blocking 问题与上轮高度相似（卡在同一问题），停止重写（仍 rejected 提交）`
    );
    break;  // 保持 report.accepted=false，走 rejected 分支
  }
}
prevBlockingIssues = currentBlocking;
```
- 阈值：相似度 ≥0.7 视为"同一问题"，命中比例 ≥50% 触发熔断
- **排除 word-count-short**：字数每轮变化，id 含动态数字，会误判为"新问题"
- **break 后不修改 report.accepted**：保持 rejected 语义（用户已确认选此方案），批次层会继续重试或最终标记失败

### 验证
重跑 smoke:storyflow:real，确认：
- CH5 式连环重写被熔断（日志出现"连环重写熔断"）
- 单章步骤数显著下降（CH5 从 11 步降到 ~6 步）

---

## 建议 3：补全记忆提取桩（electronAPI + Pinia 修复）

### 问题根因（已确认）
- `storyflowClosedLoopHarness.ts:78-103` 的 `installMemoryElectronAPI` 只注册了 6 个项目 IPC 方法，缺 4 个 memory 方法
- `MemoryFileService.saveMemory`（memory-file-service.ts:319）调 `window.electronAPI.saveMemoryFile` → 报错
- `hydrateSmartContinueStore.ts:24` 每章 `ensureActivePinia()` → `setActivePinia(createPinia())`，丢弃 harness 在 L110 注入的 settings pinia → 记忆 AI 增强走 `useAIService` 读空 settings → 报"请先配置 AI 服务"

### 改动点

**A. 补全 electronAPI 桩：`storyflowClosedLoopHarness.ts:76-106`**
在 api 对象追加 4 个方法（内存 Map 实现，支持往返）：
```ts
function installMemoryElectronAPI(): Map<string, Project> {
  const store = new Map<string, Project>();
  const memoryStore = new Map<string, Map<string, string>>(); // projectId -> (filePath -> content)
  const api = {
    // ...原有 6 个方法不变...
    saveMemoryFile: async ({ projectId, filePath, content }): Promise<{ success: boolean }> => {
      let proj = memoryStore.get(projectId);
      if (!proj) { proj = new Map(); memoryStore.set(projectId, proj); }
      proj.set(filePath, content);
      return { success: true };
    },
    loadMemoryFile: async ({ projectId, filePath }): Promise<string | null> => {
      return memoryStore.get(projectId)?.get(filePath) ?? null;
    },
    listMemoryFiles: async ({ projectId, basePath }): Promise<string[]> => {
      const proj = memoryStore.get(projectId);
      if (!proj) return [];
      return Array.from(proj.keys()).filter(f => f.startsWith(basePath + '/') || f.startsWith(basePath));
    },
    deleteMemoryFile: async ({ projectId, filePath }): Promise<{ success: boolean }> => {
      memoryStore.get(projectId)?.delete(filePath);
      return { success: true };
    },
  };
  ...
}
```
签名对齐 `src/preload.ts:40-43`。

**B. 修复 Pinia 重置导致 settings 丢失**
最小改动方案：在 `storyflowClosedLoopHarness.ts` 的 `runStoryflowClosedLoop` 中，把 `injectSettingsStore(cfg)` 改为**可重复调用**的函数，并在每章续写前重新注入。

由于 `runContinueWriteChapters` 内部每章调 `hydrateProjectStoreForSmartContinue` 会重置 pinia，而 harness 无法侵入该循环内部，采用**包装策略**：
- 把 `injectSettingsStore` 提取为返回 cfg 的闭包，或导出 settings 注入逻辑
- 更稳妥的做法：修改 `continueWriteHarness.ts` 的 `runChapter`（L749），在 `hydrateProjectStoreForSmartContinue` **之后**调用一个可选的 `onChapterHydrated?: () => void` 回调，harness 传入 `() => injectSettingsStore(cfg)` 重新注入

具体落点：
1. `continueWriteHarness.ts` 的 `openContinueWriteSession`（L707）的 options 增加 `onChapterHydrated?: () => void`
2. `runChapter`（L749）在 L764 `hydrateProjectStoreForSmartContinue(...)` 之后调用 `chapterOptions.onChapterHydrated?.()`
3. `runContinueWriteChapters`（L919）的 options 透传 `onChapterHydrated`
4. `storyflowClosedLoopHarness.ts:280` 调用 `runContinueWriteChapters` 时传入 `onChapterHydrated: () => injectSettingsStore(cfg)`

这样每章 pinia 重置后立即重新注入 AI 配置，记忆 AI 增强能读到 provider。

### 验证
重跑 smoke:storyflow:real，确认：
- 日志不再出现 `saveMemoryFile is not a function`
- 日志不再出现 `情节记忆 AI 主题分析失败: 请先配置 AI 服务`
- `temp/storyflow.closed-loop.prose` 之外能观察到记忆文件被写入（memoryStore 有数据）

---

## 改动文件清单

| 文件 | 改动 | 建议 |
|---|---|---|
| `src/renderer/src/services/writing/__tests__/continueWriteHarness.ts` | catch 分支注入截断引导；新增 `onChapterHydrated` 透传链 | 1, 3 |
| `src/renderer/src/services/story-runtime/LongFormWritingEngine.ts` | `runStepWithTransientRetry` 签名扩展；主循环加熔断 | 1, 2 |
| `src/renderer/src/utils/text-similarity.ts`（新建） | `normalizedSimilarity` 工具函数 | 2 |
| `src/renderer/src/services/writing/__tests__/storyflowClosedLoopHarness.ts` | 补全 4 个 memory electronAPI；传 `onChapterHydrated` | 3 |

不动：`realStructuredAI.ts`、`ChapterWritingPipeline.ts`、`ai-error-classify.ts`、temperature、StructuredAIRequest 接口。

## 验证方式
三建议改完后，重跑一轮 `npm run smoke:storyflow:real`，对比：
1. 空响应后下一轮 prompt 是否含截断引导（查 trace）
2. 是否出现"连环重写熔断"日志，CH5 步骤数是否下降
3. 记忆相关报错是否清零
4. 5 章仍全部 accepted（不引入回归）