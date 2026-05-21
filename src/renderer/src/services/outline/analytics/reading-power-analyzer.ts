/**
 * Reading Power Analyzer
 * 追读力分析系统 - 分析每个章节的追读力（让读者想订阅下一章的能力）
 */

import type { ChapterCommit } from '../contracts';

/**
 * 追读力评分因素
 */
export interface ReadingPowerFactors {
  /** 悬念强度 (0-100) */
  suspense: number;
  /** 章末钩子强度 (0-100) */
  cliffhanger: number;
  /** 情绪高点 (0-100) */
  emotionalPeak: number;
  /** 信息差强度 (0-100) */
  informationGap: number;
  /** 冲突强度 (0-100) */
  conflict: number;
  /** 节奏紧凑度 (0-100) */
  pace: number;
}

/**
 * 追读力分析结果
 */
export interface ReadingPowerAnalysis {
  /** 章节ID */
  chapterId: number;
  /** 总分 (0-100) */
  score: number;
  /** 各因素得分 */
  factors: ReadingPowerFactors;
  /** 评级 */
  rating: 'S' | 'A' | 'B' | 'C' | 'D';
  /** 改进建议 */
  suggestions: string[];
  /** 问题诊断 */
  issues: string[];
}

/**
 * 钩子类型
 */
export type HookType =
  | 'conflict'    // 冲突悬念
  | 'information'  // 信息悬念
  | 'emotional'    // 情感悬念
  | 'danger'       // 危险悬念
  | 'revelation';  // 揭示悬念

/**
 * 悬念分析结果
 */
export interface SuspenseAnalysis {
  /** 悬念类型 */
  type: HookType;
  /** 悬念描述 */
  description: string;
  /** 悬念强度 (0-100) */
  intensity: number;
  /** 悬念是否明确 */
  isClear: boolean;
}

/**
 * 追读力分析器
 */
export class ReadingPowerAnalyzer {
  /**
   * 分析单个章节的追读力
   */
  analyze(chapter: ChapterCommit, previousChapter?: ChapterCommit): ReadingPowerAnalysis {
    // 分析各因素
    const suspense = this.analyzeSuspense(chapter);
    const cliffhanger = this.analyzeCliffhanger(chapter);
    const emotionalPeak = this.analyzeEmotionalPeak(chapter);
    const informationGap = this.analyzeInformationGap(chapter, previousChapter);
    const conflict = this.analyzeConflict(chapter);
    const pace = this.analyzePace(chapter);

    // 计算总分
    const score = Math.round(
      suspense * 0.2 +
      cliffhanger * 0.25 +
      emotionalPeak * 0.15 +
      informationGap * 0.15 +
      conflict * 0.15 +
      pace * 0.1
    );

    // 确定评级
    const rating = this.getRating(score);

    // 生成建议和问题
    const { suggestions, issues } = this.generateRecommendations(
      score,
      { suspense, cliffhanger, emotionalPeak, informationGap, conflict, pace },
      chapter
    );

    return {
      chapterId: chapter.chapterId,
      score,
      factors: { suspense, cliffhanger, emotionalPeak, informationGap, conflict, pace },
      rating,
      suggestions,
      issues,
    };
  }

  /**
   * 批量分析多个章节
   */
  analyzeBatch(chapters: ChapterCommit[]): ReadingPowerAnalysis[] {
    const results: ReadingPowerAnalysis[] = [];
    
    for (let i = 0; i < chapters.length; i++) {
      const previousChapter = i > 0 ? chapters[i - 1] : undefined;
      results.push(this.analyze(chapters[i], previousChapter));
    }
    
    return results;
  }

  /**
   * 分析悬念强度
   */
  private analyzeSuspense(chapter: ChapterCommit): number {
    const cen = chapter.nodes.cen;
    const suspense = this.analyzeHookType(cen);
    return suspense.intensity;
  }

  /**
   * 分析钩子类型
   */
  private analyzeHookType(cen: ChapterCommit['nodes']['cen']): SuspenseAnalysis {
    const statement = cen.statement || '';
    const suspense = cen.悬念 || '';
    const hookType = cen.钩子类型 || 'conflict';

    let intensity = 50;
    let type: HookType = 'conflict';
    let isClear = true;

    // 根据钩子类型评估强度
    switch (hookType) {
      case 'danger':
        type = 'danger';
        intensity = 80;
        break;
      case 'revelation':
        type = 'revelation';
        intensity = 75;
        break;
      case 'emotional':
        type = 'emotional';
        intensity = 60;
        break;
      case 'information':
        type = 'information';
        intensity = 65;
        break;
      default:
        type = 'conflict';
        intensity = 55;
    }

    // 根据悬念描述评估
    if (suspense.includes('?') || suspense.includes('吗') || suspense.includes('到底')) {
      intensity += 10;
    }

    if (suspense.includes('竟然') || suspense.includes('原来')) {
      intensity += 15;
    }

    if (suspense.includes('即将') || suspense.includes('马上')) {
      intensity += 10;
    }

    // 检查悬念是否清晰
    if (!suspense || suspense.length < 5) {
      isClear = false;
      intensity -= 20;
    }

    // 检查悬念是否明确指向下一章
    if (statement.includes('+') || statement.includes('?')) {
      intensity += 10;
    }

    return {
      type,
      description: suspense,
      intensity: Math.min(100, Math.max(0, intensity)),
      isClear,
    };
  }

