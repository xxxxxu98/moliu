/**
 * 五步大纲法
 * 基于 story-long-write 技能库的完整大纲方法论
 * 整合 oh-story-claudecode 和 webnovel-writer 的核心方法论
 */

/**
 * 八条故事线定义
 * 用于规划故事的多维度发展
 */
export interface StoryLine {
  id: string;
  name: string;
  description: string;
  keyPoints: string[];
  burialTiming: string;
}

export const EIGHT_STORY_LINES: StoryLine[] = [
  {
    id: 'map',
    name: '地图线',
    description: '层级地点的递进发展',
    keyPoints: ['城市 → 地标 → 室内', '新地图解锁时机'],
    burialTiming: '每30-50章换地图'
  },
  {
    id: 'faction',
    name: '阵营线',
    description: '势力与地图匹配发展',
    keyPoints: ['势力冲突爆发点', '阵营关系变化'],
    burialTiming: '每20-30章升级阵营'
  },
  {
    id: 'character',
    name: '人物线',
    description: '角色按类型分组登场',
    keyPoints: ['新角色登场时机', '角色关系变化'],
    burialTiming: '关键节点引入关键角色'
  },
  {
    id: 'goldenfinger',
    name: '金手指线',
    description: '主角获得的物品/技能',
    keyPoints: ['能力升级节点', '金手指展示时机'],
    burialTiming: '每10-20章有新收获'
  },
  {
    id: 'worldRules',
    name: '世界观线',
    description: '世界设定规则揭示',
    keyPoints: ['设定揭示时机', '世界观扩展'],
    burialTiming: '前10章基础，后续逐步揭示'
  },
  {
    id: 'conflict',
    name: '矛盾线',
    description: '冲突放入矛盾网络',
    keyPoints: ['矛盾升级链', '冲突递进'],
    burialTiming: '每10章至少一个冲突'
  },
  {
    id: 'collection',
    name: '收集线',
    description: '材料/线索收集进度',
    keyPoints: ['渐进式收集层级', '收集进度展示'],
    burialTiming: '每20章有收集进展'
  },
  {
    id: 'romance',
    name: '感情线',
    description: '感情关系进展',
    keyPoints: ['亲密度升级节点', '感情冲突设计'],
    burialTiming: '每15-20章感情升温'
  }
];

/**
 * 矛盾四重递进
 * 从底层到顶层构建冲突
 */
export const CONFLICT_ESCALATION = [
  {
    level: 1,
    name: '人与自我',
    description: '内心挣扎、自我怀疑、成长突破',
    examples: ['克服恐惧', '战胜心魔', '突破极限']
  },
  {
    level: 2,
    name: '人与自然',
    description: '环境挑战、自然灾害、生存危机',
    examples: ['秘境探险', '天灾降临', '野兽袭击']
  },
  {
    level: 3,
    name: '人与人',
    description: '人际冲突、竞争对抗、恩怨情仇',
    examples: ['打脸碾压', '正邪对抗', '师门恩怨']
  },
  {
    level: 4,
    name: '人与世界',
    description: '终极对抗、命运抉择、改变世界',
    examples: ['终极之战', '拯救世界', '改变命运']
  }
];

/**
 * 冲突来源分类
 */
export const CONFLICT_SOURCES = [
  {
    type: '资源/利益',
    description: '最直观，最容易适配各类场景，方便读者接受',
    applicableScenarios: ['通用场景', '升级流', '商战']
  },
  {
    type: '阵营/种族',
    description: '天使与恶魔、人类与兽人，见面就打，从根源不可调和',
    applicableScenarios: ['奇幻', '玄幻', '西幻']
  },
  {
    type: '超凡途径',
    description: '选择不同途径等于选择盟友和敌人，底层模糊但越高层越不可调和',
    applicableScenarios: ['诡秘类', '魔法流']
  },
  {
    type: '信仰/宗教',
    description: '不同信仰之间的根本对立',
    applicableScenarios: ['西幻', '历史', '权谋']
  },
  {
    type: '派系之争',
    description: '同一信仰内部的分裂，"异端比异教徒更可恶"',
    applicableScenarios: ['武侠', '仙侠', '宫廷']
  },
  {
    type: '理念/三观',
    description: '不同人对同一事物的价值判断不同，产生冲突',
    applicableScenarios: ['所有题材']
  }
];

