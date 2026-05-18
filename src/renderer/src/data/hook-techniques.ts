/**
 * 钩子技法库
 * 基于 oh-story-claudecode-main 的钩子设计系统
 * 
 * 钩子是吸引读者继续阅读的关键元素
 */

import type { HookType } from '@/types/evaluation';

// ============================================================
// 类型定义
// ============================================================

export interface HookTechnique {
  type: HookType;
  name: string;
  description: string;
  examples: string[];
  usageTips: string[];
  genrePreferences: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  effectiveness: number; // 0-100
}

export interface HookTemplate {
  type: HookType;
  templates: string[];
}

// ============================================================
// 钩子技法库
// ============================================================

export const HOOK_TECHNIQUES: HookTechnique[] = [
  // ============================================================
  // 悬崖式悬念
  // ============================================================
  {
    type: 'cliffhanger',
    name: '悬崖式悬念',
    description: '在章节结尾制造紧急情况或重大转折，让读者无法停止阅读',
    examples: [
      '就在他准备出手的瞬间，一道寒光从暗处袭来...',
      '门被推开的瞬间，所有人都愣住了——来的人竟然是...',
      '就在任务即将完成时，通讯器里传来急促的声音："快跑，他们来了！"',
    ],
    usageTips: [
      '悬念要有具体的危机感',
      '留下足够的想象空间',
      '不要让悬念太容易猜测',
      '与主线剧情相关联',
    ],
    genrePreferences: ['都市', '玄幻', '修仙', '悬疑', '科幻'],
    difficulty: 'medium',
    effectiveness: 95,
  },

  // ============================================================
  // 疑问式钩子
  // ============================================================
  {
    type: 'question',
    name: '疑问式钩子',
    description: '提出一个引人深思的问题，激发读者的好奇心',
    examples: [
      '他为什么要这样做？明明有更好的选择...',
      '那个消失的夜晚，究竟发生了什么？',
      '为什么所有人都对这个名字讳莫如深？',
    ],
    usageTips: [
      '问题要直击核心悬念',
      '不要问太明显的问题',
      '让问题引导读者思考',
      '后续要给出答案',
    ],
    genrePreferences: ['悬疑', '推理', '都市', '科幻'],
    difficulty: 'easy',
    effectiveness: 85,
  },

  // ============================================================
  // 揭示式钩子
  // ============================================================
  {
    type: 'revelation',
    name: '揭示式钩子',
    description: '突然揭示一个惊人的事实或秘密，引发读者的震惊',
    examples: [
      '"你不是他的亲生儿子。"',
      '直到今天他才知道，那个救过他命的恩人，竟然是...',
      '原来这一切，从一开始就是个局。',
    ],
    usageTips: [
      '揭示要出人意料',
      '揭示要有足够的铺垫',
      '与读者预期形成反差',
      '揭示后要引发更多问题',
    ],
    genrePreferences: ['都市', '言情', '玄幻', '悬疑'],
    difficulty: 'hard',
    effectiveness: 90,
  },

  // ============================================================
  // 冲突式钩子
  // ============================================================
  {
    type: 'conflict',
    name: '冲突式钩子',
    description: '制造激烈的冲突场面，让读者紧张期待',
    examples: [
      '两股势力在城门口对峙，空气几乎凝固...',
      '他与师父对峙，剑已出鞘...',
      '就在谈判即将破裂的瞬间，意外发生了。',
    ],
    usageTips: [
      '冲突要有明确的对立',
      '让冲突升级',
      '加入时间压力',
      '展示各方立场',
    ],
    genrePreferences: ['玄幻', '修仙', '武侠', '都市'],
    difficulty: 'medium',
    effectiveness: 88,
  },

  // ============================================================
  // 紧张式钩子
  // ============================================================
  {
    type: 'tension',
    name: '紧张式钩子',
    description: '营造紧张的氛围，让读者感同身受',
    examples: [
      '脚步声越来越近，他屏住呼吸...',
      '时间在一分一秒地流逝，而他还差一步...',
      '心脏剧烈跳动，他知道下一秒可能就...',
    ],
    usageTips: [
      '描写要细腻',
      '加入感官细节',
      '控制节奏',
      '让读者有代入感',
    ],
    genrePreferences: ['悬疑', '恐怖', '都市', '末世'],
    difficulty: 'medium',
    effectiveness: 82,
  },

  // ============================================================
  // 选择式钩子
  // ============================================================
  {
    type: 'choice',
    name: '选择式钩子',
    description: '让角色面临艰难选择，引发读者代入',
    examples: [
      '是救她，还是完成任务？他陷入了两难...',
      '在亲情和正义之间，他该何去何从？',
      '这一票，他到底该不该干？',
    ],
    usageTips: [
      '选择要两难',
      '选项都要有代价',
      '体现角色性格',
      '引发读者思考',
    ],
    genrePreferences: ['都市', '言情', '玄幻', '科幻'],
    difficulty: 'hard',
    effectiveness: 87,
  },

  // ============================================================
  // 神秘式钩子
  // ============================================================
  {
    type: 'mystery',
    name: '神秘式钩子',
    description: '引入神秘元素，激发探索欲望',
    examples: [
      '那张泛黄的照片里，为什么没有他的脸？',
      '这个符号代表什么意思？所有人都不知道...',
      '传说中那个被封印的存在，似乎要苏醒了。',
    ],
    usageTips: [
      '神秘要有吸引力',
      '逐步揭示',
      '留有悬念',
      '与世界观关联',
    ],
    genrePreferences: ['玄幻', '修仙', '悬疑', '科幻'],
    difficulty: 'medium',
    effectiveness: 86,
  },

  // ============================================================
  // 情感式钩子
  // ============================================================
  {
    type: 'emotional',
    name: '情感式钩子',
    description: '触动读者情感，产生共鸣',
    examples: [
      '她看着他离去的背影，眼泪终于忍不住落了下来...',
      '那一刻，他想起了十年前的那个夜晚...',
      '明明应该恨他的，可为什么心会这么痛？',
    ],
    usageTips: [
      '情感要真挚',
      '引起共鸣',
      '与剧情相关',
      '适度留白',
    ],
    genrePreferences: ['言情', '都市', '历史'],
    difficulty: 'medium',
    effectiveness: 84,
  },

  // ============================================================
  // 动作式钩子
  // ============================================================
  {
    type: 'action',
    name: '动作式钩子',
    description: '以激烈动作为结尾，吸引眼球',
    examples: [
      '刀光剑影之间，胜负只在一招...',
      '引擎轰鸣，赛车冲出起点！',
      '一声巨响，城墙被炸开了一个缺口...',
    ],
    usageTips: [
      '动作要精彩',
      '要有画面感',
      '节奏要快',
      '为后续留下伏笔',
    ],
    genrePreferences: ['玄幻', '武侠', '都市', '科幻'],
    difficulty: 'easy',
    effectiveness: 80,
  },
];

