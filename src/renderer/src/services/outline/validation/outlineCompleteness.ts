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
  | 'chronology-regression'
  | 'inconsistent-story-scale'
  | 'chapter-reference-out-of-range'
  | 'unknown-character-reference'
  | 'protagonist-name-mismatch';

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

function parseTargetWordCount(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[,，\s]/gu, '');
  const range = normalized.match(/(\d+(?:\.\d+)?)万?[-~～至到](\d+(?:\.\d+)?)万?(?:字)?/u);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const multiplier = normalized.includes('万') ? 10_000 : 1;
      return Math.round(((min + max) / 2) * multiplier);
    }
  }
  const wan = normalized.match(/(\d+(?:\.\d+)?)万(?:字)?/u);
  if (wan) return Math.round(Number(wan[1]) * 10_000);
  const plain = normalized.match(/(\d{4,9})(?:字)?/u);
  return plain ? Number(plain[1]) : null;
}

const GENERIC_CHARACTER_REFERENCES = new Set([
  '主角', '男主', '女主', '皇帝', '太子', '皇后', '反派', '盟友', '导师', '配角',
]);

/**
 * 非姓名形态的"角色引用"特征：括号注解（「忠诚执行者）」「韩尚书（六部尚书…）"）、
 * 标点断句、关系短语字（从/到/与/和…）。这些是模型把关系字段/描述整句写进了
 * 角色引用字段（2026-08-16 矩阵实测 mimo/ds-pro 大纲触发 40+ 条此类 blocker
 * 拦死整轮），补登记救不了（不是名字）、整体重试不收敛（格式惯性）。
 */
const IMPLAUSIBLE_NAME_RE = /[（()），,。；;、··]/u;
const RELATION_PHRASE_RE = /[从到与和及在对为向着]/u;
/** 组织/集体称呼（「临川商会」类）与纯职务词尾（「府衙通判」类），非可建档姓名 */
const ORGANIZATION_NAME_RE =
  /(?:[门派司会盟教帮堂阁殿宗楼局署馆](?:军|团|队|众)?$)|(?:^[旧新][\u4e00-\u9fa5]{1,4}$)|(?:^[一二三四五六七八九十]+老$)/u;
/** 纯职务词（「通判」「知府」——整体即职务，无姓名成分）；「顾师爷」「钱通判」这类姓+职务是合法称呼，放行 */
const TITLE_ONLY_RE = /^(?:会长|通判|知府|知县|师爷|管家|主簿|幕僚|掌柜|首领|侍卫|仆役)$/u;
/** 机构前缀（含可选职务后缀）（「临川商会会长」「府衙通判」「县衙主簿」）：机构代称，非可建档个人姓名 */
const ORG_TITLE_RE = /^[\u4e00-\u9fa5]{0,6}(?:商会|府衙|县衙|衙门|朝廷|东宫|内阁|翰林|司礼监|军机处)(?:会长|通判|知府|知县|主簿|幕僚|首领|掌印|大学士)?$/u;

/** 引用值是否像一个可建档的姓名；不像姓名的引用不产生 unknown-character-reference blocker */
function isPlausibleCharacterName(value: string): boolean {
  const name = value.trim();
  if (!name) return false;
  if ([...name].length > 10) return false;
  if (IMPLAUSIBLE_NAME_RE.test(name)) return false;
  if (RELATION_PHRASE_RE.test(name)) return false;
  if (ORGANIZATION_NAME_RE.test(name)) return false;
  if (TITLE_ONLY_RE.test(name)) return false;
  if (ORG_TITLE_RE.test(name)) return false;
  return true;
}

