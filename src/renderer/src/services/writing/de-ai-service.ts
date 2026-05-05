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
  /** 提取的章节标题（如果有） */
  title?: string | null;
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
      // 眼神类 - 更自然的替换
      '眼中闪过一丝': '眼睛',
      '眼中闪过一抹': '眼睛',
      '眼中闪过一道': '眼睛',
      '眼中闪过': '',
      '的眼中': '的眼里',
      '眼中带着': '眼里透着',
      '眼中含着': '眼里含着',
      '的眼中闪过': '眼睛',
      '眼中浮现': '眼睛',
      '瞳孔微微一缩': '他',
      '瞳孔微缩': '他',

      // 嘴角类
      '嘴角勾起': '嘴角一挑',
      '嘴角浮现': '嘴角动了动',
      '嘴角微扬': '嘴角往上抽了抽',
      '嘴角轻轻上扬': '嘴角抽了抽',
      '的嘴角': '',
      '嘴角上扬': '嘴角动',

      // 副词类 - 删除"地"
      '缓缓地': '慢慢',
      '轻轻地': '轻轻',
      '静静地': '安静',
      '渐渐地': '慢慢',
      '突然地': '突然',
      '默默地': '不出声地',
      '呆呆地': '呆',
      '怔怔地': '怔着',
      '缓缓地睁开眼睛': '睁眼',
      '缓缓地站起身': '站起身',

      // 连接词类 - 删除或简化
      '似乎': '',
      '仿佛': '像',
      '不由得': '忍不住',
      '与此同时': '这时候',
      '此时此刻': '现在',
      '就在这时': '忽然',
      '就在此时': '忽然',
      '一时间': '',
      '瞬间': '一下子',
      '突然': '忽然',
      '不由自主': '没忍住',
      '情不自禁': '忍不住',

      // 心理描写类 - 删除或简化
      '不禁心想': '',
      '她在心里想': '',
      '他不禁想到': '',
      '不由得想到': '',
      '心下一沉': '他腿一软',
      '心头一震': '',
      '心中一动': '',
      '心下了然': '',
      '心中暗道': '',
      '心底泛起': '',
      '心道': '',
      '心中暗想': '',

      // 情绪类 - 改为动作
      '深吸一口气': '',
      '眉头微皱': '他皱眉',
      '眉头紧锁': '他皱眉',
      '眉眼低垂': '他低头',
      '坚定地': '',
      '坚定': '',

      // 过度修饰词
      '众所周知': '',
      '令人惊讶的是': '',
      '令人意外的是': '',
      '令人费解的是': '',
      '实际上': '其实',
      '事实上': '其实',
      '实质上': '其实',
      '本质上': '其实',
      '综上所述': '',
      '总而言之': '',
      '无可否认的是': '',
      '不可否认': '',
      '毫无疑问': '',

      // 过度排比词
      '聪明、勇敢、善良': '脑子灵光、胆子大、心眼好',
      '聪明、勇敢': '脑子灵光、胆子大',
      '貌美如花、气质出众': '漂亮',
      '才华横溢': '',

      // 连接词替换
      '然而': '可',
      '但是': '可',
      '然而却': '偏偏',
      '然而并没有': '偏偏没',
      '竟然': '居然',
      '居然': '竟然',

      // 程度副词
      '非常': '挺',
      '极其': '怪',
      '十分': '挺',
      '格外': '怪',
      '相当': '挺',
      '颇为': '挺',

      // 对话提示词
      '说道：': '说：',
      '回答说：': '回：',
      '问道：': '问：',
      '叹道：': '叹：',
      '解释道：': '说：',
      '补充道：': '补了一句：',
      '大喊：': '喊：',
      '喊道：': '喊：',
      '低声道：': '低声：',
      '喃喃道：': '嘟囔：',
      '低声说道：': '低声说：',
      '淡淡道：': '淡淡地说：',
      '轻笑：': '笑了笑：',
      '冷笑：': '哼了一声：',
      '微笑道：': '笑着说：',
      '点了点头道：': '点头说：',
      '摇头道：': '摇头说：',
      '皱眉道：': '皱眉说：',
      '叹气道：': '叹着气说：',

      // 【新增】网文AI高频词
      '不可名状': '说不上来',
      '恐怖如斯': '太吓人了',
      '震耳欲聋': '声音大得吓人',
      '难以置信': '不敢相信',
      '说时迟那时快': '一下子',
      '电光火石': '眨眼间',
      '电光火石间': '眨眼间',
      '刹那间': '一下子',
      '霎时间': '一下子',
      '须臾之间': '一会儿',
      '细思极恐': '越想越怕',
      '细思之下': '想想',
      '想来也是': '也是',
      '凡此种种': '',
      '种种迹象表明': '',

      // 【新增】情绪直白词 - 必须用动作替代
      '他感到愤怒': '他一拳砸在桌上',
      '她感到悲伤': '她的眼泪掉了下来',
      '他感到高兴': '他嘴角扬了起来',
      '她感到惊讶': '她愣住了',
      '他感到恐惧': '他往后退了一步',
      '她感到失落': '她低着头不说话',
      '他感到欣慰': '他点了点头',
      '他感到无奈': '他叹了口气',

      // 【新增】升华总结词 - 直接删除
      '这就是成长': '',
      '这就是人生': '',
      '这就是命运': '',
      '这就是为什么': '',
      '正因如此': '',
      '由此可见': '',
      '不难发现': '',
      '可见一斑': '',
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

    // 4. 删除多余的总结升华句（扩充版）
    content = content.replace(/\n\n.*?(总而言之|总之|由此可见|可见|因此可以說|因此可以看出|因此可以说|不难发现|显而易见|这就是|这就是为什么|正因如此|凡此种种|种种迹象表明|总的来说|总的说来).*?。/g, '');
    content = content.replace(/.*?(总而言之|总之|由此可见|可见|因此可以說|因此可以看出|因此可以说|不难发现|显而易见|这就是|这就是为什么|正因如此|凡此种种|种种迹象表明|总的来说|总的说来).*?。\n*/g, '');

    // 5. 删除结尾的"可以看到"式总结
    content = content.replace(/\n*可以看到，.*$/gm, '');
    content = content.replace(/\n*从.*?可以看出，.*$/gm, '');
    content = content.replace(/\n*从.*?可以发现，.*$/gm, '');

    // 5.1 【新增】删除AI式说教句
    content = content.replace(/.*?(有时候.*?也是.*?|真正的.*?不是.*?而是.*?|命运.*?就是这样.*?|人生.*?就是如此.*?).*?。\n*/g, '');

    // 5.2 【新增】删除段落末尾的升华句
    content = content.replace(/[，。；].*?(这就是成长|这就是人生|这就是命运|这就是全部).*?。?$/gm, '');

    // 5.3 【新增】常见错别字自动纠正（后处理）
    const typoFixes: Array<[RegExp, string]> = [
      // 的/地/得 错误（常见且重要）
      [/应该的/g, '应该地'],
      [/高高兴兴的/g, '高高兴兴地'],
      [/慢慢吞吞的/g, '慢慢吞吞地'],
      [/认认真真的/g, '认认真真地'],
      // 在/再 错误
      [/在次/g, '再次'],
      [/在来/g, '再来'],
      [/在次/g, '再次'],
      // 那/哪 错误
      [/那是/g, '那是'], // 那个是可以的
      // 做/作 错误
      [/做用/g, '作用'],
      [/做为/g, '作为'],
      // 其他常见错误
      [/象像/g, '像'], // 象像不分
      [/坐做/g, '做'],
      [/候后/g, '后'],
      [/已已经/g, '已经'],
    ];

    for (const [pattern, replacement] of typoFixes) {
      content = content.replace(pattern, replacement);
    }

    // 5.4 【新增】检查并修复"的"后面是否该用"地"
    // 修复副词性短语中的"的"替换为"地"
    const adverbPhraseFixes: Array<[RegExp, string]> = [
      // 动词性短语前的副词应该用"地"而不是"的"
      [/(悄悄|静静|慢慢|匆匆|偷偷|默默|轻轻|呆呆|悄悄)的说/g, '$1地说'],
      [/(认真|努力|仔细|专心的)看/g, '$1看'],
      [/(认真|努力|仔细)听/g, '$1听'],
    ];

    for (const [pattern, replacement] of adverbPhraseFixes) {
      content = content.replace(pattern, replacement);
    }

    // 6. 处理连续四字词（AI味的重灾区）
    // 检测连续出现3个以上的四字词组合
    const fourCharPattern = /([^，。！？；：""''\n]{4}[，。！？；：""''\n]?){3,}/g;
    let fourCharMatch;
    while ((fourCharMatch = fourCharPattern.exec(content)) !== null) {
      const matched = fourCharMatch[0];
      // 简单处理：保留前两个四字词后面的部分
      const parts = matched.match(/[^，。！？；：""''\n]{4}/g) || [];
      if (parts.length >= 3) {
        // 只保留第一和第三个四字词中间的部分
        const simplified = parts.slice(0, 1).join('') + parts.slice(2).join('').slice(0, 8);
        fixes.push({
          original: matched,
          replacement: simplified,
          reason: '连续多个四字词，简化处理',
        });
      }
    }

    // 7. 删除句首的"他/她"
    content = content.replace(/\n他\/她/g, '\n他');
    content = content.replace(/\n此人/g, '\n他');
    content = content.replace(/\n该人/g, '\n他');

    // 8. 增加句式多样性 - 在合适的地方添加口语化表达
    content = content.replace(/他的/g, '他那');
    content = content.replace(/她的/g, '她那');

    // 9. 删除过度解释的"的"
    content = content.replace(/的地得/g, '的');

    // 10. 处理"的是"句式
    content = content.replace(/是的/g, '是');

    // 11. 复合句拆分处理（长句拆短句）
    // 拆分"...，发现..."、"...，然后..."等句式
    const compoundPatterns = [
      { pattern: /([^，]+)，发现([^，]+)/g, separator: '。' },
      { pattern: /([^，]+)，然后([^，]+)/g, separator: '。' },
      { pattern: /([^，]+)，接着([^，]+)/g, separator: '。' },
      { pattern: /([^，]+)，于是([^，]+)/g, separator: '。' },
      { pattern: /([^，]+)，因为([^，]+)/g, separator: '。' },
      { pattern: /([^，]+)，所以([^，]+)/g, separator: '。' },
    ];

    for (const { pattern, separator } of compoundPatterns) {
      content = content.replace(pattern, (_, p1, p2) => {
        // 简单拆分：如果前半句超过10个字，则拆分
        if (p1.length > 10) {
          fixes.push({
            original: `${p1}，${p2}`,
            replacement: `${p1}。${p2}`,
            reason: '复合句拆分为短句',
          });
          return `${p1}。${p2}`;
        }
        return `${p1}，${p2}`;
      });
    }

    // 12. 删除"首先/其次/最后"连接词
    content = content.replace(/首先，/g, '');
    content = content.replace(/其次，/g, '');
    content = content.replace(/最后，/g, '然后，');
    content = content.replace(/第一，/g, '');
    content = content.replace(/第二，/g, '');
    content = content.replace(/第三，/g, '');

    // 13. 删除"不仅...而且..."、"一方面...另一方面"句式
    content = content.replace(/不仅([^，]+)，而且([^，]+)/g, '$1，$2');
    content = content.replace(/一方面([^，]+)，另一方面([^，]+)/g, '$1，$2');

    // 14. 删除无意义的"其实"开头
    content = content.replace(/^其实，/gm, '');

    // 15. 【新增】提取章节标题并清理内容
    const { title, content: cleanedContent } = this.extractAndCleanTitle(content);
    console.log('[DeAIService.fix] extractAndCleanTitle 结果:', {
      title: title,
      contentLength: cleanedContent.length,
      contentPreview: cleanedContent.substring(0, 100)
    });
    if (title) {
      content = cleanedContent;
      fixes.push({
        original: `生成内容包含标题: ${title}`,
        replacement: '已提取章节标题',
        reason: '清理生成内容，移除标题行',
      });
    } else {
      console.log('[DeAIService.fix] 未从内容中提取到章节标题');
    }

    return {
      content: content.trim(),
      title: title,
      fixedCount: fixes.length,
      fixes,
    };
  }

  /**
   * 【新增】提取章节标题并清理内容
   * AI生成的内容可能包含章节标题，需要提取并处理
   * @param content 原始生成内容
   * @returns 标题和清理后的正文
   */
  static extractAndCleanTitle(content: string): { title: string | null; content: string } {
    console.log('[DeAIService] extractAndCleanTitle 开始处理，内容前100字:', content.substring(0, 100));
    
    if (!content || content.trim().length === 0) {
      console.log('[DeAIService] extractAndCleanTitle: 内容为空');
      return { title: null, content };
    }

    // 匹配常见章节标题格式
    // 格式1: 第X章 标题 或 第X章.标题 或 第X章——标题
    // 格式2: 第X卷 第X章 标题
    // 格式3: 直接是标题（无章节号）
    const titlePatterns: Array<RegExp | {
      regex: RegExp;
      extract: (match: RegExpMatchArray) => { chapterNum?: string; title?: string };
    }> = [
      // 【修改】第X章 标题 格式 - 支持各种分隔符
      {
        regex: /^(第[一二三四五六七八九十百千零\d]+章)[.、\s\u2014\u2013\u2014\-–—]*(.+?)\s*\n+/,
        extract: (match: RegExpMatchArray) => ({
          chapterNum: match[1],
          title: match[2].trim(),
        }),
      },
      // 【修改】无分隔符格式：第X章标题（AI生成常见）- 匹配中文标题2-15字
      {
        regex: /^(第[一二三四五六七八九十百千零\d]+章)([\u4e00-\u9fa5]{2,15})\s*\n+/,
        extract: (match: RegExpMatchArray) => ({
          chapterNum: match[1],
          title: match[2].trim(),
        }),
      },
      /^#\s*(.+?)\s*\n+/,                           // # 标题
      /^(第[一二三四五六七八九十百千\d]+卷)[.、\s]*(第[一二三四五六七八九十百千\d]+章)[.、\s]*(.+?)\s*\n+/,  // 第X卷 第X章 标题
      /^(【[^】]+】)\s*\n+/,                         // 【标题】
      /^《([^》]+)》\s*\n+/,                         // 《标题》
    ];

    for (const pattern of titlePatterns) {
      let match: RegExpMatchArray | null;
      const regex = typeof pattern === 'object' && 'regex' in pattern ? pattern.regex : pattern;
      match = content.match(regex);
      
      if (match) {
        let title: string;
        
        // 如果是对象格式（有 extract 方法），使用特殊处理
        if (typeof pattern === 'object' && 'extract' in pattern) {
          const extracted = pattern.extract(match);
          // 组合标题：如果提取到章节号和标题，组合在一起
          if (extracted.chapterNum && extracted.title) {
            title = `${extracted.chapterNum} ${extracted.title}`;
          } else if (extracted.chapterNum) {
            title = extracted.chapterNum;
          } else {
            title = extracted.title || match[0];
          }
        } else {
          // 标准正则匹配 - 如果有捕获组1和2，拼接
          if (match[1] && match[2]) {
            title = match[1] + ' ' + match[2];
          } else if (match[1]) {
            title = match[1];
          } else {
            title = match[0];
          }
        }
        
        console.log('[DeAIService] extractAndCleanTitle: 匹配到标题正则，提取结果:', title);
        
        // 移除标题和后续的空行
        const remainingContent = content.substring(match[0].length).trim();
        return {
          title: title.trim(),
          content: remainingContent,
        };
      }
    }

    // 如果没有匹配到标题格式，检查第一行是否是标题
    // 标题特征：很短（< 20字），不包含句号或逗号
    const lines = content.split('\n');
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      console.log('[DeAIService] extractAndCleanTitle: 未匹配正则，检查第一行:', firstLine, '长度:', firstLine.length);
      // 检查第一行是否符合标题特征
      if (firstLine.length > 0 && firstLine.length < 30 && !firstLine.includes('。') && !firstLine.includes('，')) {
        // 可能是标题，检查是否像章节标题
        if (/^(第[一二三四五六七八九十百千\d]+|[一二三四五六七八九十百千\d]+、|\d+、|\d+\.)/.test(firstLine) ||
            /^【/.test(firstLine) || /^《/.test(firstLine)) {
          console.log('[DeAIService] extractAndCleanTitle: 第一行符合标题特征');
          const remainingContent = lines.slice(1).join('\n').trim();
          return {
            title: firstLine,
            content: remainingContent,
          };
        }
      }
    }

    console.log('[DeAIService] extractAndCleanTitle: 未找到任何标题格式');
    return {
      title: null,
      content: content,
    };
  }

  // ==================== 章节标题验证相关 ====================

  /** 标题长度限制 */
  static readonly TITLE_MIN_LENGTH = 2;
  static readonly TITLE_MAX_LENGTH = 50;

  /** 文言文/成语特征词（过于文绉绉的特征） */
  private static readonly LITERARY_PATTERNS = [
    // 单字文言词
    '之', '乎', '者', '也', '矣', '哉', '焉', '兮',
    // 四字成语常见词
    '风云', '江湖', '天下', '天下', '苍穹', '九天', '玄天',
    '龙啸', '凤鸣', '麒麟', '玄武', '白虎', '青龙', '朱雀',
    '江山', '社稷', '苍生', '苍茫', '茫茫', '悠悠', '漫漫',
    '蹉跎', '沧桑', '浮沉', '沉浮', '轮回', '因果', '轮回',
    // 常见过于文雅的四字组合
    '岁月如梭', '江湖再见', '风云际会', '龙啸九天',
    '暗箭难防', '风云变色', '山雨欲来', '一叶知秋',
    '物是人非', '时过境迁', '沧海桑田', '斗转星移',
    '日月如梭', '光阴似箭', '白驹过隙', '似水流年',
    '风起云涌', '电闪雷鸣', '雷霆万钧', '天崩地裂',
    '惊天地泣鬼神', '气吞山河', '横扫千军', '一夫当关',
  ];

  /**
   * 验证章节标题是否符合要求
   * @param title 待验证的标题
   * @returns 验证结果，包含是否有效及修改建议
   */
  static validateTitle(title: string | null | undefined): { valid: boolean; title: string; reason?: string } {
    console.log('[DeAIService.validateTitle] 开始验证标题:', title);
    
    // 空标题
    if (!title || title.trim().length === 0) {
      console.log('[DeAIService.validateTitle] 验证失败: 标题为空');
      return { valid: false, title: '', reason: '标题为空' };
    }

    const trimmedTitle = title.trim();
    console.log('[DeAIService.validateTitle] 原始长度:', title.length, '中文字符数:', trimmedTitle.replace(/[^\u4e00-\u9fa5]/g, '').length);

    // 1. 检查长度
    const pureChineseLength = trimmedTitle.replace(/[^\u4e00-\u9fa5]/g, '').length;
    console.log('[DeAIService.validateTitle] 中文字符数:', pureChineseLength, '限制:', this.TITLE_MIN_LENGTH, '-', this.TITLE_MAX_LENGTH);
    if (pureChineseLength < this.TITLE_MIN_LENGTH) {
      console.log('[DeAIService.validateTitle] 验证失败: 标题太短');
      return { valid: false, title: trimmedTitle, reason: `标题太短（至少${this.TITLE_MIN_LENGTH}个字）` };
    }
    if (pureChineseLength > this.TITLE_MAX_LENGTH) {
      console.log('[DeAIService.validateTitle] 验证失败: 标题太长');
      return { valid: false, title: trimmedTitle, reason: `标题太长（最多${this.TITLE_MAX_LENGTH}个字）` };
    }

    // 2. 检查是否过于文绉绉
    const isTooLiteraryResult = this.isTooLiterary(trimmedTitle);
    console.log('[DeAIService.validateTitle] 文绉绉检查结果:', isTooLiteraryResult);
    if (isTooLiteraryResult.tooLiterary) {
      console.log('[DeAIService.validateTitle] 验证失败: 标题过于文绉绉', isTooLiteraryResult.details);
      return { valid: false, title: trimmedTitle, reason: '标题过于文绉绉/像成语诗词' };
    }

    console.log('[DeAIService.validateTitle] 验证通过!');
    return { valid: true, title: trimmedTitle };
  }

  /**
   * 检查标题是否过于文绉绉
   */
  private static isTooLiterary(title: string): { tooLiterary: boolean; details?: string } {
    // 统计文言词/成语特征词出现次数
    let literaryCount = 0;
    const matchedPatterns: string[] = [];
    
    for (const pattern of this.LITERARY_PATTERNS) {
      if (title.includes(pattern)) {
        literaryCount++;
        matchedPatterns.push(pattern);
      }
    }
    
    console.log('[DeAIService.isTooLiterary] 标题:', title, '匹配到的文言词:', matchedPatterns, '数量:', literaryCount);

    // 如果文言词/成语特征超过2个，认为过于文绉绉
    if (literaryCount >= 2) {
      return { tooLiterary: true, details: `匹配到${literaryCount}个文言词: ${matchedPatterns.join(', ')}` };
    }

    // 如果4字成语比例过高（>50%），也认为过于文绉绉
    const fourCharMatches = title.match(/[\u4e00-\u9fa5]{4}/g) || [];
    const totalChineseChars = title.replace(/[^\u4e00-\u9fa5]/g, '').length;
    const ratio = totalChineseChars >= 4 ? fourCharMatches.length / totalChineseChars * 4 : 0;
    console.log('[DeAIService.isTooLiterary] 四字词匹配:', fourCharMatches, '总中文字符:', totalChineseChars, '比例:', ratio);
    
    if (totalChineseChars >= 4 && ratio > 0.5) {
      return { tooLiterary: true, details: `四字成语比例过高: ${ratio.toFixed(2)} > 0.5` };
    }

    return { tooLiterary: false };
  }

  /**
   * 提取并验证章节标题
   * 从内容中提取标题并进行验证，确保标题符合要求
   * @param content 原始内容
   * @returns 验证后的标题和清理后的正文
   */
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
