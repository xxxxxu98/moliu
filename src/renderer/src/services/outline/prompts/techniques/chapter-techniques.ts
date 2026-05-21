/**
 * Chapter Writing Techniques Library
 * 章纲写作技巧库 - 从 oh-story-claudecode 借鉴的开头/结尾/情绪技巧
 */

/**
 * 开头技巧类型
 */
export interface OpeningTechnique {
  id: string;
  name: string;
  description: string;
  example: string;
  suitableFor: string[];
  genre: string[];
}

/**
 * 结尾技巧类型
 */
export interface EndingTechnique {
  id: string;
  name: string;
  description: string;
  effect: string;
  suitableFor: string[];
  genre: string[];
}

/**
 * 情绪曲线配置
 */
export interface EmotionArcConfig {
  type: 'rising' | 'falling' | 'wave' | 'm-shape' | 'n-shape' | 'u-shape';
  name: string;
  description: string;
  intensityPattern: number[];  // 每3000字的情感强度值（0-100）
  suitableFor: string[];
}

/**
 * 章节类型
 */
export type ChapterType = 'battle' | 'plot' | 'transition' | 'climax' | 'emotional';

/**
 * 章节写作配置
 */
export interface ChapterWritingConfig {
  type: ChapterType;
  openingTechnique?: OpeningTechnique;
  endingTechnique?: EndingTechnique;
  emotionArc?: EmotionArcConfig;
  coolPointTypes: string[];
}

// ====== 开头技巧库 ======

export const OPENING_TECHNIQUES: OpeningTechnique[] = [
  {
    id: 'opening-001',
    name: '冲突前置',
    description: '第一句就是矛盾，直接进入冲突',
    example: '「离婚协议放在桌上，他已经签了。」',
    suitableFor: ['都市', '现代', '家庭'],
    genre: ['都市', '现言', '古言'],
  },
  {
    id: 'opening-002',
    name: '信息差钩',
    description: '给读者一个角色不知道的信息，制造信息差',
    example: '「她不知道，对面那个男人已经在计划第三次了。」',
    suitableFor: ['悬疑', '惊悚', '复仇'],
    genre: ['悬疑', '都市', '玄幻'],
  },
  {
    id: 'opening-003',
    name: '反常行为',
    description: '用一个不合常理的行为引起好奇',
    example: '「她把订婚戒指冲进了马桶。」',
    suitableFor: ['情感', '都市', '心理'],
    genre: ['都市', '现言', '古言'],
  },
  {
    id: 'opening-004',
    name: '重生反常',
    description: '重生后做前世绝不会做的事',
    example: '「沈栀心念成灰，支着一口气找到了媒婆:郭家的那个天阉，我来嫁。」',
    suitableFor: ['重生', '穿越', '复仇'],
    genre: ['古言', '玄幻', '都市'],
  },
  {
    id: 'opening-005',
    name: '超自然身份',
    description: '开篇揭示非人类身份',
    example: '「我是世上仅存的红衣厉鬼。我不知自己是怎么死的。」',
    suitableFor: ['灵异', '玄幻', '惊悚'],
    genre: ['悬疑', '玄幻', '都市'],
  },
  {
    id: 'opening-006',
    name: '灵魂旁观',
    description: '以灵魂视角描述死亡现场',
    example: '「我的尸体躺在透明棺材里，三个哥哥在外面笑着说：她演得真像。」',
    suitableFor: ['复仇', '重生', '悬疑'],
    genre: ['都市', '古言', '悬疑'],
  },
  {
    id: 'opening-007',
    name: '悬念句',
    description: '抛出一个需要解释的事实',
    example: '「我死后的第三天，老公发了一条朋友圈。」',
    suitableFor: ['悬疑', '情感', '复仇'],
    genre: ['悬疑', '都市', '现言'],
  },
  {
    id: 'opening-008',
    name: '替嫁被弃',
    description: '被迫接受不公正的命运',
    example: '「三个月后，我代替皇后的嫡亲公主坐上了去漠北和亲的轿撵。」',
    suitableFor: ['宫廷', '替嫁', '复仇'],
    genre: ['古言', '宫斗'],
  },
  {
    id: 'opening-009',
    name: '代入式提问',
    description: '直接让读者产生共鸣',
    example: '「你有没有在深夜接到过一个不该接的电话？」',
    suitableFor: ['悬疑', '惊悚', '情感'],
    genre: ['悬疑', '都市', '现言'],
  },
  {
    id: 'opening-010',
    name: '承接式',
    description: '直接接上章剧情，不做背景介绍',
    example: '「（接上章）林天深吸一口气，推开了秘境的大门。」',
    suitableFor: ['所有类型'],
    genre: ['玄幻', '仙侠', '都市', '全部'],
  },
];