function inspectSemanticConsistency(outline: ExecutableOutline): OutlineCompletenessBlocker[] {
  const blockers: OutlineCompletenessBlocker[] = [];
  const totalChapters = outline.storyScale?.estimatedChapterCount;

  if (outline.storyScale && Number.isFinite(totalChapters) && totalChapters > 0) {
    const targetWords = parseTargetWordCount(outline.storyScale.targetWordCount);
    const computedWords = totalChapters * outline.storyScale.averageWordsPerChapter;
    if (targetWords && computedWords > 0) {
      const drift = Math.abs(targetWords - computedWords) / targetWords;
      if (drift > 0.1) {
        blockers.push({
          kind: 'inconsistent-story-scale',
          message: `故事规模互相矛盾：目标 ${targetWords} 字，但 ${totalChapters} 章 × ${outline.storyScale.averageWordsPerChapter} 字 = ${computedWords} 字（偏差 ${Math.round(drift * 100)}%）`,
        });
      }
    }
    const plannedByVolumes = outline.storyScale.suggestedVolumeCount
      * outline.storyScale.estimatedChaptersPerVolume;
    if (plannedByVolumes > 0 && Math.abs(plannedByVolumes - totalChapters) / totalChapters > 0.1) {
      blockers.push({
        kind: 'inconsistent-story-scale',
        message: `卷章规模互相矛盾：总章数 ${totalChapters}，但 ${outline.storyScale.suggestedVolumeCount} 卷 × 每卷 ${outline.storyScale.estimatedChaptersPerVolume} 章 = ${plannedByVolumes} 章`,
      });
    }
  }

  if (Number.isFinite(totalChapters) && totalChapters > 0) {
    const checkChapter = (label: string, chapter: number | null | undefined): void => {
      if (chapter !== null && chapter !== undefined && (chapter < 1 || chapter > totalChapters)) {
        blockers.push({
          kind: 'chapter-reference-out-of-range',
          message: `${label}指向第 ${chapter} 章，超出全书 1～${totalChapters} 章范围`,
        });
      }
    };
    for (const subplot of outline.subplots ?? []) {
      checkChapter(`支线「${subplot.title}」开始章节`, subplot.startChapter);
      checkChapter(`支线「${subplot.title}」结束章节`, subplot.endChapter);
      if (subplot.startChapter && subplot.endChapter && subplot.startChapter > subplot.endChapter) {
        blockers.push({
          kind: 'chapter-reference-out-of-range',
          message: `支线「${subplot.title}」章节倒置：${subplot.startChapter}～${subplot.endChapter} 章`,
        });
      }
    }
    for (const foreshadow of outline.foreshadowPlan ?? []) {
      checkChapter(`伏笔「${foreshadow.hint}」埋设章节`, foreshadow.setupChapter);
      checkChapter(`伏笔「${foreshadow.hint}」回收章节`, foreshadow.payoffChapter);
      if (foreshadow.setupChapter && foreshadow.payoffChapter
        && foreshadow.setupChapter > foreshadow.payoffChapter) {
        blockers.push({
          kind: 'chapter-reference-out-of-range',
          message: `伏笔「${foreshadow.hint}」先回收后埋设：第${foreshadow.setupChapter}章埋设、第${foreshadow.payoffChapter}章回收`,
        });
      }
    }
    for (const point of outline.coolPointPlan ?? []) {
      checkChapter(`爽点「${point.description || point.type}」兑现章节`, point.suggestedChapter);
    }
    for (const chapter of outline.emotionPlan?.highPoints ?? []) checkChapter('情绪高点', chapter);
    for (const chapter of outline.emotionPlan?.lowPoints ?? []) checkChapter('情绪低点', chapter);
    checkChapter('金手指首次兑现章节', outline.goldenfingerPlan?.firstRevealChapter);
  }

  const canonicalNames = new Set(
    (outline.keyCharacters ?? []).map(character => character.name?.trim()).filter(Boolean),
  );
  const protagonistName = outline.storyEngine?.protagonistName?.trim();
  if (protagonistName
    && !GENERIC_CHARACTER_REFERENCES.has(protagonistName)
    && !canonicalNames.has(protagonistName)) {
    blockers.push({
      kind: 'protagonist-name-mismatch',
      message: `核心驱动中的主角「${protagonistName}」未进入关键角色规划，角色真源不一致`,
    });
  }

  const checkCharacterReference = (
    label: string,
    reference: string | undefined,
    chapterNumber?: number,
  ): void => {
    const value = reference?.trim();
    if (!value || GENERIC_CHARACTER_REFERENCES.has(value)) return;
    if ([...canonicalNames].some(name => value.includes(name))) return;
    // 关系短语/职务/组织等非姓名形态：字段本身被模型写坏，不是缺角色登记，
    // 产生 blocker 只会把整份大纲 fail-closed 且无修复通道。
    if (!isPlausibleCharacterName(value)) return;
    blockers.push({
      kind: 'unknown-character-reference',
      chapterNumber,
      message: `${label}引用了未登记角色「${value}」；必须补入关键角色规划或改用已登记角色`,
    });
  };
  for (const volume of outline.volumePlan ?? []) {
    for (const reference of volume.keyCharacters ?? []) {
      checkCharacterReference(`第${volume.volumeIndex}卷关键角色`, reference);
    }
  }
  for (const subplot of outline.subplots ?? []) {
    for (const reference of subplot.relatedCharacters ?? []) {
      checkCharacterReference(`支线「${subplot.title}」关联角色`, reference);
    }
  }
  for (const foreshadow of outline.foreshadowPlan ?? []) {
    checkCharacterReference(`伏笔「${foreshadow.hint}」载体角色`, foreshadow.carrierCharacter);
  }
  for (const character of outline.keyCharacters ?? []) {
    for (const relationship of character.relationshipChanges ?? []) {
      checkCharacterReference(`角色「${character.name}」关系`, relationship.targetName);
    }
  }
  for (const blueprint of outline.chapterBlueprints ?? []) {
    for (const reference of blueprint.involvedCharacters ?? []) {
      checkCharacterReference(`第${blueprint.orderIndex}章出场角色`, reference, blueprint.orderIndex);
    }
  }

  return blockers;
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
  blockers.push(...inspectSemanticConsistency(outline));

  return { canApply: blockers.length === 0, blockers };
}
