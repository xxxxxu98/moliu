/**
 * Extended Genre Templates
 * 扩展题材模板 - 包含详细的题材设定
 */

/**
 * 爽点记录
 */
export interface CoolPointRecord {
  id: string;
  name: string;
  description: string;
  triggerCondition: string;
  intensity: 'micro' | 'small' | 'big';
  genre: string[];
  examples: string[];
}

/**
 * 场景写作记录
 */
export interface SceneWritingRecord {
  id: string;
  name: string;
  type: 'combat' | 'romance' | 'daily' | 'mystery' | 'tension';
  description: string;
  keyElements: string[];
  template?: string;
  genre: string[];
}

/**
 * 金手指记录
 */
export interface GoldenFingerRecord {
  id: string;
  name: string;
  type: 'item' | 'skill' | 'bloodline' | 'system' | 'knowledge' | 'companion';
  description: string;
  unlockCondition: string;
  upgradePath: string[];
  genre: string[];
}

/**
 * 角色记录
 */
export interface CharacterRecord {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'mentor' | 'love';
  archetype: string;
  traits: string[];
  arc: string;
  genre: string[];
}

/**
 * 题材规则记录
 */
export interface GenreRuleRecord {
  id: string;
  genre: string;
  rule: string;
  description: string;
  importance: 'core' | 'important' | 'optional';
}

/**
 * 桥接模式记录
 */
export interface BridgePatternRecord {
  id: string;
  name: string;
  from: string;
  to: string;
  pattern: string;
  description: string;
}

/**
 * 故事卡记录
 */
export interface StoryCardRecord {
  id: string;
  name: string;
  description: string;
  structure: {
    setup: string;
    conflict: string;
    resolution: string;
  };
  emotions: string[];
  genre: string[];
  variations: string[];
}

/**
 * 扩展题材模板
 */
export interface ExtendedGenreTemplate {
  id: string;
  name: string;
  description: string;
  
  // 基础设定
  subGenres?: { name: string; description: string }[];
  
  // 核心爽点
  coreCoolPoints?: CoolPointRecord[];
  
  // 力量体系
  powerSystem?: {
    name: string;
    levels: string[];
    specialRules?: string[];
  };
  
  // 势力类型
  factionTypes?: string[];
  
  // 节奏特点
  paceCharacteristics?: {
    opening: { style: string; description: string };
    development: { rhythm: string; description: string };
    climax: { structure: string; description: string };
  };
  
  // 禁忌/毒点
  antiPatterns?: { name: string; description: string }[];
  
  // 推荐故事卡
  recommendedStoryCards?: string[];
  
  // 金手指类型
  goldenFingerTypes?: string[];
  
  // 角色模板
  characterTemplates?: CharacterRecord[];
  
  // 场景模板
  sceneTemplates?: SceneWritingRecord[];
}

// ====== 具体题材模板 ======

/**
 * 玄幻题材模板
 */
export const XUANHUAN_TEMPLATE: ExtendedGenreTemplate = {
  id: 'xuánhuàn',
  name: '玄幻',
  description: '以东方玄幻为背景，融合修仙、异火、丹药等元素，主角通过修炼不断提升实力。',
  
  subGenres: [
    { name: '东方玄幻', description: '以东方神话为背景，强调修炼与斗法' },
    { name: '异世大陆', description: '穿越到异世界，利用知识或特殊能力崛起' },
    { name: '废物流', description: '主角从被欺压的废物逆袭成强者' },
    { name: '系统流', description: '主角获得任务系统，通过完成任务获得奖励' },
  ],
  
  coreCoolPoints: [
    {
      id: 'cp-xh-1',
      name: '越级挑战',
      description: '以弱胜强，展现主角的战斗智慧和潜力',
      triggerCondition: '敌人实力高于主角',
      intensity: 'big',
      genre: ['玄幻', '仙侠'],
      examples: ['炼气期打败筑基期', '以一敌三'],
    },
    {
      id: 'cp-xh-2',
      name: '实力碾压',
      description: '主角碾压敌人，展现绝对实力',
      triggerCondition: '双方实力差距大',
      intensity: 'micro',
      genre: ['玄幻', '都市'],
      examples: ['一掌灭敌', '秒杀'],
    },
    {
      id: 'cp-xh-3',
      name: '意外收获',
      description: '主角获得意想不到的宝物或机缘',
      triggerCondition: '探索/战斗后',
      intensity: 'small',
      genre: ['玄幻', '仙侠'],
      examples: ['捡到神器', '偶得传承', '秘境探险'],
    },
    {
      id: 'cp-xh-4',
      name: '装逼打脸',
      description: '之前看不起主角的人被狠狠打脸',
      triggerCondition: '有敌人在场',
      intensity: 'micro',
      genre: ['玄幻', '都市'],
      examples: ['废物原来是天才', '大小姐跪地求饶'],
    },
    {
      id: 'cp-xh-5',
      name: '红颜知己',
      description: '与女性角色的感情进展',
      triggerCondition: '有女性角色在场',
      intensity: 'small',
      genre: ['玄幻', '仙侠', '都市'],
      examples: ['英雄救美', '暧昧互动', '倾心相许'],
    },
  ],
  
  powerSystem: {
    name: '修炼体系',
    levels: ['凡人', '炼气', '筑基', '金丹', '元婴', '化神', '渡劫', '大乘', '真仙'],
    specialRules: [
      '异火可提升炼丹/炼器成功率',
      '血脉决定修炼上限',
      '功法品质影响修炼速度',
    ],
  },
  
  factionTypes: [
    '宗门', '家族', '帝国', '散修联盟', '商会', '佣兵团', '杀手组织', '情报机构',
  ],
  
  paceCharacteristics: {
    opening: {
      style: '困境开局',
      description: '主角处于弱势地位，如废物、退婚、被打压等',
    },
    development: {
      rhythm: '螺旋上升',
      description: '实力提升→遇到更强敌人→再提升→再遇到更强敌人',
    },
    climax: {
      structure: '三幕式',
      description: '小高潮(副本结束)、中高潮(卷末)、大高潮(全书结局)',
    },
  },
  
  antiPatterns: [
    { name: '无敌文', description: '主角一上来就无敌，爽感不足' },
    { name: '圣母心', description: '主角过于善良，不杀该杀之人' },
    { name: '战力崩坏', description: '等级制度混乱，后期实力膨胀' },
    { name: '种马后宫', description: '无意义的女性角色堆砌' },
  ],
  
  recommendedStoryCards: [
    '英雄救美', '装逼打脸', '以小博大', '歪打正着', '临危受命', '成长蜕变',
  ],
  
  goldenFingerTypes: [
    '上古传承', '逆天血脉', '神秘系统', '百科全书', '炼丹炼器天赋', '空间戒指',
  ],
};

