# Moliu 续写系统完整优化方案

> 基于 oh-story-claudecode-main 和 webnovel-writer-master 的最佳实践
>
> 版本：1.0
>
> 日期：2026-05-23

---

## 一、现状分析

### 1.1 当前架构

```
┌─────────────────────────────────────────────────────────────┐
│                         AIPanel.vue                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  续写 Tab   │  │ 批量写作    │  │  去AI味    │       │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘       │
│         │                │                                  │
│  ┌──────▼──────┐  ┌──────▼──────┐                        │
│  │useChapterWriter│  │useBatchWriter│                       │
│  └──────┬──────┘  └──────┬──────┘                        │
│         │                │                                  │
│  ┌──────▼───────────────▼──────┐                        │
│  │      Writing Pipeline           │                        │
│  │  TaskBook → Draft → Review → Polish → Save           │
│  └───────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 现有服务

| 服务 | 文件 | 功能 | 状态 |
|------|------|------|------|
| BlockingReviewService | `blocking-review.service.ts` | 六维审查 + blocking 闸门 | ✅ 已有 |
| DeAIService | `de-ai-service.ts` | 去 AI 味三遍法 | ✅ 已有 |
| WritingTaskBuilder | `writing-task-builder.ts` | 任务书生成 | ✅ 已有 |
| extractChapterMemory | `extract-plot-memory.ts` | 情节记忆提取 | ✅ 已有 |

### 1.3 待改进点

| 类别 | 问题 | 来源 |
|------|------|------|
| 审查 | 审查维度不够完善 | oh-story |
| 审查 | 缺少章尾钩子检查 | oh-story |
| 审查 | 缺少爽点密度检查 | oh-story |
| 审查 | 缺少 Show Don't Tell 检查 | oh-story |
| 流程 | 任务书结构不够规范 | webnovel-writer |
| 流程 | 缺少 Commit 机制 | webnovel-writer |
| 流程 | 缺少投影验证 | webnovel-writer |
| 机制 | Blocking Override 规则缺失 | webnovel-writer |
| UI | 审查结果展示不够直观 | - |

---

## 二、优化目标

### 2.1 核心目标

1. **提升生成质量**：通过更完善的审查机制确保输出质量
2. **规范化流程**：对齐 webnovel-writer 的 6 步流程
3. **增强可观测性**：让用户清晰了解每个阶段的状态
4. **保持灵活性**：高优先级改进，低优先级可选

### 2.2 分阶段实施

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| Phase 1 | 审查维度增强 | 高 |
| Phase 2 | 章尾与钩子检查 | 高 |
| Phase 3 | 任务书结构规范化 | 中 |
| Phase 4 | Commit 机制增强 | 中 |
| Phase 5 | UI 优化 | 低 |

---

## 三、详细优化方案

### Phase 1：审查维度增强

#### 3.1.1 扩展 Review Schema

**当前结构**：

```typescript
interface ReviewIssue {
  category: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  location: string;
  blocking: boolean;
}
```

**优化后**：

```typescript
// src/types/writing-task.ts

/**
 * 审查问题 - 增强版
 * 对齐 webnovel-writer 的审查 Schema
 */
export interface ReviewIssue {
  /** 唯一标识 */
  id: string;
  
  /** 严重度 - 4 级 */
  severity: 'critical' | 'high' | 'medium' | 'low';
  
  /** 问题分类 - 8 类 */
  category: ReviewCategory;
  
  /** 位置信息 */
  location: string;
  
  /** 问题描述 */
  description: string;
  
  /** 证据引用 */
  evidence?: string;
  
  /** 修复建议 */
  fixHint?: string;
  
  /** 是否阻断 - critical 自动为 true */
  blocking: boolean;
  
  /** 是否可选节点未覆盖 */
  optional?: boolean;
}

/**
 * 审查分类 - 8 维
 */
export type ReviewCategory = 
  | 'setting'           // 设定冲突
  | 'timeline'          // 时间线
  | 'continuity'        // 连续性
  | 'character'         // 人物
  | 'logic'            // 逻辑
  | 'ai_flavor'        // AI 味
  | 'pacing'           // 节奏
  | 'chapter_ending'    // 章尾质量 (新增)
  | 'excitement'       // 爽点密度 (新增)
  | 'show_dont_tell'    // Show Don't Tell (新增)
  | 'other';           // 其他

/**
 * 审查结果 - 增强版
 */
export interface EnhancedReviewResult {
  /** 是否通过 */
  passed: boolean;
  
  /** 阻断数量 */
  blockingCount: number;
  
  /** 总问题数 */
  totalIssues: number;
  
  /** 问题列表 */
  issues: ReviewIssue[];
  
  /** 维度评分 */
  dimensionScores: Record<ReviewCategory, number>;
  
  /** 阻断问题列表 */
  blockingIssues: ReviewIssue[];
  
  /** 按分类统计 */
  categoryStats: Record<ReviewCategory, {
    total: number;
    blocking: number;
  }>;
  
  /** 摘要 */
  summary: string;
  
  /** 详细结果 */
  detail: SixDimensionReview;
}

/**
 * 审查维度评分
 */
export interface ReviewDimensionScore {
  dimension: ReviewCategory;
  score: number;        // 0-100
  weight: number;       // 权重
  passed: boolean;
  issues: ReviewIssue[];
}
```

#### 3.1.2 增强 BlockingReviewService

**新增文件**：`src/services/review/enhanced-blocking-review.service.ts`

```typescript
/**
 * 增强版审查服务 - Blocking 闸门机制
 * 参考 webnovel-writer 规范
 */
import { ReviewService, type ReviewContext, type ReviewOptions } from './review-service';
import type { 
  ReviewIssue, 
  ReviewCategory, 
  EnhancedReviewResult,
  ReviewDimensionScore,
  SixDimensionReview 
} from '@/types/writing-task';

export class EnhancedBlockingReviewService {
  private reviewService: ReviewService;
  private context: ReviewContext;
  private options: ReviewOptions;

  constructor(context: ReviewContext, options: ReviewOptions = {}) {
    this.context = context;
    this.options = {
      ...options,
      strictMode: true,
    };
    this.reviewService = new ReviewService(context, this.options);
  }

  /**
   * 执行增强版审查
   */
  async review(): Promise<EnhancedReviewResult> {
    // 1. 执行基础六维审查
    const detail = await this.reviewService.review();

    // 2. 执行专项检查
    const specialChecks = await this.performSpecialChecks(detail.overall.content);

    // 3. 合并问题
    const allIssues = [...detail.overall.issues, ...specialChecks.issues];

    // 4. 分析 blocking 状态
    const result = this.analyzeEnhancedResult(allIssues, specialChecks);

    return result;
  }

