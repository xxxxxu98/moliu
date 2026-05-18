/**
 * 爽点公式库
 * 基于 oh-story-claudecode-main 的爽点设计系统
 * 
 * 爽点是网文吸引读者的核心元素
 */

import type { CoolPointType } from '@/types/evaluation';

// ============================================================
// 类型定义
// ============================================================

export interface CoolPointFormula {
  type: CoolPointType;
  name: string;
  description: string;
  structure: {
    trigger: string[];      // 触发条件
    buildUp: string[];      // 铺垫过程
    payoff: string[];       // 兑现高潮
  };
  examples: string[];
  tips: string[];
  genrePreferences: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  intensity: 'low' | 'medium' | 'high';
}

export interface CoolPointRhythm {
  type: 'single' | 'combo' | 'cascade';
  description: string;
  interval: number;  // 章节间隔
  examples: string[];
}

export interface CoolPointCombo {
  primary: CoolPointType;
  secondary: CoolPointType[];
  description: string;
  examples: string[];
}

// ============================================================
// 爽点公式库
// ============================================================

export const COOLPOINT_FORMULAS: CoolPointFormula[] = [
  // ============================================================
  // 打脸
  // ============================================================
  {
    type: 'face-slapping',
    name: '打脸爽',
    description: '主角碾压对手，让读者产生优越感',
    structure: {
      trigger: [
        '对手轻视主角',
        '对手嘲讽或威胁',
        '对手做出不利于主角的行为',
      ],
      buildUp: [
        '主角隐忍不发',
        '展示主角的底牌暗示',
        '增加旁观者的紧张感',
      ],
      payoff: [
        '主角展现实力',
        '对手震惊后悔',
        '旁观者惊叹',
        '对手付出代价',
      ],
    },
    examples: [
      '"就凭你？"他冷笑一声。下一秒，他的表情僵住了——主角一掌将他击飞。',
      '所有人都以为他会输，谁知结果一出，所有人都惊呆了...',
      '当初看不起他的人，现在一个个目瞪口呆。',
    ],
    tips: [
      '打脸要有铺垫，不能太突兀',
      '打脸对象要有分量',
      '打脸要有快感，描写要到位',
      '可以连续打脸增强效果',
    ],
    genrePreferences: ['都市', '玄幻', '修仙'],
    difficulty: 'easy',
    intensity: 'high',
  },

  // ============================================================
  // 装逼
  // ============================================================
  {
    type: 'show-off',
    name: '装逼爽',
    description: '主角低调展示实力，让人大吃一惊',
    structure: {
      trigger: [
        '有人挑衅或质疑',
        '有人需要帮助',
        '有展示机会出现',
      ],
      buildUp: [
        '主角不主动暴露',
        '别人继续误解',
        '增加紧张感',
      ],
      payoff: [
        '主角不经意间展露',
        '知情者惊呼',
        '误解者后悔',
      ],
    },
    examples: [
      '"这问题太难了..."话音未落，旁边的人轻声说："很简单啊..."所有人都愣住了。',
      '他随手一挥，那道难题瞬间解开。众人瞪大了眼睛——这...这是传说中的那位？',
      '当所有人都在嘲笑他的选择时，事实狠狠地打了所有人的脸。',
    ],
    tips: [
      '装逼要有反差萌',
      '不要让主角主动炫耀',
      '旁人反应要到位',
      '结束时要有余韵',
    ],
    genrePreferences: ['都市', '玄幻', '修仙'],
    difficulty: 'medium',
    intensity: 'high',
  },

  // ============================================================
  // 身份掉马
  // ============================================================
  {
    type: 'identity-reveal',
    name: '身份掉马',
    description: '隐藏身份被揭示，产生巨大反差',
    structure: {
      trigger: [
        '主角有隐藏身份',
        '有人质疑主角身份',
        '身份即将曝光',
      ],
      buildUp: [
        '身份线索逐步暴露',
        '主角试图掩盖',
        '增加紧张感',
      ],
      payoff: [
        '身份被证实',
        '相关人物震惊',
        '对手恐惧或后悔',
      ],
    },
    examples: [
      '"你说你是谁？"他不屑地问。"我是..."主角亮出了那块令牌，瞬间全场寂静。',
      '当那块令牌出现时，所有人都明白了。这位，竟然是...',
      '所有人都没想到，他们一直看不起的人，竟然是那个传说中的存在！',
    ],
    tips: [
      '身份要有震撼感',
      '铺垫要足够',
      '掉马时机要恰当',
      '后续影响要延续',
    ],
    genrePreferences: ['都市', '言情', '玄幻'],
    difficulty: 'hard',
    intensity: 'very-high',
  },

  // ============================================================
  // 成长
  // ============================================================
  {
    type: 'growth',
    name: '成长爽',
    description: '主角实力或地位提升，满足读者代入感',
    structure: {
      trigger: [
        '主角获得机缘',
        '主角面临考验',
        '有突破契机',
      ],
      buildUp: [
        '付出努力或代价',
        '经历挫折',
        '积累力量',
      ],
      payoff: [
        '成功突破',
        '实力大增',
        '获得认可',
      ],
    },
    examples: [
      '金光一闪，他感觉体内有什么东西破碎了——突破了！',
      '经过数月的苦修，他终于跨入了那个传说中的境界。',
      '从被所有人看不起，到成为万众瞩目的存在，这条路他走了整整三年。',
    ],
    tips: [
      '成长要有代价',
      '突破要有仪式感',
      '配合打脸效果更佳',
      '成长要有目标感',
    ],
    genrePreferences: ['玄幻', '修仙', '都市', '武侠'],
    difficulty: 'medium',
    intensity: 'high',
  },

  // ============================================================
  // 英雄救美
  // ============================================================
  {
    type: 'rescue',
    name: '英雄救美',
    description: '主角关键时刻出现，解救困境中的角色',
    structure: {
      trigger: [
        '美女/重要角色陷入危机',
        '对手得逞在即',
        '时间紧迫',
      ],
      buildUp: [
        '增加紧迫感',
        '渲染危险氛围',
        '让读者担心',
      ],
      payoff: [
        '主角闪亮登场',
        '化解危机',
        '美人/当事人感激',
      ],
    },
    examples: [
      '就在那只手即将落下时，一道身影从天而降..."住手！"',
      '她闭上眼，以为自己完了。下一秒，一阵风声传来..."别怕，我在。"',
      '危急关头，他出现了。所有人都没想到，他竟然有这样的实力！',
    ],
    tips: [
      '危机要足够严重',
      '出场要有气势',
      '解决要干脆利落',
      '后续互动要甜',
    ],
    genrePreferences: ['都市', '玄幻', '言情'],
    difficulty: 'easy',
    intensity: 'high',
  },

  // ============================================================
  // 获得宝物
  // ============================================================
  {
    type: 'treasure',
    name: '得宝爽',
    description: '主角获得珍贵宝物或机缘',
    structure: {
      trigger: [
        '发现宝物线索',
        '进入秘境',
        '有人赠送',
      ],
      buildUp: [
        '经历危险或考验',
        '宝物不易获得',
        '增加宝物价值',
      ],
      payoff: [
        '成功获得',
        '宝物价值超预期',
        '旁人羡慕',
      ],
    },
    examples: [
      '当他打开那个盒子时，一道金光冲天而起...这是传说中的那件宝物？',
      '所有人都没想到，那个被所有人放弃的地方，竟然藏着如此逆天的机缘！',
      '看着手中散发异光的宝物，他知道，这将改变他的一生。',
    ],
    tips: [
      '宝物要有独特性',
      '获得要有难度',
      '宝物要有实用价值',
      '配合成长效果更好',
    ],
    genrePreferences: ['玄幻', '修仙', '武侠'],
    difficulty: 'easy',
    intensity: 'high',
  },

  // ============================================================
  // 突破
  // ============================================================
  {
    type: 'breakthrough',
    name: '突破爽',
    description: '主角境界或实力实现质的飞跃',
    structure: {
      trigger: [
        '积累足够',
        '遇到瓶颈',
        '有机缘出现',
      ],
      buildUp: [
        '详细描写突破过程',
        '增加困难和痛苦',
        '营造紧张感',
      ],
      payoff: [
        '成功突破',
        '实力暴涨',
        '引来惊叹',
      ],
    },
    examples: [
      '轰！体内传来巨响，所有的阻碍在这一刻全部崩碎。他，突破了！',
      '金光万道，天降异象——他终于跨出了那一步！',
      '所有人都感受到了那股暴涨的气息，他竟然在战斗中突破了！',
    ],
    tips: [
      '突破要有仪式感',
      '描写要震撼',
      '配合异象效果更好',
      '突破后要展示实力',
    ],
    genrePreferences: ['玄幻', '修仙', '武侠'],
    difficulty: 'medium',
    intensity: 'very-high',
  },

  // ============================================================
  // 感情进展
  // ============================================================
  {
    type: 'romance',
    name: '撒糖爽',
    description: '感情线甜蜜互动，让读者心花怒放',
    structure: {
      trigger: [
        '暧昧氛围',
        '关键时刻',
        '感情升温期',
      ],
      buildUp: [
        '增加互动',
        '制造心跳时刻',
        '欲擒故纵',
      ],
      payoff: [
        '甜蜜互动',
        '表白或暗示',
        '肢体接触',
      ],
    },
    examples: [
      '他轻轻揽过她的肩，"别怕，有我在。"她的脸瞬间红了。',
      '"我可以牵你的手吗？"他认真地问。',
      '四目相对的瞬间，时间仿佛静止了。他俯下身，在她额头上轻轻落下一吻。',
    ],
    tips: [
      '甜蜜要自然',
      '增加肢体描写',
      '心理活动要到位',
      '保持适度的推拉',
    ],
    genrePreferences: ['言情', '都市'],
    difficulty: 'medium',
    intensity: 'high',
  },

  // ============================================================
  // 复仇
  // ============================================================
  {
    type: 'revenge',
    name: '复仇爽',
    description: '主角报复仇人，满足读者正义感',
    structure: {
      trigger: [
        '主角曾受屈辱',
        '仇人出现',
        '实力已超越',
      ],
      buildUp: [
        '展示主角隐忍',
        '增加仇恨感',
        '铺垫复仇计划',
      ],
      payoff: [
        '开始复仇',
        '仇人恐惧',
        '成功报复',
      ],
    },
    examples: [
      '看着仇人惊恐的眼神，他笑了："当年你对我做的事，今天该还了。"',
      '"怎么可能..."仇人满脸不可置信，当年那个被他踩在脚下的人，如今竟然...',
      '当真相大白，所有人都看清了当年是谁在作恶。而他，终于等到了这一天。',
    ],
    tips: [
      '仇恨要够深',
      '复仇要有计划',
      '仇人反应要到位',
      '复仇方式要解气',
    ],
    genrePreferences: ['都市', '玄幻', '修仙'],
    difficulty: 'hard',
    intensity: 'very-high',
  },

  // ============================================================
  // 真相揭示
  // ============================================================
  {
    type: 'mystery-reveal',
    name: '揭秘爽',
    description: '重大秘密或真相被揭开',
    structure: {
      trigger: [
        '有谜团存在',
        '关键线索发现',
        '真相接近',
      ],
      buildUp: [
        '增加悬念',
        '引导猜测',
        '制造紧张',
      ],
      payoff: [
        '真相大白',
        '震撼全场',
        '剧情反转',
      ],
    },
    examples: [
      '"所有的证据都指向一个人——"他顿了顿，"那就是你。"',
      '当真相揭晓的那一刻，所有人都愣住了。原来，一切都是...',
      '直到今天他才知道，那个他一直信任的人，竟然是...',
    ],
    tips: [
      '揭秘要震撼',
      '铺垫要充分',
      '不要轻易猜到',
      '揭秘后要引发新问题',
    ],
    genrePreferences: ['悬疑', '都市', '玄幻'],
    difficulty: 'hard',
    intensity: 'very-high',
  },

  // ============================================================
  // 搞笑
  // ============================================================
  {
    type: 'comedy',
    name: '搞笑爽',
    description: '幽默情节让读者轻松愉快',
    structure: {
      trigger: [
        '意外发生',
        '角色互动',
        '反差场景',
      ],
      buildUp: [
        '增加误会',
        '制造尴尬',
        '夸张描写',
      ],
      payoff: [
        '笑点爆发',
        '人物反应',
        '神转折',
      ],
    },
    examples: [
      '"这是给你的礼物。"他打开盒子，里面是一...一把扫帚？',
      '他以为自己的表演天衣无缝，殊不知所有人都看穿了他的小九九...',
      '就在他准备潇洒离开时，裤子...裂开了。',
    ],
    tips: [
      '笑点要自然',
      '不要刻意',
      '配合人物性格',
      '适度即可',
    ],
    genrePreferences: ['都市', '玄幻', '言情'],
    difficulty: 'medium',
    intensity: 'medium',
  },

  // ============================================================
  // 正义伸张
  // ============================================================
  {
    type: 'justice',
    name: '正义爽',
    description: '坏人受到惩罚，正义得到伸张',
    structure: {
      trigger: [
        '恶人得逞',
        '好人受冤',
        '需要主持公道',
      ],
      buildUp: [
        '增加愤怒感',
        '铺垫恶人罪行',
        '增加紧迫感',
      ],
      payoff: [
        '主角出手',
        '恶人受惩',
        '公道昭雪',
      ],
    },
    examples: [
      '"你们以为可以逍遥法外？"他冷笑一声，"今天就是你们的末日。"',
      '当证据摆在眼前，那些曾经嚣张的人，终于低下了头。',
      '正义也许会迟到，但永远不会缺席。今天，就是算账的日子。',
    ],
    tips: [
      '恶人要足够可恶',
      '惩罚要合理',
      '正义要有仪式感',
      '配合打脸效果更佳',
    ],
    genrePreferences: ['都市', '玄幻', '武侠'],
    difficulty: 'easy',
    intensity: 'high',
  },
];

