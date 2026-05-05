/**
 * 故事卡模板库
 * 基于 story-long-write 技能库的"故事卡系统"
 */

/**
 * 故事卡类型
 */
export type StoryCardType = 
  | 'hero-saves-beauty'   // 英雄救美
  | 'showing-off'         // 装逼打脸
  | 'small-bet-big-win'   // 小赌大赢
  | 'face-slapping'       // 当众打脸
  | 'treasure-hunting'    // 寻宝探险
  | 'love-triangle'       // 三角关系
  | 'mentor-apprentice'   // 师徒情深
  | 'brotherhood'         // 兄弟情义
  | 'revenge'             // 复仇之路
  | 'growth-arc';         // 成长蜕变

/**
 * 故事卡结构
 */
export interface StoryCard {
  id: string;
  type: StoryCardType;
  name: string;
  icon: string;
  description: string;
  // 结构化内容
  setup: string;           // 起因
  development: string;      // 发展
  climax: string;           // 高潮
  resolution: string;        // 解决
  // 适用场景
  applicableGenres: string[];  // 适用题材
  targetAudience: 'male' | 'female' | 'general';
  wordCountRange: [number, number];  // 推荐字数范围
  // 组合建议
  comboWith: StoryCardType[];  // 可组合的故事卡
  // 示例
  example?: string;
  // 评分
  popularity: number;      // 热度 1-5
  difficulty: number;       // 难度 1-5
}

/**
 * 故事卡模板库
 */
