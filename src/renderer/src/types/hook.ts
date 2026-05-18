/**
 * 钩子类型定义
 * 基于 oh-story-claudecode-main 的钩子技法库
 */

/**
 * 钩子类型
 */
export type HookType = 
  | 'cliffhanger'     // 悬崖式悬念
  | 'question'         // 疑问式钩子
  | 'revelation'      // 揭示式钩子
  | 'conflict'        // 冲突式钩子
  | 'tension'         // 紧张式钩子
  | 'choice'          // 选择式钩子
  | 'mystery'         // 神秘式钩子
  | 'emotional'       // 情感式钩子
  | 'action';         // 动作式钩子

/**
 * 钩子技法
 */
export interface HookTechnique {
  type: HookType;
  name: string;
  description: string;
  examples: string[];
  usageTips: string[];
  genrePreferences: string[];
  effectiveness: 'high' | 'medium' | 'low';
}

/**
 * 钩子实例
 */
export interface HookInstance {
  id: string;
  type: HookType;
  name: string;
  description: string;
  
  // 执行时机
  timing: HookTiming;
  
  // 强度
  strength: number;  // 0-1
  
  // 兑现信息
  payoff?: {
    chapter: number;
    description: string;
  };
  
  // 状态
  status: 'planned' | 'executed' | 'fulfilled' | 'forgotten';
}

/**
 * 钩子时机
 */
export type HookTiming = 
  | 'opening'      // 开篇
  | 'chapter_start' // 章节开头
  | 'chapter_end'   // 章节结尾
  | 'paragraph'    // 段落间
  | 'section_end';  // 段落结束

/**
 * 钩子设计模板
 */
export interface HookTemplate {
  type: HookType;
  name: string;
  template: string;
  variables: string[];
  examples: string[];
}

/**
 * 钩子组合策略
 */
export interface HookStrategy {
  id: string;
  name: string;
  description: string;
  
  // 开篇钩子
  openingHooks: HookType[];
  
  // 章尾钩子
  chapterEndHooks: HookType[];
  
  // 组合方式
  combination: HookCombination[];
  
  // 适用题材
  genres: string[];
}

/**
 * 钩子组合
 */
export interface HookCombination {
  position: number;
  hookType: HookType;
  intensity: number;  // 0-1
  duration?: number;  // 持续章节数
}

// ============================================================
// 钩子技法库
// ============================================================

