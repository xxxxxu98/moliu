/**
 * Genre Template System
 * Genre-specific templates for outline and content generation
 */

import type { Outline } from '../schemas/outline.schema';

/**
 * 题材模板接口
 */
export interface GenreTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  
  // 流派细分
  subGenres?: {
    id: string;
    name: string;
    description: string;
  }[];
  
  // 世界观设置
  worldSettings?: {
    type: string;
    description: string;
    examples: string[];
  }[];
  
  // 力量体系
  powerSystem?: {
    name: string;
    levels: string[];
    characteristics: string;
  };
  
  // 势力类型
  factionTypes?: string[];
  
  // 核心爽点
  coreCoolPoints: string[];
  
  // 节奏特点
  paceCharacteristics?: {
    opening: string;
    development: string;
    climax: string;
  };
  
  // 禁忌/毒点
  antiPatterns: string[];
  
  // 五步法建议
  fiveStepGuidance?: {
    emotionGoal: string[];
    coreSetting: string[];
    protagonist: string[];
    storyStructure: string[];
    coolPointArrangement: string[];
  };
  
  // 提示词模板
  promptTemplates?: {
    system: string;
    user: string;
  };
}

/**
 * 内置题材模板
 */
export const genreTemplates: Record<string, GenreTemplate> = {
  // ====== 玄幻/修仙 ======
  '玄幻': {
    id: 'xuanhuan',
    name: '玄幻',
    category: '玄幻',
    description: '异世界修炼升级，热血战斗与奇遇',
    
    subGenres: [
      { id: 'fanliu', name: '凡人流', description: '主角资质平平，靠算计、谨慎和金手指逆袭' },
      { id: 'wudi', name: '无敌流', description: '开局即巅峰，一路横推' },
      { id: 'jiazu', name: '家族流', description: '主角带领家族崛起，种田经营' },
      { id: 'goudao', name: '苟道流', description: '绝不沾因果，把防御点满' },
    ],
    
    worldSettings: [
      { type: '修仙世界', description: '灵气充沛的玄幻世界', examples: ['天元大陆', '玄黄界'] },
      { type: '王朝世界', description: '皇朝更迭的乱世', examples: ['大周皇朝', '神武帝国'] },
    ],
    
    powerSystem: {
      name: '修炼体系',
      levels: ['淬体', '聚气', '化灵', '神海', '通天', '王者', '皇者', '帝境'],
      characteristics: '每境九重，逐级突破，境界压制明显',
    },
    
    factionTypes: ['宗门', '世家', '王朝', '散修联盟', '妖族部落', '远古势力'],
    
    coreCoolPoints: [
      '境界碾压 - 以弱胜强的快感',
      '底牌揭晓 - 隐藏实力的爆发',
      '因果兑现 - 前文伏笔的回收',
      '秘宝获得 - 天降机缘的惊喜',
      '仇人跪地 - 复仇打脸的痛快',
    ],
    
    paceCharacteristics: {
      opening: '前3章确定金手指，快速进入修炼状态',
      development: '每50章一个境界提升，每100章一个大的秘境探索',
      climax: '生死之战 + 越级挑战 + 底牌揭晓',
    },
    
    antiPatterns: [
      '前期无敌后劲不足',
      '境界提升太快失去紧张感',
      '战斗描写过于简单',
      '配角智商下线',
      '女主沦为工具人',
    ],
    
    fiveStepGuidance: {
      emotionGoal: ['热血沸腾', '逆袭快感', '爽感释放'],
      coreSetting: ['灵气复苏的玄幻世界', '独特的修炼体系', '宗门/家族/散修的选择'],
      protagonist: ['资质平凡但心性坚韧', '拥有独特金手指', '有明确的目标和动机'],
      storyStructure: ['境界递进 + 秘境探险 + 势力争斗', '危机 → 突破 → 新危机'],
      coolPointArrangement: ['每10章至少一个小爽点', '每50章一个大高潮'],
    },
  },
  
  '仙侠': {
    id: 'xianxia',
    name: '仙侠',
    category: '玄幻',
    description: '修真问道，斩妖除魔，长生之路',
    
    subGenres: [
      { id: 'chuanyue', name: '穿越修仙', description: '现代人穿越到修仙世界' },
      { id: 'tongren', name: '同人修仙', description: '基于已有作品的修仙世界' },
    ],
    
    powerSystem: {
      name: '修真体系',
      levels: ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'],
      characteristics: '逆天而行，每步都有风险，雷劫考验',
    },
    
    factionTypes: ['正道宗门', '魔道宗门', '散修', '妖族', '鬼修', '上古仙门'],
    
    coreCoolPoints: [
      '境界突破 - 突破时的爽感',
      '仙剑法宝 - 神兵利器在手',
      '斩妖除魔 - 正道担当',
      '长生久视 - 寿元提升',
    ],
    
    antiPatterns: [
      '打怪升级太单调',
      '感情线太狗血',
      '正邪对立太脸谱化',
    ],
  },
  
  // ====== 都市 ======
  '都市': {
    id: 'dushi',
    name: '都市',
    category: '都市',
    description: '现代都市背景的各类故事',
    
    subGenres: [
      { id: 'yigneng', name: '都市异能', description: '灵气复苏，超凡觉醒' },
      { id: 'naodong', name: '都市脑洞', description: '各种奇葩设定，创意取胜' },
      { id: 'richang', name: '都市日常', description: '温馨日常，轻喜剧风格' },
      { id: 'gaowu', name: '高武都市', description: '都市背景但武力值极高' },
    ],
    
    worldSettings: [
      { type: '现代都市', description: '熟悉的现代城市背景', examples: ['北上广深', '二三线城市'] },
      { type: '灵气复苏', description: '现代都市+超凡力量', examples: ['都市修仙世界'] },
    ],
    
    coreCoolPoints: [
      '异能展示 - 超出常人的能力',
      '打脸嘲讽 - 逆袭的快感',
      '美女倒追 - 感情线的推进',
      '权贵臣服 - 身份地位的提升',
    ],
    
    antiPatterns: [
      '金手指无代价',
      '主角无敌太无聊',
      '配角太弱智',
    ],
  },
  
  '都市异能': {
    id: 'dushi-yineng',
    name: '都市异能',
    category: '都市',
    description: '灵气复苏背景下的都市生活',
    
    worldSettings: [
      {
        type: '灵气复苏三阶段',
        description: '灵气浓度逐步上升的世界',
        examples: [
          '隐秘期：异能者极少，被官方管控',
          '爆发期：觉醒者井喷，社会动荡',
          '新秩序期：异能成为常态，建立基地市',
        ],
      },
    ],
    
    factionTypes: [
      '官方机构(龙组/特管局)',
      '民间组织(财团/教派/公会)',
      '妖兽势力',
      '野生异能者',
    ],
    
    coreCoolPoints: [
      '异能展示 - 第一次觉醒的震撼',
      '打脸嘲讽 - 用异能碾压对手',
      '发现规则漏洞 - 智取胜过蛮力',
      '预判布局 - 三章前的伏笔',
    ],
    
    paceCharacteristics: {
      opening: '快速展示异能，2-3章内让主角意识到世界变了',
      development: '异能成长 + 社会适应 + 势力博弈',
      climax: '大型势力对抗 + 异能展示 + 关键抉择',
    },
    
    antiPatterns: [
      '异能太强没有成长空间',
      '社会反应太慢或太快',
      '战斗描写太简单',
    ],
  },
  
  // ====== 言情 ======
  '言情': {
    id: 'yanqing',
    name: '言情',
    category: '言情',
    description: '爱情故事，情感纠葛',
    
    subGenres: [
      { id: 'guyan', name: '古言', description: '古代背景的言情故事' },
      { id: 'gongdou', name: '宫斗宅斗', description: '宫廷/家族内的争斗' },
      { id: 'qingchun', name: '青春甜宠', description: '校园/青春恋爱' },
      { id: 'haomen', name: '豪门总裁', description: '霸道总裁类' },
      { id: 'gouxue', name: '狗血言情', description: '各种狗血元素' },
    ],
    
    coreCoolPoints: [
      '甜蜜互动 - 心动的感觉',
      '误会解除 - 真相大白',
      '关系突破 - 感情升温',
      '误会产生 - 制造张力',
    ],
    
    antiPatterns: [
      '太甜无味',
      '太虐心累',
      '误会太脑残',
      '配角破坏感情',
    ],
  },
  
  '古言': {
    id: 'guyan',
    name: '古言',
    category: '言情',
    description: '古代背景的言情小说',
    
    worldSettings: [
      { type: '王朝', description: '古代皇朝背景', examples: ['架空王朝', '历史改编'] },
      { type: '江湖', description: '江湖门派背景', examples: ['武林门派', '江湖势力'] },
    ],
    
    factionTypes: ['皇室', '世家', '江湖门派', '商贾', '民间'],
    
    coreCoolPoints: [
      '身份逆袭 - 从卑微到尊贵',
      '权谋争斗 - 智斗取胜',
      '感情纠葛 - 多角关系',
      '误会与真相 - 虐心情节',
    ],
    
    paceCharacteristics: {
      opening: '2-3章内让男女主产生交集',
      development: '误会 + 和解 + 感情升温循环',
      climax: '身份揭露 + 重大抉择 + 感情确认',
    },
    
    antiPatterns: [
      '节奏太慢',
      '宫斗太幼稚',
      '感情太狗血',
    ],
  },
  
  // ====== 悬疑 ======
  '悬疑': {
    id: 'xuanyi',
    name: '悬疑',
    category: '悬疑',
    description: '解谜探案，紧张刺激',
    
    subGenres: [
      { id: 'tuili', name: '推理', description: '逻辑推理破案' },
      { id: 'lingyi', name: '灵异', description: '鬼怪灵异事件' },
      { id: 'naodong', name: '悬疑脑洞', description: '创意悬疑设定' },
    ],
    
    coreCoolPoints: [
      '真相揭示 - 恍然大悟',
      '规则反用 - 出人意料',
      '误导反转 - 意想不到',
      '身份逆转 - 原来是他',
    ],
    
    antiPatterns: [
      '线索太明显',
      '反转太突兀',
      '逻辑不通',
    ],
  },
  
  '规则怪谈': {
    id: 'guize-guaitan',
    name: '规则怪谈',
    category: '悬疑',
    description: '遵循规则求生的恐怖故事',
    
    worldSettings: [
      {
        type: '怪谈空间',
        description: '充满诡异规则的空间',
        examples: ['诡异小区', '恐怖学校', '禁忌医院'],
      },
    ],
    
    coreCoolPoints: [
      '规则反用 - 发现规则漏洞',
      '绝境求生 - 智取胜过武力',
      '真相揭示 - 规则背后的秘密',
      '身份危机 - 自我认知动摇',
    ],
    
    paceCharacteristics: {
      opening: '第1章就进入怪谈空间，快速建立紧张感',
      development: '规则探索 + 危机应对 + 逐步揭示真相',
      climax: '规则崩溃 + 身份揭露 + 逃出生天或更大的真相',
    },
    
    antiPatterns: [
      '规则太简单',
      '恐怖感太弱',
      '主角太强',
    ],
  },
  
  // ====== 游戏/电竞 ======
  '电竞': {
    id: 'dianjing',
    name: '电竞',
    category: '游戏',
    description: '游戏相关的竞技故事',
    
    worldSettings: [
      { type: '电竞圈', description: '职业电竞世界', examples: ['LOL/DOTA/王者荣耀职业圈'] },
    ],
    
    coreCoolPoints: [
      '逆风翻盘 - 绝境取胜',
      '实力认证 - 获得认可',
      '团队配合 - 默契战斗',
      '对手对决 - 宿敌之战',
    ],
    
    antiPatterns: [
      '游戏描写太水',
      '对手太弱',
      '成长太快',
    ],
  },
  
  // ====== 历史 ======
  '历史': {
    id: 'lishi',
    name: '历史',
    category: '历史',
    description: '历史背景的穿越或改编',
    
    subGenres: [
      { id: 'gudai', name: '历史古代', description: '古代背景' },
      { id: 'minguo', name: '民国', description: '民国背景' },
      { id: 'kangzhan', name: '抗战谍战', description: '抗日战争时期' },
    ],
    
    coreCoolPoints: [
      '历史改写 - 蝴蝶效应',
      '身份逆袭 - 改变命运',
      '权谋争斗 - 朝堂博弈',
      '文明建设 - 推动历史',
    ],
    
    antiPatterns: [
      '历史常识错误',
      '穿越太万能',
      '节奏太慢',
    ],
  },
};

