import type { ChapterBlueprint, ExecutableOutline } from '../types/executable-outline';

/**
 * 长篇商业网文大纲的可应用门槛。
 *
 * 这些数值必须与 expand-direction-prompt 的固定模板保持一致，避免提示词要求
 * 50/10/10，运行时却用更低阈值放行残缺结果。
 */
export const OUTLINE_COMPLETENESS_POLICY = {
  startupChapterCount: 50,
  minimumKeyCharacters: 10,
  minimumForeshadows: 10,
  titleMinChars: 6,
  titleMaxChars: 16,
  hookMinChars: 8,
  hookMaxChars: 25,
  minimumCpns: 1,
  maximumCpns: 3,
} as const;

export type OutlineCompletenessBlockerKind =
  | 'opening-hook'
  | 'chapter-count'
  | 'character-count'
  | 'foreshadow-count'
  | 'placeholder-title'
  | 'invalid-title-length'
  | 'invalid-hook-length'
  | 'invalid-cpn-count'
  | 'invalid-chapter-order'
  | 'incomplete-blueprint'
  | 'chronology-regression';

export interface OutlineCompletenessBlocker {
  kind: OutlineCompletenessBlockerKind;
  message: string;
  chapterNumber?: number;
}

export interface OutlineCompletenessReport {
  canApply: boolean;
  blockers: OutlineCompletenessBlocker[];
}

const STRUCTURAL_BLOCKER_KINDS = new Set<OutlineCompletenessBlockerKind>([
  'opening-hook',
  'chapter-count',
  'character-count',
  'foreshadow-count',
  'placeholder-title',
  'incomplete-blueprint',
  'invalid-chapter-order',
]);

export function hasStructuralOutlineBlockers(report: OutlineCompletenessReport): boolean {
  return report.blockers.some(blocker => STRUCTURAL_BLOCKER_KINDS.has(blocker.kind));
}

const PLACEHOLDER_TITLE_RE =
  /^第[一二三四五六七八九十百千零\d]+章(?:\s*[（(]?未命名[)）]?)?$/u;

function isPlaceholderTitle(title: string): boolean {
  return !title.trim() || PLACEHOLDER_TITLE_RE.test(title.trim());
}

function blueprintText(blueprint: ChapterBlueprint): string {
  return [
    blueprint.title,
    blueprint.CBN,
    ...blueprint.CPNs,
    blueprint.CEN,
    ...blueprint.mustCover,
  ].join('；');
}