/**
 * 都市题材模板
 */
export const URBAN_TEMPLATE: ExtendedGenreTemplate = {
  id: 'dūshì',
  name: '都市',
  description: '以现代都市为背景，主角凭借特殊能力或身份在都市中崛起。',
  
  subGenres: [
    { name: '都市爽文', description: '主角有特殊能力，在都市中打脸逆袭' },
    { name: '神医流', description: '主角是神医，治病救人同时装逼' },
    { name: '兵王流', description: '退伍兵王回归都市' },
    { name: '神豪流', description: '主角获得巨额财富或消费系统' },
    { name: '直播流', description: '主角通过直播崛起' },
  ],
  
  coreCoolPoints: [
    {
      id: 'cp-us-1',
      name: '身份打脸',
      description: '主角隐藏身份曝光，众人震惊',
      triggerCondition: '有敌人在场且主角身份未公开',
      intensity: 'big',
      genre: ['都市'],
      examples: ['首富之子曝光', '战神殿主曝光', '神医身份公开'],
    },
    {
      id: 'cp-us-2',
      name: '消费装逼',
      description: '主角花钱如流水，震惊旁人',
      triggerCondition: '有嫌贫爱富的角色在场',
      intensity: 'micro',
      genre: ['都市', '神豪'],
      examples: ['买下整家店', '随手打赏百万', '豪车接送'],
    },
    {
      id: 'cp-us-3',
      name: '医术展示',
      description: '主角展露高超医术，救人或打脸',
      triggerCondition: '有病人或庸医在场',
      intensity: 'small',
      genre: ['都市', '神医'],
      examples: ['一针救命', '诊断绝症', '妙手回春'],
    },
  ],
  
  powerSystem: {
    name: '都市能力体系',
    levels: ['普通人', '小有成就', '行业精英', '领域专家', '行业顶尖', '传奇人物'],
    specialRules: [
      '医术可治百病',
      '商业头脑决定财富',
      '武力在都市中受限制',
    ],
  },
  
  factionTypes: [
    '豪门', '世家', '企业', '地下势力', '官场', '古武家族', '隐世宗门',
  ],
  
  paceCharacteristics: {
    opening: {
      style: '隐忍开局',
      description: '主角隐藏实力，被误解或被打压',
    },
    development: {
      rhythm: '层级突破',
      description: '从底层一步步向上爬，打败越来越强的对手',
    },
    climax: {
      structure: '身份揭露',
      description: '主角真实身份曝光，所有人震惊',
    },
  },
  
  antiPatterns: [
    { name: '过于圣母', description: '对敌人手下留情' },
    { name: '无脑炫富', description: '没有情节支撑的炫富' },
    { name: '女主工具人', description: '女性角色没有独立人格' },
  ],
  
  recommendedStoryCards: [
    '英雄救美', '装逼打脸', '误会冲突', '身份反转', '商场博弈',
  ],
};

/**
 * 仙侠题材模板
 */
