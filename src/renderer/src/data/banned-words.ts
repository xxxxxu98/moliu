/**
 * 禁用词库
 * 基于 webnovel-writer-master 的内容审核系统
 * 
 * 禁用词库用于：
 * - 过滤敏感内容
 * - 避免违规词汇
 * - 提高内容质量
 */

// ============================================================
// 类型定义
// ============================================================

export interface BannedWord {
  word: string;
  reason: string;
  category: BannedCategory;
  severity: 'low' | 'medium' | 'high';
  alternatives?: string[];
}

export type BannedCategory = 
  | 'politics'      // 政治敏感
  | 'religion'      // 宗教相关
  | 'violence'      // 暴力血腥
  | 'vulgar'        // 低俗色情
  | 'discrimination' // 歧视用语
  | 'copyright'     // 版权问题
  | 'misleading'     // 误导性
  | 'quality'        // 质量警告
  | 'cliche';        // 过度套路

export interface BannedWordConfig {
  enabled: boolean;
  categories: BannedCategory[];
  checkAI: boolean;
  checkCopyright: boolean;
}

// ============================================================
// 禁用词库
// ============================================================

export const BANNED_WORDS: BannedWord[] = [
  // ============================================================
  // 政治敏感
  // ============================================================
  {
    word: '毛泽东',
    reason: '涉及领导人姓名',
    category: 'politics',
    severity: 'high',
    alternatives: ['主角', '伟人'],
  },
  {
    word: '共产党',
    reason: '涉及政党名称',
    category: 'politics',
    severity: 'high',
    alternatives: ['组织', '门派'],
  },
  {
    word: '政府官员',
    reason: '涉及官员描写',
    category: 'politics',
    severity: 'medium',
    alternatives: ['官员', '管理者'],
  },
  {
    word: '天安门',
    reason: '涉及敏感地名',
    category: 'politics',
    severity: 'high',
    alternatives: ['广场', '地标'],
  },

  // ============================================================
  // 宗教相关
  // ============================================================
  {
    word: '佛教',
    reason: '宗教相关',
    category: 'religion',
    severity: 'medium',
    alternatives: ['门派', '宗派'],
  },
  {
    word: '道教',
    reason: '宗教相关',
    category: 'religion',
    severity: 'medium',
    alternatives: ['道法', '修仙'],
  },
  {
    word: '基督教',
    reason: '宗教相关',
    category: 'religion',
    severity: 'medium',
    alternatives: ['信仰', '教派'],
  },
  {
    word: '伊斯兰教',
    reason: '宗教相关',
    category: 'religion',
    severity: 'medium',
    alternatives: ['信仰', '教派'],
  },

  // ============================================================
  // 暴力血腥
  // ============================================================
  {
    word: '屠杀',
    reason: '过于血腥暴力',
    category: 'violence',
    severity: 'medium',
    alternatives: ['激战', '覆灭'],
  },
  {
    word: '碎尸',
    reason: '过于血腥暴力',
    category: 'violence',
    severity: 'high',
    alternatives: ['击杀', '消灭'],
  },
  {
    word: '斩首',
    reason: '过于血腥暴力',
    category: 'violence',
    severity: 'medium',
    alternatives: ['击杀', '处决'],
  },

  // ============================================================
  // 低俗色情
  // ============================================================
  {
    word: '性交',
    reason: '过于直白的性描写',
    category: 'vulgar',
    severity: 'high',
    alternatives: ['亲密', '结合'],
  },
  {
    word: '做爱',
    reason: '过于直白的性描写',
    category: 'vulgar',
    severity: 'high',
    alternatives: ['亲密', '缠绵'],
  },
  {
    word: '强奸',
    reason: '涉及性暴力',
    category: 'vulgar',
    severity: 'high',
    alternatives: ['胁迫', '侵犯'],
  },
  {
    word: '裸体',
    reason: '过于直白的身体描写',
    category: 'vulgar',
    severity: 'medium',
    alternatives: ['衣衫凌乱', '衣不蔽体'],
  },
  {
    word: '呻吟',
    reason: '可能暗示性描写',
    category: 'vulgar',
    severity: 'low',
    alternatives: ['低呼', '喊叫'],
  },
  {
    word: '乳头',
    reason: '过于直白的身体部位描写',
    category: 'vulgar',
    severity: 'high',
    alternatives: ['身体'],
  },
  {
    word: '阴道',
    reason: '过于直白的生理描写',
    category: 'vulgar',
    severity: 'high',
    alternatives: [],
  },
  {
    word: '阴茎',
    reason: '过于直白的生理描写',
    category: 'vulgar',
    severity: 'high',
    alternatives: [],
  },

  // ============================================================
  // 歧视用语
  // ============================================================
  {
    word: '傻子',
    reason: '可能构成歧视',
    category: 'discrimination',
    severity: 'medium',
    alternatives: ['笨蛋', '不聪明'],
  },
  {
    word: '残疾人',
    reason: '可能构成歧视',
    category: 'discrimination',
    severity: 'medium',
    alternatives: ['行动不便者', '身体有恙者'],
  },
  {
    word: '精神病',
    reason: '可能构成歧视',
    category: 'discrimination',
    severity: 'medium',
    alternatives: ['心智异常', '精神不稳'],
  },

  // ============================================================
  // 版权问题
  // ============================================================
  {
    word: '腾讯',
    reason: '可能涉及商标',
    category: 'copyright',
    severity: 'medium',
    alternatives: ['公司', '集团'],
  },
  {
    word: '阿里巴巴',
    reason: '可能涉及商标',
    category: 'copyright',
    severity: 'medium',
    alternatives: ['商会', '财团'],
  },
  {
    word: '王者荣耀',
    reason: '可能涉及版权',
    category: 'copyright',
    severity: 'medium',
    alternatives: ['游戏', '竞技'],
  },
  {
    word: '哈利波特',
    reason: '可能涉及版权',
    category: 'copyright',
    severity: 'medium',
    alternatives: ['魔法少年', '巫师学徒'],
  },

  // ============================================================
  // 误导性
  // ============================================================
  {
    word: '根据真实故事改编',
    reason: '未经证实可能误导读者',
    category: 'misleading',
    severity: 'medium',
    alternatives: ['本故事纯属虚构', '如有雷同纯属巧合'],
  },
  {
    word: '医学研究表明',
    reason: '未注明来源可能误导',
    category: 'misleading',
    severity: 'low',
    alternatives: ['据说', '传闻'],
  },

  // ============================================================
  // 质量警告（网文特有的低质词汇）
  // ============================================================
  {
    word: '毫不犹豫',
    reason: '过度使用的套路表达',
    category: 'cliche',
    severity: 'low',
    alternatives: ['立刻', '立即'],
  },
  {
    word: '眼中闪过一丝',
    reason: '过度使用的套路表达',
    category: 'cliche',
    severity: 'low',
    alternatives: ['眼中露出', '目光中透出'],
  },
  {
    word: '不由得',
    reason: '过度使用的套路表达',
    category: 'cliche',
    severity: 'low',
    alternatives: ['忍不住', '下意识地'],
  },
  {
    word: '却是',
    reason: '过度使用的转折词',
    category: 'cliche',
    severity: 'low',
    alternatives: ['却是', '竟然是'],
  },
  {
    word: '然而',
    reason: '过度使用的转折词',
    category: 'cliche',
    severity: 'low',
    alternatives: ['但是', '只是'],
  },
  {
    word: '竟然',
    reason: '过度使用的惊叹词',
    category: 'cliche',
    severity: 'low',
    alternatives: ['居然', '没想'],
  },
  {
    word: '刹那间',
    reason: '过度使用的时间词',
    category: 'cliche',
    severity: 'low',
    alternatives: ['瞬间', '霎时'],
  },
  {
    word: '电光火石间',
    reason: '过度使用的描写',
    category: 'cliche',
    severity: 'low',
    alternatives: ['一瞬间', '眨眼间'],
  },
  {
    word: '霸道总裁',
    reason: '过度使用的标签',
    category: 'cliche',
    severity: 'low',
    alternatives: ['总裁', '豪门少爷'],
  },
  {
    word: '邪魅一笑',
    reason: '过度使用的描写',
    category: 'cliche',
    severity: 'low',
    alternatives: ['嘴角上扬', '微微一笑'],
  },
  {
    word: '凤眸微眯',
    reason: '过度使用的描写',
    category: 'cliche',
    severity: 'low',
    alternatives: ['眼神微动', '目光流转'],
  },
  {
    word: '嘴角勾起一抹',
    reason: '过度使用的描写',
    category: 'cliche',
    severity: 'low',
    alternatives: ['嘴角微扬', '露出微笑'],
  },
  {
    word: '不明觉厉',
    reason: '网络用语，不适合小说',
    category: 'cliche',
    severity: 'medium',
    alternatives: ['虽然不明白但很厉害'],
  },
  {
    word: '666',
    reason: '网络用语，不适合小说',
    category: 'cliche',
    severity: 'low',
    alternatives: ['厉害', '佩服'],
  },
  {
    word: '打call',
    reason: '网络用语，不适合小说',
    category: 'cliche',
    severity: 'low',
    alternatives: ['加油', '欢呼'],
  },
];

