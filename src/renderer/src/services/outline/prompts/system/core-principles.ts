/**
 * Core Principles for Novel Writing
 * 网文写作核心原则库 - 基于 oh-story 和 webnovel-writer 方法论
 */

import type { CoolPointDensity, StrandConfig, ConflictLevel } from '../contracts/story-contract';

/**
 * 核心信念
 */
export const CORE_BELIEFS = {
  /** 网文写作是工程，不是灵感 */
  engineering: '网文写作是工程，不是灵感。靠灵感写不了200万字，靠工程可以。',
  
  /** 日更是底线，质量是上限 */
  dailyMinimum: '稳定日更4000字比单章完美更重要。一个稳定日更4000字的作者，比一个三天打鱼两天晒网但每章8000字的作者走得更远。',
  
  /** 爽点密度决定存亡 */
  coolPointDensity: '追读率由爽点密度决定——不是每章都有爽点，而是每3000-5000字必须有一个让读者"爽"的情绪节点。',
  
  /** 大纲是地图，不是牢笼 */
  outlineAsMap: '大纲告诉你方向，但具体走哪条路可以灵活调整。没有大纲的长篇100%会崩，大纲太细的长篇会失去弹性。目标是「粗到能看见全局，细到能坐下就写」。',
  
  /** 先写30章，再谈其他的 */
  writeFirst30: '很多新人卡在"准备"阶段没完没了。大纲不需要完美，设定不需要详尽，写30章（约12万字）自然会发现问题和方向。30章之前不要改大纲。',
};

/**
 * 爽点密度常量
 */
export const COOL_POINT_DENSITY: CoolPointDensity = {
  micro: 3000,  // 每章至少1个微爽点
  small: 9000,  // 每3章1个小爽点
  big: 21000,    // 每7章1个大爽点
};

/**
 * 爽点类型枚举
 */
export const COOL_POINT_TYPES = {
  combat: {
    name: '装逼打脸',
    description: '主角展示实力，打脸看不起他的人',
  },
  powerCrush: {
    name: '实力碾压',
    description: '以绝对实力压制对手',
  },
  unexpectedGain: {
    name: '意外收获',
    description: '意外获得宝物、能力或机缘',
  },
  romanceBreakthrough: {
    name: '感情突破',
    description: '感情关系的重要进展',
  },
  truthReveal: {
    name: '真相揭示',
    description: '揭开谜底或隐藏的真相',
  },
  revengeSuccess: {
    name: '复仇成功',
    description: '成功报复仇人',
  },
  saveBeauty: {
    name: '英雄救美',
    description: '在危难中拯救异性',
  },
  treasureHunt: {
    name: '寻宝探险',
    description: '发现珍贵资源或秘境',
  },
  breakthrough: {
    name: '境界突破',
    description: '实力或境界的提升',
  },
  wisdomVictory: {
    name: '智取胜利',
    description: '用智慧而非蛮力取胜',
  },
} as const;

/**
 * 八条故事线定义
 */
export const EIGHT_STRANDS = {
  quest: {
    name: '地图线',
    description: '地点如何递进',
    example: '新手村→镇→城→州府→帝都',
    milestones: ['新地图解锁', '地图Boss', '地图探索完成'],
  },
  faction: {
    name: '阵营线',
    description: '势力如何发展',
    example: '小帮派→大门派→宗门→皇朝',
    milestones: ['加入势力', '地位提升', '成为首领'],
  },
  character: {
    name: '人物线',
    description: '角色何时登场',
    example: '配角→女主→导师→Boss',
    milestones: ['角色登场', '关系建立', '角色弧完成'],
  },
  goldenFinger: {
    name: '金手指线',
    description: '能力如何升级',
    example: '初阶→进阶→高阶→大招→终极',
    milestones: ['能力觉醒', '能力强化', '能力展示'],
  },
  worldBuilding: {
    name: '世界观线',
    description: '设定如何揭示',
    example: '谜题→线索→部分真相→完整真相',
    milestones: ['设定初现', '设定深入', '设定揭示'],
  },
  conflict: {
    name: '矛盾线',
    description: '冲突如何递进',
    example: '小冲突→中冲突→大冲突→终极对抗',
    milestones: ['矛盾产生', '矛盾升级', '矛盾爆发'],
  },
  collection: {
    name: '收集线',
    description: '资源/道具如何收集',
    example: '碎片→材料→半成品→完整',
    milestones: ['发现目标', '部分收集', '收集完成'],
  },
  romance: {
    name: '感情线',
    description: '感情如何发展',
    example: '相遇→相知→相熟→暧昧→表白→相守',
    milestones: ['初次相遇', '关系升温', '感情突破'],
  },
} as const;

