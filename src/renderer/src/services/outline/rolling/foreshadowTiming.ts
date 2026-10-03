import type { ChapterBlueprint } from '../types/executable-outline';

/**
 * 伏笔词面时序校验（从 outline-roller 抽出的独立模块，避免 completer↔roller 循环依赖）。
 *
 * 使用方：
 * - outline-roller：滚纲批次质检/修复轮「越修越坏」守卫/空章补写节点消毒
 * - outline-completer：初版蓝图批次合入时的消毒（2026-09-10 glm 200 章实证：
 *   初版第 20 章蓝图要求「笔迹比对定性补账出自行家手笔」而伏笔台账锁 22 章揭示，
 *   写作端被夹死三连拒成洞——初版产物此前无任何词面拦截）
 */
export interface RolledBlueprintIssue {
  chapterNumber: number;
  kind:
    | 'over-scoped-mustcover'
    | 'template-cbn'
    | 'hollow-cen'
    | 'reader-meta'
    | 'locked-foreshadow'
    | 'locked-foreshadow-payoff'
    | 'reveal-timing'
    | 'truncated-hook-clause'
    | 'finale-not-closing'
    | 'coolpoint-pacing';
  detail: string;
}

/**
 * 蓝图残句截断信号（2026-09-12 g38f reg20 实证：初版第 40+ 章 CBN 密集出现
 * 「仵作刚将浮尸抬上井栏，沈淮安手中。」「三张盖着朱印。」式生成截断残句，
 * 长度合法通过 8-25 字闸，正文履约只能照抄半截话）。悬垂结构是格式腐败
 * 信号，不是语义判定。两级词集：
 * - 副词/连词悬垂（正在/而且…）——现代汉语不存在以此收尾的完整句，恒判；
 * - 方位悬垂（手中/眼前…）——仅当近旁无介词/动词引导时判：「，沈淮安手中。」
 *   是半截句，而「拍在督粮官眼前。」「递到陆宣手中。」是完整处置句
 *   （2026-09-13 r4 启动实证：无引导词判据时这两句被误杀，修复轮拖死整轮）。
 * 「…的。」「…着。」可以是完整谓语句（灯还亮着），不入词集。
 */
const ADVERBIAL_DANGLER_TAIL_RE =
  /(?:正在|已经|即将|而且|但是|突然|忽然|渐渐|缓缓)[。！？!?…]?\s*$/u;
const LOCATIVE_DANGLER_TAIL_RE = /(?:手中|怀里|袖中|眼前|身后)[。！？!?…]?\s*$/u;
/** 方位词的合法引导：V在/到/进/入/向/往/至/于 + 名词 + 方位词 是完整句 */
const LOCATIVE_LICENSER_RE = /[在到进向往至于落递拍塞藏送放]/u;

export function isTruncatedClause(text: string): boolean {
  const trimmed = (text ?? '').trim();
  if (ADVERBIAL_DANGLER_TAIL_RE.test(trimmed)) return true;
  const locativeMatch = trimmed.match(LOCATIVE_DANGLER_TAIL_RE);
  if (!locativeMatch) return false;
  const tailHead = trimmed.length - locativeMatch[0].length;
  const context = trimmed.slice(Math.max(0, tailHead - 4), tailHead);
  return ![...context].some(ch => LOCATIVE_LICENSER_RE.test(ch));
}

/**
 * 终章收束声明信号（格式级存在性检查，语义收束质量归 outline-reviewer/书审）：
 * 末章蓝图的 CEN/mustCover/hookText 至少含一处收束声明词。滚纲提示词的
 * 「终卷收束硬约束」早已要求（2026-09-10 glm r2 结尾不收束 S1 后补），但纯
 * prompt 约束无守卫——g38f r3 主轮 ch200 仍以「崔相饮鸩」新钩子收尾（残卷
 * 报信戛然而止，无终局画面），提示词遵守与否没人拦。
 */
const FINALE_CLOSURE_SIGNAL_RE =
  /尘埃落定|大结局|终章|终局|落幕|归处|归隐|新秩序|天下大定|全书完|结案|定局|善终|圆满|新朝|新篇|故?事?讲完/u;

export function hasFinaleClosureSignal(text: string): boolean {
  return FINALE_CLOSURE_SIGNAL_RE.test(text ?? '');
}

/** 锁定伏笔的计时信息（Pipeline 侧 futureReveals 同源：createdChapter = 大纲预埋章号） */
export interface ForeshadowTimingHint {
  hint: string;
  createdChapter?: number;
  setupChapter?: number;
  /** 回收/兑现时点：埋设后的章节若强词面命中=提前兑现伏笔载荷（g38f-200chr2 ch36 形态） */
  payoffChapter?: number;
}

