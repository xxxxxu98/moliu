/**
 * 角色登场锁（revealTiming）大纲期确定性校验。
 *
 * 缺口实证（2026-09-29 r15fix-reg20 ch18）：设定集 revealTiming=第35章的老皇帝被
 * 初版大纲排进 ch18 御前召对——写作期的登场禁令对「履约点名的锁角色」强制放行
 * （requiredByContract，防两道门禁对挤的既有取舍），蓝图点名即穿透白名单，
 * 只剩判官黄签事后兜底。滚纲路径 2026-09-20 已有 prompt 锁+roster 标注，缺的是
 * 展开补全路径与确定性扫描——本模块补两层：completer 修复轮目标扩展 + roller 质检项。
 *
 * 判据纯词面（角色名出现在锁定期之前的蓝图字段），确定性范畴；主角豁免
 * （主角锁属设定自相矛盾，靠改蓝图排期修不了，交由大纲审查而非本章扫描）。
 */

export interface RevealTimingViolation {
  chapterNumber: number;
  characterName: string;
  notBeforeChapter: number;
  revealTiming: string;
}

/** 与写作侧 ChapterWritingPipeline.parseNotBeforeChapter 同口径：「第N章」 */
export function parseRevealNotBeforeChapter(revealTiming: string | undefined): number | null {
  if (!revealTiming) return null;
  const exact = revealTiming.match(/第\s*(\d+)\s*章/u);
  if (!exact) return null;
  const value = Number(exact[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export interface RevealScannableBlueprint {
  orderIndex: number;
  title?: string;
  CBN?: string;
  CEN?: string;
  summary?: string;
  CPNs?: string[] | string;
  mustCover?: string[] | string;
}

export interface RevealScannableCharacter {
  name: string;
  role?: string;
  revealTiming?: string;
}

function blueprintRevealText(bp: RevealScannableBlueprint): string {
  const cpns = Array.isArray(bp.CPNs) ? bp.CPNs.join('\n') : (bp.CPNs ?? '');
  const mustCover = Array.isArray(bp.mustCover)
    ? bp.mustCover.join('\n')
    : (bp.mustCover ?? '');
  return [bp.title, bp.CBN, bp.CEN, bp.summary, cpns, mustCover]
    .filter(Boolean)
    .join('\n');
}

export function findRevealTimingViolations(
  blueprints: RevealScannableBlueprint[],
  characters: RevealScannableCharacter[],
): RevealTimingViolation[] {
  const locked = characters
    .map(character => ({
      name: (character.name ?? '').trim(),
      role: character.role ?? '',
      revealTiming: character.revealTiming ?? '',
      notBefore: parseRevealNotBeforeChapter(character.revealTiming),
    }))
    .filter(
      item =>
        item.name.length >= 2 &&
        item.notBefore !== null &&
        !/protagonist|主角/u.test(item.role),
    );
  if (locked.length === 0) return [];

  const violations: RevealTimingViolation[] = [];
  for (const bp of blueprints) {
    if (bp.orderIndex <= 0) continue;
    const text = blueprintRevealText(bp);
    if (!text) continue;
    for (const item of locked) {
      if (bp.orderIndex < (item.notBefore ?? 0) && text.includes(item.name)) {
        violations.push({
          chapterNumber: bp.orderIndex,
          characterName: item.name,
          notBeforeChapter: item.notBefore ?? 0,
          revealTiming: item.revealTiming,
        });
      }
    }
  }
  return violations;
}

export function describeRevealTimingViolation(violation: RevealTimingViolation): string {
  return `第${violation.chapterNumber}章蓝图点名/安排了「${violation.characterName}」（revealTiming=${violation.revealTiming}，第${violation.notBeforeChapter}章前禁登场/禁揭示）——改写本章蓝图：该角色戏份换成间接方式（传旨/他人转述/无名单侧写），或把其戏份让给已解锁角色`;
}
