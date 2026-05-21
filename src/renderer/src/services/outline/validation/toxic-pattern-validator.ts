/**
 * Toxic Pattern Validator
 * 毒点自动检测系统 - 检测常见的写作毒点和反模式
 */

import type { ChapterCommit, StoryContract } from '../contracts';

/**
 * 毒点类型
 */
export type ToxicPatternType =
  | '圣母心'        // 主角过于善良，不杀该杀之人
  | '战力崩坏'      // 前后战斗力不一致
  | '女主工具人'    // 女性角色没有独立人格
  | '无脑反派'      // 反派只会嘲讽，智商不在线
  | '开篇背景'      // 开头大段设定介绍
  | '圣母原谅'      // 轻易原谅敌人
  | '主角被动'      // 主角一直被动挨打
  | '升级太快'      // 实力提升没有铺垫
  | '感情突兀'      // 感情线发展太突然
  | '配角弱智'      // 配角智商下线
  | '嘴炮无敌'      // 只会说不会做
  | '金手指无代价'  // 金手指没有限制
  | '节奏拖沓'      // 无意义的描写和对话
  | '设定矛盾'      // 前后设定不一致
  | '情绪断崖'      // 情绪突变没有过渡
  | '重复套路'      // 同一套路反复使用
  | '无意义虐主'    // 为虐而虐
  | '信息轰炸'      // 一次性输出太多信息
  | '视角混乱'      // 叙述视角不稳定
  | '章末水'       // 章末注水拖沓
  | '过度解释'      // 描写过于详细解释
  | '重复词汇'      // 同一词汇使用过多
  | '尴尬对话'      // 对话不自然
  | '场景跳跃'      // 场景转换太突兀
  | '角色脸谱化';   // 角色性格单一

/**
 * 毒点检测规则
 */
export interface ToxicPatternRule {
  id: string;
  type: ToxicPatternType;
  name: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  patterns: RegExp[];
  suggestions: string[];
}

/**
 * 检测结果
 */
export interface ToxicPatternMatch {
  rule: ToxicPatternRule;
  match: string;
  position: number;
  context: string;
}

/**
 * 检测报告
 */
export interface ToxicPatternReport {
  /** 章节ID */
  chapterId?: number;
  /** 是否通过 */
  passed: boolean;
  /** 匹配结果 */
  matches: ToxicPatternMatch[];
  /** 按严重性分组 */
  bySeverity: {
    critical: ToxicPatternMatch[];
    major: ToxicPatternMatch[];
    minor: ToxicPatternMatch[];
  };
  /** 按类型分组 */
  byType: Record<ToxicPatternType, ToxicPatternMatch[]>;
  /** 总体评分 (0-100，越高越健康) */
  healthScore: number;
  /** 建议 */
  suggestions: string[];
}

// ====== 毒点规则库 ======