  /**
   * 专项检查
   */
  private async performSpecialChecks(content: string): Promise<{
    issues: ReviewIssue[];
    scores: Record<string, number>;
  }> {
    const issues: ReviewIssue[] = [];
    const scores: Record<string, number> = {};

    // 1. 章尾钩子检查
    const endingCheck = await this.checkChapterEnding(content);
    issues.push(...endingCheck.issues);
    scores.chapterEnding = endingCheck.score;

    // 2. 爽点密度检查
    const excitementCheck = this.checkExcitementDensity(content);
    issues.push(...excitementCheck.issues);
    scores.excitement = excitementCheck.score;

    // 3. Show Don't Tell 检查
    const showDontTellCheck = await this.checkShowDontTell(content);
    issues.push(...showDontTellCheck.issues);
    scores.showDontTell = showDontTellCheck.score;

    // 4. AI 味模式检查
    const aiFlavorCheck = await this.checkAIFlavorPatterns(content);
    issues.push(...aiFlavorCheck.issues);
    scores.aiFlavor = aiFlavorCheck.score;

    return { issues, scores };
  }

  /**
   * 分析审查结果
   */
  private analyzeEnhancedResult(
    allIssues: ReviewIssue[],
    specialScores: Record<string, number>
  ): EnhancedReviewResult {
    // 计算维度评分
    const dimensionScores = this.calculateDimensionScores(allIssues, specialScores);

    // 统计分类
    const categoryStats = this.calculateCategoryStats(allIssues);

    // 提取阻断问题
    const blockingIssues = allIssues
      .filter(issue => issue.blocking || issue.severity === 'critical')
      .sort((a, b) => {
        if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });

    const blockingCount = blockingIssues.length;
    const passed = blockingCount === 0;

    return {
      passed,
      blockingCount,
      totalIssues: allIssues.length,
      issues: allIssues,
      dimensionScores,
      blockingIssues,
      categoryStats,
      summary: this.generateSummary(passed, blockingCount, allIssues.length, dimensionScores),
      detail: {} as SixDimensionReview, // TODO: 补充
    };
  }

  /**
   * 计算维度评分
   */
  private calculateDimensionScores(
    issues: ReviewIssue[],
    specialScores: Record<string, number>
  ): Record<ReviewCategory, number> {
    const baseScore = 100;
    const weights: Record<ReviewCategory, number> = {
      setting: 0.15,
      timeline: 0.10,
      continuity: 0.15,
      character: 0.15,
      logic: 0.15,
      ai_flavor: 0.10,
      pacing: 0.10,
      chapter_ending: 0.05,
      excitement: 0.03,
      show_dont_tell: 0.02,
      other: 0,
    };

    const scores: Record<ReviewCategory, number> = {} as Record<ReviewCategory, number>;
    const categories = Object.keys(weights) as ReviewCategory[];

    for (const category of categories) {
      const categoryIssues = issues.filter(i => i.category === category);
      const penalty = categoryIssues.reduce((sum, issue) => {
        const severityPenalty = { critical: 30, high: 15, medium: 5, low: 1 };
        return sum + (severityPenalty[issue.severity] || 1);
      }, 0);

      scores[category] = Math.max(0, baseScore - penalty);
    }

    // 合并特殊检查的评分
    if (specialScores.chapterEnding !== undefined) {
      scores.chapter_ending = specialScores.chapterEnding;
    }
    if (specialScores.excitement !== undefined) {
      scores.excitement = specialScores.excitement;
    }
    if (specialScores.showDontTell !== undefined) {
      scores.show_dont_tell = specialScores.showDontTell;
    }
    if (specialScores.aiFlavor !== undefined) {
      scores.ai_flavor = specialScores.aiFlavor;
    }

    return scores;
  }

  /**
   * 统计分类
   */
  private calculateCategoryStats(
    issues: ReviewIssue[]
  ): Record<ReviewCategory, { total: number; blocking: number }> {
    const stats = {} as Record<ReviewCategory, { total: number; blocking: number }>;
    
    for (const issue of issues) {
      if (!stats[issue.category]) {
        stats[issue.category] = { total: 0, blocking: 0 };
      }
      stats[issue.category].total++;
      if (issue.blocking) {
        stats[issue.category].blocking++;
      }
    }

    return stats;
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    passed: boolean,
    blockingCount: number,
    totalIssues: number,
    scores: Record<ReviewCategory, number>
  ): string {
    if (passed) {
      return `审查通过（${totalIssues}个问题，均非阻断）`;
    }
    
    const criticalCategories = Object.entries(scores)
      .filter(([_, score]) => score < 60)
      .map(([cat]) => this.getCategoryName(cat as ReviewCategory));
    
    return `审查未通过：${blockingCount}个阻断问题，主要问题在${criticalCategories.join('、')}`;
  }

  private getCategoryName(category: ReviewCategory): string {
    const names: Record<ReviewCategory, string> = {
      setting: '设定',
      timeline: '时间线',
      continuity: '连续性',
      character: '人物',
      logic: '逻辑',
      ai_flavor: 'AI味',
      pacing: '节奏',
      chapter_ending: '章尾',
      excitement: '爽点',
      show_dont_tell: '表达',
      other: '其他',
    };
    return names[category] || category;
  }
}
```

#### 3.1.3 专项检查服务

**新增文件**：`src/services/review/special-checks.service.ts`

```typescript
/**
 * 专项检查服务
 * 实现章尾、爽点、Show Don't Tell 等专项检查
 */
import type { ReviewIssue } from '@/types/writing-task';

// ============================================
// 章尾钩子检查
// ============================================

export interface ChapterEndingCheckResult {
  score: number;
  issues: ReviewIssue[];
  hasHook: boolean;
  hookType: 'cliffhanger' | 'question' | 'revelation' | 'tension' | 'none';
  endingType: 'action' | 'dialogue' | 'description' | 'summary' | 'philosophical';
  violations: string[];
}

export const CHAPTER_ENDING_PATTERNS = {
  // ✅ 好的钩子类型
  goodHooks: [
    /[?？]$/,                          // 以问号结尾
    /！$|!$/,                         // 以感叹号结尾
    /[.。][^。！]*$/,                 // 句号后还有内容（悬念）
    /忽然|突然|就在这时|就在这时候/,  // 突发转折
    /然而|但是|可是/,                  // 转折词
    /不知道|会不会|难道/,              // 疑问
    /还没完|还没结束/,                // 持续悬念
    /下一章|敬请期待/,                // 明确预告
  ],
  
  // ❌ 禁止的结尾类型
  forbiddenEndings: [
    /^.*(总而言之|总之|由此可见|可见|因此可以说|这就是|这就是为什么|正因如此|凡此种种).*$/m,
    /^.*(这就是人生|这就是命运|这就是成长).*$/m,
    /^.*(人生就是这样|命运就是这样).*$/m,
    /^.*(从此以后|故事到此结束|全剧终).*$/m,
  ],
  
  // ⚠️ 警告的结尾模式
  warningEndings: [
    /他(终于|终于|终于)明白/,
    /他(深刻|彻底|完全)认识到/,
    /这一刻.*(终于|才)/,
  ],
};