/**
 * 矛盾递进层级
 */
export const CONFLICT_ESCALATION: ConflictLevel[] = [
  {
    level: 1,
    name: '人与自我',
    description: '内心挣扎、自我怀疑、成长痛苦',
    chapters: [],
    status: 'pending',
  },
  {
    level: 2,
    name: '人与自然',
    description: '环境挑战、自然灾害、生存危机',
    chapters: [],
    status: 'pending',
  },
  {
    level: 3,
    name: '人与人',
    description: '人际冲突、竞争对抗、恩怨情仇',
    chapters: [],
    status: 'pending',
  },
  {
    level: 4,
    name: '人与世界',
    description: '终极对抗、命运挑战、世界危机',
    chapters: [],
    status: 'pending',
  },
];

/**
 * 故事卡组合
 */
export const STORY_CARD_COMBINATIONS = [
  ['英雄救美', '装逼打脸'],
  ['以小博大', '慧眼识真'],
  ['少年热血', '临危受命'],
  ['扮猪吃虎', '反转打脸'],
  ['系统任务', '能力觉醒'],
  ['传承觉醒', '天赋展现'],
  ['秘境探险', '宝物争夺'],
  ['宗门崛起', '天才逆袭'],
];

/**
 * 三线交织配置默认值
 */
export const DEFAULT_STRAND_CONFIG: StrandConfig = {
  quest: { ratio: 0.6, status: 'active', currentArc: '' },
  fire: { ratio: 0.25, status: 'active', currentStage: 'cold' },
  constellation: { ratio: 0.15, status: 'active', revealedLocations: [] },
};

/**
 * 章节写作技巧
 */
export const CHAPTER_WRITING_TIPS = {
  opening: {
    rule: '开篇500字必须有钩子',
    antiPatterns: [
      '从天气/风景开始',
      '从大段背景介绍开始',
      '从无关紧要的日常开始',
    ],
    recommended: [
      '冲突场景开场',
      '金手指展示开场',
      '悬念场景开场',
      '重要人物出场',
    ],
  },
  dialogue: {
    rule: '对话必须推进剧情或揭示性格',
    antiPatterns: [
      '为凑字数的闲聊',
      '信息量低的寒暄',
      '重复已有信息',
    ],
    recommended: [
      '话里有话的潜台词',
      '推进关键剧情',
      '揭示角色性格/秘密',
    ],
  },
  combat: {
    rule: '打斗要写策略和反转',
    antiPatterns: [
      '"你一拳我一脚"的流水账',
      '毫无悬念的碾压',
      '过长的大段描写',
    ],
    recommended: [
      '战斗策略展现',
      '反转与悬念',
      '关键时刻的抉择',
    ],
  },
  daily: {
    rule: '日常要有人物互动和伏笔',
    antiPatterns: [
      '单纯的"吃饭睡觉"',
      '无意义的聊天',
      '脱离主线的流水账',
    ],
    recommended: [
      '人物关系推进',
      '伏笔铺设',
      '信息揭示',
      '情感积累',
    ],
  },
  coolPoint: {
    rule: '铺垫要充分，释放要干脆',
    antiPatterns: [
      '铺垫不足直接爽',
      '爽点拖沓不干脆',
      '爽点过长',
    ],
    recommended: [
      '3章前开始铺垫',
      '爽点释放控制在1-2章',
      '爽点后留悬念',
    ],
  },
  ending: {
    rule: '每章结尾都要有钩子',
    antiPatterns: [
      '总结式结尾',
      '说教式结尾',
      '平铺直叙结尾',
    ],
    recommended: [
      '悬念结尾',
      '转折结尾',
      '危机结尾',
      '意外结尾',
    ],
  },
};