// ============================================================
// 钩子模板
// ============================================================

export const HOOK_TEMPLATES: HookTemplate[] = [
  {
    type: 'cliffhanger',
    templates: [
      '就在他准备{action}的瞬间，{unexpected}发生了...',
      '{situation}，突然传来一阵{strange}...',
      '{time}，{event}，{character}的命运将何去何从？',
      '正当众人以为一切结束的时候，{revelation}...',
      '就在他转身的瞬间，{discovery}...',
    ],
  },
  {
    type: 'question',
    templates: [
      '{character}为什么要{action}？明明{reason}...',
      '这个{secret}，究竟隐藏着什么秘密？',
      '为什么{character}对这件事讳莫如深？',
      '{event}的背后，{mystery}...',
      '{question}，这个问题一直困扰着他。',
    ],
  },
  {
    type: 'revelation',
    templates: [
      '"其实，你不是{identity}。"',
      '直到今天他才知道，{truth}...',
      '原来这一切，都是{fact}。',
      '令他震惊的是，{revelation}。',
      '所有人都不知道的是，{secret}。',
    ],
  },
  {
    type: 'conflict',
    templates: [
      '{groupA}与{groupB}在{location}对峙...',
      '{character1}与{character2}剑拔弩张...',
      '{tension}，一场大战即将爆发。',
      '{authority}宣布{decision}，引发了{faction}的强烈反对。',
      '{character}的{belief}与{fact}产生了激烈冲突。',
    ],
  },
  {
    type: 'tension',
    templates: [
      '{sound}越来越近，他{sound}...',
      '时间在一分一秒地流逝，他{situation}...',
      '他{sense}，仿佛有什么{sign}...',
      '{pressure}，每一秒都像一年...',
      '{time}倒计时开始，{character}...',
    ],
  },
  {
    type: 'choice',
    templates: [
      '是{optionA}还是{optionB}？他陷入了两难...',
      '{duty}与{desire}，他该何去何从？',
      '{risk}，这一票他到底要不要干？',
      '在{family}和{cause}之间，他必须做出选择...',
      '{optionA}还是{optionB}，这是一个艰难的决定。',
    ],
  },
  {
    type: 'mystery',
    templates: [
      '{artifact}上刻着的{symbol}，代表什么意思？',
      '传说中{fabled}，似乎要{event}...',
      '{person}的身份，没有人知道...',
      '{place}隐藏着{secret}，但{condition}...',
      '{mysterious}的{sign}，预示着什么？',
    ],
  },
  {
    type: 'emotional',
    templates: [
      '她看着{object}，{emotion}...',
      '那一刻，他想起了{time}的{memory}...',
      '明明应该{feeling}，可为什么{feeling2}？',
      '{character}的{action}，让他感到{emotion}。',
      '{moment}，他的眼眶湿润了。',
    ],
  },
  {
    type: 'action',
    templates: [
      '{weapon1}与{weapon2}碰撞，发出震耳欲聋的巨响！',
      '{vehicle}冲出{starting_point}，引擎轰鸣！',
      '一声巨响，{structure}被炸开了！',
      '{character}出手了，速度快到{spectator}看不清！',
      '{event}，战斗正式开始！',
    ],
  },
];