function blueprintEvents(blueprint: ChapterBlueprint): string[] {
  return [
    blueprint.title,
    blueprint.CBN,
    ...blueprint.CPNs,
    blueprint.CEN,
    ...blueprint.mustCover,
  ]
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function inspectChronologyRegressions(outline: ExecutableOutline): OutlineCompletenessBlocker[] {
  const blockers: OutlineCompletenessBlocker[] = [];
  const sorted = [...(outline.chapterBlueprints ?? [])].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  const terminalChapterByCharacter = new Map<string, number>();
  const names = outline.keyCharacters
    .map(character => character.name?.trim())
    .filter((name): name is string => Boolean(name && name.length >= 2));
  let closedDeadlineChapter: number | null = null;

  for (const blueprint of sorted) {
    const text = blueprintText(blueprint);
    const events = blueprintEvents(blueprint);
    if (
      closedDeadlineChapter !== null &&
      /三日(?:期限|之期).{0,8}(?:第一日|已至|已到|开始)/u.test(text)
    ) {
      blockers.push({
        kind: 'chronology-regression',
        chapterNumber: blueprint.orderIndex,
        message: `第${blueprint.orderIndex}章重启了第${closedDeadlineChapter}章已结束的“三日之期”`,
      });
      closedDeadlineChapter = null;
    }
    if (/三日(?:期限|之期).{0,8}(?:终局|结束|已结|届满)/u.test(text)) {
      closedDeadlineChapter = blueprint.orderIndex;
    }

    for (const name of names) {
      const escapedName = escapeRegExp(name);
      const released = new RegExp(`${escapedName}.{0,10}(?:越狱|逃脱|获释|释放|复职|官复原职|被劫走)`, 'u');
      const activeAfterTerminal = new RegExp(
        `${escapedName}(?:本人)?(?:当即|随即|立刻|连夜|再次|重新|亲自|暗中|当堂|仍|仍然|又)?(?:带着|率领|下令|派人|指挥|堵在|包围|审讯|缉拿|主持|召集)`,
        'u'
      );
      const terminal = new RegExp(
        `${escapedName}(?:本人)?(?:当场|当堂|随后|最终|已经|已|也|却|旋即|随即|立即|仍|仍然|又|因[^，,。；;]{1,6}){0,2}(?:被(?:当场)?(?:拿下|收押|押解|革职|处死|斩杀)|入狱|伏法|身亡)`,
        'u'
      );
      const terminalChapter = terminalChapterByCharacter.get(name);
      const releasedInChapter = events.some(event => released.test(event));
      const activeInChapter = events.some(
        event => !terminal.test(event) && activeAfterTerminal.test(event)
      );
      const terminalInChapter = events.some(event => terminal.test(event));
      if (terminalChapter !== undefined && releasedInChapter) {
        terminalChapterByCharacter.delete(name);
      } else if (terminalChapter !== undefined && activeInChapter) {
        blockers.push({
          kind: 'chronology-regression',
          chapterNumber: blueprint.orderIndex,
          message: `第${blueprint.orderIndex}章让第${terminalChapter}章已失去行动自由/官职的“${name}”无解释恢复权力行为`,
        });
      }
      if (terminalInChapter) {
        terminalChapterByCharacter.set(name, blueprint.orderIndex);
      }
    }
  }

  return blockers;
}

/**
 * 只检查“能否安全应用”的硬条件；内容质量问题仍由 outline-reviewer 负责。
 */
export function inspectOutlineCompleteness(
  outline: ExecutableOutline,
): OutlineCompletenessReport {
  const blockers: OutlineCompletenessBlocker[] = [];
  const blueprints = outline.chapterBlueprints ?? [];
  const seenOrders = new Set<number>();

  if (!(outline.startupPack30?.openingHook ?? '').trim()) {
    blockers.push({
      kind: 'opening-hook',
      message: `前${OUTLINE_COMPLETENESS_POLICY.startupChapterCount}章启动包缺少开篇钩子，不能用于生产续写`,
    });
  }

  if (blueprints.length !== OUTLINE_COMPLETENESS_POLICY.startupChapterCount) {
    blockers.push({
      kind: 'chapter-count',
      message:
        `单章蓝图数量为 ${blueprints.length}，` +
        `必须完整生成 ${OUTLINE_COMPLETENESS_POLICY.startupChapterCount} 章后才能应用`,
    });
  }

  if (outline.keyCharacters.length < OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters) {
    blockers.push({
      kind: 'character-count',
      message:
        `关键角色仅 ${outline.keyCharacters.length} 个，` +
        `至少需要 ${OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters} 个`,
    });
  }

  if (outline.foreshadowPlan.length < OUTLINE_COMPLETENESS_POLICY.minimumForeshadows) {
    blockers.push({
      kind: 'foreshadow-count',
      message:
        `伏笔仅 ${outline.foreshadowPlan.length} 条，` +
        `至少需要 ${OUTLINE_COMPLETENESS_POLICY.minimumForeshadows} 条`,
    });
  }

  for (const blueprint of blueprints) {
    const chapterNumber = blueprint.orderIndex;
    if (
      !Number.isInteger(chapterNumber) ||
      chapterNumber < 1 ||
      chapterNumber > OUTLINE_COMPLETENESS_POLICY.startupChapterCount ||
      seenOrders.has(chapterNumber)
    ) {
      blockers.push({
        kind: 'invalid-chapter-order',
        chapterNumber,
        message: `单章蓝图章号 ${chapterNumber} 非 1～${OUTLINE_COMPLETENESS_POLICY.startupChapterCount} 的唯一连续整数`,
      });
    }
    seenOrders.add(chapterNumber);
    if (isPlaceholderTitle(blueprint.title)) {
      blockers.push({
        kind: 'placeholder-title',
        chapterNumber,
        message: `第${chapterNumber}章仍是占位标题，必须生成可辨识的情节标题`,
      });
    }

    const titleLength = blueprint.title.trim().length;
    if (
      titleLength < OUTLINE_COMPLETENESS_POLICY.titleMinChars ||
      titleLength > OUTLINE_COMPLETENESS_POLICY.titleMaxChars
    ) {
      blockers.push({
        kind: 'invalid-title-length',
        chapterNumber,
        message: `第${chapterNumber}章标题长度 ${titleLength} 字，必须为 ${OUTLINE_COMPLETENESS_POLICY.titleMinChars}～${OUTLINE_COMPLETENESS_POLICY.titleMaxChars} 字`,
      });
    }

    for (const [label, hook] of [['CBN', blueprint.CBN], ['CEN', blueprint.CEN]] as const) {
      const length = hook.trim().length;
      if (
        length < OUTLINE_COMPLETENESS_POLICY.hookMinChars ||
        length > OUTLINE_COMPLETENESS_POLICY.hookMaxChars
      ) {
        blockers.push({
          kind: 'invalid-hook-length',
          chapterNumber,
          message: `第${chapterNumber}章 ${label} 长度 ${length} 字，必须为 ${OUTLINE_COMPLETENESS_POLICY.hookMinChars}～${OUTLINE_COMPLETENESS_POLICY.hookMaxChars} 字`,
        });
      }
    }

    if (
      blueprint.CPNs.length < OUTLINE_COMPLETENESS_POLICY.minimumCpns ||
      blueprint.CPNs.length > OUTLINE_COMPLETENESS_POLICY.maximumCpns
    ) {
      blockers.push({
        kind: 'invalid-cpn-count',
        chapterNumber,
        message: `第${chapterNumber}章 CPN 数量为 ${blueprint.CPNs.length}，必须为 ${OUTLINE_COMPLETENESS_POLICY.minimumCpns}～${OUTLINE_COMPLETENESS_POLICY.maximumCpns} 个`,
      });
    }

    if (
      !blueprint.CBN.trim() ||
      blueprint.CPNs.length === 0 ||
      !blueprint.CEN.trim() ||
      blueprint.mustCover.length === 0
    ) {
      blockers.push({
        kind: 'incomplete-blueprint',
        chapterNumber,
        message: `第${chapterNumber}章缺少 CBN、CPNs、CEN 或 mustCover，不能用于续写`,
      });
    }
  }

  for (let chapterNumber = 1; chapterNumber <= OUTLINE_COMPLETENESS_POLICY.startupChapterCount; chapterNumber += 1) {
    if (!seenOrders.has(chapterNumber)) {
      blockers.push({
        kind: 'invalid-chapter-order',
        chapterNumber,
        message: `单章蓝图缺少第${chapterNumber}章`,
      });
    }
  }

  blockers.push(...inspectChronologyRegressions(outline));

  return { canApply: blockers.length === 0, blockers };
}