// ============================================================
// 爽点节奏
// ============================================================

export const COOLPOINT_RHYTHM: CoolPointRhythm[] = [
  {
    type: 'single',
    description: '单一爽点：每隔一定章节出现一个大爽点',
    interval: 5,
    examples: ['每5章一个大爽点', '每10章一个高潮'],
  },
  {
    type: 'combo',
    description: '组合爽点：多个小爽点组合成大爽点',
    interval: 3,
    examples: ['连续3章打脸', '连续3章升级'],
  },
  {
    type: 'cascade',
    description: '瀑布爽点：小爽点不断，大爽点穿插',
    interval: 2,
    examples: ['每2章一个小爽点，每10章一个大爽点'],
  },
];

// ============================================================
// 爽点组合
// ============================================================

export const COOLPOINT_COMBOS: CoolPointCombo[] = [
  {
    primary: 'face-slapping',
    secondary: ['growth', 'show-off'],
    description: '打脸+成长/装逼：最经典的爽点组合',
    examples: ['升级后打脸', '装逼成功打脸'],
  },
  {
    primary: 'growth',
    secondary: ['treasure', 'breakthrough'],
    description: '成长+得宝/突破：实力提升的标配组合',
    examples: ['获得宝物后突破', '机缘巧合下连续突破'],
  },
  {
    primary: 'romance',
    secondary: ['rescue', 'identity-reveal'],
    description: '感情+救美/掉马：言情文的经典组合',
    examples: ['英雄救美后感情升温', '身份曝光后感情确定'],
  },
  {
    primary: 'mystery-reveal',
    secondary: ['revenge', 'justice'],
    description: '揭秘+复仇/正义：悬疑文的经典组合',
    examples: ['真相揭露后复仇', '揭秘后正义伸张'],
  },
];

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取指定类型的爽点公式
 */