/**
 * 检查章尾质量
 */
export function checkChapterEnding(
  content: string, 
  chapterNumber: number
): ChapterEndingCheckResult {
  const issues: ReviewIssue[] = [];
  const violations: string[] = [];
  
  // 获取最后 200 字
  const lastPart = content.slice(-200);
  const lines = lastPart.split('\n');
  const lastLine = lines[lines.length - 1]?.trim() || '';
  
  let score = 100;
  let hasHook = false;
  let hookType: ChapterEndingCheckResult['hookType'] = 'none';
  let endingType: ChapterEndingCheckResult['endingType'] = 'description';
  
  // 检查是否有好钩子
  for (const pattern of CHAPTER_ENDING_PATTERNS.goodHooks) {
    if (pattern.test(lastLine)) {
      hasHook = true;
      if (/[?？]$/.test(lastLine)) hookType = 'question';
      else if (/[。]$/.test(lastLine)) hookType = 'revelation';
      else if (/忽然|突然/.test(lastLine)) hookType = 'tension';
      else hookType = 'cliffhanger';
      break;
    }
  }
  
  // 检查禁止模式
  for (const pattern of CHAPTER_ENDING_PATTERNS.forbiddenEndings) {
    if (pattern.test(lastPart)) {
      violations.push(`存在禁止的总结式结尾`);
      issues.push({
        id: `ending-${chapterNumber}-summary`,
        severity: 'high',
        category: 'chapter_ending',
        location: `第${chapterNumber}章结尾`,
        description: '章节结尾使用总结/升华式收束',
        evidence: lastLine.slice(0, 50),
        fixHint: '用动作、对话或悬念收束，避免哲理总结',
        blocking: true,
      });
      score -= 30;
    }
  }
  
  // 检查警告模式
  for (const pattern of CHAPTER_ENDING_PATTERNS.warningEndings) {
    if (pattern.test(lastPart)) {
      violations.push(`存在警告的总结式结尾`);
      issues.push({
        id: `ending-${chapterNumber}-warning`,
        severity: 'medium',
        category: 'chapter_ending',
        location: `第${chapterNumber}章结尾`,
        description: '章节结尾过于说教',
        evidence: lastLine.slice(0, 50),
        fixHint: '减少总结性表达，用情节本身制造余韵',
        blocking: false,
      });
      score -= 15;
    }
  }
  
  // 判断结尾类型
  if (!hasHook && violations.length === 0) {
    // 没有明显问题时，根据内容判断
    if (/^["""'].*[""']$/.test(lastLine.trim())) {
      endingType = 'dialogue';
    } else if (lastLine.length < 20) {
      endingType = 'action';
    }
  }
  
  if (!hasHook) {
    issues.push({
      id: `ending-${chapterNumber}-no-hook`,
      severity: 'medium',
      category: 'chapter_ending',
      location: `第${chapterNumber}章结尾`,
      description: '章节结尾缺少钩子',
      fixHint: '建议以动作、悬念或问题结尾，吸引读者继续阅读',
      blocking: false,
    });
    score -= 20;
  }
  
  return {
    score: Math.max(0, score),
    issues,
    hasHook,
    hookType,
    endingType,
    violations,
  };
}

// ============================================
// 爽点密度检查
// ============================================

export interface ExcitementDensityResult {
  score: number;
  issues: ReviewIssue[];
  density: number;        // 字/爽点
  excitementPoints: ExcitementPoint[];
  meetsStandard: boolean; // <5000字/爽点
  totalWords: number;
}

export interface ExcitementPoint {
  position: number;
  type: ExcitementType;
  description: string;
}

export type ExcitementType = 
  | '装逼打脸'
  | '实力碾压'
  | '身份揭示'
  | '以小博大'
  | '英雄救美'
  | '资源获取'
  | '逆转翻盘'
  | '信息差'
  | '冲突爆发'
  | '收获盘点';

export const EXCITEMENT_PATTERNS: Record<ExcitementType, RegExp[]> = {
  '装逼打脸': [
    /露出?震惊|惊呆|目瞪口呆/,
    /脸色大变|面如土色/,
    /倒吸一口凉气/,
    /不(可能|敢相信)/,
  ],
  '实力碾压': [
    /根本不是对手|不堪一击/,
    /一招|一击|瞬间/,
    /毫无还手之力/,
  ],
  '身份揭示': [
    /原来|竟然是他/,
    /不知他竟是/,
    /此人正是/,
  ],
  '以小博大': [
    /以弱胜强|四两拨千斤/,
    /赌上一切|孤注一掷/,
  ],
  '英雄救美': [
    /及时出现|关键时刻/,
    /挺身而出|英雄救美/,
  ],
  '资源获取': [
    /获得|得到|收获/,
    /意外之喜|天降机缘/,
  ],
  '逆转翻盘': [
    /绝地反击|反败为胜/,
    /峰回路转|柳暗花明/,
  ],
  '信息差': [
    /他不知道|众人不知/,
    /只有他知道/,
    /蒙在鼓里/,
  ],
  '冲突爆发': [
    /冲突|争吵|大打出手/,
    /撕破脸|翻脸/,
  ],
  '收获盘点': [
    /盘点|清点|收获颇丰/,
    /共计|总共/,
  ],
};

/**
 * 检查爽点密度
 * 标准：每 3000-5000 字必须有 1 个爽点
 */
export function checkExcitementDensity(
  content: string,
  chapterNumber: number
): ExcitementDensityResult {
  const issues: ReviewIssue[] = [];
  const excitementPoints: ExcitementPoint[] = [];
  
  const totalWords = content.length;
  
  // 扫描爽点
  for (const [type, patterns] of Object.entries(EXCITEMENT_PATTERNS)) {
    for (const pattern of patterns) {
      let match;
      const regex = new RegExp(pattern.source, 'g');
      while ((match = regex.exec(content)) !== null) {
        excitementPoints.push({
          position: match.index,
          type: type as ExcitementType,
          description: match[0],
        });
      }
    }
  }
  
  // 去重（位置相近的合并）
  const uniquePoints = deduplicatePoints(excitementPoints);
  
  // 计算密度
  const density = uniquePoints.length > 0 
    ? totalWords / uniquePoints.length 
    : Infinity;
  
  // 评分
  let score = 100;
  const standardMax = 5000; // 每 5000 字最多 1 个爽点
  const standardMin = 2000;  // 每 2000 字至少 1 个爽点
  
  if (density > standardMax) {
    issues.push({
      id: `excitement-${chapterNumber}-sparse`,
      severity: 'medium',
      category: 'excitement',
      location: `第${chapterNumber}章全文`,
      description: `爽点密度过低（${Math.round(density)}字/爽点），建议增加情绪波动`,
      fixHint: '每 3000-5000 字应有 1 个让读者"爽"的情绪节点',
      blocking: false,
    });
    score -= 25;
  }
  
  if (density < standardMin && uniquePoints.length > 3) {
    issues.push({
      id: `excitement-${chapterNumber}-dense`,
      severity: 'low',
      category: 'excitement',
      location: `第${chapterNumber}章全文`,
      description: `爽点密度过高（${Math.round(density)}字/爽点），节奏过于紧凑`,
      fixHint: '适当放缓节奏，增加铺垫和过渡',
      blocking: false,
    });
    score -= 10;
  }
  
  return {
    score: Math.max(0, score),
    issues,
    density,
    excitementPoints: uniquePoints,
    meetsStandard: density <= standardMax,
    totalWords,
  };
}

/**
 * 去重相邻的爽点
 */
function deduplicatePoints(points: ExcitementPoint[]): ExcitementPoint[] {
  if (points.length === 0) return [];
  
  const sorted = [...points].sort((a, b) => a.position - b.position);
  const result: ExcitementPoint[] = [sorted[0]];
  
  const MIN_DISTANCE = 500; // 最小间隔 500 字
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].position - result[result.length - 1].position > MIN_DISTANCE) {
      result.push(sorted[i]);
    }
  }
  
  return result;
}

// ============================================
// Show Don't Tell 检查
// ============================================

export interface ShowDontTellResult {
  score: number;
  issues: ReviewIssue[];
  tellCount: number;
  showCount: number;
  ratio: number;
}

export const TELL_PATTERNS = [
  // 情绪告知
  { pattern: /他(很|非常|十分|特别)?(高兴|开心|快乐|兴奋|激动)/, type: '情绪', suggestion: '用动作/表情展示' },
  { pattern: /他(很|非常)?(紧张|害怕|恐惧|担心)/, type: '情绪', suggestion: '用身体反应展示' },
  { pattern: /她(很|非常)?(伤心|难过|悲伤|痛苦)/, type: '情绪', suggestion: '用行为展示内心' },
  { pattern: /他(很|非常)?(生气|愤怒|恼火)/, type: '情绪', suggestion: '用动作/语气展示' },
  { pattern: /她(很|非常)?(惊讶|震惊|意外)/, type: '情绪', suggestion: '用身体反应展示' },
  
  // 性格告知
  { pattern: /他是个(胆小|勇敢|聪明|愚蠢|善良|邪恶)/, type: '性格', suggestion: '用行为展示性格' },
  { pattern: /她是(温柔|泼辣|善良|冷酷)/, type: '性格', suggestion: '用对话/行为展示' },
  
  // 环境告知
  { pattern: /这里(很|非常)?(安静|吵闹|恐怖|可怕)/, type: '环境', suggestion: '用感官细节展示' },
  { pattern: /气氛(很|非常)?(紧张|轻松|尴尬)/, type: '环境', suggestion: '用场景描写展示' },
];

/**
 * 检查 Show Don't Tell
 */
export function checkShowDontTell(
  content: string,
  chapterNumber: number
): ShowDontTellResult {
  const issues: ReviewIssue[] = [];
  let tellCount = 0;
  
  for (const { pattern, type, suggestion } of TELL_PATTERNS) {
    const matches = content.match(new RegExp(pattern.source, 'g'));
    if (matches) {
      tellCount += matches.length;
      
      for (const match of matches) {
        issues.push({
          id: `sdt-${chapterNumber}-${Date.now()}`,
          severity: 'low',
          category: 'show_dont_tell',
          location: `第${chapterNumber}章`,
          description: `使用 Tell 表达"${type}"`,
          evidence: match,
          fixHint: suggestion,
          blocking: false,
        });
      }
    }
  }
  
  // 统计 Tell/Show 比例
  // 简单估算：对话/动作多 = Show 较多
  const dialogueCount = (content.match(/["""'].*?[""']/g) || []).length;
  const showCount = dialogueCount;
  const ratio = showCount / Math.max(tellCount, 1);
  
  // 评分
  let score = 100;
  if (tellCount > 5) {
    score -= Math.min(30, (tellCount - 5) * 3);
  }
  if (ratio < 1) {
    score -= 15;
  }
  
  return {
    score: Math.max(0, score),
    issues,
    tellCount,
    showCount,
    ratio,
  };
}
```

---

### Phase 2：任务书结构规范化

#### 3.2.1 优化 WritingTaskBook 类型

**修改文件**：`src/types/writing-task.ts`

```typescript
/**
 * 写作任务书 - 规范化版
 * 对齐 webnovel-writer 的任务书结构
 */
