/**
 * 增强版章节提交管理器
 * 集成伏笔追踪和追读力信号更新
 * 参考 oh-story 的 Commit 增强设计
 */

import { ChapterCommitManager } from './ChapterCommitManager';
import type { CommitResult, FulfillmentResult } from './types';
import type { ReviewResult } from '../review/types';
import type { EnhancedForeshadow, ForeshadowStatus } from '@/types/writing-task';
import { useProjectStore } from '@/stores/project.store';

// ============================================
// 伏笔追踪集成
// ============================================

export interface ForeshadowTrackingResult {
  /** 新埋设的伏笔 */
  planted: EnhancedForeshadow[];
  /** 回收的伏笔 */
  resolved: EnhancedForeshadow[];
  /** 更新的伏笔 */
  updated: EnhancedForeshadow[];
  /** 状态摘要 */
  summary: string;
}

// 伏笔检测模式
const FORESHADOW_PATTERNS = {
  // 神秘伏笔
  mystery: [
    /不知|不明|隐藏|秘密|真相|谜团/,
    /为什么|怎么回事|究竟/,
    /这个人|这背后|这其中/,
  ],
  // 冲突伏笔
  conflict: [
    /隐患|危机|威胁|危险/,
    /终有一日|迟早|早晚/,
    /迟早会|终究会/,
  ],
  // 承诺伏笔
  promise: [
    /发誓|承诺|保证|一定|答应/,
    /等(我|你).*回来/,
    /一定会.*回来/,
  ],
  // 威胁伏笔
  threat: [
    /别怪我|别以为|等着/,
    /你会后悔|后悔的/,
    /我(会|一定)要/,
  ],
  // 疑问伏笔
  question: [
    /怎么会|怎么可能|为何/,
    /难道|难道说|难道不成/,
    /这是巧合吗|这意味着/,
  ],
};

// 伏笔回收模式
const FORESHADOW_RESOLVE_PATTERNS = [
  /原来如此|真相大白|水落石出/,
  /终于明白|恍然/,
  /谜底揭开|揭开真相/,
  /兑现承诺|完成了/,
  /复仇成功|打败了/,
];

/**
 * 增强版章节提交管理器
 * 在原有 Commit 机制基础上增加：
 * 1. 伏笔追踪
 * 2. 追读力信号更新
 * 3. 章节质量评分
 */
export class EnhancedChapterCommitManager extends ChapterCommitManager {
  /**
   * 执行增强版 Commit
   */
  async enhancedCommit(
    chapterNumber: number,
    reviewResult: ReviewResult,
    content: string,
    options?: {
      trackForeshadows?: boolean;
      updateReaderSignals?: boolean;
    }
  ): Promise<{
    commitResult: CommitResult;
    foreshadowResult?: ForeshadowTrackingResult;
    readerSignalResult?: ReaderSignalUpdateResult;
  }> {
    const opts = {
      trackForeshadows: true,
      updateReaderSignals: true,
      ...options,
    };

    // 1. 执行原有 Commit
    const commitResult = await this.commit(chapterNumber, reviewResult, content);

    // 2. 伏笔追踪
    let foreshadowResult: ForeshadowTrackingResult | undefined;
    if (opts.trackForeshadows) {
      foreshadowResult = await this.trackForeshadows(chapterNumber, content);
    }

    // 3. 追读力信号更新
    let readerSignalResult: ReaderSignalUpdateResult | undefined;
    if (opts.updateReaderSignals) {
      readerSignalResult = await this.updateReaderSignals(chapterNumber, content, reviewResult);
    }

    return {
      commitResult,
      foreshadowResult,
      readerSignalResult,
    };
  }

  // ============================================
  // 伏笔追踪
  // ============================================