export function getCoolPointFormula(type: CoolPointType): CoolPointFormula | undefined {
  return COOLPOINT_FORMULAS.find(cp => cp.type === type);
}

/**
 * 获取所有爽点公式
 */
export function getAllCoolPointFormulas(): CoolPointFormula[] {
  return COOLPOINT_FORMULAS;
}

/**
 * 根据题材获取推荐爽点
 */
export function getRecommendedCoolPoints(genres: string[]): CoolPointFormula[] {
  const recommended: Map<CoolPointType, number> = new Map();

  for (const genre of genres) {
    for (const formula of COOLPOINT_FORMULAS) {
      if (formula.genrePreferences.some(g => 
        g.toLowerCase() === genre.toLowerCase()
      )) {
        const current = recommended.get(formula.type) || 0;
        recommended.set(formula.type, current + 1);
      }
    }
  }

  return Array.from(recommended.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => getCoolPointFormula(type)!)
    .filter(Boolean);
}

/**
 * 获取高强度爽点
 */
export function getHighIntensityCoolPoints(): CoolPointFormula[] {
  return COOLPOINT_FORMULAS.filter(cp => cp.intensity === 'high' || cp.intensity === 'very-high');
}

/**
 * 获取简单爽点
 */
export function getEasyCoolPoints(): CoolPointFormula[] {
  return COOLPOINT_FORMULAS.filter(cp => cp.difficulty === 'easy');
}

