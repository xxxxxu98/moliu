---
name: storyflow-auto-loop
description: Storyflow 真实冒烟自动诊断-修复-回归循环。跑真实 AI 矩阵冒烟后用确定性 triage 脚本提取失败签名，按判定分类决定修复策略，快速回归验证后对比签名 diff，并把新失败模式写回 triage 分类规则实现自我升级。触发方式：/storyflow-auto-loop、「自动调优」「自动修复冒烟」「跑一轮自动循环」「自我升级冒烟流程」。
---

# Storyflow 自动诊断-修复-回归循环

目标：让真实冒烟从「人读日志」升级为「AI 按协议自动收敛」。本 skill 是循环协议的载体；
确定性部分全部由 `scripts/storyflow-triage.mjs` 承担，AI 只做 triage 清单之上的判断与修复。

## 循环总览

```
跑矩阵 → 硬门禁 → 读者影子评审 → triage → 按 verdict 分诊 → （允许时）修复 → 快速回归 → diff 验证 → 知识回写
                                                    ↘ （stalled/需人工）出结论停止
```

单会话修复→回归上限 **3 轮**。到达上限或遇到必须人工确认的动作时，输出阶段总结并停止。

## 第 1 步：跑矩阵（或复用产物）

```bash
# 常规：指定厂商（node scripts/agent-storyflow-real-multi.mjs --list 查 ID）
node scripts/agent-storyflow-real-multi.mjs <id1> <id2>

# 快速回归（几分钟级，验证修复用）
MOLIU_CHAPTER_COUNT=1 node scripts/agent-storyflow-real-multi.mjs <id1>

# 共享大纲缓存：只对比写作阶段（多厂商回归同一份大纲）
MOLIU_OUTLINE_CACHE=temp/outline.shared.json node scripts/agent-storyflow-real-multi.mjs <id1> <id2>

# 多题材场景矩阵（场景内多厂商，场景间隔离产物）
MOLIU_STORYFLOW_SCENARIO_IDS=court-power,fair-mystery npm run smoke:storyflow:scenario-matrix -- <id1> <id2>

# 读者评审器质量变异冒烟（验证评审器能识别假钩子/注水）
npm run smoke:reader-eval:real
```

产物在 `temp/storyflow-matrix/<providerId>/`（run.log / trace jsonl / prose / summary），矩阵元数据在 `temp/storyflow-matrix/matrix.json`。

## 第 2 步：triage（确定性，不要跳过）

```bash
node scripts/storyflow-triage.mjs                # 全部厂商，报告落盘 temp/storyflow-triage/
node scripts/storyflow-triage.mjs --provider id1 # 单厂商
node scripts/storyflow-triage.mjs --diff         # 最近两份报告的签名回归对比
```

**禁止**跳过 triage 直接通读 run.log 人肉归类——triage 已把瞬态噪音、审核轮次计数、
章节归属、stalled 判定做成了确定性逻辑；AI 的工作从「分类」变成「决策」。
读报告时红签名看 evidence 前两条即可，需要细节再去看对应 run.log / trace。

## 第 3 步：按 verdict 分诊（决策表）

| verdict | 含义 | 动作 |
|---|---|---|
| `clean` / `clean-with-noise` | 全绿或仅瞬态噪音 | 可选优化（延迟/成本），否则收工 |
| `passed-with-repairs` | 质量问题被章内压缩/重试兜住 | 评估兜底代价（重写次数、耗时），值得则调 prompt 措辞 |
| `quality-rejection` | 质量拒绝且未恢复，未达 3 轮 | 读 evidence 判断是 prompt 措辞问题还是合同设计问题，修复后回归 |
| `model-capability-suspect` | 同章质量拒绝 ≥3 轮（stalled） | **停止 patch**。产出结论：换模型 / 调整合同（需人工确认），本轮结束 |
| `infra-failure` | 网络/网关主导 | 先重跑一次排除瞬态窗口；若新错误类别未被重试兜住，补重试分类 |
| `pipeline-bug` | 断言失败但无质量/网络签名 | 排查管线代码（`src/renderer/src/services/writing/`），修复后回归 |

读者评审当前为 `reader-eval-v1` **影子模式**：`reader.*` 签名一律为黄，不改变章节
accepted，也不自动驱动重写。它用于校准追读力、人物、情绪、爽点、跨章重复等质量趋势；
只有积累足够人工抽查样本、冻结阈值后，才能人工批准将高置信度底线问题升级为阻断。
未设置 `MOLIU_READER_JUDGE_PROVIDER_ID` 时，默认读取 App 中名为
`wawa-gpt-5.6-luna` 的已启用配置作为裁判；显式环境变量仍具有最高优先级。

