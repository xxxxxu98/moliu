/**
 * 增强版伏笔追踪系统
 * 参考 oh-story 和 webnovel-writer 的伏笔设计
 */

import type { EnhancedForeshadow, LoopType, UrgencyLevel, ForeshadowStatus } from '@/types/writing-task';

// ============================================================
// 类型定义
// ============================================================

export interface Foreshadow {
  id: string;
  content: string;
  loopType: LoopType;
  urgency: UrgencyLevel;
  plantedChapter: number;
  expectedPayoffChapter?: number;
  payoffChapter?: number;
  status: ForeshadowStatus;
  confidence?: number;
  note?: string;
  tags?: string[];
}

export interface ForeshadowTrackerConfig {
  maxOverdueChapters: number;
  urgencyThresholds: {
    critical: number;
    high: number;
    medium: number;
  };
  autoResolveThreshold: number;
}

export interface ForeshadowStats {
  total: number;
  active: number;
  overdue: number;
  resolved: number;
  byType: Record<LoopType, number>;
  byUrgency: Record<UrgencyLevel, number>;
}

export interface ForeshadowReport {
  stats: ForeshadowStats;
  urgent: Foreshadow[];
  overdue: Foreshadow[];
  upcoming: Foreshadow[];
  recommendations: string[];
}

// ============================================================
// 检测模式
// ============================================================

const PLANT_PATTERNS: Record<LoopType, RegExp[]> = {
  mystery: [
    /不知|不明|隐藏|秘密|真相|谜团/,
    /为什么|怎么回事|究竟/,
    /这个人|这背后|这其中/,
  ],
  conflict: [
    /隐患|危机|危险|威胁|对立/,
    /终有一日|迟早|早晚/,
  ],
  promise: [
    /发誓|承诺|保证|一定|答应/,
    /等.{0,5}(?:我|你).{0,5}回来/,
  ],
  threat: [
    /别怪我|别以为|等着/,
    /你会后悔|后悔的/,
  ],
  question: [
    /怎么会|怎么可能|为何/,
    /难道|难道说/,
    /这是巧合吗|这意味着/,
  ],
};

const PAYOFF_PATTERNS: Record<LoopType, RegExp[]> = {
  mystery: [
    /原来如此|真相大白|水落石出/,
    /终于明白|恍然|明白了/,
  ],
  conflict: [
    /终于.*(?:解决|化解|平息)/,
    /危机解除|威胁消除/,
  ],
  promise: [
    /兑现承诺|完成了承诺/,
    /他.*回来了/,
  ],
  threat: [
    /后悔了|后悔莫及/,
    /(?:报仇|复仇|报复).*(?:成功|完成)/,
  ],
  question: [
    /终于.*明白了|原来是/,
    /答案揭晓|真相浮出/,
  ],
};

// ============================================================
// 伏笔追踪器
// ============================================================

export class EnhancedForeshadowTracker {
  private foreshadows: Map<string, Foreshadow> = new Map();
  private config: ForeshadowTrackerConfig;
  private currentChapter: number;

  constructor(config?: Partial<ForeshadowTrackerConfig>, initialForeshadows?: Foreshadow[]) {
    this.config = {
      maxOverdueChapters: 10,
      urgencyThresholds: { critical: 2, high: 5, medium: 8 },
      autoResolveThreshold: 0.8,
      ...config,
    };
    this.currentChapter = 0;

    if (initialForeshadows) {
      for (const fs of initialForeshadows) {
        this.foreshadows.set(fs.id, { ...fs });
      }
    }
  }

  setCurrentChapter(chapter: number): void {
    this.currentChapter = chapter;
  }