// ====== 结尾技巧库 ======

export const ENDING_TECHNIQUES: EndingTechnique[] = [
  {
    id: 'ending-001',
    name: '余韵式',
    description: '不说完，让读者自己想',
    effect: '留下余韵，让读者回味无穷',
    suitableFor: ['情感', '虐心', '意难平'],
    genre: ['现言', '古言', '幻言'],
  },
  {
    id: 'ending-002',
    name: '呼应式',
    description: '首尾呼应，形成闭环',
    effect: '让读者感受到完整性',
    suitableFor: ['所有类型'],
    genre: ['全部'],
  },
  {
    id: 'ending-003',
    name: '开放式',
    description: '留下悬念',
    effect: '让读者迫不及待想看下一章',
    suitableFor: ['所有类型'],
    genre: ['全部'],
  },
  {
    id: 'ending-004',
    name: '反转再反转',
    description: '结尾再来一个小反转',
    effect: '让读者惊呼"竟然是这样"',
    suitableFor: ['悬疑', '复仇', '爽文'],
    genre: ['悬疑', '都市', '玄幻'],
  },
  {
    id: 'ending-005',
    name: '金句式',
    description: '一句话点题',
    effect: '让读者记住本章核心',
    suitableFor: ['情感', '成长', '励志'],
    genre: ['现言', '都市', '全部'],
  },
  {
    id: 'ending-006',
    name: '悬念断章式',
    description: '在高潮点断章，读者必须订阅',
    effect: '最大化追读欲望',
    suitableFor: ['战斗', '冲突', '情感高潮'],
    genre: ['玄幻', '都市', '全部'],
  },
  {
    id: 'ending-007',
    name: '情感留白式',
    description: '情感到位但不说完，留白给读者想象',
    effect: '让读者自己脑补更多',
    suitableFor: ['感情', '暧昧', '心动'],
    genre: ['现言', '古言', '幻言'],
  },
];

// ====== 情绪曲线配置 ======

export const EMOTION_ARC_CONFIGS: EmotionArcConfig[] = [
  {
    type: 'rising',
    name: '步步高升',
    description: '情绪从低到高持续上升，适合逆袭爽文',
    intensityPattern: [30, 40, 50, 60, 70, 80, 90, 100],
    suitableFor: ['逆袭', '升级', '成长'],
  },
  {
    type: 'falling',
    name: '虐到谷底',
    description: '情绪从高到低持续下降，适合虐文',
    intensityPattern: [100, 90, 80, 70, 50, 30, 20, 10],
    suitableFor: ['虐恋', '悲剧', '意难平'],
  },
  {
    type: 'wave',
    name: '波浪起伏',
    description: '情绪高低交替，适合多冲突剧情',
    intensityPattern: [30, 60, 40, 70, 50, 80, 60, 90],
    suitableFor: ['复仇', '商战', '宫斗'],
  },
  {
    type: 'm-shape',
    name: 'M形双峰',
    description: '两个高潮点，适合大长篇分段爽',
    intensityPattern: [30, 50, 80, 60, 50, 60, 80, 100],
    suitableFor: ['长篇', '多卷', '复合爽点'],
  },
  {
    type: 'n-shape',
    name: 'N形先抑后扬',
    description: '先压抑后爆发，适合废材逆袭',
    intensityPattern: [20, 30, 20, 40, 50, 70, 90, 100],
    suitableFor: ['废材逆袭', '退婚流', '打脸'],
  },
  {
    type: 'u-shape',
    name: 'U形谷底反弹',
    description: '先低→更低→爆发，适合绝地翻盘',
    intensityPattern: [50, 40, 20, 10, 30, 50, 80, 100],
    suitableFor: ['绝境翻盘', '复仇成功', '死里逃生'],
  },
];

