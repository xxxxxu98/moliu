/**
 * 跨章节奏账本(悬念承接 + 爽点节奏)大纲期确定性校验。
 *
 * 缺口来源(north-star L3/L4 待补清单):钩子链预检只看「章末有没有钩子」,
 * 不管「上一章抛的悬念后续接没接」;爽点类型有 prompt 纪律但当章兑现
 * 无确定性统计——读者裁判 r14 四窗口批评「悬念累积不闭合」正是悬空形态。
 *
 * 判据说明(遵循「语义判定归 agent,格式事实可确定性」口径):
 * - 悬念承接:CEN 与后章蓝图文本的最长公共子串 ≥ SUSPENSE_CARRY_MIN_CHARS。
 *   词面承接是下限检测——换措辞承接/氛围承接会漏报(宁可漏报,warning 级
 *   不阻断;fail-closed 误报比漏报致命,r4 方位悬垂教训)。命中即确定性
 *   证据「悬念被接住」,未命中只是「无词面证据」交定点修复轮由模型裁决。
 * - 爽点节奏:coolPointType 逐字计数,同质化/缺失是纯计数事实。
 *
 * 接线:outline-completer(展开补全)与 outline-roller(滚动续纲)的质检项,
 * 命中章号并入定点修复轮;修复轮提示词带 detail 的修复指引。
 */

/** 悬念承接比对窗口:第 N 章 CEN 在 N+1..N+WINDOW 章蓝图内找承接信号 */
export const SUSPENSE_CARRY_WINDOW = 3;

/** 最长公共子串达到该长度视为确定性承接(中文 4 字 ≈ 一个实词/短人名+动词) */
export const SUSPENSE_CARRY_MIN_CHARS = 4;

/** 连续悬空达到该章数视为「只抛不接」堆积失衡(P2.2 联动编排) */
export const SUSPENSE_PILEUP_MIN = 4;

/** 连续同类型爽点达到该数视为同质化 */
export const COOL_POINT_STREAK_LIMIT = 3;

/** 连续缺失爽点类型达到该数视为纪律松脱 */
export const COOL_POINT_MISSING_STREAK_LIMIT = 2;

export interface PacingScannableBlueprint {
  orderIndex: number;
  title?: string;
  CBN?: string;
  CEN?: string;
  CPNs?: string[] | string;
  mustCover?: string[] | string;
  coolPointType?: string;
}

export interface PacingIssue {
  chapterNumber: number;
  kind: 'suspense-dangling' | 'suspense-pileup' | 'coolpoint-streak' | 'coolpoint-missing';
  detail: string;
}

function blueprintCarryText(bp: PacingScannableBlueprint): string {
  const cpns = Array.isArray(bp.CPNs) ? bp.CPNs.join('\n') : (bp.CPNs ?? '');
  const mustCover = Array.isArray(bp.mustCover)
    ? bp.mustCover.join('\n')
    : (bp.mustCover ?? '');
  return [bp.title, bp.CBN, bp.CEN, cpns, mustCover]
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

/** 去标点/空白后的纯 CJK+字母串(与 text-similarity 归一口径一致) */
function normalizeForCarry(text: string): string {
  return text.replace(/[\d\s\p{P}\p{S}]/gu, '');
}

/**
 * 最长公共子串长度(经典 DP;a/b 已归一化,长度受控:CEN≤~25 × 蓝图文本≤~500)。
 * 只返回长度,不返回子串本体——判定用,展示用 CEN 原文即可。
 */
function longestCommonSubstringLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        current[j] = prev[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    prev = current;
  }
  return best;
}

/**
 * 悬念悬空扫描:第 N 章 CEN 在后续 WINDOW 章蓝图中无任何词面承接信号。
 *
 * 豁免:窗口不完整的末尾章(承接方蓝图尚未生成,滚动续纲下轮自会检查)。
 * CEN 为空的章不扫(空 CEN 属既有 incomplete-blueprint 门禁,不在此重复报)。
 */