export const XIANXIA_TEMPLATE: ExtendedGenreTemplate = {
  id: 'xiānxiá',
  name: '仙侠',
  description: '以修仙为核，融合道家思想，强调因果报应和心境修炼。',
  
  subGenres: [
    { name: '古典仙侠', description: '以凡人修仙为主，强调心境和因果' },
    { name: '洪荒流', description: '以洪荒世界为背景，涉及圣人天道' },
    { name: '凡人流', description: '以凡人视角展开，主角资质平庸' },
    { name: '蜀山流', description: '以剑修为核心，强调剑意剑道' },
  ],
  
  coreCoolPoints: [
    {
      id: 'cp-xx-1',
      name: '剑意突破',
      description: '主角在剑道上有所领悟，实力大增',
      triggerCondition: '战斗或闭关后',
      intensity: 'small',
      genre: ['仙侠'],
      examples: ['领悟剑意', '剑心通明', '人剑合一'],
    },
    {
      id: 'cp-xx-2',
      name: '心境提升',
      description: '主角心境突破，渡劫成功或实力大涨',
      triggerCondition: '经历心魔考验',
      intensity: 'big',
      genre: ['仙侠'],
      examples: ['渡过心魔', '道心坚定', '明悟本心'],
    },
  ],
  
  powerSystem: {
    name: '修仙体系',
    levels: ['炼气', '筑基', '金丹', '元婴', '化神', '大乘', '渡劫', '地仙', '天仙', '金仙', '大罗金仙', '混元大罗'],
    specialRules: [
      '渡劫有风险，可能身死道消',
      '心境与修为需匹配',
      '因果缠身影响修炼',
    ],
  },
  
  factionTypes: [
    '仙门', '魔道', '妖族', '佛门', '散修', '上古势力', '天道法则',
  ],
  
  paceCharacteristics: {
    opening: {
      style: '资质平平',
      description: '主角资质一般，需要靠机缘和努力',
    },
    development: {
      rhythm: '厚积薄发',
      description: '前期积累，后期爆发',
    },
    climax: {
      structure: '因果清算',
      description: '所有因果在最后清算',
    },
  },
  
  antiPatterns: [
    { name: '杀伐果断过头', description: '无意义杀戮，戾气过重' },
    { name: '升级太快', description: '修为提升没有铺垫' },
    { name: '心境跟不上', description: '修为高但心境低，设定矛盾' },
  ],
  
  recommendedStoryCards: [
    '成长蜕变', '因果轮回', '顿悟突破', '渡劫重生', '红尘炼心',
  ],
};

/**
 * 悬疑题材模板
 */
export const MYSTERY_TEMPLATE: ExtendedGenreTemplate = {
  id: 'xuányí',
  name: '悬疑',
  description: '以推理探案为主，强调情节反转和真相揭示。',
  
  subGenres: [
    { name: '推理破案', description: '主角通过推理破解案件' },
    { name: '惊悚悬疑', description: '以恐怖和惊悚为主' },
    { name: '心理悬疑', description: '侧重心理描写和人性的阴暗' },
  ],
  
  coreCoolPoints: [
    {
      id: 'cp-my-1',
      name: '真相揭示',
      description: '凶手身份或真相揭晓',
      triggerCondition: '推理完成时',
      intensity: 'big',
      genre: ['悬疑'],
      examples: ['凶手竟是他', '意想不到的真相'],
    },
    {
      id: 'cp-my-2',
      name: '情节反转',
      description: '读者以为的真相被推翻',
      triggerCondition: '证据出现时',
      intensity: 'small',
      genre: ['悬疑'],
      examples: ['证人被杀', '不在场证明推翻', '动机改变'],
    },
  ],
  
  powerSystem: {
    name: '推理能力',
    levels: ['观察', '分析', '推理', '洞察', '神探'],
    specialRules: [
      '细节观察是破案关键',
      '每个人都有秘密',
      '动机往往比手法更重要',
    ],
  },
  
  factionTypes: [
    '警方', '侦探', '嫌疑人', '幕后黑手', '知情者',
  ],
  
  paceCharacteristics: {
    opening: {
      style: '谜团开局',
      description: '以一个谜团或案件开场',
    },
    development: {
      rhythm: '层层剥茧',
      description: '每解开一个谜题，又出现新的谜题',
    },
    climax: {
      structure: '真相大白',
      description: '所有谜题在最后解开',
    },
  },
  
  antiPatterns: [
    { name: '凶手太明显', description: '读者一眼看出凶手' },
    { name: '机械降神', description: '最后凭空出现关键证据' },
    { name: '动机牵强', description: '凶手的动机不合理' },
  ],
  
  recommendedStoryCards: [
    '迷雾重重', '真相与假象', '心理博弈', '身份迷雾', '时间线谜题',
  ],
};

/**
 * 所有题材模板
 */
export const EXTENDED_GENRE_TEMPLATES: ExtendedGenreTemplate[] = [
  XUANHUAN_TEMPLATE,
  URBAN_TEMPLATE,
  XIANXIA_TEMPLATE,
  MYSTERY_TEMPLATE,
];

/**
 * 根据题材名获取模板
 */
export function getExtendedGenreTemplate(genreName: string): ExtendedGenreTemplate | undefined {
  return EXTENDED_GENRE_TEMPLATES.find(
    t => t.name.includes(genreName) || t.id.includes(genreName)
  );
}
