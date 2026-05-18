/**
 * 冲突模板库
 * 基于 webnovel-writer-master 的冲突设计系统
 * 
 * 冲突是故事的核心动力
 */

import type { CoolPointType } from '@/types/evaluation';

// ============================================================
// 类型定义
// ============================================================

export interface ConflictTemplate {
  id: string;
  name: string;
  description: string;
  type: ConflictType;
  structure: {
    setup: string[];      // 冲突设置
    escalation: string[]; // 升级过程
    climax: string[];      // 高潮
    resolution: string[];  // 解决
  };
  examples: string[];
  tropes: string[];
  genrePreferences: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  effectiveness: number;
}

export type ConflictType = 
  | 'character_vs_character'  // 人物vs人物
  | 'character_vs_self'      // 人物vs自我
  | 'character_vs_nature'    // 人物vs自然
  | 'character_vs_society'   // 人物vs社会
  | 'character_vs_fate';     // 人物vs命运

export interface ConflictArc {
  startChapter: number;
  endChapter: number;
  type: ConflictType;
  participants: string[];
  intensity: number; // 1-10
  resolved: boolean;
}

// ============================================================
// 冲突模板库
// ============================================================

export const CONFLICT_TEMPLATES: ConflictTemplate[] = [
  // ============================================================
  // 人物vs人物
  // ============================================================
  {
    id: '门派争斗',
    name: '门派争斗',
    description: '不同势力之间的资源争夺和恩怨情仇',
    type: 'character_vs_character',
    structure: {
      setup: [
        '两派势力有历史恩怨',
        '争夺某项资源（宝物、秘籍、地盘）',
        '年轻一代的较量',
      ],
      escalation: [
        '小规模冲突',
        '核心人物介入',
        '背后势力博弈',
        '局势升级',
      ],
      climax: [
        '大规模对决',
        '生死较量',
        '意外转折',
      ],
      resolution: [
        '一方胜利',
        '两败俱伤',
        '和解共赢',
        '第三方介入',
      ],
    },
    examples: [
      '两派争夺一把神兵利器，引发江湖动荡',
      '新生代弟子比武，背后是老一辈的恩怨',
      '门派大比上，主角力压群雄',
    ],
    tropes: ['升级流', '装逼流', '打脸流'],
    genrePreferences: ['玄幻', '修仙', '武侠'],
    difficulty: 'easy',
    effectiveness: 85,
  },

  {
    id: '商业竞争',
    name: '商业竞争',
    description: '商业领域的正当竞争和暗中较量',
    type: 'character_vs_character',
    structure: {
      setup: [
        '竞争对手出现',
        '商业目标冲突',
        '资源争夺',
      ],
      escalation: [
        '价格战',
        '商业狙击',
        '人才争夺',
        '舆论战',
      ],
      climax: [
        '关键商业决战',
        '商业阴谋曝光',
        '背水一战',
      ],
      resolution: [
        '一方吞并另一方',
        '达成合作',
        '双方转型竞争',
      ],
    },
    examples: [
      '主角公司遭遇行业巨头打压',
      '商业并购案中的明争暗斗',
      '核心技术争夺战',
    ],
    tropes: ['逆袭流', '打脸流'],
    genrePreferences: ['都市'],
    difficulty: 'medium',
    effectiveness: 82,
  },

  {
    id: '情敌对决',
    name: '情敌对决',
    description: '围绕感情的三角或多角冲突',
    type: 'character_vs_character',
    structure: {
      setup: [
        '多人喜欢同一人',
        '误会产生',
        '情感纠葛',
      ],
      escalation: [
        '暗中较劲',
        '公开冲突',
        '感情危机',
        '误会加深',
      ],
      climax: [
        '情感表白',
        '摊牌对峙',
        '艰难抉择',
      ],
      resolution: [
        '一方胜出',
        '三角关系持续',
        '意外反转',
        '开放式结局',
      ],
    },
    examples: [
      '两个男人同时追求女主',
      '女主发现追求者之间的关系',
      '三角恋的情感纠葛',
    ],
    tropes: ['言情流', '误会流'],
    genrePreferences: ['都市', '言情'],
    difficulty: 'easy',
    effectiveness: 80,
  },

  // ============================================================
  // 人物vs自我
  // ============================================================
  {
    id: '内心挣扎',
    name: '内心挣扎',
    description: '角色内心的矛盾和挣扎',
    type: 'character_vs_self',
    structure: {
      setup: [
        '面临艰难抉择',
        '内心有阴暗面',
        '过去阴影浮现',
      ],
      escalation: [
        '内心冲突加剧',
        '做出痛苦选择',
        '自我怀疑',
      ],
      climax: [
        '必须做出决定',
        '直面内心恐惧',
        '自我突破',
      ],
      resolution: [
        '克服心魔',
        '接受不完美自己',
        '做出牺牲',
        '继续挣扎',
      ],
    },
    examples: [
      '主角面临是否要杀死昔日好友的抉择',
      '主角发现自己身世的真相',
      '面对力量的诱惑，主角如何选择',
    ],
    tropes: ['成长流', '救赎流'],
    genrePreferences: ['玄幻', '都市', '言情'],
    difficulty: 'hard',
    effectiveness: 88,
  },

  {
    id: '道德困境',
    name: '道德困境',
    description: '正义与利益的抉择',
    type: 'character_vs_self',
    structure: {
      setup: [
        '发现不公之事',
        '个人利益受损',
        '面临举报风险',
      ],
      escalation: [
        '试图改变',
        '遭遇更大阻力',
        '个人代价增加',
      ],
      climax: [
        '必须做出牺牲',
        '是否坚守底线',
        '公开对峙',
      ],
      resolution: [
        '坚持正义',
        '妥协求存',
        '曲线救国',
      ],
    },
    examples: [
      '主角发现公司违法行为',
      '面对强权欺凌是否出手',
      '为救一人可能牺牲更多人',
    ],
    tropes: ['正义流', '抉择流'],
    genrePreferences: ['都市', '玄幻'],
    difficulty: 'hard',
    effectiveness: 86,
  },

  // ============================================================
  // 人物vs自然
  // ============================================================
  {
    id: '绝地求生',
    name: '绝地求生',
    description: '在极端环境或危机中求生存',
    type: 'character_vs_nature',
    structure: {
      setup: [
        '陷入险境',
        '资源匮乏',
        '威胁存在',
      ],
      escalation: [
        '环境恶化',
        '威胁逼近',
        '资源耗尽',
      ],
      climax: [
        '生死一线',
        '极限突破',
        '意外转机',
      ],
      resolution: [
        '成功脱困',
        '与环境共存',
        '发现新大陆',
      ],
    },
    examples: [
      '流落荒岛求生',
      '末世丧尸围城',
      '秘境探险被困',
    ],
    tropes: ['生存流', '成长流'],
    genrePreferences: ['末世', '玄幻', '都市'],
    difficulty: 'medium',
    effectiveness: 84,
  },

  {
    id: '秘境探险',
    name: '秘境探险',
    description: '探索未知区域的冒险',
    type: 'character_vs_nature',
    structure: {
      setup: [
        '发现秘境入口',
        '进入探索',
        '规则未知',
      ],
      escalation: [
        '遭遇危险',
        '队友受伤',
        '方向迷失',
        '机关重重',
      ],
      climax: [
        '发现宝藏',
        '遭遇守护兽',
        '最终抉择',
      ],
      resolution: [
        '获得机缘',
        '安全退出',
        '发现更大秘密',
      ],
    },
    examples: [
      '进入上古遗迹',
      '探索神秘海域',
      '踏入禁忌之地',
    ],
    tropes: ['得宝流', '成长流'],
    genrePreferences: ['玄幻', '修仙', '都市'],
    difficulty: 'medium',
    effectiveness: 87,
  },

  // ============================================================
  // 人物vs社会
  // ============================================================
  {
    id: '阶层对立',
    name: '阶层对立',
    description: '不同阶层之间的冲突',
    type: 'character_vs_society',
    structure: {
      setup: [
        '出身底层',
        '遭遇不公',
        '有翻身机会',
      ],
      escalation: [
        '向上攀爬',
        '得罪权贵',
        '被压迫',
        '积蓄力量',
      ],
      climax: [
        '公开对峙',
        '以弱胜强',
        '规则挑战',
      ],
      resolution: [
        '打破阶层',
        '建立新秩序',
        '和解共存',
      ],
    },
    examples: [
      '穷小子逆袭豪门',
      '小人物挑战大势力',
      '草根崛起之路',
    ],
    tropes: ['逆袭流', '打脸流'],
    genrePreferences: ['都市'],
    difficulty: 'easy',
    effectiveness: 83,
  },

  {
    id: '体制抗争',
    name: '体制抗争',
    description: '对抗不公体制的斗争',
    type: 'character_vs_society',
    structure: {
      setup: [
        '体制有问题',
        '主角受害',
        '有改变的意愿',
      ],
      escalation: [
        '公开挑战',
        '遭受打压',
        '获得支持',
        '势力壮大',
      ],
      climax: [
        '全面对抗',
        '关键决战',
        '揭露真相',
      ],
      resolution: [
        '改革成功',
        '推翻旧体制',
        '妥协改良',
      ],
    },
    examples: [
      '揭露黑幕',
      '对抗恶势力',
      '改变行业规则',
    ],
    tropes: ['正义流', '热血流'],
    genrePreferences: ['都市'],
    difficulty: 'hard',
    effectiveness: 90,
  },

  // ============================================================
  // 人物vs命运
  // ============================================================
  {
    id: '宿命对决',
    name: '宿命对决',
    description: '与命运或天道的抗争',
    type: 'character_vs_fate',
    structure: {
      setup: [
        '命运不公',
        '被预言支配',
        '有抗争者出现',
      ],
      escalation: [
        '尝试改变',
        '遭遇更大阻力',
        '不断失败',
        '信念动摇',
      ],
      climax: [
        '最终抉择',
        '挑战命运',
        '自我超越',
      ],
      resolution: [
        '战胜命运',
        '与命运和解',
        '以死亡超越',
        '命运被改写',
      ],
    },
    examples: [
      '被预言注定要毁灭世界',
      '与天道对弈',
      '打破血脉诅咒',
    ],
    tropes: ['逆天流', '热血流'],
    genrePreferences: ['玄幻', '修仙'],
    difficulty: 'hard',
    effectiveness: 92,
  },

  {
    id: '轮回循环',
    name: '轮回循环',
    description: '陷入时间或命运的循环',
    type: 'character_vs_fate',
    structure: {
      setup: [
        '发现时间循环',
        '重复同一段时间',
        '有逃脱的契机',
      ],
      escalation: [
        '尝试逃脱',
        '每次循环不同',
        '发现循环规律',
        '接近真相',
      ],
      climax: [
        '找到关键',
        '直面真相',
        '最后抉择',
      ],
      resolution: [
        '跳出循环',
        '接受命运',
        '永远困在循环',
      ],
    },
    examples: [
      '陷入同一天不断重复',
      '每千年发生一次灾难',
      '前世记忆觉醒',
    ],
    tropes: ['悬疑流', '命运流'],
    genrePreferences: ['玄幻', '都市', '悬疑'],
    difficulty: 'hard',
    effectiveness: 89,
  },
];

