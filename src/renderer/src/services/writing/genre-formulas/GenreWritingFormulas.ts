/**
 * 题材专属写法公式库
 * 参考 oh-story 的题材写作技法
 * 
 * 每种题材都有独特的爽点模式、节奏特点和读者期待
 */

import type { CoolPointType } from '@/types/evaluation';

// ============================================================
// 类型定义
// ============================================================

/**
 * 章节结构
 */
export interface ChapterStructure {
  opening: {
    hookType: string[];
    requiredElements: string[];
    avoidElements: string[];
    targetWordCount: [number, number];  // 目标字数范围
  };
  middle: {
    pacing: 'fast' | 'medium' | 'slow';
    conflictFrequency: number;  // 每千字冲突次数
    dialogueRatio: [number, number];  // 对话比例范围
    sceneChangeFrequency: number;  // 每千字场景切换次数
  };
  ending: {
    hookType: string[];
    cliffhangerIntensity: number;  // 1-10
    cliffhangerTypes: string[];
    avoidElements: string[];
  };
}

/**
 * 角色模板
 */
export interface CharacterTemplate {
  name: string;
  description: string;
  traits: string[];
  arc: string[];
  speechStyle: string;
  appearanceTips?: string[];
}

/**
 * 爽点节奏
 */
export interface CoolPointRhythm {
  density: {
    minimum: number;
    optimal: number;
    maximum: number;
  };
  comboInterval: number;  // 爽点Combo间隔（章数）
  climaxChapterRatio: number;  // 高潮章节比例
}

/**
 * 世界观构建
 */
export interface WorldBuilding {
  coreElements: string[];
  revealPacing: 'fast' | 'gradual' | 'delayed';
  mysteryLevel: number;  // 1-10
  powerSystem?: string;  // 如果有修炼体系
}

/**
 * 禁忌清单
 */
export interface TabooList {
  avoidPlots: string[];
  avoidCharacters: string[];
  avoidStyles: string[];
}

/**
 * 题材写法公式
 */
export interface GenreWritingFormula {
  id: string;
  name: string;
  displayName: string;
  description: string;
  targetAudience: string[];
  
  // 核心爽点
  coreCoolPoints: CoolPointType[];
  coolPointRhythm: CoolPointRhythm;
  
  // 章节结构
  chapterStructure: ChapterStructure;
  
  // 角色模板
  characterTemplates: {
    protagonist: CharacterTemplate;
    antagonist: CharacterTemplate[];
    loveInterest?: CharacterTemplate[];
    supporting?: CharacterTemplate[];
  };
  
  // 世界观
  worldBuilding: WorldBuilding;
  
  // 禁忌
  taboos: TabooList;
  
  // 成功要素
  successPatterns: string[];
  failurePatterns: string[];
  
  // 节奏指导
  pacingGuidance: {
    tensionRelease: string;
    cliffhangerFrequency: number;
    actionDialogueBalance: string;
  };
}

// ============================================================
// 题材公式库
// ============================================================

