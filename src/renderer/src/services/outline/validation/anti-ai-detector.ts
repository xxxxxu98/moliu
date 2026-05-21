/**
 * Anti-AI Text Detector
 * AI 味检测系统 - 检测并去除 AI 生成的文本特征
 */

import type { ChapterCommit } from '../contracts';

/**
 * AI 味特征类型
 */
export interface AIFeaturePattern {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  weight: number;
  suggestions: string[];
}

/**
 * 检测结果
 */
export interface AIDetectionResult {
  /** 是否通过 */
  passed: boolean;
  /** AI 味得分 (0-100，越低越好) */
  score: number;
  /** 特征列表 */
  features: {
    pattern: AIFeaturePattern;
    count: number;
    examples: string[];
  }[];
  /** 改进建议 */
  suggestions: string[];
  /** 各特征详细分析 */
  analysis: {
    pattern: AIFeaturePattern;
    count: number;
    examples: string[];
    severity: 'high' | 'medium' | 'low';
  }[];
}

/**
 * AI 味特征模式库
 */
const AI_FEATURE_PATTERNS: AIFeaturePattern[] = [
  // 过度使用序数词
  {
    id: 'ai-001',
    name: '过度使用序数词',
    description: '滥用"首先、其次、最后"等过渡词',
    pattern: /首先|其次|最后|第一|第二|第三|然后|接下来|此外|与此同时|值得一提的是|值得注意的是/gi,
    weight: 3,
    suggestions: ['使用更自然的过渡，如"接着"、"之后"、"与此同时"'],
  },
  // 过度强调
  {
    id: 'ai-002',
    name: '过度使用的强调词',
    description: '滥用"毫无疑问、显然、毫无疑问地说"',
    pattern: /毫无疑问|毫无疑问地|显然|显而易见|不言而喻|毋庸置疑|必须指出|应该指出|值得注意/gi,
    weight: 5,
    suggestions: ['删除过度强调，保持叙述的自然节奏'],
  },
  // 滥用转折词
  {
    id: 'ai-003',
    name: '滥用转折词',
    description: '过多使用"然而、但是、可是"',
    pattern: /然而|但是|可是|不过|然而出乎意料的是|然而事实是|然而让人惊讶的是/gi,
    weight: 3,
    suggestions: ['减少转折词使用，让叙事更流畅'],
  },
  // 过多"突然"
  {
    id: 'ai-004',
    name: '过多使用"突然"',
    description: '"突然、忽然"使用过于频繁',
    pattern: /突然|忽然|刹那间|一瞬间|电光火石间|眨眼之间/gi,
    weight: 2,
    suggestions: ['使用更具体的动作描写替代"突然"'],
  },
  // 代词过多
  {
    id: 'ai-005',
    name: '代词使用过多',
    description: '"他/她/它"等代词使用过于频繁',
    pattern: /他/gi,
    weight: 2,
    suggestions: ['使用角色名字替代代词，增加辨识度'],
  },
  // 过度解释
  {
    id: 'ai-006',
    name: '过度解释',
    description: '对显而易见的事情进行解释',
    pattern: /这是因为|原因是|也就是说|换句话说|也就是说|也就是说/gi,
    weight: 4,
    suggestions: ['删除解释性语句，让读者自己理解'],
  },
  // 完美对称
  {
    id: 'ai-007',
    name: '完美对称句式',
    description: '过多使用对仗工整的句式',
    pattern: /既.*又.*|不是.*而是.*|一方面.*另一方面.*|既.*也.*/gi,
    weight: 3,
    suggestions: ['使用更自然的叙述方式'],
  },
  // 机械式情感
  {
    id: 'ai-008',
    name: '机械式情感描述',
    description: '情感描写过于刻板',
    pattern: /心中一暖|心头一颤|眼眶微红|嘴唇颤抖|握紧了拳头|深吸一口气/gi,
    weight: 2,
    suggestions: ['使用更细腻、独特的情感描写'],
  },
  // 过多形容词
  {
    id: 'ai-009',
    name: '过多形容词',
    description: '滥用形容词和副词',
    pattern: /非常|极其|相当|十分|非常|尤为|格外|分外/gi,
    weight: 2,
    suggestions: ['删除程度副词，直接描述'],
  },
  // 陈词滥调
  {
    id: 'ai-010',
    name: '陈词滥调',
    description: '使用老套的表达',
    pattern: /时光飞逝|光阴似箭|日月如梭|电光火石|说时迟那时快|只见那/gi,
    weight: 4,
    suggestions: ['使用更现代、更独特的表达方式'],
  },
  // 过度总结
  {
    id: 'ai-011',
    name: '过度总结',
    description: '在结尾进行总结性陈述',
    pattern: /总之|总而言之|综上所述|通过以上|从上可以看出|由此可见/gi,
    weight: 3,
    suggestions: ['删除总结句，让读者自己体会'],
  },
  // 机械比喻
  {
    id: 'ai-012',
    name: '机械比喻',
    description: '使用刻板的比喻',
    pattern: /如.*般|像.*一样|仿佛.*一般|犹如.*一般/gi,
    weight: 2,
    suggestions: ['使用更具体、更独特的比喻'],
  },
  // 过多"应该"
  {
    id: 'ai-013',
    name: '过多使用"应该"',
    description: '滥用"应该、应当"等词',
    pattern: /应该|应当|理应|理当|理应如此|按理说/gi,
    weight: 2,
    suggestions: ['直接陈述事实，不要用"应该"'],
  },
  // 完美情节
  {
    id: 'ai-014',
    name: '情节过于完美',
    description: '剧情发展过于顺利',
    pattern: /一切都很顺利|出乎意料地顺利|一切都在计划之中/gi,
    weight: 3,
    suggestions: ['增加波折和意外'],
  },
  // 过度礼貌
  {
    id: 'ai-015',
    name: '过度礼貌的对话',
    description: '对话过于正式和规范',
    pattern: /请问|抱歉打扰|不好意思|冒昧地问|打扰一下|劳驾/gi,
    weight: 2,
    suggestions: ['使用更口语化、自然的对话'],
  },
];