export const storyCards: StoryCard[] = [
  {
    id: 'hero-saves-beauty',
    type: 'hero-saves-beauty',
    name: '英雄救美',
    icon: '💃',
    description: '英雄在危难时刻救下美人，从此结下不解之缘',
    setup: '女主遭遇危险（被追杀/被绑架/陷入困境），男主恰好出现或特意赶来营救',
    development: '女主对男主的英勇产生好感，男主对女主产生保护欲，两人关系迅速升温',
    climax: '两人面临更大的危机或敌人，需要共同面对',
    resolution: '危机解除，感情升华，确立关系或更深的羁绊',
    applicableGenres: ['都市', '玄幻', '仙侠', '武侠', '穿越'],
    targetAudience: 'female',
    wordCountRange: [5000, 30000],
    comboWith: ['showing-off', 'face-slapping', 'love-triangle'],
    popularity: 5,
    difficulty: 2,
    example: '女主被黑道追杀，慌乱中逃入小巷，男主恰好在此修炼，一招击败所有追兵。女主受伤晕倒，男主将其带回家中照顾...',
  },
  {
    id: 'showing-off',
    type: 'showing-off',
    name: '装逼打脸',
    icon: '😎',
    description: '主角低调展示实力，让看不起他的人目瞪口呆',
    setup: '主角因某种原因被他人轻视/嘲笑（如废物、退婚、穷等）',
    development: '主角低调行事，但总在关键时刻不经意展示出惊人实力或背景',
    climax: '当众展示真正实力，所有人震惊，反派当场打脸',
    resolution: '主角地位飙升，获得尊重或追随者',
    applicableGenres: ['都市', '玄幻', '仙侠', '重生'],
    targetAudience: 'male',
    wordCountRange: [3000, 20000],
    comboWith: ['hero-saves-beauty', 'face-slapping', 'small-bet-big-win'],
    popularity: 5,
    difficulty: 2,
    example: '家族年会上，主角被视为废物，受尽嘲讽。这时一位顶级大佬突然出现，当众向主角鞠躬行礼...',
  },
  {
    id: 'small-bet-big-win',
    type: 'small-bet-big-win',
    name: '小赌大赢',
    icon: '🎰',
    description: '看似不可能的赌局，主角以小博大获胜',
    setup: '主角被迫参与一场看似必输的赌局，或主动设局挑战强敌',
    development: '局势看似对主角不利，对手得意忘形',
    climax: '关键时刻主角逆转，所有人惊掉下巴',
    resolution: '主角获得巨大收益（财富/地位/女人/名声）',
    applicableGenres: ['都市', '玄幻', '都市'],
    targetAudience: 'male',
    wordCountRange: [5000, 15000],
    comboWith: ['showing-off', 'face-slapping'],
    popularity: 4,
    difficulty: 3,
    example: '一场地下赌石大会上，主角用身上仅有的1000元，赌出了一块价值千万的翡翠，全场哗然...',
  },
  {
    id: 'face-slapping',
    type: 'face-slapping',
    name: '当众打脸',
    icon: '👋',
    description: '在公开场合狠狠打击羞辱主角的人',
    setup: '主角或主角的人在公开场合被羞辱/看不起',
    development: '羞辱者得意洋洋，主角隐忍或淡然',
    climax: '关键时刻主角亮出身份/实力/背景，羞辱者当场石化',
    resolution: '羞辱者颜面尽失，主角获得全场敬畏',
    applicableGenres: ['都市', '玄幻', '穿越', '职场'],
    targetAudience: 'male',
    wordCountRange: [3000, 15000],
    comboWith: ['showing-off', 'hero-saves-beauty', 'small-bet-big-win'],
    popularity: 5,
    difficulty: 2,
    example: '订婚宴上，未婚妻当众嘲笑主角是穷小子。话音刚落，一辆限量版跑车停在门口...',
  },
  {
    id: 'treasure-hunting',
    type: 'treasure-hunting',
    name: '寻宝探险',
    icon: '🗺️',
    description: '探索秘境/古墓/遗迹，寻找宝物或真相',
    setup: '主角得知某地藏有宝物/秘籍/线索，决定前往探索',
    development: '探险过程中遭遇各种危险（机关/妖兽/其他竞争者）',
    climax: '抵达核心区域，遭遇最大危机或最强敌人',
    resolution: '获得宝物/传承/真相，实力大增或解开谜团',
    applicableGenres: ['玄幻', '仙侠', '盗墓', '科幻'],
    targetAudience: 'male',
    wordCountRange: [10000, 50000],
    comboWith: ['brotherhood', 'showing-off', 'revenge'],
    popularity: 4,
    difficulty: 4,
    example: '主角在拍卖会上拍得一张残破地图，上面标注着一处失落的仙府遗迹。他召集同伴，踏上了寻宝之旅...',
  },
  {
    id: 'love-triangle',
    type: 'love-triangle',
    name: '三角/多角关系',
    icon: '💕',
    description: '情感纠葛，多人之间的爱恨情仇',
    setup: '主角与多人产生情感纠葛（暗恋/追求/已有婚约等）',
    development: '情感逐渐加深，但关系复杂（家族反对/误会/情敌出现）',
    climax: '情感爆发点（表白/冲突/抉择/危机）',
    resolution: '情感归属确定，或开放式结局',
    applicableGenres: ['都市', '言情', '校园', '仙侠', '宫斗'],
    targetAudience: 'female',
    wordCountRange: [20000, 100000],
    comboWith: ['hero-saves-beauty', 'mentor-apprentice', 'growth-arc'],
    popularity: 5,
    difficulty: 3,
    example: '校园里，女主同时被校草学霸和冷酷男神追求。就在她犹豫时，男主出现了，他竟然是她小时候的青梅竹马...',
  },
  {
    id: 'mentor-apprentice',
    type: 'mentor-apprentice',
    name: '师徒情深',
    icon: '🧘',
    description: '师徒之间的深厚情感，从师到友到知己',
    setup: '主角拜入某位强者门下，成为其弟子',
    development: '师徒相处中渐渐产生超越师徒的感情，或师父成为主角最重要的引路人',
    climax: '师徒面临考验/分离/生死危机',
    resolution: '感情升华，或师父为徒弟牺牲/传承',
    applicableGenres: ['仙侠', '武侠', '玄幻', '都市'],
    targetAudience: 'general',
    wordCountRange: [20000, 80000],
    comboWith: ['hero-saves-beauty', 'growth-arc', 'brotherhood'],
    popularity: 4,
    difficulty: 3,
    example: '女主被家族送到隐世高人处学艺。师父冷漠严厉，却在暗中处处保护她。随着时间推移，她发现师父其实一直在等一个人...',
  },
  {
    id: 'brotherhood',
    type: 'brotherhood',
    name: '兄弟情义',
    icon: '🤝',
    description: '生死之交，患难与共的兄弟情',
    setup: '主角结识志同道合的兄弟，或已有兄弟团的雏形',
    development: '兄弟一起经历各种事件，感情加深，形成铁打的团队',
    climax: '兄弟面临重大抉择或危机，有人可能牺牲',
    resolution: '兄弟情谊经受住考验，或为彼此牺牲',
    applicableGenres: ['都市', '玄幻', '仙侠', '军旅'],
    targetAudience: 'male',
    wordCountRange: [30000, 200000],
    comboWith: ['showing-off', 'treasure-hunting', 'growth-arc'],
    popularity: 4,
    difficulty: 3,
    example: '网吧里偶然相识的几个年轻人，因为一款游戏走到一起。从网游到现实，他们成为彼此最信任的兄弟，一起闯荡都市...',
  },
  {
    id: 'revenge',
    type: 'revenge',
    name: '复仇之路',
    icon: '⚔️',
    description: '为主或为公，复仇雪恨的故事',
    setup: '主角或主角在意的人遭受不公待遇（灭门/背叛/冤屈）',
    development: '主角隐忍积蓄力量，同时调查真相或寻找仇人',
    climax: '与仇人正面对决，揭露真相',
    resolution: '复仇成功，但主角心境可能发生变化',
    applicableGenres: ['玄幻', '都市', '仙侠', '武侠'],
    targetAudience: 'male',
    wordCountRange: [30000, 150000],
    comboWith: ['showing-off', 'face-slapping', 'growth-arc'],
    popularity: 4,
    difficulty: 4,
    example: '十年前，主角的家族被诬陷通敌叛国，满门抄斩。他被忠仆救出，隐姓埋名，苦练武艺。如今，他终于回来了...',
  },
  {
    id: 'growth-arc',
    type: 'growth-arc',
    name: '成长蜕变',
    icon: '🌱',
    description: '从弱小到强大的成长历程',
    setup: '主角起点很低（废物/普通人/被欺压者），但有不甘平庸的心',
    development: '经历各种事件，实力/心智逐渐成长',
    climax: '成长到一定阶段，展现惊人实力或完成蜕变',
    resolution: '完成成长目标，或发现更大的世界',
    applicableGenres: ['玄幻', '仙侠', '都市', '校园', '科幻'],
    targetAudience: 'general',
    wordCountRange: [50000, 500000],
    comboWith: ['showing-off', 'hero-saves-beauty', 'revenge', 'brotherhood'],
    popularity: 5,
    difficulty: 3,
    example: '一个被认为是废物的少年，在被未婚妻退婚的那天，意外激活了体内的上古血脉。从此，他开始了一条逆天改命的修炼之路...',
  },
];