/**
 * Show Don't Tell 规则
 */
export const SHOW_DONT_TELL = {
  emotion: {
    forbidden: [
      '"他感到非常愤怒"',
      '"她感到十分惊讶"',
      '"他心里很难过"',
      '"她心中一暖"',
    ],
    recommended: [
      '"他一拳砸在桌上，杯子震得跳了起来。"',
      '"她愣住了，半天才回过神来。"',
      '"他低着头，一言不发地走开了。"',
      '"她的眼眶微微泛红，却还是笑着。"',
    ],
  },
  character: {
    forbidden: [
      '"他是一个善良的人"',
      '"她非常聪明"',
    ],
    recommended: [
      '通过行动展示善良（如让座、帮助陌生人）',
      '通过决策展示智慧（解决问题的方式）',
    ],
  },
};

/**
 * 掐断升华规则
 */
export const CUT_SUBLIMATION = {
  forbidden: [
    '"这就是成长"',
    '"这就是人生"',
    '"经过这次事件，他明白了一个道理..."',
    '"她终于理解了..."',
  ],
  recommended: [
    '停在对话/悬念上',
    '停在未完成动作上',
    '停在意外转折上',
    '停在读者期待的场景上',
  ],
};

/**
 * 字数与节奏参考
 */
export const WORD_COUNT_PACING = {
  highSpeed: {
    wordsPerChapter: '2000-3000字/章',
    contentDensity: '每章一个明确事件',
    suitable: '高速推进、打斗密集、悬念迭起',
  },
  normal: {
    wordsPerChapter: '3000-4000字/章',
    contentDensity: '主线 + 少量副线',
    suitable: '正常节奏、剧情推进',
  },
  slow: {
    wordsPerChapter: '3000-4000字/章',
    contentDensity: '人物互动 + 伏笔',
    suitable: '舒缓铺垫、情感积累',
  },
  climax: {
    wordsPerChapter: '2000-3000字/章',
    contentDensity: '集中释放、不拖沓',
    suitable: '高潮爆发、结局',
  },
};

/**
 * 前30章重点
 */
export const FIRST_30_CHAPTERS = {
  '1-3': {
    phase: '开篇',
    focus: '全力打磨',
    elements: ['钩子', '人设', '爽点', '悬念'],
    description: '前3章决定读者去留，必须四管齐下',
  },
  '4-10': {
    phase: '早期',
    focus: '快速推进',
    elements: ['明确进展', '金手指展示', '第一个小高潮'],
    description: '每章必须有明确进展，不能水文',
  },
  '11-30': {
    phase: '中期铺垫',
    focus: '稳定节奏',
    elements: ['中长线伏笔', '势力格局', '感情线铺垫'],
    description: '开始铺设中长线，为后续爆发做准备',
  },
};

/**
 * 禁忌/毒点列表
 */
export const ANTI_PATTERNS = [
  { type: '开局', content: '从天气/环境描写开始', severity: 'high' },
  { type: '人设', content: '主角没有明显缺点', severity: 'medium' },
  { type: '节奏', content: '前10章没有爽点', severity: 'high' },
  { type: '对话', content: '大段对话没有信息量', severity: 'medium' },
  { type: '打斗', content: '流水账式打斗', severity: 'medium' },
  { type: '日常', content: '无意义的流水账日常', severity: 'low' },
  { type: '结尾', content: '总结式/说教式结尾', severity: 'high' },
  { type: '情绪', content: '直接描写情绪（Show Dont Tell）', severity: 'high' },
  { type: '升级', content: '升级太快没有代价', severity: 'medium' },
  { type: '配角', content: '配角工具人无个性', severity: 'low' },
];