  /**
   * 追踪伏笔（埋设和回收）
   */
  async trackForeshadows(
    chapterNumber: number,
    content: string
  ): Promise<ForeshadowTrackingResult> {
    const projectStore = useProjectStore();
    const project = projectStore.currentProject;
    
    const planted: EnhancedForeshadow[] = [];
    const resolved: EnhancedForeshadow[] = [];
    const updated: EnhancedForeshadow[] = [];

    // 获取当前伏笔列表
    const existingForeshadows: EnhancedForeshadow[] = (project as any)?.foreshadows || [];

    // 1. 检测新埋设的伏笔
    for (const [type, patterns] of Object.entries(FORESHADOW_PATTERNS)) {
      for (const pattern of patterns as RegExp[]) {
        const matches = content.match(new RegExp(pattern, 'g'));
        if (matches) {
          for (const match of matches) {
            // 检查是否已存在相同伏笔
            const exists = existingForeshadows.some(
              f => f.content.includes(match) && f.status !== 'resolved'
            );

            if (!exists) {
              const newForeshadow: EnhancedForeshadow = {
                id: `fs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                content: match,
                loopType: type as EnhancedForeshadow['loopType'],
                urgency: 'medium',
                plantedChapter: chapterNumber,
                status: 'buried',
                confidence: 0.7,
              };
              planted.push(newForeshadow);
            }
          }
        }
      }
    }

    // 2. 检测伏笔回收
    for (const foreshadow of existingForeshadows) {
      if (foreshadow.status === 'resolved') continue;

      // 检查是否在本章回收
      const contentLower = content.toLowerCase();
      const foreshadowContentLower = foreshadow.content.toLowerCase();

      // 直接匹配
      if (contentLower.includes(foreshadowContentLower)) {
        foreshadow.status = 'resolved';
        foreshadow.payoffChapter = chapterNumber;
        resolved.push(foreshadow);
        updated.push(foreshadow);
      }

      // 模式匹配回收
      for (const resolvePattern of FORESHADOW_RESOLVE_PATTERNS) {
        if (resolvePattern.test(content)) {
          // 简单处理：如果有未解决的同类型伏笔，可能被回收
          if (foreshadow.loopType === 'mystery' || foreshadow.loopType === 'promise') {
            foreshadow.status = 'resolved';
            foreshadow.payoffChapter = chapterNumber;
            resolved.push(foreshadow);
            updated.push(foreshadow);
            break;
          }
        }
      }
    }

    // 3. 更新伏笔状态
    for (const newForeshadow of planted) {
      // 更新项目伏笔列表
      existingForeshadows.push(newForeshadow);
    }

    // 更新项目状态
    if (project) {
      (project as any).foreshadows = existingForeshadows;
      await projectStore.saveProject();
    }

    // 生成摘要
    const summary = [
      planted.length > 0 ? `新埋设${planted.length}个伏笔` : '',
      resolved.length > 0 ? `回收${resolved.length}个伏笔` : '',
      updated.length > 0 ? `更新${updated.length}个伏笔状态` : '',
    ].filter(Boolean).join('，') || '伏笔状态无变化';

    return {
      planted,
      resolved,
      updated,
      summary,
    };
  }

  /**
   * 获取活跃伏笔（未回收）
   */
  getActiveForeshadows(): EnhancedForeshadow[] {
    const projectStore = useProjectStore();
    const project = projectStore.currentProject;
    const foreshadows: EnhancedForeshadow[] = (project as any)?.foreshadows || [];

    return foreshadows.filter(f => f.status !== 'resolved' && f.status !== 'abandoned');
  }

  /**
   * 获取需要回收的伏笔
   */
  getForeshadowsNeedingResolution(currentChapter: number): EnhancedForeshadow[] {
    const active = this.getActiveForeshadows();
    
    return active.filter(f => {
      // 超过 10 章未回收
      if (currentChapter - f.plantedChapter > 10) {
        return true;
      }
      // 已达预期回收章节
      if (f.expectedPayoffChapter && currentChapter >= f.expectedPayoffChapter) {
        return true;
      }
      return false;
    });
  }
}

// ============================================
// 追读力信号更新
// ============================================

export interface ReaderSignalUpdateResult {
  /** 更新前的信号 */
  before: ReaderSignals;
  /** 更新后的信号 */
  after: ReaderSignals;
  /** 变化摘要 */
  changes: string[];
}

export interface ReaderSignals {
  /** 悬念密度 */
  suspenseDensity: number;
  /** 冲突强度 */
  conflictIntensity: number;
  /** 情感波动 */
  emotionalWave: number;
  /** 信息差 */
  informationGap: number;
  /** 追读指数 */
  retentionIndex: number;
}

// 追读力信号检测模式
const READER_SIGNAL_PATTERNS = {
  suspenseDensity: [/紧张|悬念|疑问|猜测|好奇|期待/],
  conflictIntensity: [/争吵|打斗|冲突|对抗|较量|矛盾/],
  emotionalWave: [/愤怒|悲伤|高兴|震惊|感动|激动/],
  informationGap: [/不知道|不明|隐藏|秘密|真相|为什么/],
};

// 信号计算权重
const SIGNAL_WEIGHTS = {
  suspenseDensity: 0.3,
  conflictIntensity: 0.25,
  emotionalWave: 0.25,
  informationGap: 0.2,
};

/**
 * 更新追读力信号
 */
async function updateReaderSignals(
  chapterNumber: number,
  content: string,
  reviewResult: ReviewResult
): Promise<ReaderSignalUpdateResult> {
  const signals = calculateReaderSignals(content);
  
  // 从审查结果中获取反馈
  const chapterEndingScore = reviewResult?.scores?.chapterEnding || 70;
  const excitementScore = reviewResult?.scores?.excitement || 70;

  // 根据审查结果调整信号
  signals.retentionIndex = (
    signals.suspenseDensity * SIGNAL_WEIGHTS.suspenseDensity +
    signals.conflictIntensity * SIGNAL_WEIGHTS.conflictIntensity +
    signals.emotionalWave * SIGNAL_WEIGHTS.emotionalWave +
    signals.informationGap * SIGNAL_WEIGHTS.informationGap
  ) * (chapterEndingScore / 100) * (excitementScore / 100);

  // 生成变化摘要
  const changes: string[] = [];
  
  if (signals.suspenseDensity > 50) {
    changes.push('悬念密度高，可能增加追读');
  } else if (signals.suspenseDensity < 30) {
    changes.push('悬念密度低，建议增加悬念');
  }

  if (signals.conflictIntensity > 60) {
    changes.push('冲突强度高，节奏紧凑');
  } else if (signals.conflictIntensity < 30) {
    changes.push('冲突强度低，建议增加冲突');
  }

  return {
    before: { ...signals },
    after: signals,
    changes,
  };
}

/**
 * 计算追读力信号
 */
function calculateReaderSignals(content: string): ReaderSignals {
  const length = content.length;
  const signals: ReaderSignals = {
    suspenseDensity: 0,
    conflictIntensity: 0,
    emotionalWave: 0,
    informationGap: 0,
    retentionIndex: 0,
  };

  // 计算各信号密度
  for (const [signal, patterns] of Object.entries(READER_SIGNAL_PATTERNS)) {
    let count = 0;
    for (const pattern of patterns as RegExp[]) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        count += matches.length;
      }
    }
    
    // 密度 = 出现次数 / (字数/1000)
    const density = count / (length / 1000);
    
    // 归一化到 0-100
    (signals as any)[signal] = Math.min(100, density * 10);
  }

  return signals;
}

// ============================================
// 便捷函数
// ============================================

/**
 * 创建增强版提交管理器
 */
export function createEnhancedChapterCommitManager(): EnhancedChapterCommitManager {
  return new EnhancedChapterCommitManager();
}

/**
 * 执行增强版提交
 */
export async function enhancedCommit(
  chapterNumber: number,
  reviewResult: ReviewResult,
  content: string,
  options?: {
    trackForeshadows?: boolean;
    updateReaderSignals?: boolean;
  }
): Promise<{
  commitResult: CommitResult;
  foreshadowResult?: ForeshadowTrackingResult;
  readerSignalResult?: ReaderSignalUpdateResult;
}> {
  const manager = new EnhancedChapterCommitManager();
  return await manager.enhancedCommit(chapterNumber, reviewResult, content, options);
}