export interface WritingTaskBook {
  // ========== 元信息 ==========
  /** 章节编号 */
  chapterNumber: number;
  /** 章节标题 */
  chapterTitle: string;
  /** 生成时间 */
  generatedAt: string;
  
  // ========== 1. 本章硬性约束 ==========
  chapterDirective: {
    /** 本章核心目标 */
    goal: string;
    /** 时间锚点 */
    timeAnchor?: string;
    /** 章节跨度 */
    chapterSpan?: string;
    /** 倒计时 */
    countdown?: string;
    /** 开放问题（结尾悬念） */
    openQuestion?: string;
  };
  
  // ========== 2. CBN/CPNs/CEN ==========
  /** CBN: 章节核心叙事 */
  CBN: string;
  /** CPNs: 核心情节节点 */
  CPNs: string[];
  /** CEN: 章节核心事件 */
  CEN: string;
  
  // ========== 3. 必须覆盖 + 禁区 ==========
  /** 必须覆盖的节点 */
  mustCover: Array<{
    node: string;
    required: boolean;  // true = 必须, false = 可选
  }>;
  /** 禁区 */
  forbiddenZones: string[];
  
  // ========== 4. 风格指引 ==========
  styleGuidance: {
    /** 节奏策略 */
    pacingStrategy: string;
    /** 主角 OOC 警戒 */
    oocWarnings: string[];
    /** 反模式 */
    antiPatterns: string[];
  };
  
  // ========== 5. 结尾感觉 ==========
  /** 结尾感觉 */
  endingSensation: string;
  /** 结尾钩子类型 */
  endingHookType: 'cliffhanger' | 'question' | 'revelation' | 'question';
  
  // ========== 6. 写作风格 ==========
  writingStyle: 'concise' | 'elegant' | 'humorous' | 'ancient';
}

/**
 * 任务书生成选项
 */