  /**
   * 分析章末钩子强度
   */
  private analyzeCliffhanger(chapter: ChapterCommit): number {
    const cen = chapter.nodes.cen;
    const hookAnalysis = this.analyzeHookType(cen);

    let intensity = hookAnalysis.intensity;

    // 检查悬念是否足够具体
    if (hookAnalysis.isClear && hookAnalysis.description.length > 10) {
      intensity += 10;
    }

    // 检查悬念是否足够强烈
    if (hookAnalysis.description.includes('...') || hookAnalysis.description.includes('。')) {
      // 留白式悬念
      intensity += 5;
    }

    // 检查是否在高潮点断章
    const cpns = chapter.nodes.cpns || [];
    const lastCpn = cpns[cpns.length - 1];
    if (lastCpn && (lastCpn.statement.includes('爆发') || lastCpn.statement.includes('出手'))) {
      intensity += 15;
    }

    return Math.min(100, Math.max(0, intensity));
  }

  /**
   * 分析情绪高点
   */
  private analyzeEmotionalPeak(chapter: ChapterCommit): number {
    const { coolPoint } = chapter.requirements;

    let intensity = 40;  // 默认基础分

    // 有爽点加分
    if (coolPoint && coolPoint !== '待设定') {
      intensity = 60;
    }

    // 检查爽点类型
    if (coolPoint) {
      if (coolPoint.includes('打脸') || coolPoint.includes('碾压')) {
        intensity = 75;
      } else if (coolPoint.includes('身份') || coolPoint.includes('揭示')) {
        intensity = 70;
      } else if (coolPoint.includes('突破') || coolPoint.includes('升级')) {
        intensity = 70;
      } else if (coolPoint.includes('感情') || coolPoint.includes('心动')) {
        intensity = 65;
      }
    }

    // 检查是否有冲突
    if (chapter.requirements.resistance && chapter.requirements.resistance !== '待设定') {
      intensity += 10;
    }

    // 检查是否有代价
    if (chapter.requirements.cost && chapter.requirements.cost !== '待设定') {
      intensity += 5;
    }

    return Math.min(100, Math.max(0, intensity));
  }

  /**
   * 分析信息差
   */
  private analyzeInformationGap(
    chapter: ChapterCommit,
    previousChapter?: ChapterCommit
  ): number {
    let intensity = 50;

    // 检查是否有新信息揭示
    const cpns = chapter.nodes.cpns || [];
    for (const cpn of cpns) {
      if (cpn.statement.includes('揭示') || 
          cpn.statement.includes('发现') || 
          cpn.statement.includes('得知')) {
        intensity += 15;
        break;
      }
    }

    // 检查是否有悬念遗留
    const cen = chapter.nodes.cen;
    if (cen.悬念 && cen.悬念.length > 10) {
      intensity += 10;
    }

    // 检查与上章的信息连贯性
    if (previousChapter) {
      const prevCen = previousChapter.nodes.cen;
      const prevTopic = prevCen.statement?.split('|')[0]?.trim();
      const currTopic = chapter.nodes.cbn.statement?.split('|')[0]?.trim();
      
      if (prevTopic === currTopic) {
        // 主题连贯，加分
        intensity += 5;
      }
    }

    return Math.min(100, Math.max(0, intensity));
  }

  /**
   * 分析冲突强度
   */
  private analyzeConflict(chapter: ChapterCommit): number {
    let intensity = 50;

    const { objective, resistance, cost } = chapter.requirements;

    // 有明确目标
    if (objective && objective !== '待设定') {
      intensity += 10;
    }

    // 有明确阻力
    if (resistance && resistance !== '待设定') {
      intensity += 15;
      
      // 根据阻力类型评估
      if (resistance.includes('强敌') || resistance.includes('boss')) {
        intensity += 10;
      }
      if (resistance.includes('困境') || resistance.includes('绝境')) {
        intensity += 10;
      }
    }

    // 有明确代价
    if (cost && cost !== '待设定') {
      intensity += 10;
      
      // 根据代价类型评估
      if (cost.includes('死') || cost.includes('灭')) {
        intensity += 10;
      }
      if (cost.includes('失去') || cost.includes('牺牲')) {
        intensity += 5;
      }
    }

    return Math.min(100, Math.max(0, intensity));
  }