// ============================================================
// 冲突强度曲线
// ============================================================

export interface ConflictIntensityCurve {
  type: 'linear' | 'escalating' | 'wave' | 'v-shape' | 'mountain';
  description: string;
  chapters: [number, number, number, number]; // [平缓期, 上升期, 高潮期, 下降期]
}

export const CONFLICT_CURVES: ConflictIntensityCurve[] = [
  {
    type: 'linear',
    description: '冲突强度线性增长',
    chapters: [20, 30, 40, 10],
  },
  {
    type: 'escalating',
    description: '冲突持续升级，后期达到顶峰',
    chapters: [15, 25, 55, 5],
  },
  {
    type: 'wave',
    description: '多个小高潮，最后一个最大',
    chapters: [20, 20, 20, 20],
  },
  {
    type: 'v-shape',
    description: '先难后易或先易后难',
    chapters: [40, 20, 20, 20],
  },
  {
    type: 'mountain',
    description: '逐步上升直到高潮',
    chapters: [25, 35, 35, 5],
  },
];

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取冲突模板
 */
export function getConflictTemplate(id: string): ConflictTemplate | undefined {
  return CONFLICT_TEMPLATES.find(c => c.id === id);
}

/**
 * 获取所有冲突模板
 */
export function getAllConflictTemplates(): ConflictTemplate[] {
  return CONFLICT_TEMPLATES;
}

