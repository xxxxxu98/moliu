/**
 * 去AI味服务 - 增强版
 * 集成了 oh-story-claudecode skills 的去AI味方法论
 * 
 * 核心改进（参考 webnovel-writer）：
 * 1. 实现三遍法：去泛化 → 去书面化 → 回人味
 * 2. 实现7种AI模式检测
 * 3. 完善禁用词表和改写范例库
 */

import { PromptBuilder } from './prompt-builder';
import { AITextAnalysisResult, AITextIssue } from '@/types/writing';

// ============================================
// 禁用词表（分级）
// ============================================

export const BANNED_WORDS = {
  // 一级禁用词（必须替换）
  level1: [
    // 眼神类
    '眼中闪过一丝', '眼中闪过一抹', '眼中闪过一道', '眼中浮现',
    '瞳孔微微一缩', '瞳孔微缩', '目光如炬',
    // 嘴角类
    '嘴角勾起', '嘴角微扬', '嘴角轻轻上扬',
    // 副词类
    '缓缓地', '轻轻地', '静静地', '渐渐地',
    // 连接词类
    '似乎', '仿佛', '不由得', '不由自主',
    '与此同时', '此时此刻', '就在这时', '就在此时',
    // 心理描写类
    '不禁心想', '她在心里想', '心中暗道', '心道',
    '心中暗想', '心下一沉', '心头一震', '心中一动',
    // 升华总结类
    '这就是成长', '这就是人生', '这就是命运',
    '总而言之', '综上所述', '可见一斑',
  ],
  // 二级禁用词（高频出现才标记）
  level2: [
    '不禁', '似乎', '仿佛', '不由得', '不由自主',
    '此时此刻', '一时间', '此刻', '须臾',
    '刹那间', '霎时间', '电光火石',
  ],
};

// ============================================
// 7种AI写作模式
// ============================================

export const AI_PATTERNS = {
  // 模式1：AI高频词
  highFrequency: [
    { pattern: '不禁', desc: '"不禁"是AI高频词' },
    { pattern: '仿佛', desc: '"仿佛"是AI高频词' },
    { pattern: '似乎', desc: '"似乎"是AI高频词' },
    { pattern: '缓缓地', desc: '"缓缓地"是AI高频词' },
    { pattern: '轻轻地', desc: '"轻轻地"是AI高频词' },
    { pattern: '静静地', desc: '"静静地"是AI高频词' },
    { pattern: '不由得', desc: '"不由得"是AI高频词' },
    { pattern: '不由自主', desc: '"不由自主"是AI高频词' },
    { pattern: '此时此刻', desc: '"此时此刻"过于书面化' },
    { pattern: '与此同时', desc: '"与此同时"过于书面化' },
    { pattern: '就在这时', desc: '"就在这时"是AI惯用转折' },
  ],

  // 模式2：弱化副词泛滥
  weakAdverbs: ['微微', '淡淡', '缓缓', '轻轻', '稍稍', '略略'],
  
  // 模式3：意义膨胀
  meaningInflation: [
    '意义深远', '前所未有', '可谓', '未来可期', '前途无量', '充满希望',
  ],
  
  // 模式4：万能结论
  genericConclusions: [
    '未来可期', '前途无量', '充满希望', '不言而喻',
    '由此可见', '总而言之', '综上所述', '不难看出',
  ],
  
  // 模式5：论文体段落结构
  academicStyle: [
    '不难看出', '由此可见', '事实上', '综上所述', '从某种意义上说',
  ],
  
  // 模式6：书面语连词
  formalConnectors: [
    '于是乎', '与此同时', '从而', '因而', '诚然', '然而',
  ],
  
  // 模式7：三连排比癖
  tripleParallelism: /，([^，]+)，([^，]+)，([^，]+)，/g,
};

// ============================================
// 改写映射表
// ============================================

