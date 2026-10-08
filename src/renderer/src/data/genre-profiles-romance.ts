/**
 * 扩展题材 Profile：女频言情与经营类题材
 *
 * 职责：补齐古言、宫斗宅斗、豪门总裁、甜宠、年代、狗血言情、种田等女频主流题材的
 * 钩子 / 爽点 / 雷区约束，修正开题中心女频题材长期匹配不到 Profile 的缺口。
 * 来源：reference/webnovel-writer-master/webnovel-writer/templates/genres/ 的核心卖点与常见雷区。
 * 约束：只能追加在基础 Profile 之后（见 genre-profiles-extended.ts 同名约束）。
 */

import type { GenreProfile } from '@/types/evaluation';

/** 女频言情与经营类扩展题材 Profile */
export const ROMANCE_GENRE_PROFILES: GenreProfile[] = [
  {
    id: 'farming',
    name: '种田',
    hooks: {
      opening: ['conflict', 'emotional', 'question'],
      chapterEnd: ['emotional', 'tension', 'cliffhanger'],
      recommendedDensity: 0.75,
    },
    coolpoints: {
      primary: ['growth', 'treasure', 'face-slapping', 'comedy'],
      secondary: ['romance', 'justice', 'rescue'],
      comboInterval: 5,
      density: { min: 1.2, optimal: 1.6, max: 2.2 },
    },
    pacing: {
      questContinuityMax: 8,
      fireBreakMax: 12,
      constellationInterval: { min: 10, max: 20 },
      actBreakpoint: [30, 70, 120],
    },
    typicalPatterns: [
      { name: '落魄开局', description: '一穷二白的开局处境', chapters: [1, 2, 3] },
      { name: '发家致富', description: '第一次经营成功改善生活', chapters: [5, 10, 20] },
    ],
    commonRisks: [
      { type: '流水账', description: '只记日常没有冲突', prevention: '每个阶段设置外部威胁或明确目标' },
      { type: '发展太顺', description: '经营一路顺风没有波折', prevention: '安排天灾人祸与同行竞争' },
    ],
  },
  {
    id: 'palace',
    name: '宫斗宅斗',
    hooks: {
      opening: ['conflict', 'tension', 'emotional'],
      chapterEnd: ['cliffhanger', 'choice', 'revelation'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['face-slapping', 'revenge', 'identity-reveal', 'show-off'],
      secondary: ['romance', 'justice', 'mystery-reveal'],
      comboInterval: 4,
      density: { min: 1.5, optimal: 2.0, max: 2.8 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 8,
      constellationInterval: { min: 8, max: 15 },
      actBreakpoint: [20, 50, 90],
    },
    typicalPatterns: [
      { name: '受辱开局', description: '入宫或入府后身处底层被陷害', chapters: [1, 2, 3] },
      { name: '步步反杀', description: '识破计谋并当众反将一军', chapters: [10, 20, 40] },
    ],
    commonRisks: [
      { type: '对手降智', description: '对手全是蠢货', prevention: '对手的计谋要合理且留有后手' },
      { type: '手段重复', description: '斗争手段反复使用', prevention: '每轮斗争更换战场与筹码' },
    ],
  },
  {
    id: 'ancient-romance',
    name: '古言',
    hooks: {
      opening: ['emotional', 'conflict', 'mystery'],
      chapterEnd: ['emotional', 'cliffhanger', 'choice'],
      recommendedDensity: 0.85,
    },
    coolpoints: {
      primary: ['romance', 'face-slapping', 'identity-reveal', 'revenge'],
      secondary: ['justice', 'show-off', 'mystery-reveal'],
      comboInterval: 4,
      density: { min: 1.2, optimal: 1.8, max: 2.5 },
    },
    pacing: {
      questContinuityMax: 6,
      fireBreakMax: 8,
      constellationInterval: { min: 8, max: 15 },
      actBreakpoint: [25, 55, 100],
    },
    typicalPatterns: [
      { name: '重生复仇', description: '前世惨死后重生回关键节点', chapters: [1, 2, 3] },
      { name: '权谋情深', description: '感情线与朝堂权谋互相推动', chapters: [30, 60, 90] },
    ],
    commonRisks: [
      { type: '现代思维太重', description: '人物言行像现代人', prevention: '先遵循时代礼法，再写有代价的反叛' },
      { type: '感情线拖沓', description: '感情推进太慢', prevention: '每卷都有明确的关系推进节点' },
    ],
  },
  {
    id: 'ceo-romance',
    name: '豪门总裁',
    hooks: {
      opening: ['emotional', 'conflict', 'revelation'],
      chapterEnd: ['emotional', 'cliffhanger', 'choice'],
      recommendedDensity: 0.95,
    },
    coolpoints: {
      primary: ['romance', 'face-slapping', 'show-off', 'identity-reveal'],
      secondary: ['revenge', 'comedy', 'rescue'],
      comboInterval: 3,
      density: { min: 1.5, optimal: 2.0, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 6,
      constellationInterval: { min: 6, max: 12 },
      actBreakpoint: [20, 50, 90],
    },
    typicalPatterns: [
      { name: '契约关系', description: '契约婚姻或交易关系开局', chapters: [1, 2, 3] },
      { name: '身份反转', description: '女主真实身份曝光震动豪门', chapters: [30, 60] },
    ],
    commonRisks: [
      { type: '霸总脸谱化', description: '男主只有霸道没有缺点', prevention: '给男主真实弱点与成长弧' },
      { type: '误会太低级', description: '一句话能解开的误会拖很多章', prevention: '误会要有合理的不能说的理由' },
    ],
  },
  {
    id: 'sweet-youth',
    name: '甜宠',
    hooks: {
      opening: ['emotional', 'question', 'conflict'],
      chapterEnd: ['emotional', 'cliffhanger', 'tension'],
      recommendedDensity: 0.9,
    },
    coolpoints: {
      primary: ['romance', 'comedy', 'show-off'],
      secondary: ['rescue', 'growth', 'face-slapping'],
      comboInterval: 3,
      density: { min: 1.5, optimal: 2.0, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 5,
      constellationInterval: { min: 6, max: 12 },
      actBreakpoint: [15, 40, 80],
    },
    typicalPatterns: [
      { name: '反差初遇', description: '高反差初遇制造记忆点', chapters: [1, 2] },
      { name: '双向奔赴', description: '误会后双方主动走向对方', chapters: [30, 50] },
    ],
    commonRisks: [
      { type: '甜度单一', description: '甜蜜互动重复', prevention: '甜点随关系阶段升级' },
      { type: '强行制造矛盾', description: '冲突太假强行虐', prevention: '冲突来自人物目标而非巧合' },
    ],
  },
  {
    id: 'period',
    name: '年代',
    hooks: {
      opening: ['conflict', 'emotional', 'question'],
      chapterEnd: ['emotional', 'tension', 'cliffhanger'],
      recommendedDensity: 0.8,
    },
    coolpoints: {
      primary: ['growth', 'face-slapping', 'treasure', 'romance'],
      secondary: ['justice', 'comedy', 'rescue'],
      comboInterval: 5,
      density: { min: 1.2, optimal: 1.6, max: 2.2 },
    },
    pacing: {
      questContinuityMax: 7,
      fireBreakMax: 10,
      constellationInterval: { min: 10, max: 20 },
      actBreakpoint: [30, 60, 100],
    },
    typicalPatterns: [
      { name: '极品亲戚', description: '开局被极品亲戚欺压', chapters: [1, 2, 3] },
      { name: '时代机遇', description: '抓住时代红利改善生活', chapters: [10, 30, 60] },
    ],
    commonRisks: [
      { type: '年代感薄弱', description: '写得像现代文', prevention: '物价、票证、称谓贴合年代' },
      { type: '金手指太明显', description: '外挂过强破坏年代感', prevention: '金手指要低调并受时代限制' },
    ],
  },
  {
    id: 'dog-blood',
    name: '狗血言情',
    hooks: {
      opening: ['emotional', 'conflict', 'revelation'],
      chapterEnd: ['emotional', 'cliffhanger', 'choice'],
      recommendedDensity: 0.95,
    },
    coolpoints: {
      primary: ['romance', 'revenge', 'identity-reveal', 'face-slapping'],
      secondary: ['justice', 'rescue', 'mystery-reveal'],
      comboInterval: 3,
      density: { min: 1.5, optimal: 2.0, max: 3.0 },
    },
    pacing: {
      questContinuityMax: 5,
      fireBreakMax: 5,
      constellationInterval: { min: 6, max: 12 },
      actBreakpoint: [20, 45, 80],
    },
    typicalPatterns: [
      { name: '虐恋开局', description: '误会或替身关系中受尽委屈', chapters: [1, 2, 3] },
      { name: '追妻火葬场', description: '真相揭开后男主追悔莫及', chapters: [40, 60, 80] },
    ],
    commonRisks: [
      { type: '为虐而虐', description: '虐点没有因果', prevention: '虐点必须由人物选择造成' },
      { type: '女主被动', description: '女主只会被动受虐', prevention: '女主要有反击与成长' },
    ],
  },
];
