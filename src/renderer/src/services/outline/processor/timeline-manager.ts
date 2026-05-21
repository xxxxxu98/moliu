/**
 * Timeline Manager
 * Manages timeline consistency and validation
 */

import type { TimeAnchor, Timeline } from '../schemas/volume.schema';

/**
 * 时间解析结果
 */
interface ParsedTime {
  absolute: number;
  year: number;
  month: number;
  day: number;
  raw: string;
}

/**
 * 时间线管理器
 */
export class TimelineManager {
  private anchors: TimeAnchor[] = [];
  private monotonic: boolean = true;
  
  constructor() {}
  
  /**
   * 添加时间锚点
   */
  addAnchor(anchor: TimeAnchor): { valid: boolean; error?: string } {
    // 检查单调性
    if (this.anchors.length > 0 && this.monotonic) {
      const last = this.anchors[this.anchors.length - 1];
      
      if (!this.isTimeConsistent(last, anchor)) {
        return {
          valid: false,
          error: `时间不一致：第${last.chapter}章为${last.absoluteTime}，第${anchor.chapter}章为${anchor.absoluteTime}`,
        };
      }
      
      // 检查章节序号
      if (anchor.chapter !== last.chapter + 1) {
        return {
          valid: false,
          error: `章节序号不连续：第${last.chapter}章后应该是第${last.chapter + 1}章`,
        };
      }
    }
    
    this.anchors.push(anchor);
    return { valid: true };
  }
  