/**
 * 单元剧设计原则
 * 定义爽点循环的核心单元
 */
export interface UnitEpisode {
  name: string;
  description: string;
  keyElements: string[];
}

export const UNIT_EPISODE_PRINCIPLES: UnitEpisode[] = [
  {
    name: '金手指展示',
    description: '每个单元剧都要展示金手指的不同用法',
    keyElements: ['金手指初次使用', '金手指升级', '金手指新功能']
  },
  {
    name: '逻辑串联',
    description: '单元剧之间要有因果关系，不能纯平行',
    keyElements: ['前因后果', '递进关系', '伏笔呼应']
  },
  {
    name: '差异化设计',
    description: '相邻单元剧不能使用相同的金手指逻辑',
    keyElements: ['不同场景', '不同对手', '不同收获']
  }
];

/**
 * 爽点节奏公式
 */
export const COOL_POINT_FORMULAS = {
  microPerChapter: '每章至少1个微爽点',
  conflictPerThreeChapters: '每3章解决1个冲突',
  climaxPerSevenChapters: '每7章1个大爽点',
  emotionalPull: '斗地主法：主角稍占上风 → 每次小角力胜利 → 最后大胜利',
  bage: '歇斯底里解决 → 不爽；风轻云淡一指灭杀 → 爽'
};

/**
 * 高潮设计原则
 */
export const CLIMAX_DESIGN = {
  corePrinciples: [
    '高潮有绝对优先级：最大冲突规模、最多出场人物、最强情绪波动',
    '高潮是读者情绪的顶点，必须集中、激烈、不可预测',
    '高潮前的铺垫决定高潮的震撼程度'
  ],
  types: [
    { name: '战斗高潮', description: '核心对决达到顶点',适用: '升级流/玄幻' },
    { name: '情感高潮', description: '角色情感达到最强点',适用: '言情/虐文' },
    { name: '真相高潮', description: '重大剧情转折揭示',适用: '悬疑/推理' },
    { name: '抉择高潮', description: '主角做出关键选择',适用: '所有题材' }
  ],
  verification: [
    '这个场景是否是本卷最大的冲突？',
    '出场人物是否最多？',
    '是否与阶段目标高度一致？',
    '读者情绪波动是否最大？'
  ]
};

/**
 * 开篇设计模板
 */
export const OPENING_TEMPLATE = {
  coreFormula: '情节钩子 → 迅速陷入异常状态 → 获得/介绍金手指 → 矛盾/欲望出现 → 目标建立',
  mustBuriedExpectations: [
    '新目标/冲突升级的方向',
    '未来实力升级和新技能的暗示',
    '未来资源升级的暗示',
    '未来感情线升级的暗示',
    '未来人际网络扩展的暗示',
    '混乱程度升级的暗示',
    '新线索/新设定的暗示'
  ],
  verification: [
    '前500字是否有钩子？',
    '是否从天气/风景开始？（避免）',
    '主角是否尽快出场？',
    '核心冲突是否露出？',
    '至少一个悬念是否埋下？'
  ]
};

/**
 * 收尾设计原则
 */
export const ENDING_TEMPLATE = {
  functions: [
    '解决主线/副线高潮，展示后续影响',
    '主角获得足够奖励 + 额外奖励（用于下一阶段）',
    '给本卷角色合适的结局',
    '节奏放缓',
    '为下一卷内容做铺垫'
  ],
  hooks: [
    '章尾钩子13式',
    '悬念留白',
    '情感余韵',
    '期待感延续'
  ]
};

/**
 * 五步大纲法步骤
 */
export interface OutlineStep {
  id: number;
  name: string;
  icon: string;
  description: string;
  questions: string[];
  tips: string[];
  examples: string[];
  // 新增：深度提示
  deepQuestions?: string[];
  keyMetrics?: string[];
  commonMistakes?: string[];
}