export interface TaskBookOptions {
  project: any;
  chapterIndex: number;
  chapterOutline?: string;
  writingStyle: 'concise' | 'elegant' | 'humorous' | 'ancient';
  targetWordCount: number;
  previousChapterSummary?: string;
  nextChapterPreview?: string;
}
```

#### 3.2.2 增强 WritingTaskBuilder

**新增文件**：`src/services/writing/enhanced-task-book-builder.ts`

```typescript
/**
 * 增强版任务书构建器
 * 按照 webnovel-writer 规范生成任务书
 */
import type { WritingTaskBook, TaskBookOptions } from '@/types/writing-task';

export class EnhancedTaskBookBuilder {
  private options: TaskBookOptions;
  
  constructor(options: TaskBookOptions) {
    this.options = options;
  }
  
  /**
   * 构建完整任务书
   */
  async buildTaskBook(): Promise<WritingTaskBook> {
    const [
      chapterDirective,
      coreContent,
      coverage,
      styleGuidance,
      endingInfo,
    ] = await Promise.all([
      this.buildChapterDirective(),
      this.buildCoreContent(),
      this.buildCoverage(),
      this.buildStyleGuidance(),
      this.buildEndingInfo(),
    ]);
    
    return {
      chapterNumber: this.options.chapterIndex + 1,
      chapterTitle: '', // 待填充
      generatedAt: new Date().toISOString(),
      chapterDirective,
      CBN: coreContent.CBN,
      CPNs: coreContent.CPNs,
      CEN: coreContent.CEN,
      mustCover: coverage.mustCover,
      forbiddenZones: coverage.forbiddenZones,
      styleGuidance,
      endingSensation: endingInfo.sensation,
      endingHookType: endingInfo.hookType,
      writingStyle: this.options.writingStyle,
    };
  }
  
  /**
   * 构建硬性约束
   */
  private async buildChapterDirective(): Promise<WritingTaskBook['chapterDirective'] {
    const { chapterOutline, previousChapterSummary, targetWordCount } = this.options;
    
    // 1. 核心目标：从大纲和上下文提取
    const goal = this.extractGoal(chapterOutline);
    
    // 2. 时间锚点：推断时间设定
    const timeAnchor = this.inferTimeAnchor(previousChapterSummary);
    
    // 3. 章节跨度：字数/目标密度
    const chapterSpan = this.calculateChapterSpan(targetWordCount);
    
    // 4. 倒计时（如有）
    const countdown = this.extractCountdown(chapterOutline);
    
    // 5. 开放问题：为本章结尾埋下的悬念
    const openQuestion = this.generateOpenQuestion(chapterOutline);
    
    return {
      goal,
      timeAnchor,
      chapterSpan,
      countdown,
      openQuestion,
    };
  }
  
  /**
   * 构建核心内容
   */
  private async buildCoreContent(): Promise<{
    CBN: string;
    CPNs: string[];
    CEN: string;
  }> {
    // CBN: 一句话概括本章叙事
    const CBN = this.generateCBN();
    
    // CPNs: 3-5 个核心情节节点
    const CPNs = this.generateCPNs();
    
    // CEN: 1 个核心事件
    const CEN = this.generateCEN();
    
    return { CBN, CPNs, CEN };
  }
  
  /**
   * 构建覆盖要求
   */
  private async buildCoverage(): Promise<{
    mustCover: WritingTaskBook['mustCover'];
    forbiddenZones: string[];
  }> {
    // 必须覆盖：情节节点 + 伏笔 + 角色互动
    const mustCover = this.generateMustCover();
    
    // 禁区：人物设定 + 世界规则
    const forbiddenZones = this.generateForbiddenZones();
    
    return { mustCover, forbiddenZones };
  }
  
  /**
   * 构建风格指引
   */
  private buildStyleGuidance(): WritingTaskBook['styleGuidance'] {
    const styleMap = {
      concise: {
        pacingStrategy: '快节奏，动作+对话为主，每段不超过3句',
        oocWarnings: ['避免过长心理描写', '禁止连续超过2段独白'],
        antiPatterns: ['过度解释', '连续排比', '总结升华'],
      },
      elegant: {
        pacingStrategy: '细腻描写，环境+心理结合，长短句交错',
        oocWarnings: ['禁止流水账式动作', '避免重复形容词'],
        antiPatterns: ['过于直白', '口语化过度'],
      },
      humorous: {
        pacingStrategy: '轻松幽默，对话有趣，反转适度',
        oocWarnings: ['禁止恶俗搞笑', '避免过度玩梗'],
        antiPatterns: ['严肃说教', '突然煽情'],
      },
      ancient: {
        pacingStrategy: '古风典雅，用词典雅，节奏舒缓',
        oocWarnings: ['避免现代词汇', '禁止白话连篇'],
        antiPatterns: ['翻译腔', '半文半白'],
      },
    };
    
    return styleMap[this.options.writingStyle];
  }
  
  /**
   * 构建结尾信息
   */
  private buildEndingInfo(): WritingTaskBook['endingSensation'] & { hookType: WritingTaskBook['endingHookType'] } {
    // 结尾感觉 + 钩子类型
    return {
      sensation: '悬念收束，让读者想翻下一章',
      hookType: 'question',
    };
  }
  
  // ========== 辅助方法 ==========
  
  private extractGoal(outline?: string): string {
    if (outline) return outline.split('\n')[0];
    return '推进剧情，解决一个冲突或揭示一个信息';
  }
  
  private inferTimeAnchor(previousSummary?: string): string {
    // 从上章推断时间
    if (previousSummary?.includes('夜')) return '夜间';
    if (previousSummary?.includes('晨')) return '清晨';
    return '白天';
  }
  
  private calculateChapterSpan(targetWordCount: number): string {
    return `约 ${targetWordCount} 字`;
  }
  
  private extractCountdown(outline?: string): string | undefined {
    if (outline?.includes('限时')) return '有时间限制';
    return undefined;
  }
  
  private generateOpenQuestion(outline?: string): string {
    return '留下一个待解答的问题，吸引读者继续阅读';
  }
  
  private generateCBN(): string {
    return '一句话概括本章发生的事';
  }
  
  private generateCPNs(): string[] {
    return [
      '第一幕：场景建立和冲突引入',
      '第二幕：冲突升级和主角应对',
      '第三幕：高潮或转折点',
    ];
  }
  
  private generateCEN(): string {
    return '本章最核心的事件或转折';
  }
  
  private generateMustCover(): WritingTaskBook['mustCover'] {
    return [
      { node: '场景转换自然', required: true },
      { node: '角色互动有张力', required: true },
      { node: '情节推进明确', required: true },
    ];
  }
  
  private generateForbiddenZones(): string[] {
    return [
      '禁止人物性格突变',
      '禁止世界观规则冲突',
      '禁止章末总结升华',
    ];
  }
}

/**
 * 创建任务书构建器
 */
