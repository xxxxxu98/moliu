/**
 * 反套路规则库
 * 基于 oh-story-claudecode-main 的创新设计系统
 * 
 * 反套路用于：
 * - 打破固有模式
 * - 增加故事新意
 * - 避免读者审美疲劳
 */

import type { CoolPointType, HookType } from '@/types/evaluation';

// ============================================================
// 类型定义
// ============================================================

export interface AntiTrope {
  id: string;
  name: string;
  description: string;
  // 原始套路
  originalTrope: string;
  // 反套路设计
  antiDesign: string;
  // 实现方式
  implementation: string[];
  examples: string[];
  genrePreferences: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  effectiveness: number;
}

export interface AntiTropeRule {
  trope: string;
  problem: string;
  solution: string;
  variations: string[];
}

export interface TropeCombination {
  baseTrope: string;
  combinedTrope: string;
  newEffect: string;
  warnings: string[];
}

// ============================================================
// 反套路规则库
// ============================================================

export const ANTI_TROPES: AntiTrope[] = [
  // ============================================================
  // 开篇反套路
  // ============================================================
  {
    id: 'anti废物流',
    name: '反废物流开篇',
    description: '主角不再是资质最低、被所有人看不起的废材',
    originalTrope: '资质检测不合格，被所有人嘲笑，主角隐忍不发',
    antiDesign: '主角资质平庸但有独特优势，或直接是有天赋的天才',
    implementation: [
      '主角一出场就是天才或有独特能力',
      '让天才身份成为负担或秘密',
      '强调主角的智慧而非单纯的武力',
      '让配角先于主角展现能力',
    ],
    examples: [
      '主角是天才炼丹师，但因某种原因无法修炼，被众人误解为废物',
      '主角穿越到一个已经存在天才的世界，直接以天才身份登场',
      '主角的能力是辅助型的，不被传统观念认可',
    ],
    genrePreferences: ['玄幻', '修仙', '武侠'],
    difficulty: 'medium',
    effectiveness: 85,
  },

  {
    id: '反退婚流',
    name: '反退婚流',
    description: '打破经典的"被未婚妻退婚羞辱"套路',
    originalTrope: '未婚妻或家族嫌弃主角退婚，主角发誓报复',
    antiDesign: '退婚是和平分手或双方共赢，或主角主动退婚',
    implementation: [
      '退婚是因为双方理念不同，和平分手',
      '未婚妻反而是主角的贵人或盟友',
      '主角主动退婚追求更好发展',
      '退婚背后有更大的阴谋，但主角早已知晓',
    ],
    examples: [
      '主角与未婚妻是好朋友，因各自发展主动解除婚约',
      '未婚妻是个天才，主动帮助主角成长',
      '主角退婚后，未婚妻家族反而成为他的助力',
    ],
    genrePreferences: ['玄幻', '修仙', '都市'],
    difficulty: 'hard',
    effectiveness: 90,
  },

  {
    id: '反系统流开局',
    name: '反系统流开局',
    description: '系统不再是简单的升级工具',
    originalTrope: '系统发布任务，主角完成任务获得奖励升级',
    antiDesign: '系统有意识、会叛变、或本身就是陷阱',
    implementation: [
      '系统有自己的目的，最终会与主角对立',
      '系统需要主角付出代价才能使用',
      '系统会误导主角',
      '主角发现系统只是一个更大棋局的一部分',
    ],
    examples: [
      '系统突然宣布：宿主已被判定为叛逃者，启动清除程序',
      '每使用一次系统能力，主角就会失去一部分记忆',
      '系统竟然是前代宿主变成的AI',
    ],
    genrePreferences: ['都市', '玄幻', '游戏'],
    difficulty: 'hard',
    effectiveness: 92,
  },

  // ============================================================
  // 角色反套路
  // ============================================================
  {
    id: '反师父套路',
    name: '反师父套路',
    description: '师父不再是全知全能的保护者',
    originalTrope: '师父传授武功、给予宝物、帮助主角解决问题',
    antiDesign: '师父比主角更需要保护，或师父有自己的秘密',
    implementation: [
      '师父是个坑徒弟的混蛋，主角只能靠自己',
      '师父自身难保，需要主角来救',
      '师父有不可告人的秘密',
      '师父是反派卧底',
    ],
    examples: [
      '师父临死前把主角推下悬崖，主角反而获得机缘',
      '师父是个酒鬼加赌徒，从来不靠谱',
      '师父的真实身份是主角的仇人',
    ],
    genrePreferences: ['玄幻', '修仙', '武侠'],
    difficulty: 'medium',
    effectiveness: 88,
  },

  {
    id: '反霸道总裁',
    name: '反霸道总裁',
    description: '打破"有钱有势还专一"的完美总裁形象',
    originalTrope: '总裁英俊多金，对女主专一深情',
    antiDesign: '总裁有缺陷，或感情线更复杂真实',
    implementation: [
      '总裁有心理创伤或阴暗面',
      '总裁是反派或灰色人物',
      '总裁的感情来得快去得也快',
      '女主的价值不依附于总裁',
    ],
    examples: [
      '总裁是个控制狂，女主慢慢发现他的可怕之处',
      '总裁接近女主有其他目的',
      '总裁最终没有选择女主',
    ],
    genrePreferences: ['都市', '言情'],
    difficulty: 'hard',
    effectiveness: 87,
  },

  {
    id: '反青梅竹马',
    name: '反青梅竹马',
    description: '青梅竹马不再是无条件的美好',
    originalTrope: '青梅竹马是温柔善良、一直等待主角的存在',
    antiDesign: '青梅竹马有自己的生活，或成为竞争对手',
    implementation: [
      '青梅竹马早已有了自己的生活和伴侣',
      '青梅竹马变成了反派或情敌',
      '青梅竹马和主角是对立阵营',
      '青梅竹马是个坑货',
    ],
    examples: [
      '青梅竹马早已嫁人，孩子都能打酱油了',
      '青梅竹马成了大反派，誓要置主角于死地',
      '青梅竹马和主角是商业竞争对手',
    ],
    genrePreferences: ['都市', '言情'],
    difficulty: 'medium',
    effectiveness: 82,
  },

  // ============================================================
  // 情节反套路
  // ============================================================
  {
    id: '反悬崖获救',
    name: '反悬崖获救',
    description: '跳崖不再必然获得机缘',
    originalTrope: '主角跳崖必获武功秘籍或高人传承',
    antiDesign: '跳崖真的会死，或获得机缘但有巨大代价',
    implementation: [
      '主角跳崖差点摔死，靠自己爬上来',
      '崖底有机缘，但代价是永远无法离开',
      '崖底有机缘，但主角必须付出最珍贵的东西',
      '崖底什么都没有',
    ],
    examples: [
      '主角跳崖后摔断了腿，靠意志力爬了三天三夜才出去',
      '崖底有个闭关的前辈，但他是被主角师门封印的魔头',
      '崖底有机缘，但代价是主角失去了所有记忆',
    ],
    genrePreferences: ['玄幻', '修仙', '武侠'],
    difficulty: 'hard',
    effectiveness: 91,
  },

  {
    id: '反遗迹探险',
    name: '反遗迹探险',
    description: '遗迹不再是遍地宝藏的宝库',
    originalTrope: '进入遗迹获得宝物、传承、美女',
    antiDesign: '遗迹是陷阱，或者获得的东西需要付出代价',
    implementation: [
      '遗迹是陷阱，进入者必死',
      '遗迹宝物需要用最珍贵的东西交换',
      '遗迹中的一切都是幻象',
      '遗迹主人还活着，等待猎物上门',
    ],
    examples: [
      '主角发现遗迹入口，准备大展身手，结果里面什么都没有了',
      '遗迹中的宝物是用无数人的命换来的',
      '遗迹主人还活着，把主角当成了新的"祭品"',
    ],
    genrePreferences: ['玄幻', '修仙', '都市'],
    difficulty: 'medium',
    effectiveness: 86,
  },

  {
    id: '反英雄救美',
    name: '反英雄救美',
    description: '救美不再让美女以身相许',
    originalTrope: '英雄救美后，美女芳心暗许或以身相许',
    antiDesign: '救美后美女有自己的态度，或根本不领情',
    implementation: [
      '美女比主角更强，不需要被救',
      '美女有自己的目的，利用主角',
      '美女是个坑货',
      '美女根本不喜欢主角',
    ],
    examples: [
      '主角准备英雄救美，结果美女三拳两脚把坏人打跑了',
      '美女是个杀手，利用主角帮她杀人',
      '美女说：你谁啊？我自己能搞定',
    ],
    genrePreferences: ['都市', '玄幻', '言情'],
    difficulty: 'medium',
    effectiveness: 85,
  },

  // ============================================================
  // 结局反套路
  // ============================================================
  {
    id: '反完美结局',
    name: '反完美结局',
    description: '主角不再功成名就、抱得美人归',
    originalTrope: '主角成神成帝，与心爱之人永远在一起',
    antiDesign: '结局留有遗憾，或主角失去一些东西',
    implementation: [
      '主角成功但失去最爱的人',
      '主角选择放弃力量，过平凡生活',
      '主角成功但自己也付出了生命',
      '结局开放，留下悬念',
    ],
    examples: [
      '主角最终成神，但他最爱的人早已不在',
      '主角在最后一刻选择放弃力量',
      '主角战胜了敌人，但他也永远无法离开这个世界',
    ],
    genrePreferences: ['玄幻', '修仙', '都市', '言情'],
    difficulty: 'hard',
    effectiveness: 93,
  },

  {
    id: '反穿越无敌',
    name: '反穿越无敌',
    description: '穿越者的现代知识不再是万能的',
    originalTrope: '穿越者用现代知识降维打击',
    antiDesign: '穿越者水土不服，或现代知识根本不适用',
    implementation: [
      '穿越者发现现代知识在这个世界毫无用处',
      '穿越者的"发明"引发灾难',
      '穿越者被当作异端',
      '穿越者的知识被人剽窃',
    ],
    examples: [
      '主角尝试制作火药，结果把自己炸了',
      '主角的"现代管理理念"被认为是邪术',
      '主角的发明被宗门弟子据为己有',
    ],
    genrePreferences: ['玄幻', '修仙', '历史', '都市'],
    difficulty: 'medium',
    effectiveness: 88,
  },

  {
    id: '反重生复仇',
    name: '反重生复仇',
    description: '重生者不再完美逆袭',
    originalTrope: '重生者带着前世记忆完美避开所有坑',
    antiDesign: '重生者因为知道太多而陷入困境',
    implementation: [
      '重生者的行为引发蝴蝶效应',
      '重生者因知道未来而做出错误判断',
      '重生者的秘密被其他人发现',
      '重生者的记忆本身就是陷阱',
    ],
    examples: [
      '主角避免了这个坑，却触发了更大的危机',
      '主角被前世的老婆（现在是敌人）认出',
      '主角的记忆其实是被人植入的',
    ],
    genrePreferences: ['都市', '玄幻'],
    difficulty: 'hard',
    effectiveness: 89,
  },
];