export const REPLACEMENTS = {
  // 眼神类
  eyeExpressions: [
    { from: '眼中闪过一丝', to: '眼睛' },
    { from: '眼中闪过一抹', to: '眼睛' },
    { from: '眼中闪过一道', to: '眼睛' },
    { from: '眼中浮现', to: '' },
    { from: '瞳孔微微一缩', to: '' },
    { from: '瞳孔微缩', to: '' },
  ],

  // 嘴角类
  mouthExpressions: [
    { from: '嘴角勾起', to: '嘴角一挑' },
    { from: '嘴角微扬', to: '嘴角往上抽了抽' },
    { from: '嘴角轻轻上扬', to: '嘴角抽了抽' },
    { from: '嘴角上扬', to: '嘴角动' },
  ],

  // 副词类
  adverbs: [
    { from: '缓缓地', to: '慢慢' },
    { from: '轻轻地', to: '轻轻' },
    { from: '静静地', to: '安静' },
    { from: '渐渐地', to: '慢慢' },
    { from: '突然地', to: '突然' },
    { from: '默默地', to: '不出声地' },
    { from: '呆呆地', to: '呆' },
  ],

  // 连接词类
  connectors: [
    { from: '似乎', to: '' },
    { from: '仿佛', to: '像' },
    { from: '不由得', to: '忍不住' },
    { from: '与此同时', to: '这时候' },
    { from: '此时此刻', to: '现在' },
    { from: '就在这时', to: '忽然' },
    { from: '一时间', to: '' },
    { from: '瞬间', to: '一下子' },
    { from: '不由自主', to: '没忍住' },
    { from: '情不自禁', to: '忍不住' },
  ],

  // 心理描写类
  psychology: [
    { from: '不禁心想', to: '' },
    { from: '她在心里想', to: '' },
    { from: '心下一沉', to: '他腿一软' },
    { from: '心头一震', to: '' },
    { from: '心中一动', to: '' },
    { from: '心中暗道', to: '' },
  ],

  // 程度副词
  degreeAdverbs: [
    { from: '非常', to: '挺' },
    { from: '极其', to: '怪' },
    { from: '十分', to: '挺' },
    { from: '格外', to: '怪' },
    { from: '相当', to: '挺' },
  ],

  // 对话提示词
  dialogueTags: [
    { from: '说道：', to: '说：' },
    { from: '回答说：', to: '回：' },
    { from: '问道：', to: '问：' },
    { from: '叹道：', to: '叹：' },
    { from: '解释道：', to: '说：' },
    { from: '补充道：', to: '补了一句：' },
    { from: '淡淡道：', to: '淡淡地说：' },
    { from: '轻笑：', to: '笑了笑：' },
  ],

  // 网文AI高频词
  webnovelAI: [
    { from: '不可名状', to: '说不上来' },
    { from: '恐怖如斯', to: '太吓人了' },
    { from: '震耳欲聋', to: '声音大得吓人' },
    { from: '难以置信', to: '不敢相信' },
    { from: '说时迟那时快', to: '一下子' },
    { from: '电光火石', to: '眨眼间' },
    { from: '刹那间', to: '一下子' },
    { from: '霎时间', to: '一下子' },
    { from: '细思极恐', to: '越想越怕' },
  ],

  // 升华总结词
  summaryWords: [
    { from: '这就是成长', to: '' },
    { from: '这就是人生', to: '' },
    { from: '这就是命运', to: '' },
    { from: '总而言之', to: '' },
    { from: '综上所述', to: '' },
    { from: '可见一斑', to: '' },
    { from: '正因如此', to: '' },
    { from: '不难发现', to: '' },
  ],
};

// ============================================
// 接口定义
// ============================================

export interface DeAIDetectionResult {
  level: 'none' | 'mild' | 'moderate' | 'severe';
  issueStats: {
    bannedWords: number;
    aiPatterns: number;
    overExplanation: number;
    uniformRhythm: number;
  };
  issues: AITextIssue[];
  suggestions: string[];
  // 7种模式检测结果
  patternResults: {
    highFrequency: number;
    weakAdverbs: number;
    meaningInflation: number;
    genericConclusions: number;
    academicStyle: number;
    formalConnectors: number;
    tripleParallelism: number;
  };
}