/**
 * AI 味检测器
 */
export class AntiAIDetector {
  private patterns = AI_FEATURE_PATTERNS;

  /**
   * 检测文本中的 AI 味
   */
  detect(text: string): AIDetectionResult {
    const features: AIDetectionResult['features'] = [];
    let totalScore = 0;

    // 检测每种特征
    for (const pattern of this.patterns) {
      const matches = text.match(pattern.pattern);
      const count = matches ? matches.length : 0;

      if (count > 0) {
        features.push({
          pattern,
          count,
          examples: this.getExamples(text, pattern.pattern, 3),
        });
        totalScore += count * pattern.weight;
      }
    }

    // 计算综合得分
    const wordCount = text.length;
    const normalizedScore = Math.min(100, (totalScore / Math.max(1, wordCount / 100)) * 10);

    // 按严重程度分组
    const analysis = features.map(f => ({
      ...f,
      severity: f.count > 5 ? 'high' : f.count > 2 ? 'medium' : 'low',
    }));

    // 生成建议
    const suggestions = this.generateSuggestions(features);

    return {
      passed: normalizedScore < 30,
      score: Math.round(normalizedScore),
      features,
      suggestions,
      analysis,
    };
  }

  /**
   * 检测章纲中的 AI 味
   */
  detectChapterOutline(chapter: ChapterCommit): AIDetectionResult {
    const text = this.chapterToText(chapter);
    return this.detect(text);
  }

  /**
   * 批量检测
   */
  detectBatch(chapters: ChapterCommit[]): AIDetectionResult[] {
    return chapters.map(ch => this.detectChapterOutline(ch));
  }

  /**
   * 获取匹配示例
   */
  private getExamples(text: string, pattern: RegExp, limit: number): string[] {
    const regex = new RegExp(pattern.source, 'gi');
    const examples: string[] = [];
    let match;

    while ((match = regex.exec(text)) !== null && examples.length < limit) {
      const start = Math.max(0, match.index - 20);
      const end = Math.min(text.length, match.index + match[0].length + 20);
      const context = text.slice(start, end);
      examples.push(`"${context}"`);
    }

    return examples;
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
   * 生成建议
   */
  private generateSuggestions(features: AIDetectionResult['features']): string[] {
    const suggestions: string[] = [];
    const seen = new Set<string>();

    for (const feature of features) {
      if (feature.count > 0) {
        for (const suggestion of feature.pattern.suggestions) {
          if (!seen.has(suggestion)) {
            suggestions.push(suggestion);
            seen.add(suggestion);
          }
        }
      }
    }

    // 添加总体建议
    if (features.length === 0) {
      suggestions.push('本章几乎没有 AI 味，表现优秀！');
    } else if (suggestions.length > 0) {
      suggestions.unshift('建议优化以下表达，减少 AI 味：');
    }

    return suggestions;
  }

  /**
   * 生成检测报告
   */
  generateReport(results: AIDetectionResult[]): string {
    const lines: string[] = [];

    lines.push('# AI 味检测报告');
    lines.push('');

    // 统计
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const passedCount = results.filter(r => r.passed).length;

    lines.push('## 总体统计');
    lines.push(`- 平均 AI 味得分：${avgScore.toFixed(1)}（越低越好）`);
    lines.push(`- 通过检测：${passedCount}/${results.length}章`);
    lines.push('');

    // 高分章节
    const lowAiChapters = results.filter(r => r.score < 20);
    if (lowAiChapters.length > 0) {
      lines.push('## AI 味较少的章节');
      for (const result of lowAiChapters) {
        lines.push(`- 第${result.chapterId || ''}章：${result.score}分`);
      }
      lines.push('');
    }

    // 高 AI 味章节
    const highAiChapters = results.filter(r => r.score >= 50);
    if (highAiChapters.length > 0) {
      lines.push('## AI 味较重的章节');
      for (const result of highAiChapters) {
        lines.push(`### 第${result.chapterId || ''}章（${result.score}分）`);
        for (const feature of result.analysis.filter(a => a.severity === 'high')) {
          lines.push(`- ${feature.pattern.name}：${feature.count}处`);
          for (const example of feature.examples.slice(0, 2)) {
            lines.push(`  示例：${example}`);
          }
        }
        lines.push('');
      }
    }

    // 常见问题汇总
    const allFeatures = new Map<string, number>();
    for (const result of results) {
      for (const feature of result.features) {
        const count = allFeatures.get(feature.pattern.name) || 0;
        allFeatures.set(feature.pattern.name, count + feature.count);
      }
    }

    if (allFeatures.size > 0) {
      lines.push('## 常见 AI 味特征');
      const sortedFeatures = Array.from(allFeatures.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      for (const [name, count] of sortedFeatures) {
        lines.push(`- ${name}：${count}处`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 添加自定义模式
   */
  addPattern(pattern: AIFeaturePattern): void {
    this.patterns.push(pattern);
  }
}

// 导出单例
export const antiAIDetector = new AntiAIDetector();