const TOXIC_PATTERN_RULES: ToxicPatternRule[] = [
  {
    id: 'toxic-001',
    type: '圣母心',
    name: '圣母心',
    description: '主角过于善良，对敌人手下留情',
    severity: 'critical',
    patterns: [
      /原谅.*敌人/,
      /不杀.*投降/,
      /对手.*认错.*就.*算了/,
      /敌人.*求饶.*就.*放了/,
    ],
    suggestions: [
      '让主角有仇必报，增加角色的狠辣感',
      '可以原谅，但要设计更有说服力的理由',
    ],
  },
  {
    id: 'toxic-002',
    type: '战力崩坏',
    name: '战力崩坏',
    description: '前后战斗力不一致',
    severity: 'critical',
    patterns: [
      /之前.*打不过.*现在.*一招/,
      /突然.*变强.*没有.*原因/,
      /昨天.*还.*今天.*就.*无敌/,
    ],
    suggestions: [
      '提前铺垫能力来源',
      '为实力提升设计合理的剧情',
    ],
  },
  {
    id: 'toxic-003',
    type: '女主工具人',
    name: '女主工具人',
    description: '女主只存在于推动男主剧情',
    severity: 'major',
    patterns: [
      /只要.*出现.*就是为了.*男主/,
      /女主.*只会.*等待.*救援/,
      /所有.*女主.*都.*围着.*男主.*转/,
    ],
    suggestions: [
      '给女主独立的剧情线和成长弧',
      '让女主有自己的目标和问题',
    ],
  },
  {
    id: 'toxic-004',
    type: '无脑反派',
    name: '无脑反派',
    description: '反派只会嘲讽，不展示智商',
    severity: 'major',
    patterns: [
      /反派.*就知道.*嘲笑/,
      /反派.*只会.*嘴炮/,
      /反派.*智商.*下线/,
    ],
    suggestions: [
      '增加反派的智谋描写',
      '让反派有自己的逻辑和立场',
    ],
  },
  {
    id: 'toxic-005',
    type: '开篇背景',
    name: '开篇背景介绍',
    description: '开头大段设定介绍',
    severity: 'major',
    patterns: [
      /^.*世界观.*规则.*设定/,
      /第一章.*就.*介绍.*世界/,
    ],
    suggestions: [
      '从冲突切入，不要先介绍设定',
      '设定要通过剧情自然带出',
    ],
  },
  {
    id: 'toxic-006',
    type: '圣母原谅',
    name: '圣母原谅',
    description: '轻易原谅敌人',
    severity: 'major',
    patterns: [
      /虽然.*但是.*还是.*原谅了/,
      /算了.*不.*追究/,
      /看.*可怜.*就.*算了/,
    ],
    suggestions: [
      '报仇要干脆',
      '如果原谅，需要更长的情感铺垫',
    ],
  },
  {
    id: 'toxic-007',
    type: '升级太快',
    name: '升级太快',
    description: '实力提升没有铺垫',
    severity: 'major',
    patterns: [
      /修炼.*一.*天.*就.*突破了/,
      /突然.*顿悟.*实力.*大涨/,
      /吃了.*什么.*就.*变强/,
    ],
    suggestions: [
      '为升级设计合理的积累过程',
      '增加瓶颈和困难的描写',
    ],
  },
  {
    id: 'toxic-008',
    type: '感情突兀',
    name: '感情突兀',
    description: '感情线发展太突然',
    severity: 'major',
    patterns: [
      /突然.*就.*喜欢/,
      /第一.*见面.*就.*爱上/,
      /没有任何.*铺垫.*就.*感情.*升温/,
    ],
    suggestions: [
      '增加感情发展的铺垫和互动',
      '让感情有合理的递进过程',
    ],
  },
  {
    id: 'toxic-009',
    type: '配角弱智',
    name: '配角弱智',
    description: '配角智商下线',
    severity: 'major',
    patterns: [
      /配角.*看不出来.*明显.*陷阱/,
      /明明.*很聪明.*突然.*变蠢/,
    ],
    suggestions: [
      '配角行为要符合其人设',
      '不要为了剧情牺牲角色智商',
    ],
  },
  {
    id: 'toxic-010',
    type: '节奏拖沓',
    name: '节奏拖沓',
    description: '无意义的描写和对话',
    severity: 'minor',
    patterns: [
      /这里.*描写.*环境.*长达/,
      /这段.*对话.*没有.*推进.*剧情/,
      /无关.*紧要.*的.*描写/,
    ],
    suggestions: [
      '删除不影响剧情的内容',
      '保持每段都有推进',
    ],
  },
  {
    id: 'toxic-011',
    type: '设定矛盾',
    name: '设定矛盾',
    description: '前后设定不一致',
    severity: 'critical',
    patterns: [
      /前面.*说.*后面.*又.*说.*不同/,
      /设定.*前后.*矛盾/,
    ],
    suggestions: [
      '建立设定追踪表',
      '避免随意改变已建立的设定',
    ],
  },
  {
    id: 'toxic-012',
    type: '情绪断崖',
    name: '情绪断崖',
    description: '情绪突变没有过渡',
    severity: 'minor',
    patterns: [
      /突然.*从.*悲伤.*变成.*开心/,
      /刚才.*还.*哭.*现在.*就.*笑/,
    ],
    suggestions: [
      '增加情绪过渡描写',
      '让情绪变化有合理的触发点',
    ],
  },
  {
    id: 'toxic-013',
    type: '重复套路',
    name: '重复套路',
    description: '同一套路反复使用',
    severity: 'minor',
    patterns: [
      /又是.*打脸/,
      /总是.*同样的.*模式/,
    ],
    suggestions: [
      '变换套路，增加新鲜感',
      '设计不同的冲突类型',
    ],
  },
  {
    id: 'toxic-014',
    type: '信息轰炸',
    name: '信息轰炸',
    description: '一次性输出太多信息',
    severity: 'minor',
    patterns: [
      /一口气.*介绍.*很多.*人物/,
      /一次性.*抛出.*大量.*设定/,
    ],
    suggestions: [
      '分批次引入新信息',
      '让信息通过剧情自然带出',
    ],
  },
  {
    id: 'toxic-015',
    type: '章末水',
    name: '章末注水',
    description: '章末拖沓',
    severity: 'minor',
    patterns: [
      /章末.*还在.*讲.*无关.*内容/,
      /结尾.*注水.*凑字数/,
    ],
    suggestions: [
      '章末要留钩子',
      '结尾要推动读者订阅',
    ],
  },
  {
    id: 'toxic-016',
    type: '金手指无代价',
    name: '金手指无代价',
    description: '主角金手指没有限制',
    severity: 'major',
    patterns: [
      /系统.*什么.*都能.*做/,
      /能力.*没有.*限制/,
      /想.*用.*就.*用/,
    ],
    suggestions: [
      '为金手指增加限制和代价',
      '让能力有冷却或副作用',
    ],
  },
  {
    id: 'toxic-017',
    type: '嘴炮无敌',
    name: '嘴炮无敌',
    description: '只会说不会做',
    severity: 'minor',
    patterns: [
      /说.*很厉害.*但.*没.*展示/,
      /吹牛.*很响.*实力.*不行/,
    ],
    suggestions: [
      '展示比描述更重要',
      '让角色用行动证明自己',
    ],
  },
];