/** 从提示语中提取 CJK 连续段（≥2 字），供词面命中统计 */
function foreshadowCoreTokens(hint: string): string[] {
  return (hint ?? '')
    .replace(/[^\u4e00-\u9fff]+/gu, ' ')
    .split(/\s+/u)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

/**
 * 锁定伏笔词面校验（双向）：
 * - 埋设方向：蓝图在埋设章之前把提示语触发词写进节点 → 写作履约即提前揭示，
 *   评审必拒（2026-08-28 百章终验 ch40 死锁实证）。命中阈值 ≥max(2, 34%) 二字组。
 * - 兑现方向：蓝图在回收章之前强词面命中（≥60% 且 ≥4 二字组）= 把伏笔载荷整段
 *   提前兑现。2026-09-06 g38f-200chr2 ch36 实证：初版节点第 36 章「当众颁布三级
 *   网格考成法」，伏笔蓝图锁定第 45 章才揭示——5 次拒稿整章死；reg20 同族
 *   （伏笔标第 18 章反杀下狱、蓝图第 3 章执行）。埋设后的推进期允许部分词面
 *   重叠（正常铺垫），只有高覆盖才算整段兑现。
 */
export function findLockedForeshadowViolations(
  blueprints: ChapterBlueprint[],
  foreshadows: ForeshadowTimingHint[],
  options?: { payoffMinHits?: number },
): RolledBlueprintIssue[] {
  const issues: RolledBlueprintIssue[] = [];
  const locked = foreshadows
    .map(f => ({
      hint: (f.hint ?? '').trim(),
      setupAt: f.setupChapter ?? f.createdChapter ?? 0,
      payoffAt: f.payoffChapter ?? 0,
    }))
    .filter(f => (f.setupAt > 0 || f.payoffAt > 0) && f.hint.length >= 4);
  if (locked.length === 0) return issues;
  for (const bp of blueprints) {
    const text = [bp.CBN, bp.CEN, bp.summary, ...bp.CPNs, ...bp.mustCover]
      .filter(Boolean)
      .join('\n');
    if (!text) continue;
    for (const f of locked) {
      const tokens = foreshadowCoreTokens(f.hint);
      const grams = new Set<string>();
      for (const token of tokens) {
        for (let i = 0; i + 2 <= token.length; i += 1) grams.add(token.slice(i, i + 2));
      }
      if (grams.size === 0) continue;
      let hits = 0;
      for (const gram of grams) if (text.includes(gram)) hits += 1;
      // 埋设方向：埋设章之前，弱覆盖即拦（触发词出现即危险）
      if (f.setupAt > 0 && bp.orderIndex < f.setupAt) {
        if (hits >= Math.max(2, Math.ceil(grams.size * 0.34))) {
          issues.push({
            chapterNumber: bp.orderIndex,
            kind: 'locked-foreshadow',
            detail:
              `第${bp.orderIndex}章蓝图词面命中第${f.setupAt}章才埋设的伏笔「${f.hint.slice(0, 24)}」` +
              `（命中 ${hits}/${grams.size} 个二字组）。把该节点改写为不含伏笔触发词的中性事件，` +
              `相关物件与异常结论留到第${f.setupAt}章再出现`,
          });
          break;
        }
      }
      // 兑现方向：埋设后、回收前，只有高覆盖（整段载荷）才拦——推进/铺垫放行。
      // 阈值 45% 实测校准：ch36 受害样本 6/13 二字组；正常铺垫形态 ~38%。
      // payoffMinHits 供逐条消毒路径放宽（短条目 4 命中即毒，见 dropForeshadowConflictingItems）。
      const payoffMinHits =
        options?.payoffMinHits ?? Math.max(4, Math.ceil(grams.size * 0.45));
      if (f.payoffAt > 0 && bp.orderIndex < f.payoffAt) {
        if (hits >= payoffMinHits) {
          issues.push({
            chapterNumber: bp.orderIndex,
            kind: 'locked-foreshadow-payoff',
            detail:
              `第${bp.orderIndex}章蓝图强词面命中第${f.payoffAt}章才回收的伏笔「${f.hint.slice(0, 24)}」` +
              `（命中 ${hits}/${grams.size} 个二字组，属整段提前兑现）。本章只许铺垫/推进：` +
              `保留线索与阻力，把该伏笔的完整兑现/揭示留到第${f.payoffAt}章`,
          });
          break;
        }
      }
    }
  }
  return issues;
}

/**
 * 空章补写前的节点消毒：逐项（CPN/mustCover）跑伏笔词面校验，删掉与伏笔
 * 时点冲突的条目（2026-09-07 r2 书修复基建：ch36 节点「当众颁布三级网格考成法」
 * vs 伏笔第 45 章揭示——原样补写会重演 5 连拒死章）。
 * mustCover 全部冲突时退化为一条通用缝合节点（承接上章、导向下章），不保留
 * 任何带毒条目——空合同有 heal 兜底，带毒合同会死锁。
 */
export function dropForeshadowConflictingItems(
  bp: ChapterBlueprint,
  foreshadows: ForeshadowTimingHint[]
): { blueprint: ChapterBlueprint; dropped: string[] } {
  const dropped: string[] = [];
  const keepClean = (items: string[]): string[] =>
    (items ?? []).filter(item => {
      const probe: ChapterBlueprint = {
        ...bp,
        CBN: '',
        CEN: '',
        summary: '',
        CPNs: [item],
        mustCover: [item],
      };
      // 单条文本短，命中数天然低：消毒口径放宽到 3（短条目「推行网格考成法」
      // 4 命中即是毒；全蓝图口径的 6 会漏）。宁可错删一条桥接项，不可放过毒项。
      if (findLockedForeshadowViolations([probe], foreshadows, { payoffMinHits: 3 }).length === 0) {
        return true;
      }
      dropped.push(item);
      return false;
    });
  const CPNs = keepClean(bp.CPNs ?? []);
  let mustCover = keepClean(bp.mustCover ?? []);
  if ((bp.mustCover ?? []).length > 0 && mustCover.length === 0) {
    mustCover = [`承接第${Math.max(1, bp.orderIndex - 1)}章结尾状态并向后推进的过渡事件`];
  }
  return {
    blueprint: { ...bp, CPNs, mustCover },
    dropped,
  };
}