/**
 * 获取指定类型的冲突模板
 */
export function getConflictTemplatesByType(type: ConflictType): ConflictTemplate[] {
  return CONFLICT_TEMPLATES.filter(c => c.type === type);
}

/**
 * 根据题材获取冲突模板
 */
export function getConflictTemplatesByGenre(genre: string): ConflictTemplate[] {
  return CONFLICT_TEMPLATES.filter(c =>
    c.genrePreferences.some(g => g.toLowerCase() === genre.toLowerCase())
  );
}

/**
 * 根据难度获取冲突模板
 */
export function getConflictTemplatesByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): ConflictTemplate[] {
  return CONFLICT_TEMPLATES.filter(c => c.difficulty === difficulty);
}

/**
 * 获取高效冲突模板
 */
export function getHighEffectivenessConflicts(minEffectiveness: number = 85): ConflictTemplate[] {
  return CONFLICT_TEMPLATES.filter(c => c.effectiveness >= minEffectiveness);
}

/**
 * 获取冲突类型名称
 */
export function getConflictTypeName(type: ConflictType): string {
  const names: Record<ConflictType, string> = {
    'character_vs_character': '人物vs人物',
    'character_vs_self': '人物vs自我',
    'character_vs_nature': '人物vs自然',
    'character_vs_society': '人物vs社会',
    'character_vs_fate': '人物vs命运',
  };
  return names[type];
}