  plant(content: string, chapterNumber: number, options?: { loopType?: LoopType; expectedPayoff?: number; tags?: string[] }): Foreshadow[] {
    const planted: Foreshadow[] = [];
    const usedContents = new Set<string>();

    for (const [type, patterns] of Object.entries(PLANT_PATTERNS)) {
      for (const pattern of patterns) {
        const matches = content.match(new RegExp(pattern.source, 'g'));
        if (matches) {
          for (const match of matches) {
            if (usedContents.has(match)) continue;

            const exists = Array.from(this.foreshadows.values()).some(
              (fs) => fs.content.includes(match) && fs.status !== 'resolved'
            );
            if (exists) continue;

            usedContents.add(match);

            const foreshadow: Foreshadow = {
              id: `fs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              content: match,
              loopType: type as LoopType,
              urgency: this.calculateUrgency(chapterNumber, options?.expectedPayoff),
              plantedChapter: chapterNumber,
              expectedPayoffChapter: options?.expectedPayoff || chapterNumber + this.config.maxOverdueChapters,
              status: 'buried',
              confidence: 0.6 + Math.random() * 0.3,
              tags: options?.tags,
            };

            this.foreshadows.set(foreshadow.id, foreshadow);
            planted.push(foreshadow);
          }
        }
      }
    }

    return planted;
  }

  detectPayoff(content: string, chapterNumber: number): Foreshadow[] {
    const resolved: Foreshadow[] = [];

    for (const foreshadow of this.foreshadows.values()) {
      if (foreshadow.status === 'resolved') continue;

      const contentLower = content.toLowerCase();
      const foreshadowLower = foreshadow.content.toLowerCase();

      if (contentLower.includes(foreshadowLower)) {
        foreshadow.status = 'resolved';
        foreshadow.payoffChapter = chapterNumber;
        resolved.push(foreshadow);
        continue;
      }

      const payoffPatterns = PAYOFF_PATTERNS[foreshadow.loopType];
      for (const pattern of payoffPatterns) {
        if (pattern.test(content)) {
          if (foreshadow.loopType === this.getPatternType(pattern)) {
            foreshadow.status = 'resolved';
            foreshadow.payoffChapter = chapterNumber;
            resolved.push(foreshadow);
            break;
          }
        }
      }
    }

    return resolved;
  }

  private getPatternType(pattern: RegExp): LoopType | null {
    for (const [type, patterns] of Object.entries(PAYOFF_PATTERNS)) {
      if (patterns.some((p) => p.source === pattern.source)) {
        return type as LoopType;
      }
    }
    return null;
  }

  private calculateUrgency(chapterNumber: number, expectedPayoff?: number): UrgencyLevel {
    const expected = expectedPayoff || chapterNumber + this.config.maxOverdueChapters;
    const remaining = expected - this.currentChapter;

    if (remaining <= this.config.urgencyThresholds.critical) return 'critical';
    if (remaining <= this.config.urgencyThresholds.high) return 'high';
    if (remaining <= this.config.urgencyThresholds.medium) return 'medium';
    return 'low';
  }

  updateUrgencies(): void {
    for (const fs of this.foreshadows.values()) {
      if (fs.status !== 'resolved') {
        fs.urgency = this.calculateUrgency(fs.plantedChapter, fs.expectedPayoffChapter);
      }
    }
  }

  getActive(): Foreshadow[] {
    return Array.from(this.foreshadows.values()).filter(
      (fs) => fs.status !== 'resolved' && fs.status !== 'abandoned'
    );
  }

  getUrgent(): Foreshadow[] {
    return this.getActive().filter((fs) => fs.urgency === 'critical' || fs.urgency === 'high');
  }

  getOverdue(): Foreshadow[] {
    return this.getActive().filter((fs) => {
      if (!fs.expectedPayoffChapter) return false;
      return this.currentChapter > fs.expectedPayoffChapter + this.config.maxOverdueChapters;
    });
  }

  getResolved(): Foreshadow[] {
    return Array.from(this.foreshadows.values()).filter((fs) => fs.status === 'resolved');
  }

  getStats(): ForeshadowStats {
    const all = Array.from(this.foreshadows.values());
    const active = this.getActive();
    const overdue = this.getOverdue();
    const resolved = this.getResolved();

    const byType: Record<LoopType, number> = {
      mystery: 0,
      conflict: 0,
      promise: 0,
      threat: 0,
      question: 0,
    };
    const byUrgency: Record<UrgencyLevel, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const fs of active) {
      byType[fs.loopType]++;
      byUrgency[fs.urgency]++;
    }

    return { total: all.length, active: active.length, overdue: overdue.length, resolved: resolved.length, byType, byUrgency };
  }

  generateReport(): ForeshadowReport {
    const stats = this.getStats();
    const urgent = this.getUrgent();
    const overdue = this.getOverdue();
    const upcoming = this.getActive().filter((fs) => !urgent.includes(fs)).slice(0, 5);
    const recommendations: string[] = [];

    if (overdue.length > 0) {
      recommendations.push(`有 ${overdue.length} 个伏笔已过期未回收，建议在近期章节中处理`);
    }
    if (urgent.length > 3) {
      recommendations.push(`紧急伏笔过多（${urgent.length}个），建议加快伏笔回收节奏`);
    }
    if (stats.active < 5 && this.currentChapter > 10) {
      recommendations.push(`伏笔数量较少，建议增加伏笔埋设以增加悬念`);
    }
    if (stats.byType.question === 0) {
      recommendations.push(`缺少疑问型伏笔，建议增加"为什么"类悬念`);
    }

    return { stats, urgent, overdue, upcoming, recommendations };
  }

  abandon(id: string, reason?: string): boolean {
    const fs = this.foreshadows.get(id);
    if (fs) {
      fs.status = 'abandoned';
      if (reason) fs.note = reason;
      return true;
    }
    return false;
  }

  delete(id: string): boolean {
    return this.foreshadows.delete(id);
  }

  clear(): void {
    this.foreshadows.clear();
  }

  export(): Foreshadow[] {
    return Array.from(this.foreshadows.values());
  }

  import(foreshadows: Foreshadow[]): void {
    this.foreshadows.clear();
    for (const fs of foreshadows) {
      this.foreshadows.set(fs.id, { ...fs });
    }
  }
}

let trackerInstance: EnhancedForeshadowTracker | null = null;

export function getForeshadowTracker(): EnhancedForeshadowTracker {
  if (!trackerInstance) {
    trackerInstance = new EnhancedForeshadowTracker();
  }
  return trackerInstance;
}

export function createForeshadowTracker(
  config?: Partial<ForeshadowTrackerConfig>,
  initialForeshadows?: Foreshadow[]
): EnhancedForeshadowTracker {
  trackerInstance = new EnhancedForeshadowTracker(config, initialForeshadows);
  return trackerInstance;
}