export const GENRE_WRITING_FORMULAS: Record<string, GenreWritingFormula> = {
  // ============================================================
  // 都市修仙
  // ============================================================
  'urban-cultivation': {
    id: 'urban-cultivation',
    name: 'urban-cultivation',
    displayName: '都市修仙',
    description: '现代都市背景下的修仙故事，主角在都市中修炼成长',
    targetAudience: ['男性向', '18-35岁', '喜欢升级流', '喜欢都市背景'],
    
    coreCoolPoints: ['face-slapping', 'show-off', 'identity-reveal', 'growth', 'power-display', 'treasure-find'],
    
    coolPointRhythm: {
      density: { minimum: 1.5, optimal: 2.5, maximum: 4 },
      comboInterval: 3,
      climaxChapterRatio: 0.2,
    },
    
    chapterStructure: {
      opening: {
        hookType: ['conflict', 'mystery', 'identity', 'power-display'],
        requiredElements: ['主角处境', '金手指暗示', '冲突起点', '都市背景'],
        avoidElements: ['冗长世界观介绍', '平淡日常', '开局太弱'],
        targetWordCount: [300, 500],
      },
      middle: {
        pacing: 'fast',
        conflictFrequency: 1.5,
        dialogueRatio: [0.3, 0.5],
        sceneChangeFrequency: 2,
      },
      ending: {
        hookType: ['cliffhanger', 'identity-reveal', 'threat', 'breakthrough'],
        cliffhangerIntensity: 8,
        cliffhangerTypes: ['强敌出现', '身份曝光', '危机降临', '境界突破', '神秘机缘'],
        avoidElements: ['总结升华', '说教', '情绪感慨'],
      },
    },
    
    characterTemplates: {
      protagonist: {
        name: '隐藏实力型',
        description: '表面普通低调，实则实力强横',
        traits: ['低调', '腹黑', '护短', '果断', '重情义'],
        arc: ['废柴/隐藏身份', '实力逐渐显露', '打脸众人', '登顶巅峰'],
        speechStyle: '简洁有力，关键时刻一针见血，偶尔嘲讽',
        appearanceTips: ['普通装扮掩盖气质', '眼神深邃'],
      },
      antagonist: [
        {
          name: '世家子弟',
          description: '出身大家族，狂妄自大',
          traits: ['狂妄', '欺软怕硬', '心胸狭窄', '愚昧无知'],
          arc: ['挑衅主角', '被主角打脸', '叫人来报复', '再次被打脸', '怀恨在心'],
          speechStyle: '傲慢嘲讽，目中无人',
        },
        {
          name: '隐藏BOSS',
          description: '幕后黑手，表面和善',
          traits: ['阴险', '伪装', '野心勃勃', '心狠手辣'],
          arc: ['布局谋划', '暗中使坏', '被主角发现', '撕破脸皮'],
          speechStyle: '客气阴冷，绵里藏针',
        },
      ],
      loveInterest: [
        {
          name: '冰山美人',
          description: '高冷外表，内心火热',
          traits: ['高冷', '外冷内热', '独立', '能力出众'],
          arc: ['与主角相遇', '产生误会', '逐渐改观', '暗生情愫', '倒追主角'],
          speechStyle: '冷淡简洁，但只在主角面前流露情绪',
        },
      ],
    },
    
    worldBuilding: {
      coreElements: ['修炼境界', '势力分布（古武世家/隐世宗门）', '机缘秘境', '都市隐藏势力'],
      revealPacing: 'gradual',
      mysteryLevel: 6,
      powerSystem: '古武修炼：外劲/内劲/化境/...',
    },
    
    taboos: {
      avoidPlots: ['主角长期被动挨打', '感情线拖沓', '升级太慢', '没有爽点', '被打脸后没有反击'],
      avoidCharacters: ['圣母主角', '无脑反派', '工具人女主'],
      avoidStyles: ['流水账日常', '冗长的修炼描写', '过多的内心独白'],
    },
    
    successPatterns: ['金手指独特', '打脸爽快', '爽点密集', '节奏明快', '感情线甜'],
    failurePatterns: ['打脸不够爽', '节奏拖沓', '主角太憋屈', '反派太弱智'],
    
    pacingGuidance: {
      tensionRelease: '紧张-释放-紧张交替，每3-5章有一个小高潮',
      cliffhangerFrequency: '每章必留悬念，可大可小',
      actionDialogueBalance: '动作戏占40%，对话占30%，描写占30%',
    },
  },

  // ============================================================
  // 都市言情
  // ============================================================
  'urban-romance': {
    id: 'urban-romance',
    name: 'urban-romance',
    displayName: '都市言情',
    description: '现代都市背景下的爱情故事，强调情感互动和甜蜜日常',
    targetAudience: ['女性向', '18-40岁', '喜欢甜宠', '喜欢浪漫'],
    
    coreCoolPoints: ['love-progress', 'show-off', 'identity-reveal', 'face-slapping'],
    
    coolPointRhythm: {
      density: { minimum: 0.8, optimal: 1.5, maximum: 3 },
      comboInterval: 5,
      climaxChapterRatio: 0.15,
    },
    
    chapterStructure: {
      opening: {
        hookType: ['meet-cute', 'misunderstanding', 'contract', 'reunion'],
        requiredElements: ['初遇场景', '心动的暗示', '后续联系', '甜蜜互动'],
        avoidElements: ['一见钟情太直白', '无脑傻白甜女主', '玛丽苏设定'],
        targetWordCount: [300, 600],
      },
      middle: {
        pacing: 'medium',
        conflictFrequency: 0.8,
        dialogueRatio: [0.4, 0.6],
        sceneChangeFrequency: 1.5,
      },
      ending: {
        hookType: ['kiss', 'confession', 'crisis', 'sweet'],
        cliffhangerIntensity: 6,
        cliffhangerTypes: ['误会加深', '情敌出现', '身世揭秘', '甜蜜互动', '求婚暗示'],
        avoidElements: ['虐心过度', '误会太久', '出轨剧情', 'BE结局'],
      },
    },
    
    characterTemplates: {
      protagonist: {
        name: '坚韧女主',
        description: '外表柔弱内心坚强，有独立人格',
        traits: ['独立', '善良', '有小脾气', '自尊自爱', '聪明'],
        arc: ['平凡生活', '遇见男主', '经历波折', '互相成长', '事业爱情双丰收'],
        speechStyle: '活泼可爱，偶尔毒舌，但有分寸',
        appearanceTips: ['清新自然', '不妖艳', '有气质'],
      },
      antagonist: [
        {
          name: '恶毒女配',
          description: '心机深沉，嫉妒女主',
          traits: ['心机', '善妒', '虚伪', '恶毒'],
          arc: ['陷害女主', '被揭穿', '身败名裂'],
          speechStyle: '表面温柔实则尖酸',
        },
      ],
      loveInterest: [
        {
          name: '霸道总裁',
          description: '外表冷酷实则宠溺',
          traits: ['高冷', '霸道', '宠溺', '专一', '有能力'],
          arc: ['嫌弃/误会', '产生好奇', '动心', '表白', '甜蜜日常'],
          speechStyle: '命令式但充满宠溺，行动比言语更直接',
        },
      ],
    },
    
    worldBuilding: {
      coreElements: ['职场背景', '豪门世家', '男主身份', '家族纷争'],
      revealPacing: 'gradual',
      mysteryLevel: 5,
    },
    
    taboos: {
      avoidPlots: ['女主太傻白甜', '男主太渣', '虐心过度', '误会超过10章', '出轨/劈腿'],
      avoidCharacters: ['圣母女主', '无脑恶毒女配', '工具人男主'],
      avoidStyles: ['过度玛丽苏', '男主对所有人高冷只对女主好太刻意', '女主没有任何成长'],
    },
    
    successPatterns: ['甜而不腻', '互动有趣', '男主宠溺', '女主人设讨喜', '误会化解自然'],
    failurePatterns: ['太虐', '误会太多太狗血', '女主人设崩塌', '甜度不够'],
    
    pacingGuidance: {
      tensionRelease: '甜为主，虐为辅，虐后必有糖',
      cliffhangerFrequency: '每3-5章一个小高潮',
      actionDialogueBalance: '对话戏占50%，动作描写占30%，心理描写占20%',
    },
  },

  // ============================================================
  // 玄幻
  // ============================================================
  xuanhuan: {
    id: 'xuanhuan',
    name: 'xuanhuan',
    displayName: '玄幻',
    description: '异世界背景的修炼成长故事，主角从弱到强',
    targetAudience: ['男性向', '16-35岁', '喜欢升级战斗', '喜欢异世界'],
    
    coreCoolPoints: ['growth', 'power-display', 'face-slapping', 'treasure-find', 'show-off'],
    
    coolPointRhythm: {
      density: { minimum: 1.2, optimal: 2, maximum: 3.5 },
      comboInterval: 4,
      climaxChapterRatio: 0.25,
    },
    
    chapterStructure: {
      opening: {
        hookType: ['rebirth', 'system', 'disaster', 'mystery'],
        requiredElements: ['世界观一角', '主角处境', '修炼目标', '金手指'],
        avoidElements: ['开局太弱', '没有目标', '冗长设定'],
        targetWordCount: [300, 600],
      },
      middle: {
        pacing: 'fast',
        conflictFrequency: 1.2,
        dialogueRatio: [0.25, 0.4],
        sceneChangeFrequency: 2.5,
      },
      ending: {
        hookType: ['breakthrough', 'treasure-appear', 'enemy-appear', 'revelation'],
        cliffhangerIntensity: 9,
        cliffhangerTypes: ['秘境开启', '强敌现身', '境界突破', '宝物现世', '身世揭秘'],
        avoidElements: ['流水账', '打斗过程太长', '重复修炼'],
      },
    },
    
    characterTemplates: {
      protagonist: {
        name: '逆袭型',
        description: '从弱者成长为强者的经典模板',
        traits: ['坚韧', '智慧', '杀伐果断', '重情义', '有底线'],
        arc: ['废物/被欺', '获得机缘', '快速成长', '越级挑战', '登顶成神'],
        speechStyle: '沉稳内敛，关键时刻一针见血，不废话',
        appearanceTips: ['初期平凡', '后期气质改变'],
      },
      antagonist: [
        {
          name: '宗门天骄',
          description: '出身大势力，自视甚高',
          traits: ['高傲', '心胸狭窄', '轻视弱者', '天才'],
          arc: ['打压主角', '被打脸', '叫长辈', '长辈也被打脸', '后悔嫉妒'],
          speechStyle: '高高在上，嘲讽',
        },
        {
          name: '老怪物',
          description: '隐藏BOSS，实力恐怖',
          traits: ['阴险', '隐忍', '野心', '谨慎'],
          arc: ['布局万年', '暗害主角', '被主角发现', '终极对决'],
          speechStyle: '平淡中透露威严',
        },
      ],
    },
    
    worldBuilding: {
      coreElements: ['修炼体系（炼气/筑基/金丹...）', '势力版图（宗门/家族/帝国）', '秘境界面', '天地奇物'],
      revealPacing: 'gradual',
      mysteryLevel: 7,
      powerSystem: '修炼境界：炼气-筑基-金丹-元婴-化神-大乘-渡劫-真仙',
    },
    
    taboos: {
      avoidPlots: ['主角优柔寡断', '升级太慢', '战斗太水', '机缘太容易', '一直越级挑战'],
      avoidCharacters: ['圣母主角', '无脑反派', '红颜太多'],
      avoidStyles: ['修炼过程流水账', '打斗过程拖沓', '过多的打脸铺垫'],
    },
    
    successPatterns: ['升级体系独特', '战斗精彩', '爽点密集', '机缘设定有趣', '配角出彩'],
    failurePatterns: ['升级太慢太无聊', '战斗描写重复', '主角光环太强没悬念'],
    
    pacingGuidance: {
      tensionRelease: '战斗-收获-消化交替，大战间隔3-5章',
      cliffhangerFrequency: '每章必有收获或悬念',
      actionDialogueBalance: '战斗动作占50%，对话占20%，描写占30%',
    },
  },

  // ============================================================
  // 悬疑
  // ============================================================
  mystery: {
    id: 'mystery',
    name: 'mystery',
    displayName: '悬疑',
    description: '以推理和揭秘为核心的悬疑故事',
    targetAudience: ['通用', '20-45岁', '喜欢烧脑', '喜欢推理'],
    
    coreCoolPoints: ['mystery-reveal', 'identity-reveal', 'reversal'],
    
    coolPointRhythm: {
      density: { minimum: 0.5, optimal: 1, maximum: 2 },
      comboInterval: 8,
      climaxChapterRatio: 0.3,
    },
    
    chapterStructure: {
      opening: {
        hookType: ['crime', 'mystery', 'question', 'suspense'],
        requiredElements: ['悬念起点', '关键线索', '推理方向', '嫌疑人'],
        avoidElements: ['线索给太明显', '没有悬念', '开局就知道凶手'],
        targetWordCount: [400, 700],
      },
      middle: {
        pacing: 'slow',
        conflictFrequency: 0.5,
        dialogueRatio: [0.3, 0.5],
        sceneChangeFrequency: 1,
      },
      ending: {
        hookType: ['clue', 'twist', 'question', 'revelation'],
        cliffhangerIntensity: 9,
        cliffhangerTypes: ['新线索', '反转', '更大谜团', '嫌疑人死亡', '主角涉险'],
        avoidElements: ['突然破案', '凶手太容易猜', '线索突兀出现'],
      },
    },
    
    characterTemplates: {
      protagonist: {
        name: '推理达人',
        description: '冷静敏锐的侦探角色',
        traits: ['冷静', '敏锐', '执着', '智慧', '正义感'],
        arc: ['接手案件', '调查取证', '分析推理', '遭遇挫折', '真相大白'],
        speechStyle: '理性分析，严谨，有条理，偶尔幽默',
      },
    },
    
    worldBuilding: {
      coreElements: ['案件背景', '嫌疑人关系', '隐藏真相', '时间线'],
      revealPacing: 'slow',
      mysteryLevel: 10,
    },
    
    taboos: {
      avoidPlots: ['推理太简单', '凶手太好猜', 'bug太多', '线索突兀', '主角开挂'],
      avoidCharacters: ['过于完美的侦探', '脸谱化的嫌疑人'],
      avoidStyles: ['过快破案', '过多巧合', '机械降神'],
    },
    
    successPatterns: ['案件精彩', '反转合理', '悬念十足', '推理严谨', '细节到位'],
    failurePatterns: ['推理漏洞', '凶手太明显', '反转太刻意', '线索不公平'],
    
    pacingGuidance: {
      tensionRelease: '悬念-小进展-更大悬念，逐步升级',
      cliffhangerFrequency: '每3-5章一个反转或新发现',
      actionDialogueBalance: '对话推理占40%，调查描写占30%，心理活动占30%',
    },
  },

  // ============================================================
  // 科幻
  // ============================================================
  scifi: {
    id: 'scifi',
    name: 'scifi',
    displayName: '科幻',
    description: '未来科技背景的冒险故事',
    targetAudience: ['男性向', '18-40岁', '喜欢科技', '喜欢冒险'],
    
    coreCoolPoints: ['growth', 'power-display', 'mystery-reveal', 'identity-reveal'],
    
    coolPointRhythm: {
      density: { minimum: 1, optimal: 1.8, maximum: 3 },
      comboInterval: 4,
      climaxChapterRatio: 0.2,
    },
    
    chapterStructure: {
      opening: {
        hookType: ['tech-mystery', 'alien-contact', 'system-awakening', 'crisis'],
        requiredElements: ['科技背景', '主角处境', '科技悬念', '探索方向'],
        avoidElements: ['过多科技术语', '设定太复杂', '开局太乱'],
        targetWordCount: [300, 600],
      },
      middle: {
        pacing: 'fast',
        conflictFrequency: 1,
        dialogueRatio: [0.3, 0.45],
        sceneChangeFrequency: 2,
      },
      ending: {
        hookType: ['discovery', 'tech-reveal', 'crisis', 'alliance'],
        cliffhangerIntensity: 8,
        cliffhangerTypes: ['新科技发现', '外星接触', '危机降临', '势力格局变化'],
        avoidElements: ['科技解释太长', '设定轰炸'],
      },
    },
    
    characterTemplates: {
      protagonist: {
        name: '科技达人',
        description: '精通科技，不断突破',
        traits: ['智慧', '好奇心', '勇敢', '创新', '冒险精神'],
        arc: ['普通人', '接触科技', '快速成长', '探索未知', '改变世界'],
        speechStyle: '专业但不晦涩，对科技充满热情',
      },
    },
    
    worldBuilding: {
      coreElements: ['科技体系', '星际格局', '未来社会', '外星文明'],
      revealPacing: 'gradual',
      mysteryLevel: 8,
    },
    
    taboos: {
      avoidPlots: ['科技太神棍', '设定前后矛盾', '科技解释太枯燥'],
      avoidCharacters: ['科技万能', '没有弱点'],
      avoidStyles: ['过多技术细节', '设定说明书'],
    },
    
    successPatterns: ['科技设定有趣', '探索感强', '爽点与悬念并存', '世界观宏大'],
    failurePatterns: ['科技太离谱', '设定太枯燥', '缺乏情感'],
    
    pacingGuidance: {
      tensionRelease: '探索-发现-危机交替，科技与冒险并重',
      cliffhangerFrequency: '每章有新发现或危机',
      actionDialogueBalance: '科技展示占30%，冒险占40%，对话占30%',
    },
  },

  // ============================================================
  // 游戏异界
  // ============================================================
  'game-isekai': {
    id: 'game-isekai',
    name: 'game-isekai',
    displayName: '游戏异界',
    description: '穿越到游戏世界或拥有游戏能力',
    targetAudience: ['男性向', '16-35岁', '喜欢游戏', '喜欢升级'],
    
    coreCoolPoints: ['growth', 'power-display', 'face-slapping', 'show-off', 'treasure-find'],
    
    coolPointRhythm: {
      density: { minimum: 1.5, optimal: 2.5, maximum: 4 },
      comboInterval: 3,
      climaxChapterRatio: 0.2,
    },
    
    chapterStructure: {
      opening: {
        hookType: ['system-awakening', 'isekai', 'game-start', 'level-up'],
        requiredElements: ['游戏设定', '主角能力', '成长目标', '首个任务'],
        avoidElements: ['游戏说明太长', '开局送装备太多'],
        targetWordCount: [300, 500],
      },
      middle: {
        pacing: 'fast',
        conflictFrequency: 1.5,
        dialogueRatio: [0.25, 0.4],
        sceneChangeFrequency: 2,
      },
      ending: {
        hookType: ['level-up', 'rare-drop', 'boss-appear', 'new-zone'],
        cliffhangerIntensity: 8,
        cliffhangerTypes: ['升级突破', '稀有掉落', 'BOSS出现', '新地图开启'],
        avoidElements: ['任务太简单', '奖励太容易'],
      },
    },
    
    characterTemplates: {
      protagonist: {
        name: '玩家型',
        description: '精通游戏机制的玩家视角',
        traits: ['精通游戏', '冷静分析', '利益至上', '策略流'],
        arc: ['穿越/觉醒', '熟悉设定', '快速升级', '攻略副本', '成为强者'],
        speechStyle: '玩家视角，经常用游戏术语，冷静分析利弊',
      },
    },
    
    worldBuilding: {
      coreElements: ['游戏系统', '副本设定', '等级制度', '装备体系', '技能树'],
      revealPacing: 'gradual',
      mysteryLevel: 5,
    },
    
    taboos: {
      avoidPlots: ['游戏说明太多', '任务太简单', '奖励太容易获得'],
      avoidCharacters: ['无敌系统', '开挂太明显'],
      avoidStyles: ['流水账刷怪', '过多的系统提示', '数字堆砌'],
    },
    
    successPatterns: ['游戏设定有趣', '升级有快感', '副本设计精彩', '策略性强'],
    failurePatterns: ['设定太复杂', '升级没感觉', '打怪太水'],
    
    pacingGuidance: {
      tensionRelease: '任务-战斗-收获-升级交替，副本节奏要紧凑',
      cliffhangerFrequency: '每个副本结束留悬念',
      actionDialogueBalance: '战斗占50%，系统提示占10%，对话占40%',
    },
  },

  // ============================================================
  // 历史穿越
  // ============================================================
  'historical': {
    id: 'historical',
    name: 'historical',
    displayName: '历史穿越',
    description: '穿越到古代历史时期的故事',
    targetAudience: ['通用', '18-45岁', '喜欢历史', '喜欢权谋'],
    
    coreCoolPoints: ['growth', 'face-slapping', 'power-display', 'love-progress', 'identity-reveal'],
    
    coolPointRhythm: {
      density: { minimum: 1, optimal: 1.8, maximum: 3 },
      comboInterval: 5,
      climaxChapterRatio: 0.15,
    },
    
    chapterStructure: {
      opening: {
        hookType: ['isekai', 'power-struggle', 'mystery', 'rebirth'],
        requiredElements: ['时代背景', '主角身份', '穿越设定', '初期目标'],
        avoidElements: ['历史知识错误', '设定不符合朝代', '开局就逆天'],
        targetWordCount: [300, 600],
      },
      middle: {
        pacing: 'medium',
        conflictFrequency: 1,
        dialogueRatio: [0.35, 0.5],
        sceneChangeFrequency: 1.5,
      },
      ending: {
        hookType: ['political-struggle', 'war', 'love', 'mystery'],
        cliffhangerIntensity: 8,
        cliffhangerTypes: ['朝堂风云', '战争爆发', '感情进展', '身世揭秘', '阴谋浮现'],
        avoidElements: ['现代梗太多', '历史常识错误', '权谋太幼稚'],
      },
    },
    
    characterTemplates: {
      protagonist: {
        name: '穿越者',
        description: '拥有现代知识的主角',
        traits: ['聪明', '有现代知识', '适应力强', '有野心', '重情义'],
        arc: ['穿越/重生', '适应古代', '崭露头角', '卷入纷争', '改变历史/成就霸业'],
        speechStyle: '半文半白，融入古代但不生硬',
      },
    },
    
    worldBuilding: {
      coreElements: ['历史朝代', '朝堂格局', '江湖势力', '历史名人'],
      revealPacing: 'delayed',
      mysteryLevel: 6,
    },
    
    taboos: {
      avoidPlots: ['历史常识错误', '现代梗太多', '发展太快', '主角全知全能'],
      avoidCharacters: ['历史人物OOC太严重'],
      avoidStyles: ['现代用语太多', '金手指太大', '违背历史逻辑'],
    },
    
    successPatterns: ['历史还原好', '权谋精彩', '人物塑造成功', '历史感强'],
    failurePatterns: ['历史常识错误', '太现代化', '发展不合理'],
    
    pacingGuidance: {
      tensionRelease: '朝堂-江湖交替，感情线点缀',
      cliffhangerFrequency: '每5-8章一个重大转折',
      actionDialogueBalance: '权谋对话占40%，动作描写占30%，感情戏占30%',
    },
  },
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取题材公式
 */
export function getGenreFormula(genre: string): GenreWritingFormula | undefined {
  return GENRE_WRITING_FORMULAS[genre];
}

/**
 * 获取所有题材公式
 */
export function getAllGenreFormulas(): GenreWritingFormula[] {
  return Object.values(GENRE_WRITING_FORMULAS);
}

/**
 * 获取题材选项（用于UI选择）
 */
export function getGenreOptions(): Array<{ value: string; label: string; description: string }> {
  return Object.values(GENRE_WRITING_FORMULAS).map(formula => ({
    value: formula.id,
    label: formula.displayName,
    description: formula.description,
  }));
}

/**
 * 获取题材写作提示词
 */
export function getGenreWritingPrompt(
  genre: string,
  chapterType: string,
  context?: { previousSummary?: string; chapterGoal?: string }
): string {
  const formula = GENRE_WRITING_FORMULAS[genre];
  
  if (!formula) {
    return '';
  }

  const parts: string[] = [];

  // 题材信息
  parts.push(`## 【题材专属】${formula.displayName}写作要求\n`);
  parts.push(`题材简介：${formula.description}`);
  parts.push(`目标读者：${formula.targetAudience.join('、')}\n`);

  // 核心爽点
  parts.push('### 核心爽点（必须包含）');
  parts.push(`爽点密度：每千字 ${formula.coolPointRhythm.density.minimum}-${formula.coolPointRhythm.density.optimal} 个`);
  parts.push(`爽点类型：${formula.coreCoolPoints.join('、')}\n`);

  // 章节结构
  parts.push('### 开局要求（前10%）');
  parts.push(`必须包含：${formula.chapterStructure.opening.requiredElements.join('、')}`);
  parts.push(`建议钩子：${formula.chapterStructure.opening.hookType.join('、')}`);
  parts.push(`禁止：${formula.chapterStructure.opening.avoidElements.join('、')}`);
  parts.push(`目标字数：${formula.chapterStructure.opening.targetWordCount[0]}-${formula.chapterStructure.opening.targetWordCount[1]}字\n`);

  // 中段节奏
  parts.push('### 中段节奏');
  parts.push(`节奏：${formula.chapterStructure.middle.pacing === 'fast' ? '快节奏' : formula.chapterStructure.middle.pacing === 'slow' ? '慢节奏' : '中等节奏'}`);
  parts.push(`冲突频率：每千字 ${formula.chapterStructure.middle.conflictFrequency} 次`);
  parts.push(`对话比例：${formula.chapterStructure.middle.dialogueRatio[0] * 100}%-${formula.chapterStructure.middle.dialogueRatio[1] * 100}%\n`);

  // 结尾要求
  parts.push('### 结尾要求（最后15%）【必须】');
  parts.push(`钩子类型：${formula.chapterStructure.ending.hookType.join('、')}`);
  parts.push(`悬念强度：${formula.chapterStructure.ending.cliffhangerIntensity}/10`);
  parts.push(`建议悬念：${formula.chapterStructure.ending.cliffhangerTypes.join('、')}`);
  parts.push(`禁止：${formula.chapterStructure.ending.avoidElements.join('、')}\n`);

  // 主角模板
  parts.push('### 主角模板');
  parts.push(`类型：${formula.characterTemplates.protagonist.name}`);
  parts.push(`特征：${formula.characterTemplates.protagonist.traits.join('、')}`);
  parts.push(`说话风格：${formula.characterTemplates.protagonist.speechStyle}`);
  parts.push(`角色弧光：${formula.characterTemplates.protagonist.arc.join(' → ')}\n`);

  // 世界观要点
  if (formula.worldBuilding.coreElements.length > 0) {
    parts.push('### 世界观要点');
    parts.push(`核心元素：${formula.worldBuilding.worldBuilding.coreElements.join('、')}`);
    parts.push(`揭示节奏：${formula.worldBuilding.worldBuilding.revealPacing === 'gradual' ? '渐进式揭示' : formula.worldBuilding.worldBuilding.revealPacing === 'fast' ? '快速揭示' : '延迟揭示'}`);
    parts.push(`神秘程度：${'★'.repeat(formula.worldBuilding.worldBuilding.mysteryLevel)}${'☆'.repeat(10 - formula.worldBuilding.worldBuilding.mysteryLevel)}`);
    if (formula.worldBuilding.powerSystem) {
      parts.push(`修炼体系：${formula.worldBuilding.powerSystem}`);
    }
    parts.push('');
  }

  // 禁忌清单
  if (formula.taboos.avoidPlots.length > 0) {
    parts.push('### 【禁忌清单】');
    parts.push(`剧情禁忌：${formula.taboos.avoidPlots.join('、')}`);
    parts.push(`人物禁忌：${formula.taboos.avoidCharacters.join('、')}`);
    parts.push(`风格禁忌：${formula.taboos.avoidStyles.join('、')}\n`);
  }

  // 成功要素
  parts.push('### 成功要素');
  parts.push(formula.successPatterns.map(p => `- ${p}`).join('\n'));
  parts.push('');

  // 节奏指导
  parts.push('### 节奏指导');
  parts.push(`张力释放：${formula.pacingGuidance.tensionRelease}`);
  parts.push(`悬念频率：${formula.pacingGuidance.cliffhangerFrequency === 1 ? '每章' : `每${formula.pacingGuidance.cliffhangerFrequency}章`}`);
  parts.push(`动作/对话比例：${formula.pacingGuidance.actionDialogueBalance}\n`);

  // 前章衔接
  if (context?.previousSummary) {
    parts.push('### 前章衔接');
    parts.push(`前章摘要：${context.previousSummary}\n`);
  }

  return parts.join('\n');
}

/**
 * 获取章节类型对应的写作要点
 */
export function getChapterTypeGuidance(genre: string, chapterType: string): string {
  const formula = GENRE_WRITING_FORMULAS[genre];
  
  if (!formula) {
    return '';
  }

  const guidance: Record<string, string> = {
    normal: '普通章节，保持稳定节奏，每章有推进有悬念',
    climax: '高潮章节，情绪拉满，打斗精彩，爽点密集',
    transition: '过渡章节，节奏稍缓，为高潮做铺垫',
    setup: '铺垫章节，埋设伏笔，建立期待',
    world_intro: '世界观介绍章，自然融入设定，不要堆砌说明',
    character_intro: '人物介绍章，通过事件展现性格',
    conflict: '冲突章节，矛盾激化，节奏加快',
    resolution: '解决章节，冲突化解，收获奖励',
    ending: '结尾章节，最终高潮，收束所有线索',
  };

  return guidance[chapterType] || '普通章节写法';
}

/**
 * 验证章节是否符合题材公式
 */
export function validateChapterAgainstFormula(
  genre: string,
  chapter: {
    content: string;
    type: string;
    wordCount: number;
  }
): { valid: boolean; issues: string[] } {
  const formula = GENRE_WRITING_FORMULAS[genre];
  
  if (!formula) {
    return { valid: true, issues: [] };
  }

  const issues: string[] = [];

  // 字数检查
  const expectedRange = formula.chapterStructure.opening.targetWordCount;
  if (chapter.wordCount < expectedRange[0] * 0.8 || chapter.wordCount > expectedRange[1] * 1.2) {
    issues.push(`字数(${chapter.wordCount})偏离预期(${expectedRange[0]}-${expectedRange[1]})`);
  }

  // 检查禁忌
  for (const taboo of formula.taboos.avoidStyles) {
    if (chapter.content.includes(taboo)) {
      issues.push(`包含禁忌风格：${taboo}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