/**
 * 五步大纲法完整流程
 */
export const fiveStepOutline: OutlineStep[] = [
  {
    id: 1,
    name: '确定情绪目标',
    icon: '🎯',
    description: '明确你想让读者感受到的核心情绪，这是故事的灵魂',
    questions: [
      '你想让读者在阅读时感受到什么情绪？',
      '是热血沸腾？甜蜜心动？还是紧张刺激？',
      '主要的情绪弧线是什么？从低到高还是波动起伏？',
    ],
    tips: [
      '情绪目标决定故事基调，要贯穿全文',
      '建议选择1-2个核心情绪，避免贪多',
      '每个高潮场景都要服务于核心情绪',
    ],
    examples: [
      '热血文：让读者感受到主角逆袭的快感',
      '甜宠文：让读者姨母笑、心动',
      '虐文：让读者心疼角色、想哭',
    ],
    // 深度提示
    deepQuestions: [
      '主角的核心欲望是什么？读者为什么会在乎？',
      '情绪高潮在哪？情绪低谷在哪？',
      '读者阅读时的"爽点"是什么？',
      '读者的"爽点"是即时兑现还是延迟满足？'
    ],
    keyMetrics: [
      '情绪密度：每3000字至少一个情绪波动',
      '情绪一致性：所有场景是否服务于核心情绪',
      '情绪递进：情绪强度是否逐层递增'
    ],
    commonMistakes: [
      '情绪目标太多，无法聚焦',
      '情绪与剧情脱节',
      '情绪波动太大，读者疲劳',
      '情绪高潮后断崖式下降'
    ]
  },
  {
    id: 2,
    name: '设计核心设定',
    icon: '⚙️',
    description: '构建故事的基础世界观和规则体系',
    questions: [
      '故事发生在什么世界？现代都市/古代/异世界/未来？',
      '这个世界的核心规则是什么？修炼体系/魔法系统/科技水平？',
      '有哪些独特的设定让这个世界与众不同？',
    ],
    tips: [
      '设定要服务于剧情，不要为了炫技而设定',
      '前3章用到的设定要清晰，后面可以逐步展开',
      '一个世界最好只有1-2个核心规则体系',
    ],
    examples: [
      '都市修仙：灵气复苏的现代都市',
      '系统流：游戏化规则的异世界',
      '星际：高科技但阶层固化的宇宙文明',
    ],
    // 深度提示
    deepQuestions: [
      '世界的核心矛盾是什么？（资源稀缺/阶层固化/外敌入侵）',
      '主角在这个世界中处于什么位置？',
      '金手指是什么？如何与世界观融合？',
      '世界的升级体系如何？有哪些境界/等级？'
    ],
    keyMetrics: [
      '设定复杂度：核心规则不超过2个',
      '设定可读性：前3章设定是否清晰易懂',
      '设定深度：设定是否有足够的延展空间'
    ],
    commonMistakes: [
      '设定太多，读者记不住',
      '设定与剧情脱节',
      '设定太复杂，自己写着写着矛盾',
      '设定没有服务于核心情绪'
    ]
  },
  {
    id: 3,
    name: '设计主角设定',
    icon: '👤',
    description: '塑造有魅力、能让读者代入的主角',
    questions: [
      '主角的核心性格特点是什么？',
      '主角最大的优势和短板是什么？',
      '主角的成长弧线：从弱小到强大还是从迷茫到坚定？',
      '主角的动机和目标是什么？',
    ],
    tips: [
      '主角要有明显的优点和缺点，太完美不真实',
      '主角的困境要具体，让读者有代入感',
      '主角的性格要能在压力下展现变化',
    ],
    examples: [
      '废物流：资质差但坚韧不拔',
      '天才流：实力强但背负使命',
      '普通人流：和你我一样面临现实压力',
    ],
    // 深度提示
    deepQuestions: [
      '主角的"标签"是什么？让读者一想到这个词就想到主角',
      '主角的性格在压力下如何变化？',
      '主角与他人的关系如何推动剧情？',
      '主角的"缺陷"是什么？如何成为故事的动力？'
    ],
    keyMetrics: [
      '代入感：读者能否在主角身上看到自己',
      '成长性：主角是否有明显的成长弧线',
      '独特性：主角是否有独特的标签让读者记住'
    ],
    commonMistakes: [
      '主角太完美，没有缺点',
      '主角太弱，读者没有代入感',
      '主角性格前后矛盾',
      '主角动机不明确'
    ]
  },
  {
    id: 4,
    name: '设计故事结构',
    icon: '🏗️',
    description: '规划故事的整体框架和关键节点',
    questions: [
      '开头如何吸引读者？用什么钩子？',
      '主角面临的主要矛盾是什么？',
      '有哪些关键转折点？',
      '高潮场景是什么？主角如何解决问题？',
      '结局是圆满还是开放式？',
    ],
    tips: [
      '开篇前3000字决定读者去留',
      '每个大情节要有起伏，不能平铺直叙',
      '高潮要足够震撼，解决要合理',
    ],
    examples: [
      '三幕式：起因→经过→结果',
      '升级流：打脸→升级→更大的打脸',
      '悬疑式：设谜→解谜→揭示真相',
    ],
    // 深度提示
    deepQuestions: [
      '八条故事线如何规划？（地图线/阵营线/人物线/金手指线/世界观线/矛盾线/收集线/感情线）',
      '矛盾如何递进？从人与自我→人与自然→人与人→人与世界',
      '每个转折点的意外性和合理性如何平衡？',
      '章节之间的钩子如何衔接？'
    ],
    keyMetrics: [
      '结构完整性：是否符合八节点结构',
      '节奏感：是否每3章有冲突、每7章有高潮',
      '钩子密度：每章是否有让读者翻页的钩子'
    ],
    commonMistakes: [
      '开头太慢，读者流失',
      '冲突太平淡，没有起伏',
      '转折太突兀，没有铺垫',
      '高潮不够爽或解决太拖沓'
    ]
  },
  {
    id: 5,
    name: '设计爽点安排',
    icon: '⚡',
    description: '规划让读者过瘾的精彩场景',
    questions: [
      '有哪些装逼打脸的场景？',
      '有哪些甜蜜/热血的高光时刻？',
      '反派是谁？如何在关键时刻被打脸？',
      '主角的哪些成就要着重描写？',
    ],
    tips: [
      '爽点要提前铺垫，爆发时才有快感',
      '爽点的节奏很重要，不能太密集也不能太少',
      '每个大爽点之间要有递进，越来越大',
    ],
    examples: [
      '英雄救美：关键时刻帅气登场',
      '当众打脸：让反派颜面尽失',
      '实力认证：获得称号或认可',
    ],
    // 深度提示
    deepQuestions: [
      '爽点的铺垫够不够？读者是否已经"等"这个爽点？',
      '爽点的密度是否合适？每3000-5000字一个爽点',
      '爽点的形式是否多样？避免重复',
      '爽点之后是否有"余韵"让读者回味？'
    ],
    keyMetrics: [
      '爽点密度：每3000-5000字至少1个爽点',
      '爽点递进：是否越来越大、越来越爽',
      '爽点多样性：是否有不同类型的爽点'
    ],
    commonMistakes: [
      '爽点没有铺垫，直接高潮',
      '爽点太密集，读者疲劳',
      '爽点形式单一，重复乏味',
      '爽点释放不够充分，意犹未尽'
    ]
  }
];