  /**
   * 检查两个时间锚点是否一致
   */
  private isTimeConsistent(a: TimeAnchor, b: TimeAnchor): boolean {
    const timeA = this.parseTime(a.absoluteTime);
    const timeB = this.parseTime(b.absoluteTime);
    
    // 检查绝对时间
    if (timeA.absolute > timeB.absolute) {
      return false;
    }
    
    // 检查倒计时逻辑
    if (a.countdown.active && b.countdown.active) {
      const aDays = a.countdown.daysRemaining || 0;
      const bDays = b.countdown.daysRemaining || 0;
      
      if (bDays > aDays) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 解析时间字符串
   */
  private parseTime(timeStr: string): ParsedTime {
    // 支持多种格式
    // 格式1: 仙历3021年春
    // 格式2: 末世第5天
    // 格式3: 公元2024年3月15日
    // 格式4: 第3章
    
    const result: ParsedTime = {
      absolute: 0,
      year: 0,
      month: 0,
      day: 0,
      raw: timeStr,
    };
    
    // 尝试匹配 "末世第X天"
    const dayMatch = timeStr.match(/末世第(\d+)天/);
    if (dayMatch) {
      result.day = parseInt(dayMatch[1], 10);
      result.absolute = result.day;
      return result;
    }
    
    // 尝试匹配 "第X章"
    const chapterMatch = timeStr.match(/第(\d+)章/);
    if (chapterMatch) {
      result.day = parseInt(chapterMatch[1], 10);
      result.absolute = result.day;
      return result;
    }
    
    // 尝试匹配 "仙历XXXX年春/夏/秋/冬"
    const xianliMatch = timeStr.match(/仙历(\d+)/);
    if (xianliMatch) {
      result.year = parseInt(xianliMatch[1], 10);
      result.absolute = result.year;
      return result;
    }
    
    // 尝试匹配 "XXXX年X月X日"
    const dateMatch = timeStr.match(/(\d+)年(\d+)月(\d+)日/);
    if (dateMatch) {
      result.year = parseInt(dateMatch[1], 10);
      result.month = parseInt(dateMatch[2], 10);
      result.day = parseInt(dateMatch[3], 10);
      result.absolute = result.year * 10000 + result.month * 100 + result.day;
      return result;
    }
    
    // 无法解析，返回默认值
    return result;
  }
  
  /**
   * 获取时间线
   */
  getTimeline(): TimeAnchor[] {
    return [...this.anchors].sort((a, b) => a.chapter - b.chapter);
  }
  
  /**
   * 获取章节时间
   */
  getChapterTime(chapterNumber: number): TimeAnchor | undefined {
    return this.anchors.find(a => a.chapter === chapterNumber);
  }
  
  /**
   * 验证所有时间锚点
   */
  validateAll(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (let i = 1; i < this.anchors.length; i++) {
      const prev = this.anchors[i - 1];
      const curr = this.anchors[i];
      
      if (!this.isTimeConsistent(prev, curr)) {
        errors.push(
          `第${curr.chapter}章时间与第${prev.chapter}章冲突：${prev.absoluteTime} → ${curr.absoluteTime}`
        );
      }
      
      if (curr.chapter !== prev.chapter + 1) {
        errors.push(
          `章节序号不连续：第${prev.chapter}章后应该是第${prev.chapter + 1}章`
        );
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * 导出为契约格式
   */
  exportForContract(): Timeline {
    return {
      baseline: this.anchors[0]?.absoluteTime || '',
      span: this.calculateTotalSpan(),
      direction: 'forward',
      monotonic: this.monotonic,
      anchors: this.anchors,
      countdownEvents: this.anchors
        .filter(a => a.countdown.active)
        .map(a => ({
          event: a.countdown.event || '',
          targetChapter: a.chapter,
          daysRemaining: a.countdown.daysRemaining || 0,
        })),
    };
  }
  
  /**
   * 计算总时间跨度
   */
  private calculateTotalSpan(): string {
    if (this.anchors.length < 2) {
      return '单章';
    }
    
    const first = this.anchors[0];
    const last = this.anchors[this.anchors.length - 1];
    
    const timeFirst = this.parseTime(first.absoluteTime);
    const timeLast = this.parseTime(last.absoluteTime);
    
    if (timeFirst.absolute > 0 && timeLast.absolute > 0) {
      const diff = timeLast.absolute - timeFirst.absolute;
      return `约${diff}单位`;
    }
    
    return `${this.anchors.length}章`;
  }
  
  /**
   * 重置
   */
  reset() {
    this.anchors = [];
  }
  
  /**
   * 从现有数据加载
   */
  loadFromTimeline(timeline: Timeline) {
    this.anchors = [...timeline.anchors];
    this.monotonic = timeline.monotonic;
  }
  
  /**
   * 检查是否有倒计时冲突
   */
  checkCountdownConflicts(): { valid: boolean; conflicts: string[] } {
    const conflicts: string[] = [];
    
    for (let i = 1; i < this.anchors.length; i++) {
      const prev = this.anchors[i - 1];
      const curr = this.anchors[i];
      
      if (prev.countdown.active && curr.countdown.active) {
        const prevDays = prev.countdown.daysRemaining || 0;
        const currDays = curr.countdown.daysRemaining || 0;
        
        if (currDays > prevDays) {
          conflicts.push(
            `倒计时冲突：第${curr.chapter}章的剩余天数(${currDays})大于第${prev.chapter}章(${prevDays})`
          );
        }
      }
    }
    
    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }
  
  /**
   * 获取章节之间的时间间隔
   */
  getTimeGap(fromChapter: number, toChapter: number): string | undefined {
    const fromAnchor = this.anchors.find(a => a.chapter === fromChapter);
    const toAnchor = this.anchors.find(a => a.chapter === toChapter);
    
    if (!fromAnchor || !toAnchor) return undefined;
    
    return toAnchor.gapFromPrevious;
  }
  
  /**
   * 获取活跃的倒计时
   */
  getActiveCountdowns(): { event: string; chapter: number; daysRemaining: number }[] {
    return this.anchors
      .filter(a => a.countdown.active && a.countdown.daysRemaining !== undefined)
      .map(a => ({
        event: a.countdown.event || '未知事件',
        chapter: a.chapter,
        daysRemaining: a.countdown.daysRemaining!,
      }))
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }
}

// 导出单例
export const timelineManager = new TimelineManager();