export const HOOK_TECHNIQUES: HookTechnique[] = [
  // ===== 章尾钩子 =====
  {
    type: 'cliffhanger',
    name: '悬崖式悬念',
    description: '在章节结尾制造紧急情况，让读者不得不继续阅读',
    examples: [
      '主角刚要逃跑，身后传来脚步声',
      '关键道具在最后一刻掉落悬崖',
      '反派笑着说出了主角的秘密',
      '时间只剩最后一秒...',
    ],
    usageTips: [
      '危机必须在下一章尽快解决',
      '不要连续使用太多悬崖式钩子',
      '危机要足够紧急但不能太夸张',
      '每个大危机后要给读者喘息',
    ],
    genrePreferences: ['xianxia', 'urban', 'thriller', 'fantasy'],
    effectiveness: 'high',
  },
  
  {
    type: 'question',
    name: '疑问式钩子',
    description: '提出一个问题，激起读者好奇心',
    examples: [
      '她为什么要隐瞒这个秘密？',
      '这个传说的真相到底是什么？',
      '他为什么会在这个时候出现？',
      '那句遗言究竟是什么意思？',
    ],
    usageTips: [
      '问题要有线索但不能太快揭晓',
      '问题要直击读者好奇心',
      '可以用反问制造更强效果',
      '多问"为什么"和"怎么办"',
    ],
    genrePreferences: ['mystery', 'scifi', 'romance', 'fantasy'],
    effectiveness: 'high',
  },
  
  {
    type: 'revelation',
    name: '揭示式钩子',
    description: '揭示一个惊人信息，吸引读者继续阅读',
    examples: [
      '原来，他才是幕后黑手',
      '这个家族的真相让人震惊',
      '主角的真实身份浮出水面',
      '她的真实目的终于暴露...',
    ],
    usageTips: [
      '揭示要有冲击力',
      '揭示后要引发更多疑问',
      '不要揭示太多核心秘密',
      '揭示可以配合其他钩子',
    ],
    genrePreferences: ['urban', 'romance', 'xianxia', 'fantasy'],
    effectiveness: 'high',
  },
  
  {
    type: 'tension',
    name: '紧张式钩子',
    description: '制造紧张氛围，让读者心跳加速',
    examples: [
      '时间在倒数，炸弹即将爆炸',
      '对手正在一步步逼近',
      '真相就要被揭露',
      '脚步声越来越近...',
    ],
    usageTips: [
      '紧张感要持续',
      '可以用时间压力增强',
      '紧张后要有释放',
      '用细节描写增强真实感',
    ],
    genrePreferences: ['thriller', 'action', 'scifi', 'horror'],
    effectiveness: 'high',
  },
  
  // ===== 章首钩子 =====
  {
    type: 'conflict',
    name: '冲突式钩子',
    description: '开篇即展示矛盾冲突，吸引读者关注',
    examples: [
      '他们剑拔弩张，一场大战在所难免',
      '两种选择摆在面前，他必须立刻决定',
      '家族的秘密被揭开，一场风暴即将来临',
    ],
    usageTips: [
      '冲突要明确',
      '让读者知道利害关系',
      '冲突要与主线相关',
      '可以用对话开篇',
    ],
    genrePreferences: ['xianxia', 'fantasy', 'urban', 'historical'],
    effectiveness: 'high',
  },
  
  {
    type: 'choice',
    name: '选择式钩子',
    description: '让主角面临两难抉择',
    examples: [
      '救女友还是救世界？',
      '说出真相还是保护秘密？',
      '离开还是留下？',
      '金钱还是道义？',
    ],
    usageTips: [
      '选择要两难',
      '选择要体现角色性格',
      '选择的后果要重大',
      '可以让读者代入思考',
    ],
    genrePreferences: ['romance', 'scifi', 'fantasy', 'urban'],
    effectiveness: 'medium',
  },
  
  {
    type: 'mystery',
    name: '神秘式钩子',
    description: '展示一个神秘元素，吸引读者探索',
    examples: [
      '他眼中的符文一闪而过',
      '古书中记载的禁忌之地',
      '那封信的真正含义',
      '壁画上的预言...',
    ],
    usageTips: [
      '神秘要有吸引力',
      '要给出足够的探索动机',
      '神秘最终要揭示',
      '可以用异常现象开头',
    ],
    genrePreferences: ['fantasy', 'scifi', 'mystery', 'xianxia'],
    effectiveness: 'medium',
  },
  
  {
    type: 'emotional',
    name: '情感式钩子',
    description: '触发读者情感，引发共鸣',
    examples: [
      '她看着他的背影，眼泪无声落下',
      '这声呼唤，他等了一千年',
      '那个笑容，让他想起了童年',
      '记忆中的那个约定...',
    ],
    usageTips: [
      '情感要真挚',
      '要触发读者的记忆',
      '情感后要有行动承接',
      '不要过度煽情',
    ],
    genrePreferences: ['romance', 'urban', 'historical', 'fantasy'],
    effectiveness: 'medium',
  },
  
  {
    type: 'action',
    name: '动作式钩子',
    description: '以精彩的动作场景开头或结尾',
    examples: [
      '剑光一闪，决战开始',
      '他的拳头带着毁灭一切的力量',
      '法术的光芒照亮了整个战场',
      '追逐战正式打响...',
    ],
    usageTips: [
      '动作要精彩',
      '要为下一章的战斗做铺垫',
      '动作要有意义',
      '配合紧张氛围效果更好',
    ],
    genrePreferences: ['xianxia', 'fantasy', 'action', 'wuxia'],
    effectiveness: 'medium',
  },
];