/**
 * 获取题材模板
 */
export function getGenreTemplate(genre: string): GenreTemplate | undefined {
  return genreTemplates[genre];
}

/**
 * 获取所有题材
 */
export function getAllGenres(): string[] {
  return Object.keys(genreTemplates);
}

/**
 * 获取题材分类
 */
export function getGenresByCategory(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  
  for (const [name, template] of Object.entries(genreTemplates)) {
    if (!result[template.category]) {
      result[template.category] = [];
    }
    result[template.category].push(name);
  }
  
  return result;
}

/**
 * 构建题材特定提示词
 */
export function buildGenreSpecificPrompt(
  template: GenreTemplate,
  context: {
    type: 'quick_outline' | 'volume' | 'chapter' | 'writing';
    params: Record<string, string>;
  }
): { system: string; user: string } {
  const { type, params } = context;
  
  // 默认系统提示词
  let systemPrompt = template.promptTemplates?.system || getDefaultSystemPrompt(template);
  
  // 替换变量
  for (const [key, value] of Object.entries(params)) {
    systemPrompt = systemPrompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  
  const userPrompt = template.promptTemplates?.user || generateDefaultUserPrompt(template, type, params);
  
  return { system: systemPrompt, user: userPrompt };
}

/**
 * 获取默认系统提示词
 */
function getDefaultSystemPrompt(template: GenreTemplate): string {
  return `你是一位专业的${template.name}小说作家。你的任务是帮助用户创作${template.name}小说。

【题材特点】
${template.description}
${template.subGenres ? `\n可选流派：${template.subGenres.map(s => `${s.name}(${s.description})`).join('、')}` : ''}

【核心爽点】
${template.coreCoolPoints.join('、')}

${template.powerSystem ? `
【力量体系】
${template.powerSystem.name}：${template.powerSystem.levels.join(' → ')}
${template.powerSystem.characteristics}
` : ''}

${template.factionTypes ? `
【势力类型】
${template.factionTypes.join('、')}
` : ''}

【写作要求】
${template.paceCharacteristics?.opening ? `
- 开篇：${template.paceCharacteristics.opening}
` : ''}
- ${template.antiPatterns.length > 0 ? `禁忌：${template.antiPatterns[0]}` : ''}
- 保持情节紧凑，避免注水`;
}

/**
 * 生成默认用户提示词
 */
function generateDefaultUserPrompt(
  template: GenreTemplate,
  type: string,
  params: Record<string, string>
): string {
  switch (type) {
    case 'quick_outline':
      return `请根据以下创意生成${template.name}小说的故事大纲：\n\n${params.seed || ''}`;
    
    case 'volume':
      return `请为第${params.volumeNumber || '1'}卷生成详细大纲`;
    
    case 'chapter':
      return `请为第${params.chapterNumber || '1'}章生成章纲`;
    
    default:
      return params.seed || '';
  }
}