// ============================================================
// 禁用词模式（正则）
// ============================================================

export const BANNED_PATTERNS = [
  // 敏感信息模式
  /\d{11}/g,  // 手机号
  /\d{15}|\d{18}/g,  // 身份证号
  /[A-Z]{1,2}\d{6,9}/g,  // 疑似账号

  // 过度重复模式
  /(.)\1{5,}/g,  // 连续重复超过5次
];

// ============================================================
// 辅助函数
// ============================================================

/**
 * 检查文本是否包含禁用词
 */
export function checkBannedWords(text: string): BannedWord[] {
  const found: BannedWord[] = [];
  
  for (const word of BANNED_WORDS) {
    if (text.includes(word.word)) {
      found.push(word);
    }
  }

  return found;
}

/**
 * 检查文本是否包含禁用模式
 */
export function checkBannedPatterns(text: string): { pattern: RegExp; match: string }[] {
  const found: { pattern: RegExp; match: string }[] = [];

  for (const pattern of BANNED_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      found.push({ pattern, match: matches[0] });
    }
  }

  return found;
}

/**
 * 过滤禁用词
 */
export function filterBannedWords(text: string, replacement: string = '**'): string {
  let filtered = text;
  
  for (const word of BANNED_WORDS) {
    filtered = filtered.split(word.word).join(replacement);
  }

  return filtered;
}