export interface DeAIFixResult {
  content: string;
  title?: string | null;
  fixedCount: number;
  fixes: Array<{
    original: string;
    replacement: string;
    reason: string;
  }>;
  // 三遍法统计
  threePassStats: {
    pass1Removed: number;  // 去泛化
    pass2Removed: number;   // 去书面化
    pass3Added: number;    // 回人味
  };
}

export interface SevenPatternsResult {
  pattern: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
  examples: string[];
}

// ============================================
// 主服务类
// ============================================

export class DeAIService {
  // ========== 检测方法 ==========

  /**
   * 检测文本的AI味（增强版）
   * 包含7种模式检测
   */
  static async detect(text: string): Promise<DeAIDetectionResult> {
    const issues: AITextIssue[] = [];
    
    // 各维度统计
    let bannedWordsCount = 0;
    let aiPatternsCount = 0;
    let overExplanationCount = 0;
    let uniformRhythmCount = 0;

    // 7种模式统计
    const patternResults = {
      highFrequency: 0,
      weakAdverbs: 0,
      meaningInflation: 0,
      genericConclusions: 0,
      academicStyle: 0,
      formalConnectors: 0,
      tripleParallelism: 0,
    };

    const lines = text.split('\n');

    // 1. 检测一级禁用词
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const word of BANNED_WORDS.level1) {
        if (line.includes(word)) {
          issues.push({
            type: 'banned_word',
            severity: 'high',
            position: `第${i + 1}行`,
            original: line.substring(0, 50) + (line.length > 50 ? '...' : ''),
            suggestion: `建议替换"${word}"为更口语化/具体的表达`,
          });
          bannedWordsCount++;
        }
      }