// ============================================================
// 反套路规则
// ============================================================

export const ANTI_TROPE_RULES: AntiTropeRule[] = [
  {
    trope: '主角光环',
    problem: '主角永远不死，永远能赢',
    solution: '让主角付出代价才能成功，或有明确的弱点',
    variations: [
      '主角每次胜利都会失去一些东西',
      '主角有克星或致命的弱点',
      '主角的成功是建立在其他人的牺牲上',
    ],
  },
  {
    trope: '反派降智',
    problem: '反派明明很强大，却总是输给主角',
    solution: '让反派有自己的逻辑和成功',
    variations: [
      '反派成功过很多次',
      '反派有自己的理想和坚持',
      '反派比主角更有人格魅力',
    ],
  },
  {
    trope: '配角工具人',
    problem: '配角只是为了衬托主角而存在',
    solution: '给配角自己的故事线和成长',
    variations: [
      '配角有自己的主线剧情',
      '配角的决定影响剧情走向',
      '配角有自己的遗憾和追求',
    ],
  },
  {
    trope: '感情线注水',
    problem: '感情戏拖沓，为了虐而虐',
    solution: '让感情戏服务于主线，而不是拖慢节奏',
    variations: [
      '感情戏直接推动主线发展',
      '用细节而非冲突来展现感情',
      '感情戏精简但质量高',
    ],
  },
  {
    trope: '升级太容易',
    problem: '主角升级太快，缺乏张力',
    solution: '拉长升级过程，增加代价',
    variations: [
      '升级需要积累和机缘，不能一蹴而就',
      '每次升级都有副作用',
      '升级后面对更强的对手',
    ],
  },
];

