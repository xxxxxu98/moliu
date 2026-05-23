/**
 * 去AI味服务 - 增强版 (Anti-AI Enhanced)
 * 基于 webnovel-writer 7层规则体系
 * 
 * 7层规则：
 * Layer 1: 禁用词 (Banned Words)
 * Layer 2: 高风险词汇 (High Risk)
 * Layer 3: 句式结构 (Sentence Structure)
 * Layer 4: 对话规范 (Dialogue Rules)
 * Layer 5: 段落结构 (Paragraph Structure)
 * Layer 6: 标点节奏 (Punctuation Rhythm)
 * Layer 7: 改写算法 (Rewrite Algorithm)
 */

import { ref } from 'vue';

// ============================================================
// 类型定义
// ============================================================

export interface AntiAIEnhancedConfig {
  /** 强度级别: gentle/moderate/aggressive */
  intensity: 'gentle' | 'moderate' | 'aggressive';
  /** 启用层数 (1-7) */
  enabledLayers: number[];
  /** 是否输出详细报告 */
  detailedReport: boolean;
}

export interface AntiAIEnhancedResult {
  /** 修复后的内容 */
  content: string;
  /** 通过状态 */
  pass: boolean;
  /** 总问题数 */
  totalIssues: number;
  /** 各层问题统计 */
  layerStats: {
    layer1_banned: number;
    layer2_highRisk: number;
    layer3_sentence: number;
    layer4_dialogue: number;
    layer5_paragraph: number;
    layer6_punctuation: number;
    layer7_rewrite: number;
  };
  /** 修复详情 */
  fixes: AntiAIFix[];
  /** 偏差记录 */
  deviations: Deviation[];
  /** AI味评分 (0-100, 越低越好) */
  aiScore: number;
}

export interface AntiAIFix {
  layer: number;
  layerName: string;
  type: string;
  original: string;
  replacement: string;
  reason: string;
  position: string;
}

export interface Deviation {
  position: string;
  reason: string;
  approved: boolean;
}

// ============================================================
// 7层规则定义
// ============================================================

const LAYER1_BANNED_WORDS = [
  // 政治敏感
  /\b(台独|港独|藏独|疆独|分裂|颠覆|反动|暴动|抗议|示威|游行|罢工)\b/gi,
  // 色情低俗
  /\b(色情|淫秽|嫖娼|卖淫|裸体|性爱|性交|做爱|上床|强暴|猥亵)\b/gi,
  // 暴力血腥
  /\b(残杀|虐杀|肢解|分尸|凌迟|剥皮|抽筋)\b/gi,
  // 封建迷信
  /\b(算命|风水|占卜|巫术|诅咒|邪教|法轮功)\b/gi,
];

const LAYER2_HIGH_RISK_PATTERNS = [
  // 三段式枚举
  { pattern: /首先[，,。].*?其次[，,。].*?最后/gs, name: '三段式枚举' },
  { pattern: /第一[，,]。*?第二[，,]。*?第三/gs, name: '序号枚举' },
  { pattern: /一方面[，,].*?另一方面/gs, name: '双面论述' },
  // 绝对化词汇
  { pattern: /\b(所有|全部|一切|完全没有|绝对|必须|一定|必然)\b/g, name: '绝对化词汇' },
  // AI惯用词
  { pattern: /\b(众所周知|不言而喻|毫无疑问|毋庸置疑|值得注意的是|尤其重要的是)\b/gi, name: 'AI惯用开场' },
  { pattern: /\b(然而|但是|不过|然而却)\s*\1\b/gi, name: '重复转折' },
];