/**
 * 钩子设计模板
 */
export const HOOK_TEMPLATES: HookTemplate[] = [
  {
    type: 'cliffhanger',
    name: '危机降临',
    template: '{时间/资源}耗尽，{危机}即将发生，{主角}必须...',
    variables: ['时间/资源', '危机', '主角动作'],
    examples: [
      '倒计时归零，爆炸声响起',
      '最后一发子弹上膛',
      '氧气即将耗尽...',
    ],
  },
  {
    type: 'question',
    name: '真相追问',
    template: '{事件}的真相是{疑问}，{关键人物}却三缄其口...',
    variables: ['事件', '疑问', '关键人物'],
    examples: [
      '她为何深夜独自离开？',
      '这封信是谁寄来的？',
      '父亲隐瞒了什么？',
    ],
  },
  {
    type: 'revelation',
    name: '惊天秘密',
    template: '原来{真相}，这完全出乎{主角/读者}的意料...',
    variables: ['真相', '主角/读者'],
    examples: [
      '原来他一直在欺骗所有人',
      '这个组织远比想象中可怕',
      '她的身份竟然是...',
    ],
  },
  {
    type: 'conflict',
    name: '对峙场景',
    template: '{势力A}与{势力B}对峙，{冲突原因}，大战一触即发...',
    variables: ['势力A', '势力B', '冲突原因'],
    examples: [
      '正邪两道高手对峙',
      '两大家族争夺秘宝',
      '师兄弟反目成仇',
    ],
  },
  {
    type: 'tension',
    name: '步步紧逼',
    template: '{追踪者}越来越近，{逃亡者}必须想办法...',
    variables: ['追踪者', '逃亡者'],
    examples: [
      '杀手已经摸到门口',
      '追兵的脚步声清晰可闻',
      '时间所剩无几...',
    ],
  },
];

/**
 * 题材推荐钩子
 */
export function getRecommendedHooks(genres: string[]): HookType[] {
  const genreSet = new Set(genres.map(g => g.toLowerCase()));
  
  const recommendations: Record<string, HookType[]> = {
    'xianxia': ['cliffhanger', 'conflict', 'revelation', 'action'],
    'fantasy': ['mystery', 'cliffhanger', 'revelation', 'choice'],
    'urban': ['conflict', 'revelation', 'emotional', 'cliffhanger'],
    'romance': ['emotional', 'choice', 'question', 'revelation'],
    'scifi': ['mystery', 'question', 'tension', 'revelation'],
    'thriller': ['tension', 'cliffhanger', 'question', 'conflict'],
    'wuxia': ['conflict', 'action', 'cliffhanger', 'revelation'],
    'historical': ['conflict', 'emotional', 'revelation', 'choice'],
    'mystery': ['question', 'mystery', 'revelation', 'tension'],
  };
  
  const result: HookType[] = [];
  for (const [genre, hooks] of Object.entries(recommendations)) {
    if (genreSet.has(genre)) {
      result.push(...hooks);
    }
  }
  
  // 默认返回通用钩子
  if (result.length === 0) {
    return ['conflict', 'cliffhanger', 'revelation', 'question'];
  }
  
  // 去重
  return [...new Set(result)];
}

/**
 * 获取钩子类型名称
 */
export function getHookTypeName(type: HookType): string {
  const technique = HOOK_TECHNIQUES.find(h => h.type === type);
  return technique?.name || type;
}

/**
 * 获取钩子类型描述
 */
export function getHookTypeDescription(type: HookType): string {
  const technique = HOOK_TECHNIQUES.find(h => h.type === type);
  return technique?.description || '';
}

/**
 * 创建钩子实例
 */
export function createHookInstance(type: HookType, description: string): HookInstance {
  return {
    id: `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    name: getHookTypeName(type),
    description,
    timing: 'chapter_end',
    strength: 0.8,
    status: 'planned',
  };
}