export function createEnhancedTaskBookBuilder(options: TaskBookOptions): EnhancedTaskBookBuilder {
  return new EnhancedTaskBookBuilder(options);
}
```

---

### Phase 3：Commit 机制增强

#### 3.3.1 扩展提取结果类型

**新增文件**：`src/types/chapter-commit.ts`

```typescript
/**
 * 章节 Commit 结果类型
 * 对齐 webnovel-writer 的 commit schema
 */

export interface ChapterCommitResult {
  /** 提交状态 */
  status: 'accepted' | 'rejected';
  
  /** 节点完成情况 */
  fulfillment: {
    plannedNodes: string[];    // 计划的节点
    coveredNodes: string[];    // 已覆盖的节点
    missedNodes: string[];     // 遗漏的节点
    extraNodes: string[];       // 额外增加的节点
    coverageRate: number;       // 覆盖率
  };
  
  /** 歧义处理 */
  disambiguation: {
    pending: Ambiguity[];        // 待处理歧义
    resolved: Resolution[];    // 已解决歧义
  };
  
  /** 事实提取 */
  extraction: {
    events: ExtractedEvent[];     // 提取的事件
    stateDeltas: StateDelta[];  // 状态变化
    entityDeltas: EntityDelta[]; // 实体变化
    entitiesAppeared: Entity[];  // 本章出现的实体
    scenes: Scene[];            // 场景列表
    summaryText: string;        // 章节摘要
  };
  
  /** 投影状态 */
  projectionStatus: {
    state: ProjectionStatus;
    index: ProjectionStatus;
    summary: ProjectionStatus;
    memory: ProjectionStatus;
    vector: ProjectionStatus;
  };
  
  /** 时间戳 */
  timestamp: string;
}

export type ProjectionStatus = 'done' | 'pending' | 'skipped' | 'failed';

export interface Ambiguity {
  id: string;
  description: string;
  options: string[];
  selected?: string;
}

export interface Resolution {
  id: string;
  ambiguityId: string;
  resolution: string;
  reasoning: string;
}

export interface ExtractedEvent {
  eventId: string;
  chapter: number;
  eventType: string;
  subject: string;
  predicate: string;
  object?: string;
  timestamp?: string;
  location?: string;
}

export interface StateDelta {
  entityId: string;
  entityName: string;
  before: Record<string, any>;
  after: Record<string, any>;
  reason: string;
}

export interface EntityDelta {
  entityId: string;
  entityName: string;
  entityType: 'character' | 'location' | 'item' | 'faction';
  action: 'appeared' | 'disappeared' | 'changed';
  details?: Record<string, any>;
}

export interface Entity {
  id: string;
  name: string;
  type: 'character' | 'location' | 'item' | 'faction';
  firstAppeared: number;
  attributes: Record<string, any>;
}

export interface Scene {
  id: string;
  location: string;
  startTime: string;
  endTime?: string;
  characters: string[];
  keyEvents: string[];
}
```

#### 3.3.2 增强 Commit 服务

**新增文件**：`src/services/writing/enhanced-chapter-commit.ts`

```typescript
/**
 * 增强版章节 Commit 服务
 * 对齐 webnovel-writer 的 commit 流程
 */
import type { 
  ChapterCommitResult,
  ExtractedEvent,
  StateDelta,
  EntityDelta 
} from '@/types/chapter-commit';
import { extractChapterFacts } from './extract-plot-memory';

export interface CommitOptions {
  autoProject: boolean;
  strictMode: boolean;
}

export class EnhancedChapterCommitService {
  
  /**
   * 执行章节 Commit
   * 
   * 流程：
   * 1. Data Agent 提取事实
   * 2. 检查 fulfillment
   * 3. 检查 disambiguation
   * 4. 判定状态
   * 5. 执行投影
   */
  async commit(
    context: {
      project: any;
      chapter: any;
      chapterIndex: number;
    },
    reviewResult: any,
    options: CommitOptions = { autoProject: true, strictMode: true }
  ): Promise<ChapterCommitResult> {
    
    // 1. 提取事实
    const extraction = await extractChapterFacts(
      context.chapter,
      context.chapterIndex
    );
    
    // 2. 检查 fulfillment
    const fulfillment = this.checkFulfillment(
      extraction.events,
      extraction.stateDeltas,
      reviewResult
    );
    
    // 3. 检查 disambiguation
    const disambiguation = this.checkDisambiguation(extraction);
    
    // 4. 判定状态
    const status = this.determineStatus(fulfillment, disambiguation, options.strictMode);
    
    // 5. 执行投影（如需要）
    let projectionStatus: ChapterCommitResult['projectionStatus'] = {
      state: 'skipped',
      index: 'skipped',
      summary: 'skipped',
      memory: 'skipped',
      vector: 'skipped',
    };
    
    if (status === 'accepted' && options.autoProject) {
      projectionStatus = await this.performProjection(context, extraction);
    }
    
    return {
      status,
      fulfillment,
      disambiguation,
      extraction: {
        events: extraction.events,
        stateDeltas: extraction.stateDeltas,
        entityDeltas: extraction.entityDeltas,
        entitiesAppeared: extraction.entities,
        scenes: extraction.scenes,
        summaryText: extraction.summary,
      },
      projectionStatus,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * 检查节点覆盖
   */
  private checkFulfillment(
    events: ExtractedEvent[],
    stateDeltas: StateDelta[],
    reviewResult: any
  ): ChapterCommitResult['fulfillment'] {
    // 从任务书获取计划节点
    const plannedNodes = reviewResult?.taskBook?.CPNs || [];
    
    // 从提取的事件中匹配
    const coveredNodes: string[] = [];
    const missedNodes: string[] = [];
    const extraNodes: string[] = [];
    
    for (const node of plannedNodes) {
      const matched = events.some(e => 
        e.eventType.includes(node) || 
        e.description?.includes(node)
      );
      if (matched) {
        coveredNodes.push(node);
      } else {
        missedNodes.push(node);
      }
    }
    
    // 检查状态变化是否合理
    const stateChangesValid = stateDeltas.every(delta => 
      delta.reason && delta.reason.length > 0
    );
    
    if (!stateChangesValid) {
      missedNodes.push('状态变化缺乏合理性');
    }
    
    const coverageRate = plannedNodes.length > 0 
      ? coveredNodes.length / plannedNodes.length 
      : 1;
    
    return {
      plannedNodes,
      coveredNodes,
      missedNodes,
      extraNodes,
      coverageRate,
    };
  }
  
  /**
   * 检查歧义
   */
  private checkDisambiguation(
    extraction: any
  ): ChapterCommitResult['disambiguation'] {
    const pending: any[] = [];
    const resolved: any[] = [];
    
    // 检查实体歧义
    const entities = extraction.entities || [];
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        if (entities[i].name === entities[j].name) {
          pending.push({
            id: `entity-${i}-${j}`,
            description: `两个同名实体"${entities[i].name}"可能指代同一实体`,
            options: [
              `是同一实体，合并`,
              `不是同一实体，需要区分`,
            ],
          });
        }
      }
    }
    
    return { pending, resolved };
  }
  