const LAYER3_SENTENCE_PATTERNS = [
  // 连续说明句
  { pattern: /[^。！？]{50,}[。！？]/g, name: '超长句', maxLength: 100 },
  // 连续同构句（3句以上）
  { pattern: /([^。！？]{10,}[。！？]\s*){3,}/g, name: '连续同构句' },
  // 抽象情绪句
  { pattern: /他(感到|觉得|内心|心中|感到).*?([高兴|愤怒|悲伤|害怕|惊讶|感动|恐惧|紧张]+)[^。！？]*[。！？]/g, name: '抽象情绪句' },
  // 结论先行句
  { pattern: /^(然而|但是|因此|所以|于是)(.*?)[。！？]/gm, name: '结论先行' },
];

const LAYER4_DIALOGUE_PATTERNS = [
  // 对白后紧跟解释
  { pattern: /["""]([^"""]+)["""]\s*[，,]?\s*他(?:这么|这|那样)说是因为[^。！？]*[。！？]/g, name: '对白后解释' },
  // 万能 said tag
  { pattern: /["""]([^"""]+)["""]\s*[，,]?\s*(?:他|她)(?:说|道|回答|说道)/g, name: '万能对话标签', maxRatio: 0.3 },
  // 整段背景解释
  { pattern: /["""]([^"""]+)["""]\s*[，,]?\s*(?:因为|由于|因此)(?:这个|那个|他|她)(?:原因|缘故|背景)/g, name: '对话解释背景' },
];

const LAYER5_PARAGRAPH_PATTERNS = [
  // 单句成段
  { pattern: /^[^\n]{1,20}[。！？]\s*$/gm, name: '单句成段', maxRatio: 0.5 },
  // 超长段落
  { pattern: /(?<!\n\n)([^\n]{200,})\n(?!\n)/g, name: '超长段落' },
];

const LAYER6_PUNCTUATION_PATTERNS = [
  // 连续省略号
  { pattern: /\.{4,}/g, name: '连续省略号' },
  // 连续感叹号
  { pattern: /!{3,}/g, name: '连续感叹号' },
  // 连续问号
  { pattern: /\?{3,}/g, name: '连续问号' },
  // 逗号过多
  { pattern: /[^，。]{20,}[，,]{4,}/g, name: '逗号过多' },
];

const LAYER7_REWRITE_RULES = [
  // 抽象情绪 → 生理反应
  {
    pattern: /他(感到?|觉得?|内心|心中)(.+?)[，,]?(他|她|他们)?(.+?)[。！？]/g,
    rewrite: (match: string) => {
      // 转换为生理反应 + 动作
      return match; // 实际实现需要更复杂的逻辑
    }
  },
  // 结论句 → 事实细节
  {
    pattern: /(因此|所以|于是|结果)(.+?)[。！？]/g,
    rewrite: (match: string) => match
  },
];

// ============================================================
// 改写算法
// ============================================================

const REWRITE_ALGORITHMS = {
  // 抽象情绪句 → 生理反应 + 当下意图 + 下一动作
  abstractEmotion: (sentence: string): string => {
    const emotionMap: Record<string, string[]> = {
      '愤怒': ['指节捏得发白', '胸口起伏', '拳头攥紧'],
      '高兴': ['嘴角上扬', '眼睛弯成月牙', '脚步轻快'],
      '悲伤': ['眼眶泛红', '声音沙哑', '肩膀微微颤抖'],
      '紧张': ['手心全是汗', '喉咙发紧', '坐立不安'],
      '惊讶': ['瞪大眼睛', '倒吸一口凉气', '愣在原地'],
      '恐惧': ['脸色发白', '双腿发软', '浑身发抖'],
    };
    
    return sentence; // 简化实现
  },
  
  // 结论句 → 事实细节 + 代价/风险 + 决策
  conclusionToFact: (sentence: string): string => {
    return sentence; // 简化实现
  },
  
  // 连续说明句 → 对白/动作/反问 混排
  breakExplanations: (sentences: string[]): string[] => {
    return sentences; // 简化实现
  },
  
  // 连续同构句 → 打断插入动作锚点
  breakUniformSentences: (sentences: string[]): string[] => {
    return sentences; // 简化实现
  },
  
  // 情绪标签 → 生理反应 + 微动作 + 环境映射
  emotionTagToBehavior: (sentence: string): string => {
    return sentence; // 简化实现
  },
};

// ============================================================
// 服务实现
// ============================================================

export class AntiAIEnhancedService {
  private config: AntiAIEnhancedConfig;
  
  constructor(config?: Partial<AntiAIEnhancedConfig>) {
    this.config = {
      intensity: 'moderate',
      enabledLayers: [1, 2, 3, 4, 5, 6, 7],
      detailedReport: true,
      ...config,
    };
  }
  
  /**
   * 检测并修复AI味
   */
  async fix(content: string): Promise<AntiAIEnhancedResult> {
    const fixes: AntiAIFix[] = [];
    const deviations: Deviation[] = [];
    const layerStats = {
      layer1_banned: 0,
      layer2_highRisk: 0,
      layer3_sentence: 0,
      layer4_dialogue: 0,
      layer5_paragraph: 0,
      layer6_punctuation: 0,
      layer7_rewrite: 0,
    };
    
    let result = content;
    
    // Layer 1: 禁用词
    if (this.config.enabledLayers.includes(1)) {
      result = this.applyLayer1(result, fixes, deviations);
      layerStats.layer1_banned = fixes.filter(f => f.layer === 1).length;
    }
    
    // Layer 2: 高风险词汇
    if (this.config.enabledLayers.includes(2)) {
      result = this.applyLayer2(result, fixes, deviations);
      layerStats.layer2_highRisk = fixes.filter(f => f.layer === 2).length;
    }
    
    // Layer 3: 句式结构
    if (this.config.enabledLayers.includes(3)) {
      result = this.applyLayer3(result, fixes, deviations);
      layerStats.layer3_sentence = fixes.filter(f => f.layer === 3).length;
    }
    
    // Layer 4: 对话规范
    if (this.config.enabledLayers.includes(4)) {
      result = this.applyLayer4(result, fixes, deviations);
      layerStats.layer4_dialogue = fixes.filter(f => f.layer === 4).length;
    }
    
    // Layer 5: 段落结构
    if (this.config.enabledLayers.includes(5)) {
      result = this.applyLayer5(result, fixes, deviations);
      layerStats.layer5_paragraph = fixes.filter(f => f.layer === 5).length;
    }
    
    // Layer 6: 标点节奏
    if (this.config.enabledLayers.includes(6)) {
      result = this.applyLayer6(result, fixes, deviations);
      layerStats.layer6_punctuation = fixes.filter(f => f.layer === 6).length;
    }
    
    // Layer 7: 改写算法
    if (this.config.enabledLayers.includes(7)) {
      result = this.applyLayer7(result, fixes, deviations);
      layerStats.layer7_rewrite = fixes.filter(f => f.layer === 7).length;
    }
    
    // 计算 AI 评分
    const aiScore = this.calculateAIScore(layerStats, result);
    
    // 判断是否通过
    const totalIssues = Object.values(layerStats).reduce((a, b) => a + b, 0);
    const pass = totalIssues === 0 || deviations.length > 0;
    
    return {
      content: result,
      pass,
      totalIssues,
      layerStats,
      fixes,
      deviations,
      aiScore,
    };
  }
  
  /**
   * Layer 1: 禁用词
   */
  private applyLayer1(
    content: string,
    fixes: AntiAIFix[],
    deviations: Deviation[]
  ): string {
    let result = content;
    
    for (const pattern of LAYER1_BANNED_WORDS) {
      const matches = result.match(pattern);
      if (matches) {
        for (const match of matches) {
          fixes.push({
            layer: 1,
            layerName: '禁用词',
            type: 'banned_word',
            original: match,
            replacement: '***',
            reason: '包含禁用词汇',
            position: `第${result.indexOf(match)}字符`,
          });
        }
        result = result.replace(pattern, '***');
      }
    }
    
    return result;
  }
  
  /**
   * Layer 2: 高风险词汇
   */
  private applyLayer2(
    content: string,
    fixes: AntiAIFix[],
    deviations: Deviation[]
  ): string {
    let result = content;
    
    for (const rule of LAYER2_HIGH_RISK_PATTERNS) {
      const matches = result.match(rule.pattern);
      if (matches) {
        for (const match of matches) {
          if (this.config.intensity === 'aggressive') {
            fixes.push({
              layer: 2,
              layerName: '高风险词汇',
              type: rule.name,
              original: match.slice(0, 50) + (match.length > 50 ? '...' : ''),
              replacement: '[已标记]',
              reason: `包含${rule.name}模式`,
              position: `第${result.indexOf(match)}字符`,
            });
            result = result.replace(match, '[已标记]');
          } else {
            deviations.push({
              position: `第${result.indexOf(match)}字符`,
              reason: `检测到${rule.name}模式，建议修改`,
              approved: false,
            });
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * Layer 3: 句式结构
   */
  private applyLayer3(
    content: string,
    fixes: AntiAIFix[],
    deviations: Deviation[]
  ): string {
    let result = content;
    
    for (const rule of LAYER3_SENTENCE_PATTERNS) {
      if (rule.maxLength) {
        // 超长句检测
        const sentences = result.split(/[。！？]/);
        for (const sentence of sentences) {
          if (sentence.length > rule.maxLength) {
            fixes.push({
              layer: 3,
              layerName: '句式结构',
              type: rule.name,
              original: sentence.slice(0, 50) + '...',
              replacement: '[建议拆分]',
              reason: `句子超过${rule.maxLength}字符，建议拆分`,
              position: '句中',
            });
          }
        }
      } else {
        const matches = result.match(rule.pattern);
        if (matches) {
          for (const match of matches) {
            fixes.push({
              layer: 3,
              layerName: '句式结构',
              type: rule.name,
              original: match.slice(0, 50) + (match.length > 50 ? '...' : ''),
              replacement: '[建议改写]',
              reason: `检测到${rule.name}，建议改为动作/对话/反问混排`,
              position: `第${result.indexOf(match)}字符`,
            });
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * Layer 4: 对话规范
   */
  private applyLayer4(
    content: string,
    fixes: AntiAIFix[],
    deviations: Deviation[]
  ): string {
    let result = content;
    
    // 统计万能 said tag 比例
    const saidTagMatches = result.match(/["""]([^"""]+)["""]\s*[，,]?\s*(?:他|她)(?:说|道)/g) || [];
    const dialogueMatches = result.match(/["""][^"""]+["""]/g) || [];
    
    if (dialogueMatches.length > 0 && saidTagMatches.length / dialogueMatches.length > 0.3) {
      deviations.push({
        position: '全文',
        reason: `万能对话标签占比${Math.round(saidTagMatches.length / dialogueMatches.length * 100)}%，超过30%阈值`,
        approved: false,
      });
    }
    
    for (const rule of LAYER4_DIALOGUE_PATTERNS) {
      const matches = result.match(rule.pattern);
      if (matches) {
        for (const match of matches) {
          fixes.push({
            layer: 4,
            layerName: '对话规范',
            type: rule.name,
            original: match.slice(0, 50) + (match.length > 50 ? '...' : ''),
            replacement: '[建议改写为带意图的对抗式对白]',
            reason: `检测到${rule.name}模式`,
            position: `第${result.indexOf(match)}字符`,
          });
        }
      }
    }
    
    return result;
  }
  
  /**
   * Layer 5: 段落结构
   */
  private applyLayer5(
    content: string,
    fixes: AntiAIFix[],
    deviations: Deviation[]
  ): string {
    const paragraphs = content.split(/\n\s*\n/);
    let result = content;
    
    for (const rule of LAYER5_PARAGRAPH_PATTERNS) {
      if (rule.name === '单句成段') {
        const shortParagraphs = result.match(rule.pattern) || [];
        const ratio = shortParagraphs.length / Math.max(paragraphs.length, 1);
        
        if (ratio > 0.5) {
          deviations.push({
            position: '全文',
            reason: `单句成段占比${Math.round(ratio * 100)}%，建议控制在45%以下`,
            approved: false,
          });
        }
      }
    }
    
    return result;
  }
  
  /**
   * Layer 6: 标点节奏
   */
  private applyLayer6(
    content: string,
    fixes: AntiAIFix[],
    deviations: Deviation[]
  ): string {
    let result = content;
    
    for (const rule of LAYER6_PUNCTUATION_PATTERNS) {
      const matches = result.match(rule.pattern);
      if (matches) {
        for (const match of matches) {
          fixes.push({
            layer: 6,
            layerName: '标点节奏',
            type: rule.name,
            original: match,
            replacement: this.getPunctuationReplacement(match),
            reason: `检测到${rule.name}，建议分散使用`,
            position: `第${result.indexOf(match)}字符`,
          });
        }
      }
    }
    
    // 应用修复
    result = result.replace(/\.{4,}/g, '...');
    result = result.replace(/!{3,}/g, '!');
    result = result.replace(/\?{3,}/g, '?');
    
    return result;
  }
  
  /**
   * Layer 7: 改写算法
   */
  private applyLayer7(
    content: string,
    fixes: AntiAIFix[],
    deviations: Deviation[]
  ): string {
    let result = content;
    
    // 应用7条改写算法
    const algorithms = [
      { test: /他(感到?|觉得?|内心|心中).+?[高兴愤怒悲伤害怕惊讶感动恐惧紧张]/, action: 'abstractEmotion' },
      { test: /(因此|所以|于是).+?[。！？]/, action: 'conclusionToFact' },
      { test: /[^。！？]{20,}[。！？]\s*[^。！？]{20,}[。！？]\s*[^。！？]{20,}[。！？]/, action: 'breakExplanations' },
    ];
    
    for (const algo of algorithms) {
      if (algo.test.test(result)) {
        deviations.push({
          position: '全文',
          reason: `建议应用"${algo.action}"改写算法`,
          approved: false,
        });
      }
    }
    
    return result;
  }
  
  /**
   * 计算 AI 评分
   */
  private calculateAIScore(layerStats: AntiAIEnhancedResult['layerStats'], content: string): number {
    let score = 0;
    
    // 各层权重
    score += layerStats.layer1_banned * 20;
    score += layerStats.layer2_highRisk * 5;
    score += layerStats.layer3_sentence * 3;
    score += layerStats.layer4_dialogue * 3;
    score += layerStats.layer5_paragraph * 2;
    score += layerStats.layer6_punctuation * 2;
    score += layerStats.layer7_rewrite * 5;
    
    // 归一化到 0-100
    return Math.min(100, Math.max(0, 100 - score));
  }
  
  /**
   * 获取标点替换
   */
  private getPunctuationReplacement(match: string): string {
    if (match.startsWith('.')) return '...';
    if (match.startsWith('!')) return '!';
    if (match.startsWith('?')) return '?';
    return match;
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: Partial<AntiAIEnhancedConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useAntiAIEnhanced(config?: Partial<AntiAIEnhancedConfig>) {
  const service = new AntiAIEnhancedService(config);
  
  return {
    service,
    
    fix: (content: string) => service.fix(content),
    
    detect: async (content: string) => {
      const result = await service.fix(content);
      return {
        pass: result.pass,
        aiScore: result.aiScore,
        totalIssues: result.totalIssues,
        layerStats: result.layerStats,
        fixes: result.fixes,
        deviations: result.deviations,
      };
    },
    
    // 便捷方法：单层检测
    checkLayer: (content: string, layer: number) => {
      const result = service.fix(content);
      const layerKey = `layer${layer}_${['', '', 'highRisk', 'sentence', 'dialogue', 'paragraph', 'punctuation', 'rewrite'][layer]}`;
      return (result.layerStats as any)[layerKey] || 0;
    },
  };
}