/**
 * 推荐冲突模板
 */
export function recommendConflictTemplates(
  genre: string,
  count: number = 3
): ConflictTemplate[] {
  const byGenre = getConflictTemplatesByGenre(genre);
  
  // 按有效性和难度排序
  return byGenre
    .sort((a, b) => {
      // 优先选择easy难度的
      if (a.difficulty === 'easy' && b.difficulty !== 'easy') return -1;
      if (b.difficulty === 'easy' && a.difficulty !== 'easy') return 1;
      // 然后按有效性
      return b.effectiveness - a.effectiveness;
    })
    .slice(0, count);
}

/**
 * 生成冲突弧
 */
export function generateConflictArc(
  template: ConflictTemplate,
  startChapter: number,
  endChapter: number,
  participants: string[]
): ConflictArc {
  return {
    startChapter,
    endChapter,
    type: template.type,
    participants,
    intensity: 5,
    resolved: false,
  };
}

/**
 * 计算冲突强度
 */
export function calculateConflictIntensity(
  arc: ConflictArc,
  currentChapter: number
): number {
  const { startChapter, endChapter, intensity } = arc;
  const totalChapters = endChapter - startChapter + 1;
  const progress = (currentChapter - startChapter) / totalChapters;

  if (progress <= 0) return 1;
  if (progress >= 1) return 0;

  // 使用正态分布曲线
  const normalized = (progress - 0.5) * 4; // -2 到 2
  const curve = Math.exp(-normalized * normalized / 2);
  
  return Math.round(curve * intensity);
}

/**
 * 获取冲突曲线
 */
export function getConflictCurve(type: ConflictIntensityCurve['type']): ConflictIntensityCurve | undefined {
  return CONFLICT_CURVES.find(c => c.type === type);
}

/**
 * 生成冲突序列
 */
export function generateConflictSequence(
  arcs: ConflictArc[],
  chapterCount: number
): { chapter: number; intensity: number; arcId: string }[] {
  const sequence: { chapter: number; intensity: number; arcId: string }[] = [];

  for (let ch = 1; ch <= chapterCount; ch++) {
    let maxIntensity = 0;
    let activeArcId = '';

    for (const arc of arcs) {
      if (ch >= arc.startChapter && ch <= arc.endChapter) {
        const intensity = calculateConflictIntensity(arc, ch);
        if (intensity > maxIntensity) {
          maxIntensity = intensity;
          activeArcId = `${arc.type}-${arc.startChapter}`;
        }
      }
    }

    if (maxIntensity > 0) {
      sequence.push({
        chapter: ch,
        intensity: maxIntensity,
        arcId: activeArcId,
      });
    }
  }

  return sequence;
}