/**
 * 获取爽点类型中文名称
 */
export function getCoolPointName(type: CoolPointType): string {
  const formula = getCoolPointFormula(type);
  return formula?.name || type;
}

/**
 * 获取爽点类型描述
 */
export function getCoolPointDescription(type: CoolPointType): string {
  const formula = getCoolPointFormula(type);
  return formula?.description || '';
}

/**
 * 验证爽点节奏
 */
export function validateCoolPointRhythm(
  coolPoints: CoolPointType[],
  rhythm: 'single' | 'combo' | 'cascade'
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (coolPoints.length === 0) {
    warnings.push('没有安排爽点');
    return { valid: false, warnings };
  }

  // 检查爽点密度
  if (coolPoints.length < 3) {
    warnings.push('爽点数量较少，建议增加');
  }

  // 检查爽点多样性
  const uniqueTypes = new Set(coolPoints);
  if (uniqueTypes.size === 1) {
    warnings.push('爽点类型单一，建议增加多样性');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * 生成爽点序列
 */
export function generateCoolPointSequence(
  chapterCount: number,
  rhythmType: 'single' | 'combo' | 'cascade',
  coolPointTypes: CoolPointType[]
): number[] {
  const sequence: number[] = [];
  
  if (coolPointTypes.length === 0) return sequence;

  const rhythm = COOLPOINT_RHYTHM.find(r => r.type === rhythmType);
  const interval = rhythm?.interval || 5;

  let currentChapter = 1;
  let typeIndex = 0;

  while (currentChapter <= chapterCount) {
    sequence.push(currentChapter);

    if (rhythmType === 'combo') {
      // 连续2-3章
      const comboLength = 2 + Math.floor(Math.random() * 2);
      for (let i = 1; i < comboLength && currentChapter + i <= chapterCount; i++) {
        sequence.push(currentChapter + i);
      }
      currentChapter += comboLength + interval;
    } else if (rhythmType === 'cascade') {
      // 小爽点穿插
      if (Math.random() > 0.5 && currentChapter + 1 <= chapterCount) {
        sequence.push(currentChapter + 1);
      }
      currentChapter += interval;
    } else {
      currentChapter += interval;
    }

    typeIndex = (typeIndex + 1) % coolPointTypes.length;
  }

  return [...new Set(sequence)].sort((a, b) => a - b);
}