  /**
   * 判定状态
   */
  private determineStatus(
    fulfillment: ChapterCommitResult['fulfillment'],
    disambiguation: ChapterCommitResult['disambiguation'],
    strictMode: boolean
  ): 'accepted' | 'rejected' {
    // 拒绝条件
    if (strictMode) {
      // 有遗漏的必须节点
      const missedRequired = fulfillment.missedNodes.filter(
        n => !n.includes('可选')
      );
      if (missedRequired.length > 0) {
        return 'rejected';
      }
      
      //有待处理歧义
      if (disambiguation.pending.length > 0) {
        return 'rejected';
      }
    }
    
    // 覆盖率过低
    if (fulfillment.coverageRate < 0.5) {
      return 'rejected';
    }
    
    return 'accepted';
  }
  
  /**
   * 执行投影
   */
  private async performProjection(
    context: any,
    extraction: any
  ): Promise<ChapterCommitResult['projectionStatus']> {
    const status = {
      state: 'pending' as const,
      index: 'pending' as const,
      summary: 'pending' as const,
      memory: 'pending' as const,
      vector: 'pending' as const,
    };
    
    try {
      // 状态投影
      await this.projectState(context, extraction.stateDeltas);
      status.state = 'done';
    } catch (e) {
      status.state = 'failed';
    }
    
    try {
      // 索引投影
      await this.projectIndex(context, extraction.entities);
      status.index = 'done';
    } catch (e) {
      status.index = 'failed';
    }
    
    try {
      // 摘要投影
      await this.projectSummary(context, extraction.summaryText);
      status.summary = 'done';
    } catch (e) {
      status.summary = 'failed';
    }
    
    // memory 和 vector 可选
    status.memory = 'skipped';
    status.vector = 'skipped';
    
    return status;
  }
  
  private async projectState(context: any, stateDeltas: StateDelta[]): Promise<void> {
    // TODO: 实现状态投影到项目 store
  }
  
  private async projectIndex(context: any, entities: any[]): Promise<void> {
    // TODO: 实现索引投影
  }
  
  private async projectSummary(context: any, summary: string): Promise<void> {
    // TODO: 实现摘要投影
  }
}
```

---

### Phase 4：Blocking Override 规则

#### 3.4.1 Override 规则定义

**新增文件**：`src/services/review/blocking-override-rules.ts`

```typescript
/**
 * Blocking Override 规则
 * 参考 webnovel-writer 的 override 规范
 */

/**
 * Override 规则
 */
export interface OverrideRule {
  /** 规则 ID */
  id: string;
  
  /** 适用分类 */
  category: string;
  
  /** 严重度 */
  severity: string[];
  
  /** 是否允许 Override */
  canOverride: boolean;
  
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  
  /** 说明 */
  description: string;
  
  /** 示例 */
  examples?: string[];
}

/**
 * 禁止 Override 的规则
 */
export const FORBIDDEN_OVERRIDE_RULES: OverrideRule[] = [
  {
    id: 'setting-conflict',
    category: 'setting',
    severity: ['critical', 'high'],
    canOverride: false,
    requiresConfirmation: false,
    description: '设定冲突（角色能力、世界规则、势力关系与设定集矛盾）',
    examples: [
      '主角使用了尚未觉醒的能力',
      '地点穿越：上章在A城，本章无交代突然在B城',
    ],
  },
  {
    id: 'timeline-conflict',
    category: 'timeline',
    severity: ['critical', 'high'],
    canOverride: false,
    requiresConfirmation: false,
    description: '时间线冲突（事件顺序、时间跨度与已有章节矛盾）',
    examples: [
      '上章是早上，本章突然变成晚上',
    ],
  },
  {
    id: 'fact-error',
    category: 'logic',
    severity: ['critical'],
    canOverride: false,
    requiresConfirmation: false,
    description: '事实错误（角色死亡后复活、已销毁道具再次出现等）',
    examples: [
      '已死角色复活',
    ],
  },
  {
    id: 'continuity-break',
    category: 'continuity',
    severity: ['critical', 'high'],
    canOverride: false,
    requiresConfirmation: false,
    description: '连续性断裂（上章结尾与本章开头无法衔接）',
  },
];

/**
 * 可以 Override 的规则
 */
export const ALLOWED_OVERRIDE_RULES: OverrideRule[] = [
  {
    id: 'pacing-deviation',
    category: 'pacing',
    severity: ['high', 'medium', 'low'],
    canOverride: true,
    requiresConfirmation: true,
    description: '节奏偏差（本章偏慢/偏快，但不影响剧情正确性）',
    examples: [
      '过渡章节奏偏慢，但本章是故意铺垫',
    ],
  },
  {
    id: 'style-suggestion',
    category: 'ai_flavor',
    severity: ['medium', 'low'],
    canOverride: true,
    requiresConfirmation: true,
    description: '风格建议（对话过于书面化、描写密度偏高等）',
    examples: [
      '对话风格偏书面，但角色设定就是学者/官员',
    ],
  },
  {
    id: 'optional-node-missed',
    category: 'continuity',
    severity: ['medium', 'low'],
    canOverride: true,
    requiresConfirmation: true,
    description: '可选节点未覆盖（CBN中某个可选推进节点未显式展开）',
  },
  {
    id: 'show-dont-tell-minor',
    category: 'show_dont_tell',
    severity: ['low'],
    canOverride: true,
    requiresConfirmation: true,
    description: '轻微的 Tell 表达（偶尔使用情绪词）',
  },
];

/**
 * 检查是否可以 Override
 */
export function canOverrideIssue(
  category: string,
  severity: string
): { canOverride: boolean; requiresConfirmation: boolean; reason?: string } {
  // 1. 先检查禁止规则
  for (const rule of FORBIDDEN_OVERRIDE_RULES) {
    if (rule.category === category && rule.severity.includes(severity)) {
      return {
        canOverride: false,
        requiresConfirmation: false,
        reason: rule.description,
      };
    }
  }
  
  // 2. 再检查允许规则
  for (const rule of ALLOWED_OVERRIDE_RULES) {
    if (rule.category === category && rule.severity.includes(severity)) {
      return {
        canOverride: true,
        requiresConfirmation: rule.requiresConfirmation,
      };
    }
  }
  
  // 3. 默认不允许
  return {
    canOverride: false,
    requiresConfirmation: true,
    reason: '未分类问题不允许 Override',
  };
}

/**
 * 获取 Override 确认消息
 */
