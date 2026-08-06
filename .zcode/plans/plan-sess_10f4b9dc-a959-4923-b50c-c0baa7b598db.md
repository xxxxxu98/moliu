# 实施计划：三项质量改进（对齐用户选择 1A+1B / 2A+2B / 3B）

## 背景与根因（精读确认）

本轮真实冒烟暴露 3 类问题，精读代码后根因明确：

1. **API 失败整批中断**：测试 harness（`continueWriteHarness.ts:998`）单章失败 `break` 整批、maxRetries=3、退避弱（2^n 秒），落后于正式 App（`useBatchWriter.ts:1208-1231` 已 `continue` 跳过、maxRetries=5、`backoffDelayMs` 4s基数）。且全仓无任何 provider/model/key 级容错。
2. **短章被放过（真 bug）**：`LongFormWritingEngine.ts:253` 注释承诺"轮次耗尽则拒收"，但实现是 `:269-271` 仅 `break` 进 commit（`:286`），是否拒收完全依赖 `buildWordCountShortfallIssue` 能否注入 blocking；而补字提前停在目标 80%（`:430-441`）、blocking 判定在 85%（`MIN_WORD_THRESHOLD=0.85`），制造 1600-1700 灰区 + `countWords` 口径漂移，导致 ch1 1460 字被 accepted。
3. **章末台词重复**：全仓正文/台词级去重为 0 实现；`SixGatePolishPipeline`（去AI味）已禁用且不在批量链路。

---

## 改进①：1A（对齐 harness）+ 1B（留白补章）

### 1A. harness 对齐 App 真实行为
**文件**：`src/renderer/src/services/writing/__tests__/continueWriteHarness.ts`

- **`:946`**：`maxRetries ?? 3` → `?? 5`（对齐 `useBatchWriter` 默认 5）
- **`:981`**：退避 `2 ** attempt` 秒 → 复用 App 的 `backoffDelayMs`（从 `@/utils/ai-error-classify` 导入），改用 `abortableSleep` 响应 abort
- **`:991-999`**：单章耗尽 `break` → `continue`（对齐 `useBatchWriter:1242` `getNextChapterIndex` 跳过逻辑）
- **`:955` 注释** 与 **`:10` 文件头注释**：修正"耗尽停止整个批量"为"耗尽跳过本章继续后续章"，消除过时注释
- **`:983-985`/`:994-996` 日志**：`停止批量` → `跳过本章，继续后续章`

### 1B. 留白补章（失败章占位）
**文件**：同 `continueWriteHarness.ts`

- 在 `:991-999` 耗尽分支：为失败章构造一个**占位 ChapterWriteOutput**（`success:false`、`prose:''`、`error: lastError`、`forceAccepted:false`）push 进 `chapters`，并打 `writeStatus:'failed'` 标记到 project，使批量汇总完整反映 N 章状态（而非只到失败章为止）
- 对齐 App `useBatchWriter:1221-1228`：`projectStore.updateChapter(failedId, { writeStatus:'failed', lastError, lastErrorKind, lastErrorAt })`
- 这样 summary 能正确显示"ch4 failed"而非"只跑了4章"，且后续 ch5 会继续尝试

> 说明：真正的 provider/model 级 fallback（1C）需多 provider 配置 UI，本次不做（用户选 1A+1B）。

---

## 改进②：2A（commit 前硬兜底）+ 2B（阈值口径统一）

### 2A. commit 前强制字数校验（根治"短章放过"）
**文件**：`src/renderer/src/services/story-runtime/LongFormWritingEngine.ts`

在 `:284`（重写 while 循环结束）与 `:286`（`commitService.commit`）之间，插入**硬兜底校验**：
```
// 轮次耗尽后，commit 前对最新 drafts 做一次独立字数兜底：
// 不再依赖 issue 注入是否命中，直接按 countWords 口径判定，short 即构造 rejected commit 返回
const finalBounds = checkWordCountBounds(draftsProse(drafts), writeInput.targetWordCount ?? 0);
if (finalBounds.status === 'short') {
  console.warn(`[LongFormWritingEngine] 字数兜底拦截：${finalBounds.currentWords}/${finalBounds.minWords}，拒收提交`);
  const rejectedCommit = { status: 'rejected', reasons: [`字数不足：${finalBounds.currentWords}/${finalBounds.minWords}`] };
  return { plan, context, drafts, facts, report, commit: rejectedCommit, receipt: null, rewriteRounds };
}
```
要点：`commit` 类型需允许 `receipt: null`；`ChapterWritingPipeline:717` 已有 `result.commit.status !== 'accepted' || !result.receipt` 分支处理，会返回 `success:false`，由改进①的留白补章兜住。

### 2B. 阈值口径统一（消除 1600-1700 灰区）
**文件**：`src/renderer/src/services/story-runtime/LongFormWritingEngine.ts` + `supplement.ts`