/**
 * 获取禁用词统计
 */
export function getBannedWordStats(text: string): {
  total: number;
  byCategory: Record<BannedCategory, number>;
  bySeverity: Record<string, number>;
} {
  const found = checkBannedWords(text);

  const byCategory: Record<BannedCategory, number> = {
    politics: 0,
    religion: 0,
    violence: 0,
    vulgar: 0,
    discrimination: 0,
    copyright: 0,
    misleading: 0,
    quality: 0,
    cliche: 0,
  };

  const bySeverity: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };

  for (const word of found) {
    byCategory[word.category]++;
    bySeverity[word.severity]++;
  }

  return {
    total: found.length,
    byCategory,
    bySeverity,
  };
}

/**
 * 获取禁用词建议
 */
export function getBannedWordSuggestions(text: string): string[] {
  const found = checkBannedWords(text);
  const suggestions: string[] = [];

  for (const word of found) {
    if (word.alternatives && word.alternatives.length > 0) {
      suggestions.push(`"${word.word}" 建议替换为: ${word.alternatives.join('、')}`);
    } else {
      suggestions.push(`"${word.word}" 需要修改 (原因: ${word.reason})`);
    }
  }

  return suggestions;
}

/**
 * 按类别获取禁用词
 */
export function getBannedWordsByCategory(category: BannedCategory): BannedWord[] {
  return BANNED_WORDS.filter(w => w.category === category);
}

/**
 * 按严重程度获取禁用词
 */
export function getBannedWordsBySeverity(severity: 'low' | 'medium' | 'high'): BannedWord[] {
  return BANNED_WORDS.filter(w => w.severity === severity);
}

/**
 * 检查质量警告（套路词）
 */
export function checkQualityWarnings(text: string): string[] {
  const warnings: string[] = [];
  const qualityWords = BANNED_WORDS.filter(w => w.category === 'cliche');

  for (const word of qualityWords) {
    if (text.includes(word.word)) {
      warnings.push(`套路表达: "${word.word}" - 建议使用更自然的表达`);
    }
  }

  return warnings;
}

/**
 * 获取质量分数（基于套路词使用）
 */
export function getQualityScore(text: string): number {
  const qualityWords = BANNED_WORDS.filter(w => w.category === 'cliche');
  let penalty = 0;

  for (const word of qualityWords) {
    const regex = new RegExp(word.word, 'g');
    const matches = text.match(regex);
    if (matches) {
      penalty += matches.length * 2;
    }
  }

  return Math.max(0, 100 - penalty);
}