// ============================================================
// 套路组合
// ============================================================

export const TROPE_COMBINATIONS: TropeCombination[] = [
  {
    baseTrope: '退婚流',
    combinedTrope: '系统流',
    newEffect: '退婚对象激活了主角的系统，但系统任务是针对退婚对象的',
    warnings: ['可能显得系统太功利', '需要平衡爽感'],
  },
  {
    baseTrope: '废物流',
    combinedTrope: '重生流',
    newEffect: '主角前世就是天才，重生后不需要再证明自己',
    warnings: ['可能缺乏成长感', '需要设计新的困境'],
  },
  {
    baseTrope: '打脸流',
    combinedTrope: '迪化流',
    newEffect: '主角的普通操作被误解为深不可测',
    warnings: ['可能用力过度', '容易变成纯粹的装逼'],
  },
];

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取反套路
 */
export function getAntiTrope(id: string): AntiTrope | undefined {
  return ANTI_TROPES.find(t => t.id === id);
}

/**
 * 获取所有反套路
 */
export function getAllAntiTropes(): AntiTrope[] {
  return ANTI_TROPES;
}

/**
 * 根据题材获取反套路
 */
export function getAntiTropesByGenre(genre: string): AntiTrope[] {
  return ANTI_TROPES.filter(t => 
    t.genrePreferences.some(g => 
      g.toLowerCase() === genre.toLowerCase()
    )
  );
}

