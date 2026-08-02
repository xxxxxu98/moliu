# 开题中心（Topic Discovery）重构方案与实施记录

> 状态：实施中（P0 → P4 分阶段推进，每阶段可独立上线、可回滚）
> 关联模块：`components/home/TopicDiscoveryPanel.vue`、`composables/useTopicDiscovery.ts`、`services/inspiration/*`、`types/topic-discovery.ts`

---

## 1. 背景与根因

**用户反馈**：开题中心每个玩法生成的题材（书名和描述）都偏严肃陈旧，缺少网文脑洞与吸引力。

**根因定位**（阅读源码确认）：

| 主因 | 说明 | 位置 |
|------|------|------|
| **静默降级** | 未配置可用 AI Provider 时，所有玩法 100% 走本地模板池：标题 = `题材·逆袭/觉醒/重生/破局/登顶`，oneLiner = "在X世界里，主角凭借…撕开困境，从被低估走向掌控全局"；UI 仅一行琥珀小字提示，用户误以为这就是 AI 结果 | `services/inspiration/topic-discovery.service.ts:355-489`、`TopicDiscoveryPanel.vue:1001` |
| **提示词零脑洞引导** | 系统提示词只要求"可立即开写/有辨识度"，反而注入"典型开篇模式参考、常见雷区（请避开）、务实可执行"等保守约束；方向卡提示词同样重"承载力/可写性" | `services/inspiration/prompts/topic-discovery-prompts.ts`、`services/inspiration/genre-seed-context.ts`、`services/outline/prompts/system/direction-prompt.ts` |
| **降级池数据老** | `genreTags` 缺近年脑洞标签（规则怪谈/模拟器/直播流/御兽/无限流…）；`market-trends` 为静态过期数据 | `data/inspirations.ts`、`data/market-trends.ts` |

---

## 2. 目标架构

```
src/renderer/src/
├─ pages/home/HomePage.vue            # 只挂 TopicDiscoveryBoard
├─ components/home/discovery/         # ◀── 新开题中心模块
│   ├─ TopicDiscoveryBoard.vue        # 页面容器（替代 TopicDiscoveryPanel）
│   ├─ PlayModeSwitcher.vue           # 玩法 tab（配置驱动渲染）
│   ├─ FilterBar.vue                  # 受众/平台/篇幅锁定 + 来源徽章（AI/本地）
│   ├─ SeedGrid.vue + SeedCard.vue    # 种子卡（seeds/twist/mix/dice 复用）
│   ├─ InsightGrid.vue + InsightCard.vue
│   ├─ MixPanel.vue / DicePanel.vue / PromptPanel.vue / FavoritesPanel.vue
│   └─ pipeline/DirectionPipeline.vue # 通用方向管线（复用 DirectionResultPanel）
├─ stores/topicDiscovery.store.ts     # ◀── 状态收敛（版本化持久化 + v1→v2 迁移）
├─ stores/directionSession.store.ts   # 方向卡会话（按 projectId 隔离）
├─ composables/useTopicDiscovery.ts   # 删除（能力进 store）
└─ services/inspiration/
    ├─ topic-discovery.service.ts     # 瘦身：编排 + 解析（引擎可注入）
    ├─ engines/
    │   ├─ ai-engine.ts               # AI 生成（调 unified.service）
    │   └─ local-engine.ts            # ◀── 组合式本地创意引擎（非模板拼接）
    ├─ prompts/
    │   ├─ topic-discovery-prompts.ts # 高概念硬约束 + few-shot 书名示范
    │   └─ title-craft.ts             # 书名技法库（句式/词根/脑洞规则）
    ├─ genre-seed-context.ts          # 弱化"典型/避开"语气为"读者预期锚点"
    ├─ fallback/
    │   ├─ genre-pool.ts              # 扩充脑洞题材池
    │   └─ hook-twist-pool.ts         # 开篇手法/意外设定池（骰子与本地引擎共用）
    └─ play-modes.ts                  # ◀── 玩法配置表（唯一真相源）
```

---

## 3. 关键设计

### 3.1 本地组合式创意引擎（修静默降级）

`local-engine.ts` 用**组合式生成**替代前缀+后缀拼接：