/**
 * 获取故事卡类型的中文名称
 */
export function getStoryCardTypeName(type: StoryCardType): string {
  const card = storyCards.find(c => c.type === type);
  return card?.name || type;
}

/**
 * 根据题材筛选故事卡
 */
export function filterStoryCardsByGenre(genre: string): StoryCard[] {
  return storyCards.filter(card => card.applicableGenres.includes(genre));
}

/**
 * 根据受众筛选故事卡
 */
export function filterStoryCardsByAudience(audience: 'male' | 'female' | 'general'): StoryCard[] {
  return storyCards.filter(card => 
    card.targetAudience === audience || card.targetAudience === 'general'
  );
}

/**
 * 获取可组合的故事卡
 */
export function getComboCards(cardType: StoryCardType): StoryCard[] {
  const card = storyCards.find(c => c.type === cardType);
  if (!card) return [];
  return storyCards.filter(c => card.comboWith.includes(c.type));
}

/**
 * 获取推荐的故事卡组合
 */
export function getRecommendedCombos(): { primary: StoryCard; secondary: StoryCard; description: string }[] {
  return [
    {
      primary: storyCards.find(c => c.type === 'growth-arc')!,
      secondary: storyCards.find(c => c.type === 'showing-off')!,
      description: '成长+装逼，经典套路永不过时',
    },
    {
      primary: storyCards.find(c => c.type === 'hero-saves-beauty')!,
      secondary: storyCards.find(c => c.type === 'face-slapping')!,
      description: '英雄救美+当众打脸，女频必杀技',
    },
    {
      primary: storyCards.find(c => c.type === 'treasure-hunting')!,
      secondary: storyCards.find(c => c.type === 'brotherhood')!,
      description: '探险寻宝+兄弟情义，热血冒险组合',
    },
    {
      primary: storyCards.find(c => c.type === 'love-triangle')!,
      secondary: storyCards.find(c => c.type === 'mentor-apprentice')!,
      description: '多角恋+师徒情，女频虐恋组合',
    },
    {
      primary: storyCards.find(c => c.type === 'revenge')!,
      secondary: storyCards.find(c => c.type === 'small-bet-big-win')!,
      description: '复仇+小赌大赢，男频逆袭组合',
    },
  ];
}