- **`LongFormWritingEngine.ts:430-441`**：补字提前停阈值 `Math.floor(target * 0.8)` → `Math.floor(target * MIN_WORD_THRESHOLD)`（85%），与 `buildWordCountShortfallIssue` 判定口径一致。消除"补字停在80%但blocking要85%"的灰区
- **`supplement.ts`**：新增导出常量 `SUPPLEMENT_STOP_THRESHOLD = MIN_WORD_THRESHOLD`（0.85），供 `LongFormWritingEngine` 引用，避免魔法数字分散
- 同步校验：确认 UI 显示字数（若用不同口径）与 `countWords` 一致；若不一致，在 summary 落盘处统一用 `countWords` 计算

---

## 改进③：3B（prompt 强化 + 确定性去重）

### 3B-1. prompt 强化（预防）
**文件**：`src/renderer/src/services/story-runtime/SceneDraftEngine.ts`

在 system prompt 数组（`:205-224`）的禁止规则区（`:218` 附近）追加两条硬约束：
```
'- 【禁止】同一句台词/同一句话在本章内重复出现（包括章末回扣开篇钩子句）；若需强调，必须变换措辞或场景',
'- 【禁止】章末段落把已出现过的句子原样再写一遍作为收尾',
```

### 3B-2. 确定性后处理去重（兜底）
**新建文件**：`src/renderer/src/services/story-runtime/proseDedup.ts`

导出 `dedupProse(prose: string): string`，规则（确定性、零 AI、零改伤叙述）：
1. **相邻段落完全相同** → 删除重复段（治"两段一模一样"）
2. **章末段内重复句**：最后一段若含与前面段落完全相同的整句，删除该句（治"签也得签重复"）
3. **连续重复句**：同一段内连续相同的句子折叠为一句
4. 保守原则：仅做"完全相同"判定（trim+标点归一后比对），不做语义近似删除，避免误伤排比/反复修辞

### 3B-3. 接入统一收口
**文件**：`src/renderer/src/services/writing/ChapterWritingPipeline.ts`

在 `:706-710` 的 prose 收口（唯一"整篇已拼接+已清洗schema+即将落库"的点），把 `dedupProse` 串入：
```
const prose = dedupProse(
  normalizeWebnovelParagraphs(
    sanitizeStructuredProseLeakage(
      result.drafts.flatMap(scene => scene.paragraphs).join('\n\n')
    )
  )
);
```
同时 `:560`（StateDriven 降级路径）同样接入，保证两条路径一致。

---

## 测试与验证

### 单元测试（新增）
1. **`proseDedup.test.ts`**：覆盖相邻段重复、章末句重复、连续句重复、排比/反复修辞不被误删（回归保护）
2. **`supplement`/`LongFormWritingEngine` 字数兜底测试**：构造 1460 字 drafts，断言 commit 返回 `status:'rejected'`；构造达标 drafts 断言 `accepted`
3. 阈值统一回归：补字提前停=85% 的边界用例

### 端到端验证
重跑 `npm run smoke:storyflow:real`，确认：
- ch4 即使 API 失败，summary 显示 5 章（ch4 failed + ch5 继续）
- 无 1460 字短章被 accepted（要么达标要么 rejected）
- 章末无重复台词

### 风险与回退
- 2A 可能让原本 accepted 的短章变 rejected（数量增多）→ 由 1B 留白补章兜住，不卡批量；如误伤过多可调 `MIN_WORD_THRESHOLD`（如 0.8）
- 3B-2 去重保守，仅删完全相同句，误伤风险极低；若有误删可放宽比对口径
- 全部改动不触碰大纲生成链路（已验证达标），不影响开题中心

---

## 改动文件清单

| 文件 | 改动 | 类型 |
|---|---|---|
| `services/writing/__tests__/continueWriteHarness.ts` | 1A 对齐 + 1B 留白补章 | 改 |
| `services/story-runtime/LongFormWritingEngine.ts` | 2A 硬兜底 + 2B 阈值统一 | 改 |
| `services/writing/supplement.ts` | 2B 导出 SUPPLEMENT_STOP_THRESHOLD | 改 |
| `services/story-runtime/SceneDraftEngine.ts` | 3B-1 prompt 强化 | 改 |
| `services/story-runtime/proseDedup.ts` | 3B-2 新建确定性去重 | 新建 |
| `services/writing/ChapterWritingPipeline.ts` | 3B-3 接入收口 | 改 |
| `services/story-runtime/__tests__/proseDedup.test.ts` | 去重单测 | 新建 |
| 字数兜底相关测试 | 2A/2B 回归 | 新建 |

不触碰：大纲生成（`outline/`）、UI 组件、provider 配置、SQLite 持久化层。