stalled 是硬停止信号：同签名 3 轮不收敛说明是模型能力或合同问题，代码修不动，
继续重试只烧钱。历史先例：max_tokens 区间语法、空响应守卫、schema 软兜底都是 1-2 轮内可修的；
而「查账章节数字不自洽」类反复失败换模型才解决。

## 第 4 步：修复边界（护栏，不可越过）

**允许自动修**（修完必须回归）：
- infra 错误处理：新瞬态类别的重试分类、退避参数
- 解析/软兜底：schema 校验失败的元素级软修复逻辑
- prompt 措辞：写作引擎 / reviewer 的措辞强化（不改变判定标准本身）
- 测试/脚本自身的 bug（triage 误分类等）

**必须人工确认后才动**：
- 质量门本身：reviewer 判定 schema、合同 mustCover/forbidden 语义、字数区间
- 大纲合同的生成规则（futureReveals/notBeforeChapter 等约束的放宽或收紧）
- 「让测试变绿」性质的一切判定标准调整——这是指标 gaming，不是修复

拿不准属于哪类时，默认按需人工确认处理，在阶段总结里列出待确认项。

## 第 5 步：快速回归 + diff 验证

```bash
# 1. 快速回归（单章 + 可靠便宜厂商优先；能复现原问题的最小配置）
MOLIU_CHAPTER_COUNT=1 node scripts/agent-storyflow-real-multi.mjs <可靠厂商id>

# 2. triage 新产物
node scripts/storyflow-triage.mjs

# 3. 对比修复前后签名
node scripts/storyflow-triage.mjs --diff
```

通过标准：
- 目标签名出现在「已消失」
- 「新增」里没有红签名（有则退出码 1，必须处理或回滚）
- 同厂商 verdict 不劣化（如 passed-with-repairs → quality-rejection）
- 首过率下降不超过 10%，平均重写轮次不增长超过 20%
- 读者大纲分/章节均分不下降超过 5 分（影子告警；显式设置
  `MOLIU_READER_REGRESSION_BLOCK=1` 才阻断）
- 请求 P95 延迟不增长超过 25%

快速回归通过 ≠ 完成。涉及写作管线行为的修复，最终验收用全量 20 章矩阵重跑一轮。

## 第 6 步：知识回写（自我升级）

每轮循环结束时：
1. **triage 认识的新失败模式** → 加进 `storyflow-triage.mjs` 的 `parseIssue` / `classifyTransient`
   （下轮循环它就从「AI 判断」降级为「确定性分类」）
2. **分诊表没覆盖的 verdict 场景** → 更新本 SKILL.md 决策表
3. **跨会话有价值的结论**（某模型在某题材的能力边界、某网关的抖动特征）→ 写入
   auto-memory（`memory/` 目录，type: project）

## 阶段总结格式（每轮循环结束必写）

```
## 第 N 轮
- 触发签名：<红签名/劣化点>
- 诊断：<verdict + 根因>
- 修复：<文件:行 + 一句话>（或「无需修复」「需人工确认：...」）
- 回归：<diff 结果 已消失/新增/verdict 变化>
- 回写：<triage 规则 / SKILL.md / memory 更新项>
- 下一步：<继续 / 停止原因>
```

## 已知噪音（见到不要当成问题）

- 合聚网关 502/ETIMEDOUT/ECONNRESET/流式 0 字中断：重试机制兜住即为黄，属正常抖动
- `POST ... 400` 紧邻「max_tokens 超网关上限降级重试」：预期协商（triage 记黄 `infra.maxtokens-downgrade`），opencode 网关上限 524288
- 反重力网关 400 "User location is not supported"（上游地区路由拦截）：多上游通道轮换级抖动，有秒级短窗口与分钟级长窗口（实测最长 ~8 分钟、109 次 400）；已归 rate_limit 长退避（15-120s，含被包进 review-unavailable 的文案）。被重试兜住为黄 `infra.transient.geo-block`；若长窗口仍杀批次，结论是换模型/网关而非继续加退避
- outline-expand trace 里 2 字符空响应（配对出现的缓存命中/空批次）：黄
- `outline.titles-shrunk-local`：本地收缩不发 AI 请求，无成本，黄
- 章 0 次通过但 `passed-with-repairs`：兜底机制工作正常，只有重写代价大时才优化
- `reader.self-evaluation-fallback`：未配置独立 reader judge，回退写作模型自评；结果只能低置信度观察
