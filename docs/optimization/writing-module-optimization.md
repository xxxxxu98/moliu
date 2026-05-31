# moliu 续写模块优化方案

> 生成时间：2026-05-31
> 版本：v1.1

---

## 一、现状分析

### 1.1 已有的完善系统

| 模块 | 现状 | 评价 |
|------|------|------|
| **合同系统** | ✅ 完整实现 `services/writing/contract/` | ⭐⭐⭐⭐⭐ 完善 |
| **投影系统** | ✅ 完整实现 `services/writing/projection/` | ⭐⭐⭐⭐⭐ 完善 |
| **TaskBook** | ✅ 完整实现 `services/writing/taskbook/` | ⭐⭐⭐⭐⭐ 完善 |
| **审查系统** | ✅ `EnhancedReviewAgent` 实现六维审查 | ⭐⭐⭐⭐ 成熟 |
| **Blocking 闸门** | ✅ 三级严格度 + 自适应降级 | ⭐⭐⭐⭐⭐ 成熟 |
| **写到完结** | ✅ 完结感知引擎 + 伏笔追踪 | ⭐⭐⭐⭐ 完整 |
| **记忆提取** | ✅ 情节记忆自动提取 | ⭐⭐⭐ 可用 |
| **UI 集成** | ✅ Vue 组件 + 可视化 | ⭐⭐⭐⭐⭐ 优秀 |

### 1.2 需要补充的功能

| 模块 | 问题 | 优先级 |
|------|------|--------|
| **结构化报告** | 缺乏报告生成器，审查结果难以导出 | P1 |
| **失败恢复** | 缺乏完整失败恢复机制 | P1 |
| **去AI味** | 功能暂时禁用 | P2 |

---

## 二、优化目标

1. **可追溯性**：结构化审查报告生成，追踪质量趋势
2. **提升稳定性**：失败隔离和恢复机制
3. **后续规划**：去AI味功能优化、Dry-run 模式、白名单机制

---

## 三、需要补充的功能

### Phase 1：质量保障（优先级 P1）

#### 3.1 结构化审查报告生成器

**目标**：为审查结果生成可导出、可追踪的结构化报告

```typescript
// services/writing/review/report-generator.ts

export interface StructuredReviewReport {
  // 报告元数据
  meta: {
    chapterId: string;
    chapterNumber: number;
    reviewedAt: string;
    reviewVersion: string;
    duration: number;  // 审查耗时
  };
  
  // 总览
  overview: {
    totalIssues: number;
    blockingCount: number;
    nonBlockingCount: number;
    overallScore: number;  // 0-100
    verdict: 'accepted' | 'needs_revision' | 'rejected';
  };
  
  // 阻断问题
  blockingIssues: Issue[];
  
  // 非阻断问题
  nonBlockingIssues: Issue[];
  
  // 质量维度评分
  qualityDimensions: {
    continuity: DimensionScore;
    hookScore: DimensionScore;
    coolpointScore: DimensionScore;
    paceScore: DimensionScore;
    antiAIScore: DimensionScore;
    contractScore: DimensionScore;
  };
  
  // 修复建议
  suggestedFixes: FixSuggestion[];
  
  // 审查历史
  history: ReviewAttempt[];
}
```

#### 3.2 失败恢复机制

**目标**：实现故障隔离和自动恢复

```typescript
// services/writing/failure-recovery/failure-manager.ts

// 失败恢复策略配置
export const FAILURE_RECOVERY_CONFIG = {
  draft: {
    maxRetries: 2,
    strategies: ['retry', 'retry_with_simpler_prompt', 'skip_chapter'],
    fallbackAction: 'skip',
  },
  review: {
    maxRetries: 3,
    strategies: ['retry_with_lower_strictness', 'user_decision', 'force_proceed'],
    fallbackAction: 'force_proceed',
  },
  polish: {
    maxRetries: 1,
    strategies: ['retry', 'use_original_content'],
    fallbackAction: 'use_original_content',
  },
  memoryExtraction: {
    maxRetries: 2,
    strategies: ['retry', 'use_placeholder', 'fallback_to_previous'],
    fallbackAction: 'fallback_to_previous',
  },
};

// 失败状态记录
export interface FailureState {
  chapterId: string;
  failedStep: PipelineStep;
  error: string;
  attempts: number;
  lastAttemptAt: string;
  resolution?: 'resolved' | 'skipped' | 'user_override';
}
```

### Phase 2：后续功能（优先级 P2）

根据用户需求，以下功能暂时不实现：
- ~~去AI味功能重新启用~~
- ~~Dry-run 模式实现~~
- ~~白名单机制实现~~

---

## 四、需要新增的文件

### 已实现功能

| 文件 | 状态 | 说明 |
|------|------|------|
| `services/writing/review/report-generator.ts` | ✅ 已完成 | 结构化报告生成器 |
| `services/writing/failure-recovery/failure-manager.ts` | ✅ 已完成 | 失败恢复管理器 |
| `services/writing/failure-recovery/index.ts` | ✅ 已完成 | 导出模块 |

### 待集成功能

以下功能已集成完成：
- ✅ `useChapterWriter` - 报告生成 + 失败恢复
- ✅ `useBatchWriter` - 报告生成 + 失败恢复
- ✅ `AIPanel.vue` - 报告导出 UI

---

## 五、验收标准

### Phase 1 验收

- [x] 结构化报告生成器完成 (`report-generator.ts`)
- [x] 失败恢复机制实现 (`failure-manager.ts`)
- [x] 与 useChapterWriter 集成
- [x] 与 useBatchWriter 集成
- [x] 报告导出 UI 实现
- [ ] 报告导出功能测试

### Phase 2 验收

- [ ] Dry-run 模式实现
- [ ] 白名单机制实现

---

## 六、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 结构化报告增加存储 | 存储成本 | 定期归档旧报告，压缩存储 |
| 去AI味误判 | 质量 | 实现白名单+人工确认 |
| 失败恢复策略不当 | 稳定性 | 充分测试+灰度发布 |

---

## 七、后续规划

1. **多 Agent 协作**：引入专门的 Agent 处理各阶段任务
2. **实时监控**：Dashboard 监控写作流水线状态
3. **质量趋势分析**：长期追踪项目质量变化
4. **智能推荐**：基于历史数据推荐写作策略