// ====== 检测器类 ======

/**
 * 毒点检测器
 */
export class ToxicPatternValidator {
  private rules: ToxicPatternRule[] = TOXIC_PATTERN_RULES;

  /**
   * 检测文本中的毒点
   */
  detect(text: string, chapterId?: number): ToxicPatternReport {
    const matches: ToxicPatternMatch[] = [];

    // 对每条规则进行检测
    for (const rule of this.rules) {
      for (const pattern of rule.patterns) {
        const regex = new RegExp(pattern.source, 'gi');
        let match;

        while ((match = regex.exec(text)) !== null) {
          matches.push({
            rule,
            match: match[0],
            position: match.index,
            context: this.extractContext(text, match.index, 50),
          });
        }
      }
    }

    // 按严重性分组
    const bySeverity = {
      critical: matches.filter(m => m.rule.severity === 'critical'),
      major: matches.filter(m => m.rule.severity === 'major'),
      minor: matches.filter(m => m.rule.severity === 'minor'),
    };

    // 按类型分组
    const byType = {} as Record<ToxicPatternType, ToxicPatternMatch[]>;
    for (const type of Object.keys(TOXIC_PATTERN_RULES.reduce((acc, r) => {
      acc[r.type] = true;
      return acc;
    }, {} as Record<string, boolean>)) as ToxicPatternType[]) {
      byType[type] = matches.filter(m => m.rule.type === type);
    }

    // 计算健康分
    const healthScore = this.calculateHealthScore(bySeverity);

    // 生成建议
    const suggestions = this.generateSuggestions(matches);

    return {
      chapterId,
      passed: bySeverity.critical.length === 0,
      matches,
      bySeverity,
      byType,
      healthScore,
      suggestions,
    };
  }

  /**
   * 检测章纲中的毒点
   */
  detectChapterOutline(chapter: ChapterCommit): ToxicPatternReport {
    const text = this.chapterToText(chapter);
    return this.detect(text, chapter.chapterId);
  }

  /**
   * 检测多个章纲
   */
  detectBatch(chapters: ChapterCommit[]): ToxicPatternReport[] {
    return chapters.map(chapter => this.detectChapterOutline(chapter));
  }

  /**
   * 根据题材获取特定毒点
   */
  getPatternsForGenre(genre: string): ToxicPatternRule[] {
    const genrePatterns: Record<string, ToxicPatternType[]> = {
      '玄幻': ['战力崩坏', '升级太快', '金手指无代价'],
      '都市': ['战力崩坏', '女主工具人', '感情突兀'],
      '悬疑': ['设定矛盾', '配角弱智'],
      '现言': ['感情突兀', '女主工具人'],
      '古言': ['圣母原谅', '感情突兀'],
    };

    const types = genrePatterns[genre] || [];
    return this.rules.filter(r => types.includes(r.type));
  }