/**
 * 获取步骤详情
 */
export function getStepDetails(stepId: number): OutlineStep | undefined {
  return fiveStepOutline.find(step => step.id === stepId);
}

/**
 * 生成完整大纲的框架（增强版）
 */
export interface OutlineFramework {
  // 基础信息
  emotionGoal: string;
  coreSetting: {
    world: string;
    rules: string[];
    uniqueFeature: string;
  };
  protagonist: {
    name: string;
    personality: string;
    strengths: string;
    weaknesses: string;
    growthArc: string;
  };
  structure: {
    opening: string;
    conflicts: string[];
    turningPoints: string[];
    climax: string;
    resolution: string;
  };
  pleasurePoints: {
    scenes: string[];
    frequency: string;
  };
  // 新增：八条故事线
  storyLines?: {
    map: string;
    faction: string;
    character: string;
    goldenfinger: string;
    worldRules: string;
    conflict: string;
    collection: string;
    romance: string;
  };
  // 新增：矛盾设计
  conflictDesign?: {
    source: string;
    escalation: string[];
    majorConflicts: string[];
  };
  // 新增：高潮设计
  climaxDesign?: {
    climax1: string;
    climax2: string;
    finalClimax: string;
  };
}

/**
 * 五步大纲法完成状态
 */
export interface FiveStepProgress {
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
  step4Complete: boolean;
  step5Complete: boolean;
}