export function getOverrideConfirmationMessage(
  issue: any,
  reason?: string
): string {
  return `确认 Override 以下问题？

类型：${issue.category}
严重度：${issue.severity}
描述：${issue.description}
${reason ? `\n原因：${reason}` : ''}

⚠️ Override 不等于"问题不存在"，而是"接受当前状态继续"
`;
}
```

---

## 四、UI 优化建议

### 4.1 审查结果展示

**新增组件**：`src/components/editor/ReviewResultPanel.vue`

```vue
<template>
  <div class="review-result-panel">
    <!-- 总体状态 -->
    <div class="status-banner" :class="{ passed, blocked: !passed }">
      <CheckCircle v-if="passed" class="icon" />
      <AlertTriangle v-else class="icon" />
      <span>{{ passed ? '审查通过' : `${blockingCount} 个阻断问题` }}</span>
    </div>
    
    <!-- 维度评分 -->
    <div class="dimension-scores">
      <div 
        v-for="(score, dimension) in dimensionScores" 
        :key="dimension"
        class="score-item"
      >
        <span class="dimension-name">{{ getDimensionName(dimension) }}</span>
        <div class="score-bar">
          <div 
            class="score-fill" 
            :class="getScoreClass(score)"
            :style="{ width: `${score}%` }"
          />
        </div>
        <span class="score-value">{{ score }}</span>
      </div>
    </div>
    
    <!-- 问题列表 -->
    <div class="issues-list">
      <div 
        v-for="issue in issues" 
        :key="issue.id"
        class="issue-item"
        :class="{ blocking: issue.blocking }"
      >
        <div class="issue-header">
          <NTag :type="getSeverityType(issue.severity)" size="small">
            {{ issue.severity }}
          </NTag>
          <NTag type="info" size="small">{{ issue.category }}</NTag>
          <span v-if="issue.blocking" class="blocking-badge">阻断</span>
        </div>
        <div class="issue-content">
          <p class="issue-description">{{ issue.description }}</p>
          <p class="issue-location">位置：{{ issue.location }}</p>
          <p v-if="issue.evidence" class="issue-evidence">
            证据：{{ issue.evidence }}
          </p>
          <p v-if="issue.fixHint" class="issue-hint">
            修复建议：{{ issue.fixHint }}
          </p>
        </div>
      </div>
    </div>
    
    <!-- Override 操作 -->
    <div v-if="canOverrideAny" class="override-section">
      <NButton @click="showOverrideDialog = true">
        Override 问题
      </NButton>
    </div>
  </div>
</template>
```

### 4.2 流水线状态增强

**增强现有流水线展示**：

```vue
<!-- 流水线状态增强 -->
<div class="pipeline-status">
  <div 
    v-for="(step, index) in pipelineSteps" 
    :key="step.key"
    class="pipeline-step"
    :class="{ active: step.status === 'active', completed: step.status === 'completed', blocked: step.status === 'blocked' }"
  >
    <div class="step-indicator">
      <Check v-if="step.status === 'completed'" />
      <X v-else-if="step.status === 'blocked'" />
      <span v-else>{{ index + 1 }}</span>
    </div>
    <span class="step-name">{{ step.name }}</span>
  </div>
</div>
```

---

## 五、实施计划

### 5.1 优先级排序

| 优先级 | 任务 | 工作量 | 价值 |
|--------|------|--------|------|
| P0 | 审查 Schema 扩展 | 中 | 高 |
| P0 | 章尾钩子检查 | 低 | 高 |
| P1 | 爽点密度检查 | 中 | 高 |
| P1 | Show Don't Tell 检查 | 低 | 中 |
| P2 | 任务书结构规范化 | 中 | 中 |
| P2 | Blocking Override 规则 | 低 | 中 |
| P3 | Commit 机制增强 | 高 | 中 |
| P3 | UI 优化 | 中 | 低 |

### 5.2 实施步骤

**Step 1: 扩展类型定义**
- 修改 `src/types/writing-task.ts`
- 添加新的 ReviewCategory 类型
- 扩展 ReviewIssue 接口

**Step 2: 实现专项检查服务**
- 创建 `src/services/review/special-checks.service.ts`
- 实现章尾、爽点、ShowDontTell 检查

**Step 3: 增强 BlockingReviewService**
- 集成专项检查
- 更新分析逻辑

**Step 4: 规范化任务书**
- 修改 `src/types/writing-task.ts` 中的 WritingTaskBook
- 创建增强版 builder

**Step 5: 实现 Override 规则**
- 创建 `src/services/review/blocking-override-rules.ts`
- 集成到 UI

**Step 6: 增强 Commit**
- 创建 `src/types/chapter-commit.ts`
- 实现增强版 commit 服务

**Step 7: UI 优化**
- 创建 ReviewResultPanel 组件
- 更新 AIPanel 展示

---

## 六、文件变更清单

### 新增文件

| 文件路径 | 说明 |
|----------|------|
| `src/services/review/special-checks.service.ts` | 专项检查服务 |
| `src/services/review/enhanced-blocking-review.service.ts` | 增强版审查服务 |
| `src/services/writing/enhanced-task-book-builder.ts` | 增强版任务书构建器 |
| `src/services/writing/enhanced-chapter-commit.ts` | 增强版 Commit 服务 |
| `src/services/review/blocking-override-rules.ts` | Override 规则 |
| `src/types/chapter-commit.ts` | Commit 类型定义 |
| `src/components/editor/ReviewResultPanel.vue` | 审查结果面板 |

### 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `src/types/writing-task.ts` | 扩展 ReviewIssue, ReviewCategory |
| `src/services/review/blocking-review.service.ts` | 集成专项检查 |
| `src/composables/useChapterWriter.ts` | 使用增强服务 |
| `src/composables/useBatchWriter.ts` | 使用增强服务 |
| `src/components/editor/AIPanel.vue` | 更新 UI |

---

## 七、风险与注意事项

### 7.1 兼容性

- 保持向后兼容，新增字段使用可选
- 老数据迁移使用默认值

### 7.2 性能

- 专项检查应在后台执行，不阻塞主流程
- 考虑添加缓存机制

### 7.3 用户体验

- Override 操作需要明确提示风险
- 保留历史记录便于回溯

---

## 八、附录

### A. 术语对照

| Moliu | webnovel-writer | oh-story |
|-------|------------------|----------|
| 续写 | 写章 | 写作 |
| 审查 | 审查 | 质量检查 |
| Blocking | blocking | - |
| 任务书 | TaskBook | 写作指南 |
| Commit | Commit | 归档 |

### B. 参考文档

- `skills/oh-story-claudecode-main/skills/story-long-write/references/anti-ai-writing.md`
- `skills/webnovel-writer-master/webnovel-writer/skills/webnovel-write/SKILL.md`
- `skills/webnovel-writer-master/webnovel-writer/references/review-schema.md`
- `skills/webnovel-writer-master/webnovel-writer/references/review/blocking-override-guidelines.md`

---

*文档版本：1.0 | 最后更新：2026-05-23*
