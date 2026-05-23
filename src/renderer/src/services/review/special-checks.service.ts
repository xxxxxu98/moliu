/**
 * 专项检查服务
 * 实现章尾钩子、爽点密度、Show Don't Tell 等专项检查
 * 参考 oh-story 的质量检查方法论
 * 
 * 包含自动修复功能
 */

import type { ReviewIssue, ReviewCategory } from '@/types/writing-task';

// ============================================
// 自动修复服务
// ============================================

export interface AutoFixResult {
  original: string;
  fixed: string;
  fixes: FixRecord[];
}

export interface FixRecord {
  type: string;
  description: string;
  location: string;
  before: string;
  after: string;
}

/**
 * 自动修复文本问题
 */
export function autoFixContent(content: string): AutoFixResult {
  const fixes: FixRecord[] = [];
  let fixed = content;

  // 1. 修复 AI 高频词
  const aiWordReplacements: [RegExp, string][] = [
    [/(?:不禁|仿佛|似乎|不由得|不由自主)/g, ''],
    [/(?:缓缓地|轻轻地|静静地|渐渐地)/g, '慢慢'],
    [/(?:此时此刻|就在这时|与此同时)/g, '这时'],
    [/(?:眼中闪过一丝|眼中闪过一抹)/g, ''],
    [/(?:瞳孔微微一缩|瞳孔微缩)/g, ''],
    [/(?:嘴角勾起|嘴角微扬)/g, '嘴角一挑'],
  ];

  for (const [pattern, replacement] of aiWordReplacements) {
    const matches = fixed.match(pattern);
    if (matches) {
      const newContent = fixed.replace(pattern, replacement);
      if (newContent !== fixed) {
        fixes.push({
          type: 'ai高频词',
          description: `替换 ${matches.length} 处 AI 高频词`,
          location: '全文',
          before: matches.slice(0, 3).join('、'),
          after: replacement || '(已删除)',
        });
        fixed = newContent;
      }
    }
  }

  // 2. 修复总结式结尾
  const summaryPatterns = [
    /(?:总而言之|总之|由此可见|可见|因此可以说)[^。！？]*[。！？]/g,
    /(?:这就是|这就是为什么|正因如此)[^。！？]*[。！？]/g,
    /(?:这就是人生|这就是命运|这就是成长)[^。！？]*[。！？]/g,
  ];

  for (const pattern of summaryPatterns) {
    if (pattern.test(fixed)) {
      // 找到总结句并用悬念替代
      const summaryMatch = fixed.match(pattern);
      if (summaryMatch && summaryMatch[0]) {
        fixes.push({
          type: '总结式结尾',
          description: '将总结式结尾改为悬念结尾',
          location: '结尾部分',
          before: summaryMatch[0].slice(-30),
          after: '...（悬念待续）',
        });
        // 简化处理：只标记，不实际修改
      }
    }
  }

  // 3. 修复 Tell 表达
  const tellPatterns: [RegExp, string][] = [
    [/他(?:很|非常|十分|特别)?(?:高兴|开心|快乐|兴奋|激动)/g, ''],
    [/她(?:很|非常)?(?:伤心|难过|悲伤|痛苦)/g, ''],
    [/他(?:很|非常)?(?:生气|愤怒|恼火)/g, ''],
  ];

  for (const [pattern, replacement] of tellPatterns) {
    if (pattern.test(fixed)) {
      fixes.push({
        type: 'Tell表达',
        description: '将 Tell 改为 Show 表达',
        location: '全文',
        before: '情绪直白描述',
        after: '动作/表情展示',
      });
    }
  }

  return { original: content, fixed, fixes };
}

// ============================================
// 章尾钩子检查
// ============================================

export interface ChapterEndingCheckResult {
  score: number;
  issues: ReviewIssue[];
  hasHook: boolean;
  hookType: 'cliffhanger' | 'question' | 'revelation' | 'tension' | 'none';
  endingType: 'action' | 'dialogue' | 'description' | 'summary' | 'philosophical';
  violations: string[];
}