/**
 * 故事卡组合器
 */
export interface StoryCardComposition {
  primaryCard: StoryCard;
  secondaryCard?: StoryCard;
  customSettings?: {
    protagonistName?: string;
    setting?: string;
    additionalElements?: string[];
  };
}

/**
 * 生成故事卡组合的大纲框架
 */
export function generateCompositionOutline(composition: StoryCardComposition): string {
  const { primaryCard, secondaryCard, customSettings } = composition;
  const protagonist = customSettings?.protagonistName || '主角';
  
  let outline = `# ${primaryCard.name}${secondaryCard ? ' + ' + secondaryCard.name : ''} 故事框架\n\n`;
  
  outline += `## 第一幕：起因 (约20%)\n\n`;
  outline += `### 设定铺垫\n`;
  outline += `${primaryCard.setup}\n`;
  if (secondaryCard) {
    outline += `${secondaryCard.setup}\n`;
  }
  
  outline += `\n## 第二幕：发展 (约50%)\n\n`;
  outline += `### 成长/积累阶段\n`;
  outline += `${primaryCard.development}\n`;
  if (secondaryCard) {
    outline += `${secondaryCard.development}\n`;
  }
  outline += `\n### 矛盾积累\n`;
  outline += `- 主要冲突逐渐升级\n`;
  outline += `- 关键人物逐一登场\n`;
  outline += `- 伏笔埋设与回收\n`;
  
  outline += `\n## 第三幕：高潮 (约20%)\n\n`;
  outline += `### 核心冲突爆发\n`;
  outline += `${primaryCard.climax}\n`;
  if (secondaryCard) {
    outline += `${secondaryCard.climax}\n`;
  }
  outline += `\n### 关键抉择\n`;
  outline += `- 主角面临重大选择\n`;
  outline += `- 情感/利益/道义的权衡\n`;
  
  outline += `\n## 第四幕：解决 (约10%)\n\n`;
  outline += `### 结局呈现\n`;
  outline += `${primaryCard.resolution}\n`;
  if (secondaryCard) {
    outline += `${secondaryCard.resolution}\n`;
  }
  
  outline += `\n## 爽点设计\n\n`;
  outline += `| 阶段 | 爽点 |\n`;
  outline += `|------|------|\n`;
  outline += `| 开篇 | ${protagonist}的独特设定或隐藏身份 |\n`;
  outline += `| 中期 | 多次打脸/装逼/逆袭 |\n`;
  outline += `| 高潮 | 终极对决/真相大白 |\n`;
  outline += `| 结尾 | 功成名就/抱得美人归 |\n`;
  
  return outline;
}
