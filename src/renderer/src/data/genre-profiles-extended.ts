/**
 * 扩展题材 Profile：男频与通用新题材
 *
 * 职责：补齐 GENRE_PROFILES 基础 10 类之外的主流题材（高武、系统流、无限流、规则怪谈等），
 * 供开题种子注入题材专属钩子 / 爽点 / 雷区约束。
 * 来源：webnovel-writer 题材模板的核心卖点与常见雷区（上游见 docs/reference-projects.md，不随本仓库分发）。
 * 约束：只能追加在基础 Profile 之后（EmotionGenreStep 取前 8 个展示，且 matchGenreProfile 按顺序部分匹配）。
 */

import type { GenreProfile } from '@/types/evaluation';

/** 男频与通用扩展题材 Profile */
export const EXTENDED_GENRE_PROFILES: GenreProfile[] = [
  {
    id: 'high-martial',
    name: '高武',
    hooks: {
      opening: ['conflict', 'action', 'tension'],
      chapterEnd: ['cliffhanger', 'action', 'revelation'],
      recommendedDensity: 0.85,
    },
    coolpoints: {
      primary: ['breakthrough', 'face-slapping', 'show-off', 'growth'],
      secondary: ['justice', 'treasure', 'rescue'],
      comboInterval: 4,
      density: { min: 1.8, optimal: 2.2, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 6,
      fireBreakMax: 12,
      constellationInterval: { min: 8, max: 18 },
      actBreakpoint: [25, 55, 100],
    },
    typicalPatterns: [
      { name: '武考觉醒', description: '全民武考或觉醒测试开局，天赋被低估', chapters: [1, 2, 3] },
      { name: '擂台碾压', description: '正式比武众目睽睽之下一招制敌', chapters: [20, 40, 60] },
      { name: '国战荣耀', description: '代表国家或人族出战异族', chapters: [80, 120, 160] },
    ],
    commonRisks: [
      { type: '战力崩坏', description: '数值膨胀，境界前后矛盾', prevention: '固定境界表与战力对照' },
      { type: '打脸疲劳', description: '打脸过密导致审美疲劳', prevention: '打脸要有铺垫并穿插事业推进' },
    ],
  },
  {
    id: 'urban-power',
    name: '都市异能',
    hooks: {
      opening: ['conflict', 'mystery', 'revelation'],
      chapterEnd: ['cliffhanger', 'tension', 'revelation'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['show-off', 'face-slapping', 'identity-reveal', 'growth'],
      secondary: ['rescue', 'romance', 'comedy'],
      comboInterval: 3,
      density: { min: 2.0, optimal: 2.5, max: 3.5 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 10,
      constellationInterval: { min: 6, max: 15 },
      actBreakpoint: [20, 50, 90],
    },
    typicalPatterns: [
      { name: '异能觉醒', description: '平凡生活中突然觉醒超凡能力', chapters: [1, 2, 3] },
      { name: '人前显圣', description: '隐藏实力的普通人在关键场合出手', chapters: [10, 30, 60] },
    ],
    commonRisks: [
      { type: '现实感崩塌', description: '超凡入侵后社会毫无反应', prevention: '写清普通人与官方对超凡的反应' },
      { type: '战力失控', description: '主角无代价碾压一切', prevention: '为能力设置代价与限制' },
    ],
  },
  {
    id: 'system',
    name: '系统流',
    hooks: {
      opening: ['revelation', 'conflict', 'question'],
      chapterEnd: ['cliffhanger', 'revelation', 'choice'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['growth', 'treasure', 'show-off', 'face-slapping'],
      secondary: ['breakthrough', 'comedy', 'identity-reveal'],
      comboInterval: 3,
      density: { min: 2.0, optimal: 2.5, max: 3.5 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 10,
      constellationInterval: { min: 6, max: 15 },
      actBreakpoint: [20, 50, 100],
    },
    typicalPatterns: [
      { name: '系统绑定', description: '开局绑定系统并发布首个任务', chapters: [1, 2] },
      { name: '任务兑现', description: '完成任务即时兑现奖励改变处境', chapters: [3, 5, 10] },
      { name: '系统真相', description: '揭开系统来历与隐藏代价', chapters: [100, 150] },
    ],
    commonRisks: [
      { type: '数值流水账', description: '面板数据刷屏代替剧情', prevention: '奖励必须改变处境而非只涨数值' },
      { type: '系统万能', description: '系统替主角解决一切冲突', prevention: '给系统设定规则、冷却与代价' },
    ],
  },
  {
    id: 'infinite',
    name: '无限流',
    hooks: {
      opening: ['tension', 'question', 'mystery'],
      chapterEnd: ['cliffhanger', 'tension', 'revelation'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['mystery-reveal', 'growth', 'show-off', 'treasure'],
      secondary: ['rescue', 'face-slapping', 'breakthrough'],
      comboInterval: 4,
      density: { min: 1.5, optimal: 2.0, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 6,
      fireBreakMax: 12,
      constellationInterval: { min: 5, max: 12 },
      actBreakpoint: [20, 45, 80],
    },
    typicalPatterns: [
      { name: '新手副本', description: '被拉入第一个生死副本', chapters: [1, 2, 3] },
      { name: '隐藏线通关', description: '不按攻略走出隐藏结局', chapters: [15, 30, 45] },
      { name: '主神真相', description: '逐步揭开轮回空间的真相', chapters: [80, 120] },
    ],
    commonRisks: [
      { type: '副本同质化', description: '副本换皮重复', prevention: '每个副本的核心规则与情感主题必须不同' },
      { type: '能力叠加成神', description: '跨副本奖励无限叠加', prevention: '奖励设上限并引入取舍' },
    ],
  },
  {
    id: 'rule-horror',
    name: '规则怪谈',
    hooks: {
      opening: ['mystery', 'tension', 'question'],
      chapterEnd: ['cliffhanger', 'question', 'revelation'],
      recommendedDensity: 0.95,
    },
    coolpoints: {
      primary: ['mystery-reveal', 'justice', 'growth'],
      secondary: ['rescue', 'face-slapping', 'show-off'],
      comboInterval: 3,
      density: { min: 1.5, optimal: 2.0, max: 2.8 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 12,
      constellationInterval: { min: 4, max: 10 },
      actBreakpoint: [15, 40, 70],
    },
    typicalPatterns: [
      { name: '规则手册', description: '开局拿到写着诡异规则的守则', chapters: [1, 2] },
      { name: '规则漏洞', description: '解读规则间的矛盾找到生路', chapters: [3, 6, 10] },
    ],
    commonRisks: [
      { type: '规则自相矛盾', description: '规则前后冲突或随剧情需要改写', prevention: '先定规则底层逻辑再写条文' },
      { type: '线索不公平', description: '解法读者无法推导', prevention: '关键线索必须提前给出' },
    ],
  },
  {
    id: 'cthulhu',
    name: '克苏鲁',
    hooks: {
      opening: ['mystery', 'tension', 'question'],
      chapterEnd: ['revelation', 'cliffhanger', 'tension'],
      recommendedDensity: 0.85,
    },
    coolpoints: {
      primary: ['mystery-reveal', 'growth', 'rescue'],
      secondary: ['justice', 'treasure', 'breakthrough'],
      comboInterval: 5,
      density: { min: 1.0, optimal: 1.5, max: 2.2 },
    },
    pacing: {
      questContinuityMax: 7,
      fireBreakMax: 15,
      constellationInterval: { min: 6, max: 14 },
      actBreakpoint: [25, 60, 100],
    },
    typicalPatterns: [
      { name: '异常初现', description: '日常中出现无法解释的细节', chapters: [1, 2, 3] },
      { name: '真相代价', description: '每接近真相一步都要付出理智代价', chapters: [20, 40, 70] },
    ],
    commonRisks: [
      { type: '只有吓人描写', description: '恐怖描写堆砌而没有规则逻辑', prevention: '为不可名状之物设定可观测规律' },
      { type: '代价不兑现', description: '理智代价只是嘴上说说', prevention: '每次越界都留下不可逆损失' },
    ],
  },
  {
    id: 'supernatural',
    name: '灵异',
    hooks: {
      opening: ['mystery', 'tension', 'emotional'],
      chapterEnd: ['cliffhanger', 'revelation', 'tension'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['mystery-reveal', 'justice', 'rescue'],
      secondary: ['show-off', 'comedy', 'growth'],
      comboInterval: 4,
      density: { min: 1.5, optimal: 2.0, max: 2.8 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 10,
      constellationInterval: { min: 5, max: 12 },
      actBreakpoint: [20, 50, 80],
    },
    typicalPatterns: [
      { name: '接单驱邪', description: '单元委托串联主线', chapters: [1, 10, 20] },
      { name: '身世关联', description: '主角体质与灵异事件根源相关', chapters: [30, 60] },
    ],
    commonRisks: [
      { type: '恐怖堆砌', description: '灵异设定前后矛盾', prevention: '统一阴阳规则并保持一致' },
      { type: '主角开挂', description: '主角过强破坏压迫感', prevention: '每次处理事件都要付出代价' },
    ],
  },
  {
    id: 'esports',
    name: '电竞',
    hooks: {
      opening: ['conflict', 'emotional', 'action'],
      chapterEnd: ['cliffhanger', 'tension', 'choice'],
      recommendedDensity: 0.85,
    },
    coolpoints: {
      primary: ['face-slapping', 'growth', 'show-off', 'justice'],
      secondary: ['romance', 'comedy', 'rescue'],
      comboInterval: 4,
      density: { min: 1.5, optimal: 2.0, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 6,
      fireBreakMax: 10,
      constellationInterval: { min: 8, max: 15 },
      actBreakpoint: [20, 50, 90],
    },
    typicalPatterns: [
      { name: '落魄复出', description: '被战队抛弃后从草根重来', chapters: [1, 2, 5] },
      { name: '逆风翻盘', description: '关键比赛逆风翻盘', chapters: [30, 60, 90] },
    ],
    commonRisks: [
      { type: '只报结果', description: '比赛只写比分不写博弈', prevention: '写清战术选择与临场决策' },
      { type: '长期连胜', description: '队伍连胜没有代价', prevention: '安排失利与阵容危机' },
    ],
  },
  {
    id: 'livestream',
    name: '直播',
    hooks: {
      opening: ['conflict', 'question', 'revelation'],
      chapterEnd: ['cliffhanger', 'tension', 'revelation'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['show-off', 'face-slapping', 'identity-reveal', 'comedy'],
      secondary: ['justice', 'growth', 'romance'],
      comboInterval: 3,
      density: { min: 2.0, optimal: 2.5, max: 3.5 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 10,
      constellationInterval: { min: 5, max: 12 },
      actBreakpoint: [15, 40, 80],
    },
    typicalPatterns: [
      { name: '首播出圈', description: '第一次直播意外爆火', chapters: [1, 2, 3] },
      { name: '舆论反转', description: '被全网黑后用证据当众反转', chapters: [10, 25, 50] },
    ],
    commonRisks: [
      { type: '天降流量', description: '数据增长全靠天降流量', prevention: '流量增长要由内容和事件驱动' },
      { type: '观众背景板', description: '弹幕不参与剧情', prevention: '让观众反馈推动主角下一步行动' },
    ],
  },
  {
    id: 'western-fantasy',
    name: '西幻',
    hooks: {
      opening: ['mystery', 'conflict', 'action'],
      chapterEnd: ['cliffhanger', 'revelation', 'choice'],
      recommendedDensity: 0.8,
    },
    coolpoints: {
      primary: ['growth', 'treasure', 'breakthrough', 'show-off'],
      secondary: ['justice', 'romance', 'identity-reveal'],
      comboInterval: 5,
      density: { min: 1.2, optimal: 1.8, max: 2.5 },
    },
    pacing: {
      questContinuityMax: 7,
      fireBreakMax: 12,
      constellationInterval: { min: 10, max: 20 },
      actBreakpoint: [30, 60, 100],
    },
    typicalPatterns: [
      { name: '契约仪式', description: '学院测试或契约仪式开局', chapters: [1, 2, 3] },
      { name: '神魔之争', description: '卷入神与魔的博弈', chapters: [60, 90, 120] },
    ],
    commonRisks: [
      { type: '名词堆砌', description: '世界观术语过多读者看不懂', prevention: '设定随剧情需要逐步揭示' },
      { type: '魔法无代价', description: '魔法万能导致主角无敌', prevention: '每种魔法都绑定代价与限制' },
    ],
  },
  {
    id: 'espionage',
    name: '谍战',
    hooks: {
      opening: ['tension', 'mystery', 'conflict'],
      chapterEnd: ['cliffhanger', 'tension', 'choice'],
      recommendedDensity: 0.85,
    },
    coolpoints: {
      primary: ['mystery-reveal', 'justice', 'identity-reveal'],
      secondary: ['rescue', 'revenge', 'show-off'],
      comboInterval: 4,
      density: { min: 1.2, optimal: 1.8, max: 2.5 },
    },
    pacing: {
      questContinuityMax: 6,
      fireBreakMax: 12,
      constellationInterval: { min: 6, max: 14 },
      actBreakpoint: [20, 50, 90],
    },
    typicalPatterns: [
      { name: '潜伏开局', description: '以伪装身份打入敌方', chapters: [1, 2, 3] },
      { name: '身份危机', description: '被怀疑后反向排查内鬼', chapters: [20, 40, 60] },
    ],
    commonRisks: [
      { type: '反派降智', description: '敌方轻易被骗', prevention: '对手要聪明多疑并有反制手段' },
      { type: '史实硬伤', description: '历史常识错误', prevention: '核对时代背景与机构设置' },
    ],
  },
];