export function findSuspenseDanglingIssues(
  blueprints: PacingScannableBlueprint[],
  options?: { window?: number; minCarryChars?: number },
): PacingIssue[] {
  const window = options?.window ?? SUSPENSE_CARRY_WINDOW;
  const minCarry = options?.minCarryChars ?? SUSPENSE_CARRY_MIN_CHARS;

  const usable = blueprints
    .filter(bp => bp.orderIndex > 0 && String(bp.CEN ?? '').trim())
    .sort((a, b) => a.orderIndex - b.orderIndex);
  if (usable.length === 0) return [];

  const byOrder = new Map(usable.map(bp => [bp.orderIndex, bp]));
  const maxOrder = usable[usable.length - 1].orderIndex;

  const issues: PacingIssue[] = [];
  for (const bp of usable) {
    // 末尾窗口不完整:承接章还没生成,交给下一轮滚纲检查
    if (bp.orderIndex + window > maxOrder) continue;
    const cen = normalizeForCarry(String(bp.CEN));
    if (cen.length < minCarry) continue;

    let carried = false;
    for (let n = bp.orderIndex + 1; n <= bp.orderIndex + window && !carried; n += 1) {
      const follower = byOrder.get(n);
      if (!follower) continue;
      const followerText = normalizeForCarry(blueprintCarryText(follower));
      if (followerText.length === 0) continue;
      if (longestCommonSubstringLength(cen, followerText) >= minCarry) {
        carried = true;
      }
    }
    if (!carried) {
      issues.push({
        chapterNumber: bp.orderIndex,
        kind: 'suspense-dangling',
        detail: describeSuspenseDangling(bp.orderIndex, String(bp.CEN), window),
      });
    }
  }

  // 悬念堆积失衡(2026-10-03 P2.2 联动编排):单章悬空可能是合法的情绪钩
  // (p1reg20 实证 20+ 条悬空零弃读),但连续 SUSPENSE_PILEUP_MIN 章(章号相邻)
  // 全部悬空 = 「只抛不接」的结构性失衡——每章都开新悬念而旧悬念无一承接,
  // 悬念账面只增不减,读者的期待感被透支。每个 ≥4 的连续游程各报一条
  // (r17 回测:首个游程可达 36 章且与读者低分带重合,只报首个会漏后续区间)。
  // 与单章悬空区分:单章交读者评审 suspensePayoff 维度终审,堆积才是结构病。
  const danglingOrders = issues
    .map(issue => issue.chapterNumber)
    .sort((a, b) => a - b);
  const pileups: PacingIssue[] = [];
  let runStart = 0;
  let runLength = 0;
  const flushRun = (): void => {
    if (runLength >= SUSPENSE_PILEUP_MIN) {
      pileups.push({
        chapterNumber: runStart,
        kind: 'suspense-pileup',
        detail: `第${runStart}-${runStart + runLength - 1}章连续 ${runLength} 章章尾悬念无一被后续承接——「只抛不接」的结构性失衡:每章都开新钩而旧钩零承接,悬念账面只增不减,读者期待被透支。重写区间内至少数章的蓝图,让其正面承接前章悬念(兑现或显式推进一步)`,
      });
    }
    runLength = 0;
  };
  for (const order of danglingOrders) {
    if (runLength > 0 && order === runStart + runLength) {
      runLength += 1;
    } else {
      flushRun();
      runStart = order;
      runLength = 1;
    }
  }
  flushRun();
  issues.push(...pileups);
  return issues;
}

/**
 * 爽点节奏扫描(纯计数):
 * - 连续 ≥3 章 coolPointType 逐字相同 → 同质化(读者对同款爽点疲劳)
 * - 连续 ≥2 章 coolPointType 缺失 → 纪律松脱(prompt 已要求每章标注)
 */