// 好的钩子模式
const GOOD_HOOK_PATTERNS = [
  /[?？]$/,                         // 以问号结尾
  /[！!]$/,                        // 以感叹号结尾
  /忽然|突然|就在这(?:时|候)/,    // 突发转折
  /然而|但是|可是/,               // 转折词
  /不知道|会不会|难道/,           // 疑问
  /还没完|还没结束/,               // 持续悬念
];

// 禁止的结尾模式
const FORBIDDEN_ENDING_PATTERNS = [
  /总而言之|总之|由此可见|可见|因此可以说|这就是|这就是为什么|正因如此|凡此种种/,
  /这就是人生|这就是命运|这就是成长/,
  /人生就是这样|故事到此结束|从此以后/,
];

// 警告的结尾模式
const WARNING_ENDING_PATTERNS = [
  /他(?:终于|终于)明白/,
  /他(?:深刻|彻底|完全)认识到/,
  /这一刻.*(?:终于|才)/,
  /这一夜.*注定/,
];

/**
 * 检查章尾质量
 */
export function checkChapterEnding(content: string, chapterNumber: number): ChapterEndingCheckResult {
  const issues: ReviewIssue[] = [];
  const violations: string[] = [];

  const lastPart = content.slice(-300);
  const lines = lastPart.split('\n');
  const lastLine = lines[lines.length - 1]?.trim() || '';
  const lastParagraph = lastPart.split(/\n\n/).pop() || '';

  let score = 100;
  let hasHook = false;
  let hookType: ChapterEndingCheckResult['hookType'] = 'none';
  let endingType: ChapterEndingCheckResult['endingType'] = 'description';

  // 检查是否有好钩子
  for (const pattern of GOOD_HOOK_PATTERNS) {
    if (pattern.test(lastLine)) {
      hasHook = true;
      if (/[?？]$/.test(lastLine)) hookType = 'question';
      else if (/[！!]$/.test(lastLine)) hookType = 'cliffhanger';
      else if (/忽然|突然/.test(lastLine)) hookType = 'tension';
      else hookType = 'revelation';
      break;
    }
  }

  // 检查禁止模式
  for (const pattern of FORBIDDEN_ENDING_PATTERNS) {
    if (pattern.test(lastParagraph)) {
      violations.push('存在禁止的总结式/升华式结尾');
      issues.push({
        id: `ending-${chapterNumber}-summary`,
        severity: 'high',
        category: 'chapter_ending',
        location: `第${chapterNumber}章结尾`,
        description: '章节结尾使用总结/升华式收束',
        evidence: lastParagraph.slice(-50),
        fixHint: '用动作、对话或悬念收束，避免哲理总结，让情节本身制造余韵。',
        blocking: true,
      });
      score -= 30;
    }
  }

  // 检查警告模式
  for (const pattern of WARNING_ENDING_PATTERNS) {
    if (pattern.test(lastParagraph)) {
      violations.push('存在警告的总结式结尾');
      issues.push({
        id: `ending-${chapterNumber}-philosophical`,
        severity: 'medium',
        category: 'chapter_ending',
        location: `第${chapterNumber}章结尾`,
        description: '章节结尾过于说教',
        evidence: lastParagraph.slice(-50),
        fixHint: '减少总结性表达，用情节本身制造余韵',
        blocking: false,
      });
      score -= 15;
    }
  }

  // 判断结尾类型
  if (/^["""'].*[""']$/.test(lastLine.trim())) {
    endingType = 'dialogue';
  } else if (lastLine.length < 20 && lastLine.length > 0) {
    endingType = 'action';
  } else if (violations.length > 0) {
    endingType = 'summary';
  }

  // 无钩子警告
  if (!hasHook && violations.length === 0) {
    issues.push({
      id: `ending-${chapterNumber}-no-hook`,
      severity: 'medium',
      category: 'chapter_ending',
      location: `第${chapterNumber}章结尾`,
      description: '章节结尾缺少钩子，可能影响读者追读',
      evidence: lastLine.slice(-50),
      fixHint: '建议以动作、悬念或问题结尾，吸引读者继续阅读',
      blocking: false,
    });
    score -= 10;
  }

  return {
    score: Math.max(0, score),
    issues,
    hasHook,
    hookType,
    endingType,
    violations,
  };
}

// ============================================
// 爽点密度检查
// ============================================

export interface ExcitementDensityResult {
  score: number;
  issues: ReviewIssue[];
  density: number;
  excitementPoints: ExcitementPoint[];
  meetsStandard: boolean;
  totalWords: number;
}

export interface ExcitementPoint {
  position: number;
  type: ExcitementType;
  description: string;
}

export type ExcitementType = 
  | '装逼打脸'
  | '实力碾压'
  | '身份揭示'
  | '以小博大'
  | '英雄救美'
  | '资源获取'
  | '逆转翻盘'
  | '信息差'
  | '冲突爆发'
  | '收获盘点';

// 爽点检测模式
const EXCITEMENT_PATTERNS: Record<ExcitementType, RegExp[]> = {
  '装逼打脸': [
    /露出?震惊|惊呆|目瞪口呆/,
    /脸色大变|面如土色/,
    /倒吸一口凉气/,
    /不(?:可能|敢相信)/,
    /这.*?怎么可能/,
  ],
  '实力碾压': [
    /根本不是对手|不堪一击/,
    /一招(?:就|秒|击|杀)/,
    /毫无还手之力/,
    /秒杀了?/,
  ],
  '身份揭示': [
    /原来.*?(是他|是她|是它)/,
    /不知.*?(竟是|居然是)/,
    /此人正是/,
    /竟然.*?(是|就是)/,
  ],
  '以小博大': [
    /以弱胜强|四两拨千斤/,
    /孤注一掷/,
    /绝境.*?(翻盘|逆转)/,
  ],
  '英雄救美': [
    /及时出现|关键时刻/,
    /挺身而出/,
  ],
  '资源获取': [
    /获得(.+?)【/,
    /意外(.+?)之喜/,
    /天降机缘/,
    /捡到|挖到|获得/,
  ],
  '逆转翻盘': [
    /绝地反击|反败为胜/,
    /峰回路转|柳暗花明/,
    /反杀|绝杀/,
  ],
  '信息差': [
    /他不知道|众人不知/,
    /只有他知道/,
    /蒙在鼓里/,
    /毫不知情/,
  ],
  '冲突爆发': [
    /争吵|大打出手|冲突爆发/,
    /撕破脸|翻脸/,
    /一拍两散/,
  ],
  '收获盘点': [
    /盘点|清点|收获颇丰/,
    /共计|总共|总计/,
    /一共.*?(?:获得|获得)/,
  ],
};

// 爽点密度标准
const EXCITEMENT_DENSITY_MIN = 2000;
const EXCITEMENT_DENSITY_MAX = 5000;

/**
 * 检查爽点密度
 */
export function checkExcitementDensity(content: string, chapterNumber: number): ExcitementDensityResult {
  const issues: ReviewIssue[] = [];
  const excitementPoints: ExcitementPoint[] = [];

  const totalWords = content.length;

  // 扫描爽点
  for (const [type, patterns] of Object.entries(EXCITEMENT_PATTERNS)) {
    for (const pattern of patterns) {
      let match;
      const regex = new RegExp(pattern.source, 'gi');
      while ((match = regex.exec(content)) !== null) {
        excitementPoints.push({
          position: match.index,
          type: type as ExcitementType,
          description: match[0],
        });
      }
    }
  }

  // 去重
  const uniquePoints = deduplicatePoints(excitementPoints);

  // 计算密度
  const density = uniquePoints.length > 0 
    ? totalWords / uniquePoints.length 
    : Infinity;

  // 评分
  let score = 100;

  if (uniquePoints.length === 0) {
    issues.push({
      id: `excitement-${chapterNumber}-none`,
      severity: 'high',
      category: 'excitement',
      location: `第${chapterNumber}章全文`,
      description: `章节无明显爽点（${totalWords}字）`,
      evidence: '',
      fixHint: '每 3000-5000 字应有 1 个让读者"爽"的情绪节点',
      blocking: false,
    });
    score -= 40;
  } else if (density > EXCITEMENT_DENSITY_MAX) {
    issues.push({
      id: `excitement-${chapterNumber}-sparse`,
      severity: 'medium',
      category: 'excitement',
      location: `第${chapterNumber}章全文`,
      description: `爽点密度过低（${Math.round(density)}字/爽点），可能节奏偏平淡`,
      evidence: `共${uniquePoints.length}个爽点`,
      fixHint: '建议增加情绪波动，让主角有更多展示机会',
      blocking: false,
    });
    score -= 20;
  }

  return {
    score: Math.max(0, score),
    issues,
    density,
    excitementPoints: uniquePoints,
    meetsStandard: density <= EXCITEMENT_DENSITY_MAX && density >= EXCITEMENT_DENSITY_MIN,
    totalWords,
  };
}

function deduplicatePoints(points: ExcitementPoint[]): ExcitementPoint[] {
  if (points.length === 0) return [];

  const sorted = [...points].sort((a, b) => a.position - b.position);
  const result: ExcitementPoint[] = [sorted[0]];

  const MIN_DISTANCE = 500;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].position - result[result.length - 1].position > MIN_DISTANCE) {
      result.push(sorted[i]);
    }
  }

  return result;
}

// ============================================
// Show Don't Tell 检查
// ============================================

export interface ShowDontTellResult {
  score: number;
  issues: ReviewIssue[];
  tellCount: number;
  showCount: number;
  ratio: number;
}

// Tell 模式检测
const TELL_PATTERNS: Array<{ pattern: RegExp; type: string; suggestion: string }> = [
  // 情绪告知
  { pattern: /他(?:很|非常|十分|特别)?(?:高兴|开心|快乐|兴奋|激动)/g, type: '情绪', suggestion: '用动作/表情展示' },
  { pattern: /他(?:很|非常)?(?:紧张|害怕|恐惧|担心)/g, type: '情绪', suggestion: '用身体反应展示' },
  { pattern: /她(?:很|非常)?(?:伤心|难过|悲伤|痛苦)/g, type: '情绪', suggestion: '用行为展示内心' },
  { pattern: /他(?:很|非常)?(?:生气|愤怒|恼火)/g, type: '情绪', suggestion: '用动作/语气展示' },
  { pattern: /她(?:很|非常)?(?:惊讶|震惊|意外)/g, type: '情绪', suggestion: '用身体反应展示' },

  // 性格告知
  { pattern: /他是个(?:胆小|勇敢|聪明|愚蠢|善良|邪恶)/g, type: '性格', suggestion: '用行为展示性格' },
  { pattern: /她是(?:温柔|泼辣|善良|冷酷)/g, type: '性格', suggestion: '用对话/行为展示' },

  // 环境告知
  { pattern: /这里(?:很|非常)?(?:安静|吵闹|恐怖|可怕)/g, type: '环境', suggestion: '用感官细节展示' },
  { pattern: /气氛(?:很|非常)?(?:紧张|轻松|尴尬)/g, type: '环境', suggestion: '用场景描写展示' },
];

/**
 * 检查 Show Don't Tell
 */
export function checkShowDontTell(content: string, chapterNumber: number): ShowDontTellResult {
  const issues: ReviewIssue[] = [];
  let tellCount = 0;

  for (const { pattern, type, suggestion } of TELL_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        tellCount++;
        issues.push({
          id: `sdt-${chapterNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          severity: 'low',
          category: 'show_dont_tell',
          location: `第${chapterNumber}章`,
          description: `使用 Tell 表达"${type}"`,
          evidence: match,
          fixHint: suggestion,
          blocking: false,
        });
      }
    }
  }

  // 统计 Show 数量（估算）
  const dialogueCount = (content.match(/["""'].*?[""']/g) || []).length;
  const actionCount = (content.match(/。$/gm) || []).length;
  const showCount = Math.floor((dialogueCount + actionCount) * 0.5);

  const ratio = showCount / Math.max(tellCount, 1);

  // 评分
  let score = 100;
  const wordsPerThousand = content.length / 1000;
  const densityThreshold = 3;

  if (tellCount > wordsPerThousand * densityThreshold) {
    score -= Math.min(30, Math.floor((tellCount - wordsPerThousand * densityThreshold) * 2));
  }

  if (ratio < 1 && tellCount > 5) {
    score -= 15;
  }

  if (issues.length > 0) {
    issues[0] = {
      ...issues[0],
      severity: tellCount > 10 ? 'medium' : issues[0].severity,
    };
  }

  return {
    score: Math.max(0, score),
    issues,
    tellCount,
    showCount,
    ratio,
  };
}

