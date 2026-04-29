/**
 * 去AI味服务
 * 集成了 oh-story-claudecode skills 的去AI味方法论
 * 
 * 核心思路：改变"风味"而非修改"错误"
 * AI味本质：过度工整、过度解释、缺乏生活感
 */

import { PromptBuilder } from './prompt-builder';
import { AITextAnalysisResult, AITextIssue } from '@/types/writing';

export interface DeAIDetectionResult {
  /** AI味等级：none/mild/moderate/severe */
  level: 'none' | 'mild' | 'moderate' | 'severe';
  /** 主要问题类型统计 */
  issueStats: {
    bannedWords: number;
    aiPatterns: number;
    overExplanation: number;
    uniformRhythm: number;
  };
  /** 具体问题列表 */
  issues: AITextIssue[];
  /** 改进建议 */
  suggestions: string[];
}

export interface DeAIFixResult {
  /** 修复后的内容 */
  content: string;
  /** 修复的问题数量 */
  fixedCount: number;
  /** 修复详情 */
  fixes: {
    original: string;
    replacement: string;
    reason: string;
  }[];
}

/**
 * 去AI味服务类
 */
export class DeAIService {
  /**
   * 检测文本的AI味
   */
  static async detect(text: string): Promise<DeAIDetectionResult> {
    const { bannedWords } = await import('@/config/writing-knowledge');
    
    const issues: AITextIssue[] = [];
    let bannedWordsCount = 0;
    let aiPatternsCount = 0;
    let overExplanationCount = 0;
    let uniformRhythmCount = 0;

    // 1. 检测禁用词
    const lines = text.split('\n');
    lines.forEach((line, lineIndex) => {
      // 检查一级禁用词
      for (const word of bannedWords.level1) {
        if (line.includes(word)) {
          issues.push({
            type: 'banned_word',
            severity: 'high',
            position: `第${lineIndex + 1}行`,
            original: line.substring(0, 50) + (line.length > 50 ? '...' : ''),
            suggestion: `建议替换"${word}"为更口语化/具体的表达`,
          });
          bannedWordsCount++;
        }
      }

      // 检查二级禁用词（高频出现才标记）
      for (const word of bannedWords.level2) {
        const regex = new RegExp(word, 'g');
        const matches = line.match(regex);
        if (matches && matches.length > 0) {
          // 统计该词在全文出现次数
          const totalMatches = (text.match(new RegExp(word, 'g')) || []).length;
          if (totalMatches >= 2) {
            issues.push({
              type: 'banned_word',
              severity: 'medium',
              position: `第${lineIndex + 1}行（全文出现${totalMatches}次）`,
              original: line.substring(0, 50) + (line.length > 50 ? '...' : ''),
              suggestion: `"${word}"出现频率较高，建议减少使用或替换`,
            });
            aiPatternsCount++;
          }
        }
      }
    });

    // 2. 检测AI惯用句式
    const aiPatterns = [
      { pattern: /^她.*?的.*?眼神/, desc: 'AI惯用"她的眼神"描写' },
      { pattern: /^他.*?的.*?嘴角/, desc: 'AI惯用"他的嘴角"描写' },
      { pattern: /缓缓地/g, desc: '"缓缓地"是AI高频词' },
      { pattern: /轻轻地/g, desc: '"轻轻地"是AI高频词' },
      { pattern: /静静地/g, desc: '"静静地"是AI高频词' },
      { pattern: /似乎/g, desc: '"似乎"出现过于频繁' },
      { pattern: /仿佛/g, desc: '"仿佛"出现过于频繁' },
      { pattern: /就在这时/g, desc: '"就在这时"是AI惯用转折' },
      { pattern: /不由得/g, desc: '"不由得"是AI高频词' },
      { pattern: /心中想着/g, desc: '"心中想着"过于直白' },
      { pattern: /与此同时/g, desc: '"与此同时"过于书面化' },
      { pattern: /此时此刻/g, desc: '"此时此刻"过于书面化' },
    ];

    lines.forEach((line, lineIndex) => {
      for (const { pattern, desc } of aiPatterns) {
        if (pattern.test(line)) {
          issues.push({
            type: 'ai_pattern',
            severity: 'medium',
            position: `第${lineIndex + 1}行`,
            original: line.substring(0, 50) + (line.length > 50 ? '...' : ''),
            suggestion: desc,
          });
          aiPatternsCount++;
        }
      }
    });

    // 3. 检测过度解释（AI习惯把什么都解释清楚）
    const overExplanationPatterns = [
      { pattern: /解释道：“/, desc: '"解释道"过于直白' },
      { pattern: /解释道："/, desc: '"解释道"过于直白' },
      { pattern: /解释道：'/, desc: '"解释道"过于直白' },
      { pattern: /补充道：“/, desc: '"补充道"过于直白' },
      { pattern: /不禁心想/g, desc: '"不禁心想"是AI惯用心理描写' },
      { pattern: /她在心里想/g, desc: '"她在心里想"过于直白' },
    ];

    lines.forEach((line, lineIndex) => {
      for (const { pattern, desc } of overExplanationPatterns) {
        if (pattern.test(line)) {
          issues.push({
            type: 'over_explanation',
            severity: 'low',
            position: `第${lineIndex + 1}行`,
            original: line.substring(0, 50) + (line.length > 50 ? '...' : ''),
            suggestion: desc,
          });
          overExplanationCount++;
        }
      }
    });

    // 4. 检测节奏问题（连续短句、连续排比等）
    // 检测连续3行以上短句
    const shortLineThreshold = 15; // 少于15字符视为短句
    let consecutiveShortLines = 0;
    let lastShortLineIndex = -1;

    lines.forEach((line, lineIndex) => {
      if (line.trim().length < shortLineThreshold) {
        if (lastShortLineIndex === lineIndex - 1) {
          consecutiveShortLines++;
        } else {
          consecutiveShortLines = 1;
        }
        lastShortLineIndex = lineIndex;

        if (consecutiveShortLines >= 3) {
          issues.push({
            type: 'rhythm_issue',
            severity: 'medium',
            position: `第${lineIndex - 2}至第${lineIndex + 1}行`,
            original: '连续短句',
            suggestion: '连续短句过多，节奏过于急促，建议适当合并或增加过渡',
          });
          uniformRhythmCount++;
        }
      }
    });

    // 检测连续排比
    const parallelismPattern = /，.*?，.*?，/g;
    let match;
    while ((match = parallelismPattern.exec(text)) !== null) {
      issues.push({
        type: 'rhythm_issue',
        severity: 'low',
        position: `位置${match.index}`,
        original: match[0],
        suggestion: '连续排比过于工整，建议保留最强一条',
      });
      uniformRhythmCount++;
    }

    // 5. 计算AI味等级
    const totalIssues = bannedWordsCount + aiPatternsCount + overExplanationCount + uniformRhythmCount;
    const issueDensity = totalIssues / lines.length;

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
    const suggestions: string[] = [];
    if (bannedWordsCount > 0) {
      suggestions.push(`替换${bannedWordsCount}处一级禁用词`);
    }
    if (aiPatternsCount > 0) {
      suggestions.push(`改写${aiPatternsCount}处AI惯用句式`);
    }
    if (overExplanationCount > 0) {
      suggestions.push(`减少${overExplanationCount}处过度解释性描写`);
    }
    if (uniformRhythmCount > 0) {
      suggestions.push(`调整${uniformRhythmCount}处节奏问题`);
    }
    if (suggestions.length === 0) {
      suggestions.push('文本AI味较轻，保持当前风格');
    }

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
    };
  }

  /**
   * 自动修复文本的AI味
   */
  static async fix(text: string): Promise<DeAIFixResult> {
    const { bannedWords } = await import('@/config/writing-knowledge');
    
    let content = text;
    const fixes: DeAIFixResult['fixes'] = [];

    // 替换策略映射
    const replacements: Record<string, string> = {
      // 眼神类
      '眼中闪过一丝': '眼睛',
      '眼中闪过一抹': '眼睛',
      '眼中闪过一道': '眼睛',
      '眼中闪过': '',
      '的眼中': '的眼里',
      '眼中带着': '眼里透着',
      '眼中含着': '眼里含着',

      // 嘴角类
      '嘴角勾起': '嘴角一挑',
      '嘴角浮现': '嘴角动了动',
      '嘴角微扬': '嘴角往上抽了抽',
      '的嘴角': '',

      // 副词类
      '缓缓地': '慢慢',
      '轻轻地': '轻轻',
      '静静地': '安静地',
      '渐渐地': '慢慢',
      '突然地': '突然',
      '默默地': '不出声地',

      // 连接词类
      '似乎': '像',
      '仿佛': '像',
      '不由得': '忍不住',
      '与此同时': '这时候',
      '此时此刻': '现在',

      // 心理描写类
      '不禁心想': '',
      '她在心里想': '',
      '他不禁想到': '',
      '不由得想到': '',
    };

    // 1. 替换一级禁用词
    for (const [original, replacement] of Object.entries(replacements)) {
      const regex = new RegExp(original, 'g');
      if (regex.test(content)) {
        const count = (content.match(regex) || []).length;
        content = content.replace(regex, replacement);
        fixes.push({
          original,
          replacement,
          reason: `替换${count}处"${original}"`,
        });
      }
    }

    // 2. 特殊句式处理
    // 处理"就在这时"类型的突兀转折
    content = content.replace(/就在这时，/g, '忽然，');
    content = content.replace(/就在此时，/g, '忽然，');

    // 处理"解释道"类型的过度解释
    content = content.replace(/他解释道："/g, '他说："');
    content = content.replace(/她解释道："/g, '她说："');
    content = content.replace(/他解释道：'/g, "他说：'");
    content = content.replace(/她解释道：'/g, "她说：'");

    // 处理连续排比（保留第一条）
    const parallelismRegex = /(，([^，]+)，)+([^，]+)，?$/g;
    let match;
    while ((match = parallelismRegex.exec(content)) !== null) {
      const parts = match[0].split('，').filter(Boolean);
      if (parts.length > 2) {
        const first = parts[0];
        const last = parts[parts.length - 1];
        content = content.replace(match[0], `，${last}，`);
        fixes.push({
          original: match[0],
          replacement: `，${last}，`,
          reason: '连续排比过于工整，保留核心项',
        });
      }
    }

    // 3. 修复连续短句节奏问题
    const lines = content.split('\n');
    const fixedLines: string[] = [];
    let consecutiveShort = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine.length < 15) {
        consecutiveShort++;
        if (consecutiveShort > 2 && i < lines.length - 1) {
          // 合并短句到下一行
          const nextLine = lines[i + 1] || '';
          if (nextLine.trim().length > 20) {
            fixedLines[fixedLines.length - 1] = trimmedLine + nextLine;
            lines[i + 1] = '';
            fixes.push({
              original: `${trimmedLine}\n${nextLine}`,
              replacement: trimmedLine + nextLine,
              reason: '合并连续短句，改善节奏',
            });
            consecutiveShort = 0;
            continue;
          }
        }
        fixedLines.push(line);
      } else {
        consecutiveShort = 0;
        fixedLines.push(line);
      }
    }

    content = fixedLines.join('\n');

    // 4. 删除多余的总结升华句
    content = content.replace(/\n\n.*?(总而言之|总之|由此可见|可见|因此可以說|因此可以看出).*?。/g, '');
    content = content.replace(/.*?(总而言之|总之|由此可见|可见|因此可以說|因此可以看出).*?。\n*/g, '');

    // 5. 删除结尾的"可以看到"式总结
    content = content.replace(/\n*可以看到，.*$/gm, '');
    content = content.replace(/\n*从.*?可以看出，.*$/gm, '');

    return {
      content: content.trim(),
      fixedCount: fixes.length,
      fixes,
    };
  }

  /**
   * 使用AI模型检测并修复AI味
   */
  static async detectAndFixWithAI(
    text: string,
    aiClient: (prompt: string) => Promise<string>
  ): Promise<{ detection: DeAIDetectionResult; fixedContent: string }> {
    // 1. 先用规则检测
    const detection = await this.detect(text);

    // 2. 用AI进行深度检测
    const detectionPrompt = PromptBuilder.buildAIDetectionPrompt(text);
    const aiFeedback = await aiClient(detectionPrompt);

    // 3. 用AI进行润色去味
    const polishPrompt = PromptBuilder.buildPolishPrompt(text, 'concise', 'deai');
    const fixedContent = await aiClient(polishPrompt);

    return {
      detection,
      fixedContent,
    };
  }
}

export default DeAIService;