export function findCoolPointPacingIssues(
  blueprints: PacingScannableBlueprint[],
  options?: { streakLimit?: number; missingLimit?: number },
): PacingIssue[] {
  const streakLimit = options?.streakLimit ?? COOL_POINT_STREAK_LIMIT;
  const missingLimit = options?.missingLimit ?? COOL_POINT_MISSING_STREAK_LIMIT;

  const usable = blueprints
    .filter(bp => bp.orderIndex > 0)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const issues: PacingIssue[] = [];
  let prevOrder = 0;
  let streakType = '';
  let streakStart = 0;
  let streakLength = 0;
  let missingStart = 0;
  let missingLength = 0;

  const flushStreak = (): void => {
    if (streakType && streakLength >= streakLimit) {
      issues.push({
        chapterNumber: streakStart,
        kind: 'coolpoint-streak',
        detail: `第${streakStart}-${streakStart + streakLength - 1}章连续 ${streakLength} 章爽点类型同为「${streakType}」——读者对同款爽点会疲劳,重写其中至少一章的爽点类型并相应调整场面(打脸/碾压/反转/解谜/立威等轮换)`,
      });
    }
    streakType = '';
    streakLength = 0;
  };
  const flushMissing = (): void => {
    if (missingLength >= missingLimit) {
      issues.push({
        chapterNumber: missingStart,
        kind: 'coolpoint-missing',
        detail: `第${missingStart}-${missingStart + missingLength - 1}章连续 ${missingLength} 章蓝图缺「爽点类型」标注——每章必须安排一个当章兑现的微爽点,补标类型并确保 mustCover 有对应兑现场面`,
      });
    }
    missingLength = 0;
  };
  const flushAll = (): void => {
    flushStreak();
    flushMissing();
  };

  for (const bp of usable) {
    // 章号不连续(中间章蓝图缺失/不可用)时先结算——「连续 N 章」的前提是章号相邻,
    // 缺口两侧不能串成一串(否则 1,2,[缺],4,5 会误报连续 4 章)
    if (prevOrder > 0 && bp.orderIndex !== prevOrder + 1) {
      flushAll();
    }
    prevOrder = bp.orderIndex;

    const type = String(bp.coolPointType ?? '').trim();
    if (!type) {
      flushStreak();
      if (missingLength === 0) missingStart = bp.orderIndex;
      missingLength += 1;
      continue;
    }
    flushMissing();
    if (type === streakType) {
      streakLength += 1;
    } else {
      flushStreak();
      streakType = type;
      streakStart = bp.orderIndex;
      streakLength = 1;
    }
  }
  flushAll();
  return issues;
}

/** 悬念悬空的修复指引(交给定点修复轮:改承接方而非提出方——悬念本身没错) */
export function describeSuspenseDangling(
  chapterNumber: number,
  cen: string,
  window: number,
): string {
  const cenBrief = cen.length > 40 ? `${cen.slice(0, 40)}…` : cen;
  return `第${chapterNumber}章章尾悬念「${cenBrief}」在其后 ${window} 章蓝图中无任何承接信号(CBN/CPNs/mustCover 均未接住)——悬念开而不接是弃书点:重写第${chapterNumber + 1}章蓝图,让开场或推进节点正面承接该悬念的后果(可直接兑现,或显式推进一层后留更强的钩)`;
}

/** 组合入口:两类检测一次跑完(接线方合并进既有 qualityIssues 数组) */
export function findPacingIssues(
  blueprints: PacingScannableBlueprint[],
  options?: {
    suspenseWindow?: number;
    minCarryChars?: number;
    coolPointStreakLimit?: number;
    coolPointMissingLimit?: number;
  },
): PacingIssue[] {
  return [
    ...findSuspenseDanglingIssues(blueprints, {
      window: options?.suspenseWindow,
      minCarryChars: options?.minCarryChars,
    }),
    ...findCoolPointPacingIssues(blueprints, {
      streakLimit: options?.coolPointStreakLimit,
      missingLimit: options?.coolPointMissingLimit,
    }),
  ];
}
