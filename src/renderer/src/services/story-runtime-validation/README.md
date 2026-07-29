# 长篇运行时验证工具

本目录提供可重复、纯内存的长篇故事运行时验证基建。合成数据分类参考
ConStory-Bench 的长程一致性评估思路，针对中文网文覆盖：

- 人物记忆、知识边界与能力限制
- 持久事实
- 第三人称限知与冷峻克制文风
- 时间顺序与因果前置条件
- 世界规则

## 合成数据

`generateSyntheticChapters()` 按需生成 100、500 或 2000 章，不保存大型 fixture。
相同 `seed` 和章节数会得到相同数据，调用方可直接迭代，也可在测试中按需转为数组。

```ts
import { generateSyntheticChapters } from '@/services/story-runtime-validation';

const chapters = generateSyntheticChapters({ chapterCount: 2000, seed: 42 });
for (const chapter of chapters) {
  // chapter.oracle 包含 must-cover、禁用事实、状态和世界规则真值
}
```

## 指标

`ValidationMetricsCollector` 支持逐章流式聚合：

- CED：每万字一致性错误数
- 未知实体率
- 状态漂移率
- must-cover 漏写率
- 错误事实入库率
- 检索耗时 P50/P95
- 上下文 token 总量、均值与 P95

各比率在分母为零时返回 `0`；分位数采用 nearest-rank 规则。

## Benchmark harness

`StoryRuntimeBenchmarkHarness` 接收 `StoryRuntimeRunnerFactory`，支持以下场景：

1. `accepted_rejected`：统计正常 accepted/rejected 输出。
2. `startup_resume`：保存 checkpoint，创建新 runner 并从 checkpoint 启动恢复。
3. `crash_recovery`：在指定章节请求注入崩溃，从最近 accepted checkpoint 恢复并重试。
4. `rewrite_rollback`：对指定 rejected 章节重写，重写仍失败时回滚到章前 checkpoint。

`StoryRuntimeRunner` 是刻意保持窄小的适配层。**本目录不直接打开真实 SQLite，
也不直接调用 AI。** 真实数据库事务、checkpoint 序列化、AI 写作、审查与事实提取，
必须由上层实现 runner 并注入。runner 应在 `shouldInjectCrash` 为 `true` 时模拟或触发
可恢复故障，并把运行时观测转换为 `ValidationMetricSample`。

```ts
const harness = new StoryRuntimeBenchmarkHarness(() => createApplicationRunner());
const report = await harness.run(
  generateSyntheticChapters({ chapterCount: 100, seed: 42 }),
  { crashChapter: 50, resumeAfterChapter: 50, rewriteChapter: 60 }
);
```

## 测试

从仓库根目录运行：

```bash
npx vitest run src/renderer/src/services/story-runtime-validation
```
