/**
 * 书名技法库（title-craft）
 *
 * 两类导出：
 *  - TITLE_PATTERNS / formatTitlePatterns()：供 AI 提示词 few-shot 的书名句式库
 *  - buildLocalTitle()：供本地组合式创意引擎（local-engine）执行的书名生成
 */

/** 给 AI 提示词用的书名句式 */
export interface TitlePattern {
  id: string;
  name: string;
  description: string;
  example: string;
}

export const TITLE_PATTERNS: TitlePattern[] = [
  {
    id: 'number-contrast',
    name: '数字×反差',
    description: '用具体数字/夸张成就制造反差与悬念',
    example: '《我靠捡垃圾成了星际首富》',
  },
  {
    id: 'identity-scene',
    name: '身份×荒诞场景',
    description: '高位身份落入日常场景，错位感拉满',
    example: '《退休魔王在小区当保安》',
  },
  {
    id: 'question-hook',
    name: '疑问钩子',
    description: '以"当…"句式抛出反常识前提，逼读者点开',
    example: '《当全人类只有我记得末日》',
  },
  {
    id: 'noun-collision',
    name: '双名词碰撞',
    description: '两个风马牛不相及的名词硬碰出设定',
    example: '《赛博道士》',
  },
  {
    id: 'system-variant',
    name: '系统变异',
    description: '金手指不按常理出牌，变异/坏掉/有性格',
    example: '《我的系统是破产清算版》',
  },
  {
    id: 'role-reversal',
    name: '身份错位',
    description: '反派/炮灰/路人视角反客为主',
    example: '《反派今天也在努力洗白》',
  },
  {
    id: 'career-contrast',
    name: '职业反差',
    description: '穿越/重生后干起毫不相关的现代营生',
    example: '《穿成恶毒女配后我开起了烧烤摊》',
  },
  {
    id: 'rule-break',
    name: '规则颠覆',
    description: '设定/剧本/规则本身被打破',
    example: '《这个妖怪不按剧本走》',
  },
  {
    id: 'extreme-premise',
    name: '极端前提',
    description: '一句极端到荒谬的前提撑起全书',
    example: '《全世界都在求我别死》',
  },
  {
    id: 'dayjob-super',
    name: '日常×超凡',
    description: '身边不起眼的人其实是绝世大佬',
    example: '《我的房东是上古剑仙》',
  },
];

/** 拼进系统提示词的 few-shot 段落 */
export function formatTitlePatterns(): string {
  const lines = TITLE_PATTERNS.map(p => `- ${p.name}：${p.description}，示例《${p.example}》`);
  return lines.join('\n');
}

// ============================================================
// 本地引擎词根池（组合式生成用）
// ============================================================

export const TITLE_SUBJECTS = [
  '退休魔王',
  '咸鱼大佬',
  '社畜打工人',
  '病弱少年',
  '倒霉蛋',
  '退休兵王',
  '社恐程序员',
  '破产千金',
  '过气影帝',
  '摆烂学霸',
  '亡国太子',
  '废柴富二代',
  '穿越主播',
  '挂科学渣',
] as const;

export const TITLE_SETTINGS = [
  '小区',
  '菜市场',
  '烧烤摊',
  '养老院',
  '幼儿园',
  '废品站',
  '城中村',
  '直播间',
  '外卖平台',
  '家政公司',
  '地下停车场',
  '城中村理发店',
] as const;

export const TITLE_MECHANISMS = [
  '捡垃圾',
  '摆地摊',
  '写小说',
  '做UP主',
  '送外卖',
  '开直播',
  '养猫',
  '记账',
  '睡觉',
  '打游戏',
  '收废品',
  '相亲',
] as const;

export const TITLE_ACHIEVEMENTS = [
  '星际首富',
  '满级大佬',
  '国服第一',
  '全服公敌',
  '星际霸主',
  '万人迷',
  '顶流',
  '救世主',
  '隐藏BOSS',
  '幕后黑手',
  '位面商人',
  '神级大佬',
] as const;

export const TITLE_SECRETS = [
  '末日',
  '真相',
  '剧本',
  '密码',
  '预言',
  '藏宝图',
  '游戏规则',
  '通关条件',
] as const;

export const TITLE_ROLES = [
  '保安',
  '保洁',
  '门卫',
  '厨子',
  '奶爸',
  '幼师',
  '出租车司机',
  '快递员',
  '宿管',
  '图书管理员',
] as const;

export const TITLE_STRANGERS = [
  '房东',
  '邻居',
  '同桌',
  '合租室友',
  '楼下大爷',
  '班主任',
  '相亲对象',
  '外卖小哥',
] as const;

export const TITLE_MASTERS = [
  '上古剑仙',
  '隐世大佬',
  '灭世魔尊',
  '神级厨师',
  '星际元帅',
  '龙族族长',
  '千亿总裁',
  '顶级黑客',
] as const;

type PickFn = <T>(pool: readonly T[]) => T;

/**
 * 本地引擎书名生成：按脑洞句式模板 + 词根池组合。
 * 同一输入保证输出可复现（pick 由调用方注入，便于测试）。
 */
export function buildLocalTitle(pick: PickFn, ctx: { genre?: string }): string {
  const templates: Array<(p: PickFn) => string> = [
    p => `我靠${p(TITLE_MECHANISMS)}成了${p(TITLE_ACHIEVEMENTS)}`,
    p => `${p(TITLE_SUBJECTS)}在${p(TITLE_SETTINGS)}当${p(TITLE_ROLES)}`,
    p => `当${ctx.genre || p(TITLE_SUBJECTS)}只有${p(TITLE_SUBJECTS)}记得${p(TITLE_SECRETS)}`,
    p => `${p(TITLE_MECHANISMS)}到${p(TITLE_ACHIEVEMENTS)}：${p(TITLE_SUBJECTS)}的躺赢人生`,
    p => `我的${p(TITLE_STRANGERS)}是${p(TITLE_MASTERS)}`,
    p => `穿成${p(TITLE_SUBJECTS)}后我${p(TITLE_MECHANISMS)}养活了整个${p(TITLE_SETTINGS)}`,
    p => `${p(TITLE_SUBJECTS)}靠${p(TITLE_MECHANISMS)}成了${p(TITLE_ACHIEVEMENTS)}`,
    p => `${ctx.genre || '全服'}都在求${p(TITLE_SUBJECTS)}别${p(TITLE_SECRETS)}`,
    p => `${p(TITLE_SUBJECTS)}的${p(TITLE_MECHANISMS)}系统不对劲`,
    p => `我在${p(TITLE_SETTINGS)}当${p(TITLE_ROLES)}的那些年`,
  ];
  return templates[Math.floor(Math.random() * templates.length)](pick);
}
