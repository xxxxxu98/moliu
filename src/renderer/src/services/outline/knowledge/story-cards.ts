/**
 * Story Card Database
 * 故事卡数据库 - 可复用的小说结构模板
 */

/**
 * 故事卡接口
 */
export interface StoryCard {
  id: string;
  name: string;
  category: 'combat' | 'romance' | 'growth' | 'mystery' | 'daily' | 'emotional';
  description: string;
  structure: {
    setup: string;
    development: string;
    climax: string;
    resolution: string;
  };
  emotions: string[];
  genre: string[];
  tags: string[];
  usageTips?: string[];
}

/**
 * 故事卡数据库
 */
export const STORY_CARDS: StoryCard[] = [
  // ====== 战斗类 ======
  {
    id: 'card-combat-1',
    name: '英雄救美',
    category: 'combat',
    description: '主角在危机中救下女性角色，两人关系因此产生质变',
    structure: {
      setup: '女性角色陷入危机（被围困/被追杀/被绑架）',
      development: '主角出现，与敌人战斗',
      climax: '主角战胜或智取敌人',
      resolution: '女性角色感激/倾心，关系升级',
    },
    emotions: ['紧张', '热血', '心动'],
    genre: ['玄幻', '仙侠', '都市'],
    tags: ['救美', '战斗', '暧昧', '关系升级'],
    usageTips: [
      '不要让女性角色只是等待救援，要展现她的智慧或勇气',
      '救美后不要马上表白，保持暧昧张力',
      '可以加入"她看我的眼神变了"等细节',
    ],
  },
  {
    id: 'card-combat-2',
    name: '装逼打脸',
    category: 'combat',
    description: '之前轻视主角的人被主角狠狠打脸',
    structure: {
      setup: '有人轻视/羞辱主角（通常是反派或势利眼）',
      development: '主角展示实力或身份',
      climax: '对方震惊/恐惧/后悔',
      resolution: '主角淡然处之，或给予教训',
    },
    emotions: ['爽快', '得意', '解气'],
    genre: ['玄幻', '都市', '仙侠'],
    tags: ['打脸', '身份揭露', '碾压', '爽'],
    usageTips: [
      '铺垫要足，让读者期待打脸时刻',
      '打脸方式要与之前被羞辱的方式对应',
      '主角要淡定，不能得意忘形',
      '可以加入旁观者的震惊反应',
    ],
  },
  {
    id: 'card-combat-3',
    name: '以小博大',
    category: 'combat',
    description: '主角以弱胜强，战胜远超自己的敌人',
    structure: {
      setup: '敌人实力远超主角，看起来不可能战胜',
      development: '主角利用智慧/策略/特殊能力',
      climax: '绝境中爆发出惊人实力',
      resolution: '战胜敌人，获得认可或奖励',
    },
    emotions: ['紧张', '热血', '激动'],
    genre: ['玄幻', '仙侠', '都市'],
    tags: ['越级', '战斗', '逆袭', '热血'],
    usageTips: [
      '前期要充分展现敌人的强大',
      '主角的策略要合理，不能凭空开挂',
      '战斗要有波折，不能一击必杀',
      '胜利后要给予足够的奖励和认可',
    ],
  },
  {
    id: 'card-combat-4',
    name: '临危受命',
    category: 'combat',
    description: '危机时刻，主角临危受命，力挽狂澜',
    structure: {
      setup: '团队/宗门/势力面临灭顶之灾',
      development: '原定人选无法解决，只有主角能行',
      climax: '主角挺身而出',
      resolution: '主角成功化解危机',
    },
    emotions: ['紧张', '热血', '感动'],
    genre: ['玄幻', '仙侠', '都市'],
    tags: ['危机', '担当', '拯救', '热血'],
    usageTips: [
      '危机要足够大，让读者紧张',
      '要展现"只有主角能行"的合理性',
      '可以加入其他人从质疑到认可的转变',
      '成功后要有相应的地位提升',
    ],
  },
  {
    id: 'card-combat-5',
    name: '同阶无敌',
    category: 'combat',
    description: '主角在同等级中无敌，展现压倒性优势',
    structure: {
      setup: '有同阶对手挑战或比试',
      development: '双方交手，对手自信满满',
      climax: '主角轻松碾压',
      resolution: '对手震惊，旁观者哗然',
    },
    emotions: ['爽快', '自信', '得意'],
    genre: ['玄幻', '仙侠'],
    tags: ['碾压', '同阶', '实力展示'],
    usageTips: [
      '要展现主角的从容和对手的狼狈',
      '可以加入对手的心理崩溃描写',
      '旁观者的反应很重要',
    ],
  },

  // ====== 感情类 ======
  {
    id: 'card-romance-1',
    name: '欢喜冤家',
    category: 'romance',
    description: '两人从互看不顺眼到日久生情',
    structure: {
      setup: '两人因误会或立场对立而互看不顺眼',
      development: '频繁接触，争吵摩擦中逐渐了解',
      climax: '某个关键时刻一方发现心意',
      resolution: '暧昧升温或表白',
    },
    emotions: ['甜蜜', '好笑', '心动'],
    genre: ['都市', '言情', '玄幻'],
    tags: ['冤家', '暧昧', '日久生情'],
    usageTips: [
      '争吵要有趣，不能真的讨厌对方',
      '加入一些只有两人知道的秘密',
      '要有一方先心动的微妙时刻',
    ],
  },
  {
    id: 'card-romance-2',
    name: '命中注定',
    category: 'romance',
    description: '命中注定的两人相遇，冥冥之中被联系在一起',
    structure: {
      setup: '神秘的命运联系',
      development: '命运安排一次次相遇',
      climax: '命运揭示或关键时刻',
      resolution: '接受命运，情感升华',
    },
    emotions: ['神秘', '心动', '宿命'],
    genre: ['玄幻', '仙侠', '都市'],
    tags: ['命运', '缘分', '宿命'],
    usageTips: [
      '命运联系要有具体形式（契约/印记/系统等）',
      '相遇要巧妙，不能太刻意',
      '要展现"命中注定"的浪漫感',
    ],
  },
  {
    id: 'card-romance-3',
    name: '破镜重圆',
    category: 'romance',
    description: '曾经分离的两人再次相遇，旧情复燃',
    structure: {
      setup: '两人曾有过感情，因某种原因分离',
      development: '多年后重逢，各自有了变化',
      climax: '某个事件让两人直面感情',
      resolution: '放下过去，重新在一起',
    },
    emotions: ['怀念', '心疼', '甜蜜'],
    genre: ['都市', '言情'],
    tags: ['重逢', '旧情', '破镜重圆'],
    usageTips: [
      '分离的原因要让人心疼但不是渣',
      '重逢时要有戏剧张力',
      '要展现两人的成长和变化',
    ],
  },

  // ====== 成长类 ======
  {
    id: 'card-growth-1',
    name: '成长蜕变',
    category: 'growth',
    description: '主角经历重大事件后实现蜕变成长',
    structure: {
      setup: '主角处于困境或低谷',
      development: '经历磨难，获得领悟',
      climax: '突破心魔或极限',
      resolution: '实力/心境提升，展现全新面貌',
    },
    emotions: ['心疼', '激动', '骄傲'],
    genre: ['玄幻', '仙侠', '都市'],
    tags: ['成长', '蜕变', '突破'],
    usageTips: [
      '困境要真实，让读者心疼主角',
      '成长要有铺垫，不能凭空顿悟',
      '蜕变后要有明显的变化',
    ],
  },
  {
    id: 'card-growth-2',
    name: '绝境逢生',
    category: 'growth',
    description: '主角在绝境中爆发，获得重大突破',
    structure: {
      setup: '主角陷入绝境，看起来必死无疑',
      development: '激发潜能或获得机缘',
      climax: '绝地反击',
      resolution: '脱困并获得提升',
    },
    emotions: ['紧张', '激动', '爽快'],
    genre: ['玄幻', '仙侠'],
    tags: ['绝境', '爆发', '突破'],
    usageTips: [
      '绝境要足够绝望',
      '爆发要有合理性',
      '可以用"置之死地而后生"的结构',
    ],
  },
  {
    id: 'card-growth-3',
    name: '传承觉醒',
    category: 'growth',
    description: '主角获得前辈传承，实力大增',
    structure: {
      setup: '发现遗迹/遗物/遗书',
      development: '接受传承考验',
      climax: '传承完成或觉醒',
      resolution: '实力/认知提升',
    },
    emotions: ['期待', '紧张', '激动'],
    genre: ['玄幻', '仙侠'],
    tags: ['传承', '觉醒', '机缘'],
    usageTips: [
      '传承要有独特性',
      '考验要有意义',
      '觉醒要震撼',
    ],
  },

  // ====== 悬疑类 ======
  {
    id: 'card-mystery-1',
    name: '迷雾重重',
    category: 'mystery',
    description: '真相隐藏在层层迷雾中',
    structure: {
      setup: '一个谜团或疑点',
      development: '多方线索，真相若隐若现',
      climax: '关键证据出现',
      resolution: '真相大白',
    },
    emotions: ['好奇', '紧张', '恍然大悟'],
    genre: ['悬疑', '玄幻', '都市'],
    tags: ['推理', '揭秘', '悬疑'],
    usageTips: [
      '谜团要有吸引力',
      '线索要合理铺陈',
      '真相要出乎意料但又合情合理',
    ],
  },
  {
    id: 'card-mystery-2',
    name: '身份反转',
    category: 'mystery',
    description: '角色真实身份与表面不符',
    structure: {
      setup: '某人以某种身份出现',
      development: '身份受到质疑或挑战',
      climax: '真实身份揭露',
      resolution: '身份带来的影响',
    },
    emotions: ['震惊', '意外', '恍然大悟'],
    genre: ['玄幻', '都市', '悬疑'],
    tags: ['反转', '身份', '揭秘'],
    usageTips: [
      '身份反差要大',
      '铺垫要自然',
      '揭露要震撼',
    ],
  },

  // ====== 日常类 ======
  {
    id: 'card-daily-1',
    name: '温馨日常',
    category: 'daily',
    description: '紧张剧情后的温馨缓冲',
    structure: {
      setup: '战斗/危机后的平静',
      development: '日常互动，增进感情',
      climax: '某个温馨小细节',
      resolution: '角色关系更亲密',
    },
    emotions: ['温馨', '甜蜜', '治愈'],
    genre: ['玄幻', '都市', '言情'],
    tags: ['日常', '温馨', '感情'],
    usageTips: [
      '要有人物特点的展现',
      '小细节比大事件更打动人',
      '可以加入一些搞笑元素',
    ],
  },
  {
    id: 'card-daily-2',
    name: '意外收获',
    category: 'daily',
    description: '主角获得意想不到的收获',
    structure: {
      setup: '日常场景（捡漏/淘宝/探险）',
      development: '发现不寻常的东西',
      climax: '确认其价值',
      resolution: '获得收益或机缘',
    },
    emotions: ['惊喜', '期待', '兴奋'],
    genre: ['玄幻', '仙侠', '都市'],
    tags: ['捡漏', '机缘', '收获'],
    usageTips: [
      '收获要有价值感',
      '可以有"不识货"的配角对比',
      '收获要能用得上',
    ],
  },

  // ====== 情感类 ======
  {
    id: 'card-emotional-1',
    name: '离别重逢',
    category: 'emotional',
    description: '重要角色离去后的再次相遇',
    structure: {
      setup: '重要角色因某种原因离去',
      development: '主角的思念或成长',
      climax: '重逢时刻',
      resolution: '情感升华或新的开始',
    },
    emotions: ['伤感', '期待', '感动'],
    genre: ['玄幻', '都市', '言情'],
    tags: ['离别', '重逢', '情感'],
    usageTips: [
      '离别要让人不舍',
      '重逢要有戏剧性',
      '情感要真挚',
    ],
  },
  {
    id: 'card-emotional-2',
    name: '真相与假象',
    category: 'emotional',
    description: '发现一直相信的是假象',
    structure: {
      setup: '某种"真相"被广泛相信',
      development: '出现与"真相"矛盾的证据',
      climax: '真相揭露',
      resolution: '面对真实后的选择',
    },
    emotions: ['震惊', '心痛', '坚定'],
    genre: ['玄幻', '悬疑', '都市'],
    tags: ['反转', '真相', '信念'],
    usageTips: [
      '假象要看起来像真的',
      '揭露要足够震撼',
      '后续处理要有深度',
    ],
  },
];