// ====== 辅助函数 ======

/**
 * 根据章节类型获取推荐的开头技巧
 */
export function getRecommendedOpeningTechniques(chapterType: ChapterType): OpeningTechnique[] {
  const typeMap: Record<ChapterType, string[]> = {
    battle: ['opening-010', 'opening-006'],
    plot: ['opening-010', 'opening-001', 'opening-003'],
    transition: ['opening-010'],
    climax: ['opening-010', 'opening-007', 'opening-009'],
    emotional: ['opening-003', 'opening-005', 'opening-004'],
  };
  
  const ids = typeMap[chapterType] || ['opening-010'];
  return OPENING_TECHNIQUES.filter(t => ids.includes(t.id));
}

/**
 * 根据章节类型获取推荐的结尾技巧
 */
export function getRecommendedEndingTechniques(chapterType: ChapterType): EndingTechnique[] {
  const typeMap: Record<ChapterType, string[]> = {
    battle: ['ending-006', 'ending-004'],
    plot: ['ending-003', 'ending-006'],
    transition: ['ending-003', 'ending-001'],
    climax: ['ending-006', 'ending-004', 'ending-002'],
    emotional: ['ending-001', 'ending-005', 'ending-007'],
  };
  
  const ids = typeMap[chapterType] || ['ending-003'];
  return ENDING_TECHNIQUES.filter(t => ids.includes(t.id));
}

/**
 * 根据情绪目标获取推荐的情感曲线
 */
export function getEmotionArcByGoal(emotionGoal: string): EmotionArcConfig | undefined {
  const goalMap: Record<string, string> = {
    '逆袭': 'n-shape',
    '爽': 'rising',
    '虐': 'falling',
    '复仇': 'wave',
    '成长': 'rising',
    '意难平': 'u-shape',
    '翻盘': 'u-shape',
    '热血': 'rising',
    '悬疑': 'wave',
  };
  
  const arcType = goalMap[emotionGoal] || 'wave';
  return EMOTION_ARC_CONFIGS.find(c => c.type === arcType);
}

/**
 * 生成章节技巧提示文本
 */
export function generateChapterTechniquesPrompt(
  chapterType: ChapterType,
  emotionGoal?: string
): string {
  const openings = getRecommendedOpeningTechniques(chapterType);
  const endings = getRecommendedEndingTechniques(chapterType);
  
  const sections: string[] = ['【推荐开头技巧】（选其一）'];
  
  for (const o of openings.slice(0, 3)) {
    sections.push(`- ${o.name}：${o.description}`);
    sections.push(`  示例：${o.example}`);
  }
  
  sections.push('\n【推荐结尾技巧】（选其一）');
  
  for (const e of endings.slice(0, 3)) {
    sections.push(`- ${e.name}：${e.description}`);
    sections.push(`  效果：${e.effect}`);
  }
  
  if (emotionGoal) {
    const arc = getEmotionArcByGoal(emotionGoal);
    if (arc) {
      sections.push(`\n【情绪曲线建议】`);
      sections.push(`- 推荐曲线：${arc.name}`);
      sections.push(`- 描述：${arc.description}`);
    }
  }
  
  return sections.join('\n');
}

// ====== 导出 ======

export {
  OPENING_TECHNIQUES,
  ENDING_TECHNIQUES,
  EMOTION_ARC_CONFIGS,
};