      // 检测二级禁用词（高频）
      for (const word of BANNED_WORDS.level2) {
        const regex = new RegExp(word, 'g');
        const matches = line.match(regex);
        if (matches) {
          const totalMatches = (text.match(new RegExp(word, 'g')) || []).length;
          if (totalMatches >= 2) {
            issues.push({
              type: 'banned_word',
              severity: 'medium',
              position: `第${i + 1}行（全文出现${totalMatches}次）`,
              original: line.substring(0, 50),
              suggestion: `"${word}"出现频率较高，建议减少使用`,
            });
            bannedWordsCount++;
          }
        }
      }
    }

    // 2. 检测7种AI模式

    // 模式1：AI高频词
    for (const { pattern, desc } of AI_PATTERNS.highFrequency) {
      const matches = text.match(new RegExp(pattern, 'g'));
      if (matches && matches.length > 0) {
        patternResults.highFrequency += matches.length;
        aiPatternsCount += matches.length;
      }
    }

    // 模式2：弱化副词
    for (const adverb of AI_PATTERNS.weakAdverbs) {
      const regex = new RegExp(adverb, 'g');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        // 阈值：每1000字超过3个
        const density = matches.length / (text.length / 1000);
        if (density > 3) {
          patternResults.weakAdverbs += matches.length;
          aiPatternsCount++;
        }
      }
    }

    // 模式3：意义膨胀
    for (const phrase of AI_PATTERNS.meaningInflation) {
      if (text.includes(phrase)) {
        patternResults.meaningInflation++;
        issues.push({
          type: 'ai_pattern',
          severity: 'medium',
          position: '全文',
          original: phrase,
          suggestion: ` "${phrase}"过于空洞，建议用具体描述替代`,
        });
        aiPatternsCount++;
      }
    }

    // 模式4：万能结论
    for (const phrase of AI_PATTERNS.genericConclusions) {
      if (text.includes(phrase)) {
        patternResults.genericConclusions++;
        issues.push({
          type: 'ai_pattern',
          severity: 'medium',
          position: '全文',
          original: phrase,
          suggestion: ` "${phrase}"是万能结论，建议删除或用具体问题替代`,
        });
        aiPatternsCount++;
      }
    }

    // 模式5：论文体
    for (const phrase of AI_PATTERNS.academicStyle) {
      if (text.includes(phrase)) {
        patternResults.academicStyle++;
        issues.push({
          type: 'ai_pattern',
          severity: 'high',
          position: '全文',
          original: phrase,
          suggestion: ` "${phrase}"是论文体，文学作品中应避免`,
        });
        aiPatternsCount++;
      }
    }

    // 模式6：书面语连词
    for (const phrase of AI_PATTERNS.formalConnectors) {
      const regex = new RegExp(phrase, 'g');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        patternResults.formalConnectors += matches.length;
        aiPatternsCount += matches.length;
      }
    }

    // 模式7：三连排比
    let match;
    while ((match = AI_PATTERNS.tripleParallelism.exec(text)) !== null) {
      patternResults.tripleParallelism++;
      issues.push({
        type: 'rhythm_issue',
        severity: 'low',
        position: `位置${match.index}`,
        original: match[0],
        suggestion: '连续排比过于工整，建议保留最强一条',
      });
      uniformRhythmCount++;
    }

    // 3. 检测过度解释
    const overExplanationPatterns = [
      { pattern: /解释道：["']/, desc: '"解释道"过于直白' },
      { pattern: /补充道：["']/, desc: '"补充道"过于直白' },
      { pattern: /不禁心想/, desc: '"不禁心想"是AI惯用心理描写' },
    ];

    for (const { pattern, desc } of overExplanationPatterns) {
      if (pattern.test(text)) {
        issues.push({
          type: 'over_explanation',
          severity: 'low',
          position: '全文',
          original: pattern.source,
          suggestion: desc,
        });
        overExplanationCount++;
      }
    }

    // 4. 检测节奏问题
    let consecutiveShortLines = 0;
    let lastShortLineIndex = -1;
    const shortLineThreshold = 15;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().length < shortLineThreshold) {
        if (lastShortLineIndex === i - 1) {
          consecutiveShortLines++;
        } else {
          consecutiveShortLines = 1;
        }
        lastShortLineIndex = i;

        if (consecutiveShortLines >= 3) {
          issues.push({
            type: 'rhythm_issue',
            severity: 'medium',
            position: `第${i - 2}至第${i + 1}行`,
            original: '连续短句',
            suggestion: '连续短句过多，节奏过于急促',
          });
          uniformRhythmCount++;
        }
      }
    }

    // 5. 计算AI味等级
    const totalIssues = bannedWordsCount + aiPatternsCount + overExplanationCount + uniformRhythmCount;
    const issueDensity = totalIssues / Math.max(lines.length, 1);

    let level: DeAIDetectionResult['level'];
    if (issueDensity < 0.05 || totalIssues < 3) {
      level = 'none';
    } else if (issueDensity < 0.15) {
      level = 'mild';
    } else if (issueDensity < 0.3) {
      level = 'moderate';
    } else {
      level = 'severe';
    }

    // 6. 生成改进建议
    const suggestions = this.generateSuggestions({
      bannedWordsCount,
      aiPatternsCount,
      overExplanationCount,
      uniformRhythmCount,
      patternResults,
    });

    return {
      level,
      issueStats: {
        bannedWords: bannedWordsCount,
        aiPatterns: aiPatternsCount,
        overExplanation: overExplanationCount,
        uniformRhythm: uniformRhythmCount,
      },
      issues,
      suggestions,
      patternResults,
    };
  }

  /**
   * 检测7种AI模式
   */
  static async detectSevenPatterns(text: string): Promise<SevenPatternsResult[]> {
    const results: SevenPatternsResult[] = [];

    // 模式1：AI高频词
    let hfCount = 0;
    const hfExamples: string[] = [];
    for (const { pattern } of AI_PATTERNS.highFrequency) {
      const matches = text.match(new RegExp(pattern, 'g'));
      if (matches) {
        hfCount += matches.length;
        if (hfExamples.length < 3) hfExamples.push(pattern);
      }
    }
    results.push({
      pattern: 'AI高频词',
      count: hfCount,
      severity: hfCount > 5 ? 'high' : hfCount > 2 ? 'medium' : 'low',
      examples: hfExamples,
    });

    // 模式2：弱化副词
    let waCount = 0;
    const waExamples: string[] = [];
    for (const adverb of AI_PATTERNS.weakAdverbs) {
      const matches = text.match(new RegExp(adverb, 'g'));
      if (matches) {
        waCount += matches.length;
        if (waExamples.length < 3) waExamples.push(adverb);
      }
    }
    results.push({
      pattern: '弱化副词泛滥',
      count: waCount,
      severity: waCount > 10 ? 'high' : waCount > 5 ? 'medium' : 'low',
      examples: waExamples,
    });

    // 模式3-6...
    results.push({
      pattern: '意义膨胀',
      count: AI_PATTERNS.meaningInflation.filter(p => text.includes(p)).length,
      severity: 'medium',
      examples: AI_PATTERNS.meaningInflation.filter(p => text.includes(p)),
    });

    results.push({
      pattern: '万能结论',
      count: AI_PATTERNS.genericConclusions.filter(p => text.includes(p)).length,
      severity: 'medium',
      examples: AI_PATTERNS.genericConclusions.filter(p => text.includes(p)),
    });

    results.push({
      pattern: '论文体段落结构',
      count: AI_PATTERNS.academicStyle.filter(p => text.includes(p)).length,
      severity: 'high',
      examples: AI_PATTERNS.academicStyle.filter(p => text.includes(p)),
    });

    results.push({
      pattern: '书面语连词',
      count: AI_PATTERNS.formalConnectors.reduce((count, phrase) => {
        const matches = text.match(new RegExp(phrase, 'g'));
        return count + (matches?.length || 0);
      }, 0),
      severity: 'low',
      examples: AI_PATTERNS.formalConnectors.filter(p => text.includes(p)),
    });

    // 模式7：三连排比
    const tpMatches = text.match(AI_PATTERNS.tripleParallelism) || [];
    results.push({
      pattern: '三连排比癖',
      count: tpMatches.length,
      severity: tpMatches.length > 3 ? 'high' : tpMatches.length > 1 ? 'medium' : 'low',
      examples: tpMatches.slice(0, 3),
    });

    return results;
  }

  // ========== 修复方法 - 三遍法 ==========

  /**
   * 自动修复文本的AI味 - 三遍法
   * 
   * Pass 1: 去泛化（Strip Generic）
   * Pass 2: 去书面化（Cut Professional Diction）
   * Pass 3: 回人味（Restore Human Presence）
   */
  static async fix(text: string): Promise<DeAIFixResult> {
    let content = text;
    const fixes: DeAIFixResult['fixes'] = [];
    let pass1Removed = 0;
    let pass2Removed = 0;
    let pass3Added = 0;

    // ========== Pass 1: 去泛化 ==========
    const pass1Result = this.pass1StripGeneric(content);
    content = pass1Result.content;
    fixes.push(...pass1Result.fixes);
    pass1Removed = pass1Result.removedCount;

    // ========== Pass 2: 去书面化 ==========
    const pass2Result = this.pass2CutProfessionalDiction(content);
    content = pass2Result.content;
    fixes.push(...pass2Result.fixes);
    pass2Removed = pass2Result.removedCount;

    // ========== Pass 3: 回人味 ==========
    const pass3Result = this.pass3RestoreHumanPresence(content);
    content = pass3Result.content;
    fixes.push(...pass3Result.fixes);
    pass3Added = pass3Result.addedCount;

    // 提取标题
    const { title, content: cleanedContent } = this.extractAndCleanTitle(content);
    if (title) {
      content = cleanedContent;
    }

    return {
      content: content.trim(),
      title: title,
      fixedCount: fixes.length,
      fixes,
      threePassStats: {
        pass1Removed,
        pass2Removed,
        pass3Added,
      },
    };
  }

  /**
   * Pass 1: 去泛化（Strip Generic）
   * 
   * - 抽象情绪总结句 → 删或替换为具体动作
   * - 假深度句 → 删
   * - 意义膨胀 → 缩小到具体影响
   * - 空洞结论 → 删
   * - 工整对比句式 → 打散重写
   * - 装饰性形容词堆砌 → 白描
   * - 过度使用"于是""然而""此刻" → 删掉一半
   * - 所有角色说话一样"高级" → 区分语气
   */
  private static pass1StripGeneric(text: string): {
    content: string;
    fixes: DeAIFixResult['fixes'];
    removedCount: number;
  } {
    let content = text;
    const fixes: DeAIFixResult['fixes'] = [];
    let removedCount = 0;

    // 替换映射
    const allReplacements = [
      ...REPLACEMENTS.eyeExpressions,
      ...REPLACEMENTS.mouthExpressions,
      ...REPLACEMENTS.adverbs,
      ...REPLACEMENTS.connectors,
      ...REPLACEMENTS.psychology,
      ...REPLACEMENTS.degreeAdverbs,
      ...REPLACEMENTS.summaryWords,
      ...REPLACEMENTS.webnovelAI,
    ];

    for (const { from, to } of allReplacements) {
      const regex = new RegExp(from, 'g');
      if (regex.test(content)) {
        const count = (content.match(regex) || []).length;
        content = content.replace(regex, to);
        if (from !== to) { // 只记录有实际替换的
          fixes.push({
            original: from,
            replacement: to,
            reason: '去泛化：替换AI常用表达',
          });
          removedCount += count;
        }
      }
    }

    // 删除"此刻"类连接词
    content = content.replace(/此刻，/g, '');
    content = content.replace(/此时此刻，/g, '');

    // 删除章末升华总结句
    content = content.replace(/\n\n.*?(总而言之|总之|由此可见|可见|因此可以说|因此可以看出|不难发现|显而易见|这就是|这就是为什么|正因如此|凡此种种|种种迹象表明).*?。/g, '');
    content = content.replace(/.*?(总而言之|总之|由此可见|可见|因此可以说|因此可以看出|不难发现|显而易见|这就是|这就是为什么|正因如此|凡此种种|种种迹象表明).*?。\n*/g, '');

    // 删除AI式说教句
    content = content.replace(/.*?(有时候.*?也是.*?|真正的.*?不是.*?而是.*?|命运.*?就是这样.*?|人生.*?就是如此.*?).*?。\n*/g, '');

    // 删除段落末尾的升华句
    content = content.replace(/[，。；].*?(这就是成长|这就是人生|这就是命运|这就是全部).*?。?$/gm, '');

    return { content, fixes, removedCount };
  }

  /**
   * Pass 2: 去书面化（Cut Professional Diction）
   * 
   * - 分析性用词（"机制""结构""逻辑""体系"出现在小说中）→ 换成日常表达
   * - 抽象名词滥用 → 直接说事
   * - 体制内用语（"进一步""深入""推进""落实"）→ 删
   * - 专业术语堆砌 → 只保留必要的，用白话解释
   */
  private static pass2CutProfessionalDiction(text: string): {
    content: string;
    fixes: DeAIFixResult['fixes'];
    removedCount: number;
  } {
    let content = text;
    const fixes: DeAIFixResult['fixes'] = [];
    let removedCount = 0;

    // 书面化表达替换
    const formalReplacements: Array<[string, string]> = [
      ['机制', ''],
      ['结构', ''],
      ['逻辑', ''],
      ['体系', ''],
      ['进一步', ''],
      ['深入', ''],
      ['推进', ''],
      ['落实', ''],
      ['从而', '所以'],
      ['因而', '所以'],
      ['然而', '可'],
      ['但是', '可'],
      ['然而却', '偏偏'],
      ['然而并没有', '偏偏没'],
      ['似乎', ''],
      ['仿佛', '像'],
      ['不由得', '忍不住'],
    ];

    for (const [from, to] of formalReplacements) {
      const regex = new RegExp(from, 'g');
      if (regex.test(content)) {
        const count = (content.match(regex) || []).length;
        content = content.replace(regex, to);
        if (from !== to) {
          fixes.push({
            original: from,
            replacement: to,
            reason: '去书面化：替换正式用语',
          });
          removedCount += count;
        }
      }
    }

    // 删除连接词
    content = content.replace(/首先，/g, '');
    content = content.replace(/其次，/g, '');
    content = content.replace(/最后，/g, '然后，');
    content = content.replace(/第一，/g, '');
    content = content.replace(/第二，/g, '');
    content = content.replace(/第三，/g, '');

    // 删除无意义的"其实"开头
    content = content.replace(/^其实，/gm, '');

    // 处理复合句
    content = content.replace(/不仅([^，]+)，而且([^，]+)/g, '$1，$2');
    content = content.replace(/一方面([^，]+)，另一方面([^，]+)/g, '$1，$2');

    return { content, fixes, removedCount };
  }

  /**
   * Pass 3: 回人味（Restore Human Presence）
   * 
   * - 具体的感官细节（气味、温度、触感）
   * - 角色说话方式的区分（不同人不同语气）
   * - 节奏变化（长短句交错）
   * - 社会位置感的对话（上级和下属说话方式不同）
   * - 场景特有的记忆点
   * - 项目特有的语言习惯（角色的口头禅）
   */
  private static pass3RestoreHumanPresence(text: string): {
    content: string;
    fixes: DeAIFixResult['fixes'];
    addedCount: number;
  } {
    let content = text;
    const fixes: DeAIFixResult['fixes'] = [];
    let addedCount = 0;

    // 处理连续四字词（AI味的重灾区）
    const fourCharPattern = /([^，。！？；：""''\n]{4}[，。！？；：""''\n]?){3,}/g;
    let match;
    while ((match = fourCharPattern.exec(content)) !== null) {
      const matched = match[0];
      const parts = matched.match(/[^，。！？；：""''\n]{4}/g) || [];
      if (parts.length >= 3) {
        const simplified = parts.slice(0, 2).join('');
        if (simplified !== matched) {
          content = content.replace(matched, simplified);
          fixes.push({
            original: matched,
            replacement: simplified,
            reason: '回人味：简化连续四字词',
          });
          addedCount++;
        }
      }
    }

    // 复合句拆分（长句拆短句）
    const compoundPatterns = [
      /([^，]+)，发现([^，]+)/g,
      /([^，]+)，然后([^，]+)/g,
      /([^，]+)，接着([^，]+)/g,
      /([^，]+)，于是([^，]+)/g,
      /([^，]+)，因为([^，]+)/g,
      /([^，]+)，所以([^，]+)/g,
    ];

    for (const pattern of compoundPatterns) {
      content = content.replace(pattern, (_, p1, p2) => {
        if (p1.length > 10) {
          fixes.push({
            original: `${p1}，${p2}`,
            replacement: `${p1}。${p2}`,
            reason: '回人味：复合句拆分为短句',
          });
          addedCount++;
          return `${p1}。${p2}`;
        }
        return `${p1}，${p2}`;
      });
    }

    // 处理连续排比（保留最强一条）
    const parallelismRegex = /(，([^，]+)，)+([^，]+)，?$/g;
    let pMatch;
    while ((pMatch = parallelismRegex.exec(content)) !== null) {
      const parts = pMatch[0].split('，').filter(Boolean);
      if (parts.length > 2) {
        const last = parts[parts.length - 1];
        content = content.replace(pMatch[0], `，${last}，`);
        fixes.push({
          original: pMatch[0],
          replacement: `，${last}，`,
          reason: '回人味：排比保留核心项',
        });
        addedCount++;
      }
    }

    return { content, fixes, addedCount };
  }

  // ========== 辅助方法 ==========

  /**
   * 生成改进建议
   */
  private static generateSuggestions(stats: {
    bannedWordsCount: number;
    aiPatternsCount: number;
    overExplanationCount: number;
    uniformRhythmCount: number;
    patternResults: DeAIDetectionResult['patternResults'];
  }): string[] {
    const suggestions: string[] = [];

    if (stats.bannedWordsCount > 0) {
      suggestions.push(`替换${stats.bannedWordsCount}处禁用词`);
    }

    if (stats.patternResults.highFrequency > 3) {
      suggestions.push('AI高频词过多，建议用口语化表达替代');
    }

    if (stats.patternResults.weakAdverbs > 5) {
      suggestions.push('弱化副词（微微、淡淡等）使用过多，建议删除或换具体动作');
    }

    if (stats.patternResults.academicStyle > 0) {
      suggestions.push('存在论文体表达，建议改为日常口语');
    }

    if (stats.patternResults.tripleParallelism > 1) {
      suggestions.push('排比句过于工整，建议保留核心项');
    }

    if (stats.overExplanationCount > 0) {
      suggestions.push('减少过度解释性描写');
    }

    if (stats.uniformRhythmCount > 0) {
      suggestions.push('调整节奏，增加疏密对比');
    }

    if (suggestions.length === 0) {
      suggestions.push('文本AI味较轻，保持当前风格');
    }

    return suggestions;
  }

  /**
   * 提取章节标题并清理内容
   */
  static extractAndCleanTitle(content: string): { title: string | null; content: string } {
    if (!content || content.trim().length === 0) {
      return { title: null, content };
    }

    const titlePatterns = [
      // 第X章 标题
      {
        regex: /^(第[一二三四五六七八九十百千零\d]+章)[.、\s\u2014\u2013\u2014\-–—]*(.+?)\s*\n+/,
        extract: (match: RegExpMatchArray) => ({
          chapterNum: match[1],
          title: match[2].trim(),
        }),
      },
      // 无分隔符：第X章标题
      {
        regex: /^(第[一二三四五六七八九十百千零\d]+章)([\u4e00-\u9fa5]{2,15})\s*\n+/,
        extract: (match: RegExpMatchArray) => ({
          chapterNum: match[1],
          title: match[2].trim(),
        }),
      },
      /^#\s*(.+?)\s*\n+/,
      /^【([^】]+)】\s*\n+/,
      /^《([^》]+)》\s*\n+/,
    ];

    for (const pattern of titlePatterns) {
      const regex = typeof pattern === 'object' && 'regex' in pattern ? pattern.regex : pattern;
      const match = content.match(regex);
      
      if (match) {
        let title: string;

        if (typeof pattern === 'object' && 'extract' in pattern) {
          const extracted = pattern.extract(match);
          title = extracted.chapterNum && extracted.title
            ? `${extracted.chapterNum} ${extracted.title}`
            : extracted.chapterNum || extracted.title || match[0];
        } else {
          title = match[1] || match[0];
        }

        const remainingContent = content.substring(match[0].length).trim();
        return { title: title.trim(), content: remainingContent };
      }
    }

    return { title: null, content };
  }

  // ========== 标题验证 ==========

  static readonly TITLE_MIN_LENGTH = 2;
  static readonly TITLE_MAX_LENGTH = 50;

  static validateTitle(title: string | null | undefined): { valid: boolean; title: string; reason?: string } {
    if (!title || title.trim().length === 0) {
      return { valid: false, title: '', reason: '标题为空' };
    }

    const trimmedTitle = title.trim();
    const pureChineseLength = trimmedTitle.replace(/[^\u4e00-\u9fa5]/g, '').length;

    if (pureChineseLength < this.TITLE_MIN_LENGTH) {
      return { valid: false, title: trimmedTitle, reason: `标题太短（至少${this.TITLE_MIN_LENGTH}个字）` };
    }
    if (pureChineseLength > this.TITLE_MAX_LENGTH) {
      return { valid: false, title: trimmedTitle, reason: `标题太长（最多${this.TITLE_MAX_LENGTH}个字）` };
    }

    return { valid: true, title: trimmedTitle };
  }

  static extractAndValidateTitle(content: string): { title: string | null; content: string; titleValid: boolean } {
    const { title, content: cleanedContent } = this.extractAndCleanTitle(content);
    if (!title) {
      return { title: null, content: cleanedContent, titleValid: false };
    }
    const validation = this.validateTitle(title);
    return {
      title: validation.title,
      content: cleanedContent,
      titleValid: validation.valid,
    };
  }

  // ========== AI增强检测和修复 ==========

  static async detectAndFixWithAI(
    text: string,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<{ detection: DeAIDetectionResult; fixedContent: string }> {
    const detection = await this.detect(text);
    const detectionPrompt = PromptBuilder.buildAIDetectionPrompt(text);
    await aiClient(detectionPrompt);
    const polishPrompt = PromptBuilder.buildPolishPrompt(text, 'concise', 'deai');
    const fixedContent = await aiClient(polishPrompt);
    return { detection, fixedContent };
  }
}

export default DeAIService;