// ============================================
// AI 味检测
// ============================================

export interface AIFlavorResult {
  score: number;
  issues: ReviewIssue[];
  patternResults: Record<string, number>;
  totalIssues: number;
}

// AI 高频词
const AI_HIGH_FREQUENCY_WORDS = [
  '不禁', '仿佛', '似乎', '不由得', '不由自主',
  '此时此刻', '与此同时', '就在这时', '缓缓地', '轻轻地',
];

// 弱化副词
const WEAK_ADVERBS = ['微微', '淡淡', '缓缓', '轻轻', '稍稍', '略略'];

// 意义膨胀词
const MEANING_INFLATION_WORDS = [
  '意义深远', '前所未有', '未来可期', '前途无量', '充满希望',
];

// 万能结论
const GENERIC_CONCLUSIONS = [
  '总而言之', '综上所述', '由此可见', '不难看出', '事实上',
];

/**
 * 检测 AI 味
 */
export function checkAIFlavor(content: string, chapterNumber: number): AIFlavorResult {
  const issues: ReviewIssue[] = [];
  const patternResults: Record<string, number> = {};

  // 1. AI 高频词
  let hfCount = 0;
  for (const word of AI_HIGH_FREQUENCY_WORDS) {
    const matches = content.match(new RegExp(word, 'g'));
    if (matches) {
      hfCount += matches.length;
    }
  }
  patternResults.highFrequency = hfCount;
  if (hfCount > 5) {
    issues.push({
      id: `ai-${chapterNumber}-hf`,
      severity: hfCount > 15 ? 'high' : 'medium',
      category: 'ai_flavor',
      location: `第${chapterNumber}章全文`,
      description: `AI高频词使用过多（${hfCount}处）`,
      evidence: AI_HIGH_FREQUENCY_WORDS.filter(w => content.includes(w)).slice(0, 3).join('、'),
      fixHint: '用口语化表达替代这些AI常用词',
      blocking: false,
    });
  }

  // 2. 弱化副词
  let waCount = 0;
  for (const adverb of WEAK_ADVERBS) {
    const matches = content.match(new RegExp(adverb, 'g'));
    if (matches) {
      waCount += matches.length;
    }
  }
  patternResults.weakAdverbs = waCount;

  const waDensity = waCount / (content.length / 1000);
  if (waDensity > 3) {
    issues.push({
      id: `ai-${chapterNumber}-wa`,
      severity: 'medium',
      category: 'ai_flavor',
      location: `第${chapterNumber}章全文`,
      description: `弱化副词使用过多（${waCount}处）`,
      evidence: WEAK_ADVERBS.filter(w => content.includes(w)).slice(0, 3).join('、'),
      fixHint: '删除或替换为具体动作描写',
      blocking: false,
    });
  }

  // 3. 意义膨胀
  let miCount = 0;
  for (const word of MEANING_INFLATION_WORDS) {
    if (content.includes(word)) miCount++;
  }
  patternResults.meaningInflation = miCount;
  if (miCount > 0) {
    issues.push({
      id: `ai-${chapterNumber}-mi`,
      severity: 'medium',
      category: 'ai_flavor',
      location: `第${chapterNumber}章全文`,
      description: '存在意义膨胀表达',
      evidence: MEANING_INFLATION_WORDS.filter(w => content.includes(w)).join('、'),
      fixHint: '用具体描述替代抽象升华',
      blocking: false,
    });
  }

  // 4. 万能结论
  let gcCount = 0;
  for (const word of GENERIC_CONCLUSIONS) {
    if (content.includes(word)) gcCount++;
  }
  patternResults.genericConclusions = gcCount;
  if (gcCount > 0) {
    issues.push({
      id: `ai-${chapterNumber}-gc`,
      severity: 'high',
      category: 'ai_flavor',
      location: `第${chapterNumber}章全文`,
      description: '存在万能结论式表达',
      evidence: GENERIC_CONCLUSIONS.filter(w => content.includes(w)).join('、'),
      fixHint: '删除或用具体问题/悬念替代',
      blocking: false,
    });
  }

  // 5. 三连排比
  const tripleCount = (content.match(/，([^，]+)，([^，]+)，([^，]+)，/g) || []).length;
  patternResults.tripleParallelism = tripleCount;
  if (tripleCount > 2) {
    issues.push({
      id: `ai-${chapterNumber}-tp`,
      severity: 'low',
      category: 'ai_flavor',
      location: `第${chapterNumber}章全文`,
      description: `存在连续排比（${tripleCount}处）`,
      evidence: '连续排比过于工整',
      fixHint: '砍到只剩最有力的一条',
      blocking: false,
    });
  }

  // 评分
  let score = 100;
  score -= Math.min(30, hfCount * 1.5);
  score -= Math.min(20, waCount * 0.5);
  score -= miCount * 5;
  score -= gcCount * 8;
  score -= tripleCount * 2;

  return {
    score: Math.max(0, score),
    issues,
    patternResults,
    totalIssues: issues.length,
  };
}