```
输入约束（玩法/锁定题材/骰子面/混搭元素）
  → 从 genre-pool / hook-pool / twist-pool / title-patterns 取样
  → 按结构槽位（开局处境×核心冲突×金手指×兑现方式×书名句式）组合
  → 规则校验（去重、非模板句、字数）→ 输出 StorySeedCard
```

- `title-craft.ts` 提供 8-10 类脑洞书名句式：数字+反差、身份+荒诞场景、疑问钩子、双名词碰撞、系统变异、身份错位、职业反差、规则颠覆…
- 池子扩充：规则怪谈、模拟器、直播流、御兽、无限流、克苏鲁、美食经营、脑洞日常等近年热门标签
- 玩法差异通过**槽位权重**实现（twist 加权 brokenTrope 槽、dice 强制三面入核）

### 3.2 AI 提示词高概念重构

- 高概念硬要求：oneLiner 必须含至少一个反常识设定/新鲜元素组合；禁止近五年写烂的经典开局（废柴逆袭、退婚打脸、无脑系统流…）
- 书名要求：title 必须使用 title-craft 句式之一或自创同等冲击力的句式；禁止「题材·逆袭/觉醒」式命名
- 题材 Profile 措辞："常见雷区（请避开）" → "读者预期锚点（可反其道而行）"
- 方向卡补一条：premise 必须保留种子的反常识设定，禁止洗回平庸

### 3.3 状态收敛（Pinia store + 版本化持久化）

- `stores/topicDiscovery.store.ts`：seedBuckets(4 桶) / insights / favorites / locked* / diceRoll / mixSelection
- `stores/directionSession.store.ts`：directionSessions（从组件迁入，按 projectId 隔离）
- 持久化：手写版本化（`moliu:topic-discovery:v2`），v1 旧键迁移器（兼容旧版单桶 + 新版分桶），损坏 JSON 静默回退空状态
- 竞态/abort 收敛为 store 内 `runWithGeneration`

### 3.4 玩法配置化

`play-modes.ts` 为唯一真相源：id / style / producesSeeds / mergeRules（`inheritLocks` | `ownConstraints`）/ component。新玩法 = 一个配置项 + 一个 UI 组件。

### 3.5 对外契约冻结

`buildTopicDiscoveryProjectSeed`、`insightToSeedConstraints`、`favoriteSeedKey`、`TopicDiscoveryProjectSeed` 类型签名不变，下游（useProjectCreator、大纲系统、追读力审查）零改动。

---

## 4. 分阶段实施

| 阶段 | 内容 | 状态 |
|------|------|------|
| **P0 创意修复** | 提示词高概念约束 + title-craft + local-engine 组合式引擎 + 脑洞池 + 来源徽章 | ✅ 完成 |
| **P1 状态收敛** | composable → Pinia store + 版本化持久化 + v2 迁移 + 测试迁移 | ✅ 完成 |
| **P2 组件拆分** | discovery/ 子组件 + TopicDiscoveryBoard + 删旧面板 | ✅ 完成 |
| **P3 玩法配置化** | play-modes + mergeRules + 引擎接口化 | ✅ 完成 |
| **P4 清理** | 删旧 composable/旧文案 + 全量验证 | ✅ 完成 |

> 实施备注：
> - `useTopicDiscovery.ts` 兼容层已删除，测试直接测 `stores/topicDiscovery.store.ts`
> - 持久化为单键 v2（`moliu:topic-discovery:v2`），v1 旧键自动迁移
> - 引擎接口化：AI 路径保留在 service 主流程（避免循环依赖），local-engine 为纯函数可注入

---

## 5. 验收标准

1. 行为等价：6 个玩法交互与重构前一致（迁移测试 + 冒烟）
2. 创意达标：无 AI 时连续刷新，标题无一命中 `题材·逆袭/觉醒/重生/破局/登顶` 模式（单测）
3. 来源显性：种子卡/顶部始终显示 `AI` / `本地灵感` 徽章
4. 契约冻结：`topicDiscoverySeed` 写入项目结构不变
5. 质量门：`npm run lint` + `npm run test` 全绿；新代码按项目覆盖率规范