  /**
   * 分析节奏紧凑度
   */
  private analyzePace(chapter: ChapterCommit): number {
    let intensity = 50;

    const cpns = chapter.nodes.cpns || [];

    // 有足够的推进节点
    if (cpns.length >= 2 && cpns.length <= 4) {
      intensity += 15;
    } else if (cpns.length > 4) {
      intensity += 5;
    }

    // 检查节点是否紧凑
    let actionWords = 0;
    for (const cpn of cpns) {
      if (cpn.statement.includes('|')) {
        actionWords++;
      }
    }

    if (actionWords >= cpns.length * 0.8) {
      intensity += 10;
    }

    return Math.min(100, Math.max(0, intensity));
  }

  /**
   * 根据总分获取评级
   */
  private getRating(score: number): ReadingPowerAnalysis['rating'] {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  }

  /**
   * 生成改进建议和问题诊断
   */
  private generateRecommendations(
    score: number,
    factors: ReadingPowerFactors,
    chapter: ChapterCommit
  ): { suggestions: string[]; issues: string[] } {
    const suggestions: string[] = [];
    const issues: string[] = [];

    // 检查各因素
    if (factors.suspense < 60) {
      issues.push('悬念不够强烈，读者可能不会追订');
      suggestions.push('在CEN中加入更明确的悬念，如"即将发生什么"或"揭示什么秘密"');
    }

    if (factors.cliffhanger < 60) {
      issues.push('章末钩子不够吸引人');
      suggestions.push('尝试在章末设置一个行动、发现或揭露的临界点');
    }

    if (factors.emotionalPeak < 60) {
      issues.push('情绪高点不够突出');
      suggestions.push('增加一个爽点、虐点或心动点');
    }

    if (factors.informationGap < 60) {
      issues.push('信息差不够，读者没有好奇心');
      suggestions.push('留下一个未解之谜或暗示后续有重大揭示');
    }

    if (factors.conflict < 60) {
      issues.push('冲突不够激烈');
      suggestions.push('增加主角面临的风险或阻力');
    }

    if (factors.pace < 60) {
      issues.push('节奏可能偏慢');
      suggestions.push('精简章节内容，加快推进速度');
    }

    // 检查爽点
    if (!chapter.requirements.coolPoint || chapter.requirements.coolPoint === '待设定') {
      issues.push('缺少爽点设计');
      suggestions.push('必须为每一章设计一个爽点');
    }

    // 检查悬念
    if (!chapter.nodes.cen.悬念) {
      issues.push('CEN缺少悬念描述');
      suggestions.push('为CEN添加悬念说明');
    }

    // 高分建议
    if (score >= 85) {
      suggestions.unshift('本章追读力优秀！');
    }

    return { suggestions, issues };
  }

  /**
   * 生成分析报告
   */
  generateReport(analyses: ReadingPowerAnalysis[]): string {
    const lines: string[] = [];
    
    lines.push('# 追读力分析报告');
    lines.push('');
    
    // 统计
    const stats = {
      S: analyses.filter(a => a.rating === 'S').length,
      A: analyses.filter(a => a.rating === 'A').length,
      B: analyses.filter(a => a.rating === 'B').length,
      C: analyses.filter(a => a.rating === 'C').length,
      D: analyses.filter(a => a.rating === 'D').length,
    };
    
    const avgScore = analyses.reduce((sum, a) => sum + a.score, 0) / analyses.length;
    
    lines.push('## 总体统计');
    lines.push(`- 平均分：${avgScore.toFixed(1)}`);
    lines.push(`- S级：${stats.S}章`);
    lines.push(`- A级：${stats.A}章`);
    lines.push(`- B级：${stats.B}章`);
    lines.push(`- C级：${stats.C}章`);
    lines.push(`- D级：${stats.D}章`);
    lines.push('');
    
    // 列出低分章节
    const lowScoreChapters = analyses.filter(a => a.score < 70);
    if (lowScoreChapters.length > 0) {
      lines.push('## 需要改进的章节');
      for (const analysis of lowScoreChapters) {
        lines.push(`### 第${analysis.chapterId}章 (${analysis.score}分 - ${analysis.rating})`);
        for (const issue of analysis.issues) {
          lines.push(`- 问题：${issue}`);
        }
        for (const suggestion of analysis.suggestions) {
          lines.push(`- 建议：${suggestion}`);
        }
        lines.push('');
      }
    }
    
    // 高分章节
    const highScoreChapters = analyses.filter(a => a.score >= 85);
    if (highScoreChapters.length > 0) {
      lines.push('## 优秀章节');
      for (const analysis of highScoreChapters) {
        lines.push(`- 第${analysis.chapterId}章：${analysis.score}分`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  }
}

// 导出单例
export const readingPowerAnalyzer = new ReadingPowerAnalyzer();