// ============================================================
// 题材钩子推荐
// ============================================================

export const GENRE_HOOK_PREFERENCES: Record<string, HookType[]> = {
  '都市': ['conflict', 'cliffhanger', 'revelation', 'emotional'],
  '玄幻': ['cliffhanger', 'mystery', 'conflict', 'action'],
  '修仙': ['cliffhanger', 'mystery', 'breakthrough', 'conflict'],
  '言情': ['emotional', 'choice', 'revelation', 'conflict'],
  '悬疑': ['question', 'mystery', 'tension', 'cliffhanger'],
  '科幻': ['mystery', 'revelation', 'action', 'tension'],
  '武侠': ['conflict', 'action', 'cliffhanger', 'mystery'],
  '历史': ['conflict', 'emotional', 'revelation', 'choice'],
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取指定类型的钩子技法
 */
export function getHookTechnique(type: HookType): HookTechnique | undefined {
  return HOOK_TECHNIQUES.find(h => h.type === type);
}

/**
 * 获取所有钩子技法
 */
export function getAllHookTechniques(): HookTechnique[] {
  return HOOK_TECHNIQUES;
}

/**
 * 根据题材获取推荐钩子
 */
export function getRecommendedHooksForGenre(genre: string): HookType[] {
  const normalizedGenre = normalizeGenre(genre);
  return GENRE_HOOK_PREFERENCES[normalizedGenre] || ['conflict', 'cliffhanger'];
}

/**
 * 根据题材获取推荐钩子技法
 */
export function getHookTechniquesForGenre(genre: string): HookTechnique[] {
  const recommendedTypes = getRecommendedHooksForGenre(genre);
  return HOOK_TECHNIQUES.filter(h => recommendedTypes.includes(h.type));
}

/**
 * 获取高效的钩子技法
 */
export function getHighEffectivenessHooks(minEffectiveness: number = 80): HookTechnique[] {
  return HOOK_TECHNIQUES.filter(h => h.effectiveness >= minEffectiveness);
}

/**
 * 获取简单易用的钩子技法
 */
export function getEasyHooks(): HookTechnique[] {
  return HOOK_TECHNIQUES.filter(h => h.difficulty === 'easy');
}

/**
 * 获取指定题材的模板
 */
export function getHookTemplatesForType(type: HookType): string[] {
  const template = HOOK_TEMPLATES.find(t => t.type === type);
  return template?.templates || [];
}

/**
 * 生成钩子
 */
export function generateHook(type: HookType, variables: Record<string, string>): string {
  const templates = getHookTemplatesForType(type);
  if (templates.length === 0) return '';

  const template = templates[Math.floor(Math.random() * templates.length)];
  
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return result;
}

/**
 * 标准化题材名称
 */
function normalizeGenre(genre: string): string {
  const mapping: Record<string, string> = {
    '都市': '都市',
    'dushi': '都市',
    'urban': '都市',
    '玄幻': '玄幻',
    'xuanhuan': '玄幻',
    'fantasy': '玄幻',
    '修仙': '修仙',
    'xianxia': '修仙',
    '言情': '言情',
    'yanqing': '言情',
    'romance': '言情',
    '悬疑': '悬疑',
    'xuanyi': '悬疑',
    'mystery': '悬疑',
    '科幻': '科幻',
    'kehuan': '科幻',
    'scifi': '科幻',
    '武侠': '武侠',
    'wuxia': '武侠',
    '历史': '历史',
    'lishi': '历史',
    'historical': '历史',
  };

  return mapping[genre.toLowerCase()] || genre;
}

/**
 * 获取钩子类型中文名称
 */
export function getHookTypeName(type: HookType): string {
  const technique = getHookTechnique(type);
  return technique?.name || type;
}

/**
 * 获取钩子类型描述
 */
export function getHookTypeDescription(type: HookType): string {
  const technique = getHookTechnique(type);
  return technique?.description || '';
}