/**
 * 获取所有故事卡
 */
export function getAllStoryCards(): StoryCard[] {
  return STORY_CARDS;
}

/**
 * 根据ID获取故事卡
 */
export function getStoryCardById(id: string): StoryCard | undefined {
  return STORY_CARDS.find(card => card.id === id);
}

/**
 * 根据分类获取故事卡
 */
export function getStoryCardsByCategory(category: StoryCard['category']): StoryCard[] {
  return STORY_CARDS.filter(card => card.category === category);
}

/**
 * 根据题材获取故事卡
 */
export function getStoryCardsByGenre(genre: string): StoryCard[] {
  return STORY_CARDS.filter(card => card.genre.includes(genre));
}

/**
 * 根据标签搜索故事卡
 */
export function searchStoryCards(query: string): StoryCard[] {
  const lowerQuery = query.toLowerCase();
  return STORY_CARDS.filter(
    card =>
      card.name.toLowerCase().includes(lowerQuery) ||
      card.description.toLowerCase().includes(lowerQuery) ||
      card.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * 获取推荐故事卡
 */
export function getRecommendedStoryCards(genre?: string, count: number = 5): StoryCard[] {
  let cards = STORY_CARDS;
  
  if (genre) {
    cards = getStoryCardsByGenre(genre);
  }
  
  return cards.slice(0, count);
}

/**
 * 故事卡组合技术
 */
export const STORY_CARD_COMBINATIONS: Record<string, string[]> = {
  '英雄救美 + 装逼打脸': ['card-combat-1', 'card-combat-2'],
  '以小博大 + 临危受命': ['card-combat-3', 'card-combat-4'],
  '英雄救美 + 命中注定': ['card-combat-1', 'card-romance-2'],
  '成长蜕变 + 传承觉醒': ['card-growth-1', 'card-growth-3'],
  '迷雾重重 + 身份反转': ['card-mystery-1', 'card-mystery-2'],
  '温馨日常 + 意外收获': ['card-daily-1', 'card-daily-2'],
  '离别重逢 + 破镜重圆': ['card-emotional-1', 'card-romance-3'],
};