  /**
   * 计算健康分
   */
  private calculateHealthScore(bySeverity: ToxicPatternReport['bySeverity']): number {
    // 基础分100
    let score = 100;

    // 严重问题扣分
    score -= bySeverity.critical.length * 20;
    score -= bySeverity.major.length * 10;
    score -= bySeverity.minor.length * 3;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 生成建议
   */
  private generateSuggestions(matches: ToxicPatternMatch[]): string[] {
    const suggestions: string[] = [];

    // 按类型去重
    const types = new Set(matches.map(m => m.rule.type));
    for (const type of types) {
      const match = matches.find(m => m.rule.type === type);
      if (match) {
        suggestions.push(...match.rule.suggestions);
      }
    }

    return suggestions;
  }

  /**
   * 提取上下文
   */
  private extractContext(text: string, position: number, length: number): string {
    const start = Math.max(0, position - length);
    const end = Math.min(text.length, position + length);
    let context = text.slice(start, end);

    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';

    return context;
  }

  /**
   * 将章纲转换为文本
   */
  private chapterToText(chapter: ChapterCommit): string {
    const parts: string[] = [];

    // 节点
    if (chapter.nodes.cbn) {
      parts.push(chapter.nodes.cbn.statement || '');
    }
    if (chapter.nodes.cpns) {
      parts.push(...chapter.nodes.cpns.map(cpn => cpn.statement || ''));
    }
    if (chapter.nodes.cen) {
      parts.push(chapter.nodes.cen.statement || '');
    }

    // 要求
    if (chapter.requirements.objective) {
      parts.push(chapter.requirements.objective);
    }
    if (chapter.requirements.resistance) {
      parts.push(chapter.requirements.resistance);
    }
    if (chapter.requirements.coolPoint) {
      parts.push(chapter.requirements.coolPoint);
    }

    return parts.join(' ');
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: ToxicPatternRule): void {
    this.rules.push(rule);
  }

  /**
   * 生成报告
   */
  generateReport(reports: ToxicPatternReport[]): string {
    const lines: string[] = [];

    lines.push('# 毒点检测报告');
    lines.push('');

    // 统计
    const totalCritical = reports.reduce((sum, r) => sum + r.bySeverity.critical.length, 0);
    const totalMajor = reports.reduce((sum, r) => sum + r.bySeverity.major.length, 0);
    const totalMinor = reports.reduce((sum, r) => sum + r.bySeverity.minor.length, 0);
    const avgScore = reports.reduce((sum, r) => sum + r.healthScore, 0) / reports.length;

    lines.push('## 总体统计');
    lines.push(`- 平均健康分：${avgScore.toFixed(1)}`);
    lines.push(`- 严重问题：${totalCritical}个`);
    lines.push(`- 主要问题：${totalMajor}个`);
    lines.push(`- 次要问题：${totalMinor}个`);
    lines.push('');

    // 列出严重问题
    if (totalCritical > 0) {
      lines.push('## 严重问题');
      for (const report of reports) {
        for (const match of report.bySeverity.critical) {
          lines.push(`### 第${report.chapterId}章：${match.rule.name}`);
          lines.push(`- 匹配内容：${match.match}`);
          lines.push(`- 上下文：${match.context}`);
          lines.push(`- 建议：${match.rule.suggestions.join('；')}`);
          lines.push('');
        }
      }
    }

    // 主要问题汇总
    if (totalMajor > 0) {
      lines.push('## 主要问题汇总');
      const majorByType = new Map<string, number>();
      for (const report of reports) {
        for (const match of report.bySeverity.major) {
          const count = majorByType.get(match.rule.type) || 0;
          majorByType.set(match.rule.type, count + 1);
        }
      }
      for (const [type, count] of majorByType.entries()) {
        lines.push(`- ${type}：${count}处`);
      }
      lines.push('');
    }

    // 优秀章节
    const healthyChapters = reports.filter(r => r.healthScore >= 90);
    if (healthyChapters.length > 0) {
      lines.push('## 健康章节');
      for (const report of healthyChapters) {
        lines.push(`- 第${report.chapterId}章：${report.healthScore}分`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// 导出单例
export const toxicPatternValidator = new ToxicPatternValidator();