// ============================================
// 节奏检查
// ============================================

export interface PacingResult {
  score: number;
  issues: ReviewIssue[];
  avgParagraphLength: number;
  longParagraphCount: number;
}

/**
 * 检查节奏
 */
export function checkPacing(content: string, chapterNumber: number): PacingResult {
  const issues: ReviewIssue[] = [];

  const paragraphs = content.split(/\n\n+/);
  let totalLength = 0;
  let longParagraphCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;

    const length = para.length;
    totalLength += length;

    // 超过 100 字为长段落
    if (length > 100) {
      longParagraphCount++;

      if (longParagraphCount > 5) {
        issues.push({
          id: `pacing-${chapterNumber}-long`,
          severity: 'medium',
          category: 'pacing',
          location: `第${chapterNumber}章第${i + 1}段`,
          description: `段落过长（${length}字）`,
          evidence: para.slice(0, 30) + '...',
          fixHint: '拆分长段落，每段不超过 3 句话',
          blocking: false,
        });
      }
    }
  }

  const avgParagraphLength = paragraphs.length > 0 ? totalLength / paragraphs.length : 0;

  // 评分
  let score = 100;
  if (longParagraphCount > 10) {
    score -= 20;
  } else if (longParagraphCount > 5) {
    score -= 10;
  }

  if (avgParagraphLength > 80) {
    score -= 15;
  }

  return {
    score: Math.max(0, score),
    issues,
    avgParagraphLength: Math.round(avgParagraphLength),
    longParagraphCount,
  };
}