/**
 * 生成核心原则提示词片段
 */
export function buildCorePrinciplesPrompt(): string {
  return `
【核心信念】
${Object.values(CORE_BELIEFS).map((b, i) => `${i + 1}. ${b}`).join('\n')}

【爽点密度要求】
- 微爽点：每${COOL_POINT_DENSITY.micro}字至少1个
- 小爽点：每${COOL_POINT_DENSITY.small}字1个
- 大爽点：每${COOL_POINT_DENSITY.big}字1个

【写作禁忌】
${ANTI_PATTERNS.map(a => `- ${a.type}禁忌：${a.content}`).join('\n')}
`;
}

/**
 * 生成八条故事线提示词片段
 */
export function buildEightStrandsPrompt(): string {
  const lines = ['【八条故事线规划】'];
  lines.push('| 故事线 | 内容 | 递进方式 |');
  lines.push('|--------|------|----------|');
  
  for (const [key, strand] of Object.entries(EIGHT_STRANDS)) {
    lines.push(`| ${strand.name} | ${strand.description} | ${strand.example} |`);
  }
  
  return lines.join('\n');
}

/**
 * 生成矛盾递进提示词片段
 */
export function buildConflictEscalationPrompt(): string {
  const lines = ['【矛盾四重递进】'];
  lines.push(CONFLICT_ESCALATION.map(c => `${c.level}. ${c.name}：${c.description}`).join('\n'));
  return lines.join('\n');
}

/**
 * 生成章节节点规范提示词片段
 */
export function buildChapterNodePrompt(): string {
  return `
【结构化节点规范】
格式：主体 | 动作/变化 | 对象/结果

节点类型：
- CBN（章节起点）：每章固定1个
- CPN（推进节点）：每章2-4个，按时间顺序
- CEN（章节终点）：每章固定1个

规则：
- CBN -> 下一章 CBN 必须逻辑承接
- CPNs 必须按时间顺序排列
- 禁止在 CBN 前出现 CPN

示例：
- CBN: 萧炎 | 抵达 | 迦南学院入口
- CPN: 萧炎 | 展示 | 异火控制力
- CPN: 药老 | 对萧炎产生 | 明确兴趣
- CEN: 萧炎 | 意识到 | 学院考核远比预想更严苛
`;
}

/**
 * 生成时间线约束提示词片段
 */
export function buildTimelineConstraintPrompt(): string {
  return `
【时间线硬约束】
1. 时间线必须单调递增（除非明确标注闪回）
2. 每章必须包含时间锚点
3. 与上章时间差必须明确标注
4. 倒计时事件必须列出并标记 D-N

【时间锚点格式】
{
  "time_anchor": "具体时间点",
  "chapter_time_span": "本章节内时间跨度",
  "time_diff_from_prev": "与上章时间差（如：当天/次日/三月后）",
  "countdown_status": "倒计时状态（如：距宗门大比30天）"
}
`;
}

/**
 * 生成写作技巧提示词片段
 */
export function buildWritingTipsPrompt(): string {
  const lines = ['【写作技巧提醒】'];
  lines.push('| 场景 | 技巧 |');
  lines.push('|------|------|');
  
  for (const [scene, tip] of Object.entries(CHAPTER_WRITING_TIPS)) {
    lines.push(`| ${scene} | ${tip.rule} |`);
    if (tip.antiPatterns.length > 0) {
      lines.push(`| | 禁忌：${tip.antiPatterns[0]} |`);
    }
  }
  
  return lines.join('\n');
}