/**
 * 增强的五步大纲完成状态（包含深度完成检查）
 */
export interface EnhancedFiveStepProgress extends FiveStepProgress {
  // 深度完成检查
  step1DeepComplete: boolean;  // 是否有情绪密度和递进设计
  step2DeepComplete: boolean;  // 是否有世界观矛盾分析
  step3DeepComplete: boolean;  // 是否有角色标签和成长设计
  step4DeepComplete: boolean;  // 是否有八线规划和转折设计
  step5DeepComplete: boolean;  // 是否有爽点节奏和递进设计
  // 故事线完成状态
  storyLinesComplete: boolean; // 八条故事线是否规划
  conflictDesignComplete: boolean; // 矛盾设计是否完成
  climaxDesignComplete: boolean; // 高潮设计是否完成
}

export function isAllStepsComplete(progress: FiveStepProgress): boolean {
  return progress.step1Complete && 
         progress.step2Complete && 
         progress.step3Complete && 
         progress.step4Complete && 
         progress.step5Complete;
}

export function getProgressPercentage(progress: FiveStepProgress): number {
  const completed = [
    progress.step1Complete,
    progress.step2Complete,
    progress.step3Complete,
    progress.step4Complete,
    progress.step5Complete,
  ].filter(Boolean).length;
  return Math.round((completed / 5) * 100);
}

/**
 * 获取八条故事线列表
 */
export function getEightStoryLines(): StoryLine[] {
  return EIGHT_STORY_LINES;
}

/**
 * 获取矛盾递进层级
 */
export function getConflictEscalation(): typeof CONFLICT_ESCALATION {
  return CONFLICT_ESCALATION;
}

/**
 * 获取冲突来源分类
 */
export function getConflictSources(): typeof CONFLICT_SOURCES {
  return CONFLICT_SOURCES;
}

/**
 * 获取单元剧设计原则
 */
export function getUnitEpisodePrinciples(): UnitEpisode[] {
  return UNIT_EPISODE_PRINCIPLES;
}

/**
 * 获取爽点节奏公式
 */
export function getCoolPointFormulas(): typeof COOL_POINT_FORMULAS {
  return COOL_POINT_FORMULAS;
}

/**
 * 获取高潮设计原则
 */
export function getClimaxDesign(): typeof CLIMAX_DESIGN {
  return CLIMAX_DESIGN;
}

/**
 * 获取开篇设计模板
 */
export function getOpeningTemplate(): typeof OPENING_TEMPLATE {
  return OPENING_TEMPLATE;
}

/**
 * 获取收尾设计原则
 */
export function getEndingTemplate(): typeof ENDING_TEMPLATE {
  return ENDING_TEMPLATE;
}

/**
 * 验证大纲完整性
 */