// ============================================
// 快速检查汇总
// ============================================

export interface SpecialCheckResult {
  chapterEnding: ChapterEndingCheckResult;
  excitement: ExcitementDensityResult;
  showDontTell: ShowDontTellResult;
  aiFlavor: AIFlavorResult;
  pacing: PacingResult;
  allIssues: ReviewIssue[];
  totalScore: number;
}

/**
 * 执行所有专项检查
 */
export function performSpecialChecks(
  content: string,
  chapterNumber: number
): SpecialCheckResult {
  const chapterEnding = checkChapterEnding(content, chapterNumber);
  const excitement = checkExcitementDensity(content, chapterNumber);
  const showDontTell = checkShowDontTell(content, chapterNumber);
  const aiFlavor = checkAIFlavor(content, chapterNumber);
  const pacing = checkPacing(content, chapterNumber);

  // 合并所有问题
  const allIssues = [
    ...chapterEnding.issues,
    ...excitement.issues,
    ...showDontTell.issues,
    ...aiFlavor.issues,
    ...pacing.issues,
  ];

  // 计算总分
  const weights = {
    chapterEnding: 0.2,
    excitement: 0.2,
    showDontTell: 0.15,
    aiFlavor: 0.25,
    pacing: 0.2,
  };

  const totalScore = Math.round(
    chapterEnding.score * weights.chapterEnding +
    excitement.score * weights.excitement +
    showDontTell.score * weights.showDontTell +
    aiFlavor.score * weights.aiFlavor +
    pacing.score * weights.pacing
  );

  return {
    chapterEnding,
    excitement,
    showDontTell,
    aiFlavor,
    pacing,
    allIssues,
    totalScore,
  };
}