/**
 * 根据难度获取反套路
 */
export function getAntiTropesByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): AntiTrope[] {
  return ANTI_TROPES.filter(t => t.difficulty === difficulty);
}

/**
 * 获取高效反套路
 */
export function getHighEffectivenessAntiTropes(minEffectiveness: number = 85): AntiTrope[] {
  return ANTI_TROPES.filter(t => t.effectiveness >= minEffectiveness);
}

/**
 * 获取反套路建议
 */
export function suggestAntiTropes(genre: string, count: number = 3): AntiTrope[] {
  const byGenre = getAntiTropesByGenre(genre);
  const easy = byGenre.filter(t => t.difficulty === 'easy').slice(0, Math.ceil(count / 2));
  const others = byGenre.filter(t => t.difficulty !== 'easy')
    .sort((a, b) => b.effectiveness - a.effectiveness)
    .slice(0, Math.floor(count / 2));
  
  return [...easy, ...others].slice(0, count);
}

/**
 * 获取套路规则
 */
export function getAntiTropeRules(): AntiTropeRule[] {
  return ANTI_TROPE_RULES;
}

/**
 * 获取套路组合
 */
export function getTropeCombinations(): TropeCombination[] {
  return TROPE_COMBINATIONS;
}

/**
 * 生成反套路设计
 */
export function generateAntiTropeDesign(originalTrope: string): string[] {
  const tropes = ANTI_TROPES.filter(t => 
    t.originalTrope.toLowerCase().includes(originalTrope.toLowerCase())
  );

  if (tropes.length === 0) return [];

  const trope = tropes[0];
  return trope.implementation;
}

/**
 * 评估反套路强度
 */
export function evaluateAntiTropeStrength(antiTrope: AntiTrope): {
  overall: number;
  novelty: number;
  risk: number;
  recommendation: string;
} {
  const novelty = antiTrope.effectiveness;
  const risk = antiTrope.difficulty === 'easy' ? 30 : antiTrope.difficulty === 'medium' ? 50 : 70;
  const overall = Math.round((novelty * 0.6 + (100 - risk) * 0.4));

  let recommendation = '';
  if (antiTrope.difficulty === 'easy') {
    recommendation = '容易实现，推荐新手尝试';
  } else if (antiTrope.difficulty === 'medium') {
    recommendation = '需要一定技巧，建议有经验的作者尝试';
  } else {
    recommendation = '难度较高，需要精心设计，适合进阶作者';
  }

  return { overall, novelty, risk, recommendation };
}