export function validateOutlineCompleteness(framework: Partial<OutlineFramework>): {
  isComplete: boolean;
  missingFields: string[];
  warnings: string[];
} {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  
  // 基础必填字段
  if (!framework.emotionGoal) missingFields.push('情绪目标');
  if (!framework.coreSetting?.world) missingFields.push('世界观');
  if (!framework.protagonist?.name) missingFields.push('主角姓名');
  if (!framework.structure?.climax) missingFields.push('高潮设计');
  
  // 深度检查
  if (framework.storyLines) {
    const lines = framework.storyLines;
    if (!lines.map) warnings.push('建议添加地图线规划');
    if (!lines.faction) warnings.push('建议添加阵营线规划');
    if (!lines.goldenfinger) warnings.push('建议添加金手指线规划');
    if (!lines.conflict) warnings.push('建议添加矛盾线规划');
  } else {
    warnings.push('建议添加八条故事线规划');
  }
  
  if (framework.conflictDesign) {
    if (!framework.conflictDesign.source) warnings.push('建议明确冲突来源');
    if (!framework.conflictDesign.escalation?.length) warnings.push('建议设计矛盾递进');
  } else {
    warnings.push('建议添加矛盾设计');
  }
  
  return {
    isComplete: missingFields.length === 0,
    missingFields,
    warnings
  };
}

/**
 * 生成五步大纲AI提示词
 */
export function generateFiveStepPrompt(
  step: number,
  userInput: string,
  framework?: Partial<OutlineFramework>
): string {
  const prompts: Record<number, string> = {
    1: `根据用户输入"${userInput}"，设计故事的情绪目标。

请分析：
1. 核心情绪是什么？（热血/甜蜜/虐心/紧张等）
2. 情绪弧线如何设计？（从低到高/波动起伏）
3. 情绪高潮在哪？
4. 情绪密度：每3000字至少一个情绪波动

参考原则：
- 情绪目标决定故事基调，要贯穿全文
- 建议选择1-2个核心情绪，避免贪多
- 每个高潮场景都要服务于核心情绪`,

    2: `根据用户输入"${userInput}"和已有框架${JSON.stringify(framework)}，设计故事的世界观。

请分析：
1. 世界类型：都市/古代/异世界/未来/玄幻
2. 核心规则：修炼体系/魔法系统/科技水平
3. 世界的核心矛盾是什么？
4. 金手指如何与世界观融合？
5. 世界的升级体系如何？

参考原则：
- 设定要服务于剧情，不要为了炫技而设定
- 前3章用到的设定要清晰，后面可以逐步展开
- 一个世界最好只有1-2个核心规则体系`,

    3: `根据用户输入"${userInput}"和已有框架${JSON.stringify(framework)}，设计故事的主角。

请分析：
1. 主角的核心性格特点是什么？
2. 主角的"标签"是什么？
3. 主角的优势和短板是什么？
4. 主角的成长弧线是什么？
5. 主角的动机和目标是什么？

参考原则：
- 主角要有明显的优点和缺点，太完美不真实
- 主角的困境要具体，让读者有代入感
- 主角的性格要能在压力下展现变化`,

    4: `根据用户输入"${userInput}"和已有框架${JSON.stringify(framework)}，设计故事的结构。

请分析：
1. 八条故事线如何规划？（地图线/阵营线/人物线/金手指线/世界观线/矛盾线/收集线/感情线）
2. 矛盾如何递进？人与自我→人与自然→人与人→人与世界
3. 有哪些关键转折点？
4. 高潮场景是什么？

参考原则：
- 开篇前3000字决定读者去留
- 每个大情节要有起伏，不能平铺直叙
- 高潮要足够震撼，解决要合理
- 每章结尾必须有钩子`,

    5: `根据用户输入"${userInput}"和已有框架${JSON.stringify(framework)}，设计故事的爽点。

请分析：
1. 有哪些装逼打脸的场景？
2. 有哪些甜蜜/热血的高光时刻？
3. 反派是谁？如何在关键时刻被打脸？
4. 爽点的节奏：每3000-5000字一个爽点
5. 爽点如何递进？越来越大

参考原则：
- 爽点要提前铺垫，爆发时才有快感
- 爽点的节奏很重要，不能太密集也不能太少
- 每个大爽点之间要有递进，越来越大`
  };
  
  return prompts[step] || '';
}
