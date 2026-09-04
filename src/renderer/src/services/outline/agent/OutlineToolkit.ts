/**
 * 大纲修复工具集（docs/agent-architecture-refactor.md P3）：暂存写 + 确定性校验。
 *
 * 大纲的唯一真源是 Markdown rawText，ExecutableOutline 由 parseExpandedOutline 派生。
 * 写类工具只改暂存的 rawText（StagedArtifact，内存），每次写入立即重解析：
 * 解析失败 / 目标章不可用 / 段落解析为空 → 拒绝写入并把原因回喂模型，暂存稿不变。
 * `run_checks` 跑与落库门禁完全相同的 inspectOutlineCompleteness + inspectOutlineQuality，
 * 结果记成「该 revision 已校验」；最终采用物只取最后一次校验过的 revision（resolveFinal）。
 *
 * 约束：本文件不发 AI 请求、不落库；所有语义判断（哪一章该怎么改）由 agent 决定，
 * 这里只做格式校验、结构统计与确定性修复（收缩超长钩子 / 登记地点）。
 */
import {
  clipText,
  isPlainObject,
  readIntArg,
  readStringArg,
  readStringArrayArg,
  type AgentToolkit,
  type ToolCallResult,
  type ToolDescriptor,
} from '@/services/story-runtime/agent/AgentToolkit';
import { StagedArtifact } from '@/services/story-runtime/agent/StagedArtifact';

import {
  BLUEPRINT_SECTION_ALIASES,
  extractOutlineSectionBody,
  findUnregisteredCharacterNames,
  findUnregisteredLocationNames,
  isUsableBlueprint,
  repairUnregisteredLocations,
  replaceOutlineSection,
  sanitizeOutlineHookLengths,
  serializeBlueprint,
  stripInvisibleOutlineChars,
} from '../generators/outline-completer';
import { inspectOutlineQuality, type OutlineQualityIssue } from '../generators/outline-reviewer';
import { parseExpandedOutline } from '../parser/expanded-outline-parser';
import { OUTLINE_SECTION_DEFS } from '../prompts/system/expand-direction-steps';
import type { ChapterBlueprint, ExecutableOutline } from '../types/executable-outline';
import {
  inspectOutlineCompleteness,
  OUTLINE_COMPLETENESS_POLICY,
  type OutlineCompletenessReport,
} from '../validation/outlineCompleteness';

/** 暂存稿快照：rawText 为真源，outline 为其解析结果（写入时同步派生） */
export interface OutlineSnapshot {
  rawText: string;
  outline: ExecutableOutline;
}

/** 一次 run_checks 的完整结果（与 expandDirection 出口门禁同口径） */
export interface OutlineCheckOutcome {
  completeness: OutlineCompletenessReport;
  qualityIssues: OutlineQualityIssue[];
}

/** 某个 revision 的暂存稿及其校验结果 */
export interface CheckedOutlineRevision extends OutlineCheckOutcome {
  revision: number;
  snapshot: OutlineSnapshot;
}

export interface OutlineFinalResolution extends CheckedOutlineRevision {
  /** 最终稿是否因「改后未复检」而回退到上一个已校验 revision */
  revertedUnchecked: boolean;
}

export interface OutlineToolkitInput {
  rawText: string;
  outline: ExecutableOutline;
  /** run_checks 预算（确定性校验零 AI 成本，但每次都是一轮模型往返；预算防止空转） */
  maxChecks: number;
}

/** get_chapters 单次最多返回章数：50 章全量回喂会撑爆单轮结果上限 */
export const OUTLINE_CHAPTER_READ_LIMIT = 10;
/** rewrite_chapters 单次最多章数：与批量补全同一批大小，避免一次改坏半本 */
export const OUTLINE_CHAPTER_WRITE_LIMIT = 10;

type SectionKey = keyof typeof OUTLINE_SECTION_DEFS;

const SECTION_LIST = Object.entries(OUTLINE_SECTION_DEFS) as Array<
  [SectionKey, (typeof OUTLINE_SECTION_DEFS)[SectionKey]]
>;

/** 段名（规范名或别名）→ 段定义；蓝图段单列（用 get_chapters / rewrite_chapters） */
function resolveSection(name: string): (typeof OUTLINE_SECTION_DEFS)[SectionKey] | null {
  const normalized = name.trim().replace(/^##\s*/u, '');
  for (const [, def] of SECTION_LIST) {
    if (def.canonical === normalized || def.aliases.includes(normalized)) return def;
  }
  return null;
}

function isBlueprintSectionName(name: string): boolean {
  const normalized = name.trim().replace(/^##\s*/u, '');
  return BLUEPRINT_SECTION_ALIASES.includes(normalized);
}

/** 剥掉模型顺手带上的「## 段名」首行：replaceOutlineSection 自己写规范标题 */
function stripLeadingSectionHeading(body: string): string {
  return body.replace(/^\s*##\s+[^\n]*\n?/u, '').trim();
}

function charLength(text: string): number {
  return [...text.trim()].length;
}

/** 解析后的结构计数：写入前后对比用（判断「替换后解析为空」这类静默失败） */
interface StructureCounts {
  volumes: number;
  chapterBlocks: number;
  characters: number;
  foreshadows: number;
  locations: number;
  factions: number;
  blueprints: number;
  subplots: number;
}

function countStructure(outline: ExecutableOutline): StructureCounts {
  return {
    volumes: outline.volumePlan?.length ?? 0,
    chapterBlocks: outline.startupPack30?.chapterBlocks?.length ?? 0,
    characters: outline.keyCharacters?.length ?? 0,
    foreshadows: outline.foreshadowPlan?.length ?? 0,
    locations: outline.worldBuilding?.locations?.length ?? 0,
    factions: outline.worldBuilding?.factions?.length ?? 0,
    blueprints: outline.chapterBlueprints?.length ?? 0,
    subplots: outline.subplots?.length ?? 0,
  };
}

function diffCounts(before: StructureCounts, after: StructureCounts): Record<string, string> {
  const delta: Record<string, string> = {};
  for (const key of Object.keys(before) as Array<keyof StructureCounts>) {
    if (before[key] !== after[key]) delta[key] = `${before[key]}→${after[key]}`;
  }
  return delta;
}

/** 蓝图字段格式校验（门禁同阈值）；返回违规文案列表，空数组表示通过 */
function validateBlueprintFormat(blueprint: ChapterBlueprint): string[] {
  const policy = OUTLINE_COMPLETENESS_POLICY;
  const problems: string[] = [];
  const title = charLength(blueprint.title);
  if (title < policy.titleMinChars || title > policy.titleMaxChars) {
    problems.push(`标题 ${title} 字，需 ${policy.titleMinChars}–${policy.titleMaxChars} 字`);
  }
  const cbn = charLength(blueprint.CBN);
  if (cbn < policy.hookMinChars || cbn > policy.hookMaxChars) {
    problems.push(`CBN ${cbn} 字，需 ${policy.hookMinChars}–${policy.hookMaxChars} 字`);
  }
  const cen = charLength(blueprint.CEN);
  if (cen < policy.hookMinChars || cen > policy.hookMaxChars) {
    problems.push(`CEN ${cen} 字，需 ${policy.hookMinChars}–${policy.hookMaxChars} 字`);
  }
  if (blueprint.CPNs.length < policy.minimumCpns || blueprint.CPNs.length > policy.maximumCpns) {
    problems.push(`CPNs ${blueprint.CPNs.length} 条，需 ${policy.minimumCpns}–${policy.maximumCpns} 条`);
  }
  if (blueprint.mustCover.length === 0) problems.push('mustCover 不能为空');
  return problems;
}

/** 把模型给的章对象归一成 ChapterBlueprint；字段缺失/类型错返回错误文案 */
function readBlueprintArg(
  entry: unknown,
  existing: ChapterBlueprint | undefined
): { ok: true; blueprint: ChapterBlueprint } | { ok: false; error: string } {
  if (!isPlainObject(entry)) return { ok: false, error: 'chapters 每项必须是对象' };
  const chapterNumber = Number(entry.chapterNumber);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return { ok: false, error: `chapterNumber=${String(entry.chapterNumber)} 非法` };
  }
  if (chapterNumber > OUTLINE_COMPLETENESS_POLICY.startupChapterCount) {
    return {
      ok: false,
      error: `第 ${chapterNumber} 章超出启动包范围（1–${OUTLINE_COMPLETENESS_POLICY.startupChapterCount}）`,
    };
  }
  const pick = (key: string): string | undefined => readStringArg(entry, key) ?? undefined;
  const pickList = (key: string): string[] | undefined =>
    Array.isArray(entry[key]) ? readStringArrayArg(entry, key) : undefined;

  const title = pick('title') ?? existing?.title;
  const CBN = pick('CBN') ?? existing?.CBN;
  const CEN = pick('CEN') ?? existing?.CEN;
  const CPNs = pickList('CPNs') ?? existing?.CPNs;
  const mustCover = pickList('mustCover') ?? existing?.mustCover;
  const missing = [
    !title && 'title',
    !CBN && 'CBN',
    !CEN && 'CEN',
    !CPNs && 'CPNs',
    !mustCover && 'mustCover',
  ].filter((item): item is string => typeof item === 'string');
  if (missing.length > 0) {
    return {
      ok: false,
      error: `第 ${chapterNumber} 章缺字段 ${missing.join('/')}（该章原稿不存在时必须给全）`,
    };
  }
  return {
    ok: true,
    blueprint: {
      orderIndex: chapterNumber,
      title: title as string,
      summary: pick('summary') ?? existing?.summary ?? '',
      CBN: CBN as string,
      CPNs: CPNs as string[],
      CEN: CEN as string,
      mustCover: mustCover as string[],
      forbiddenZones: pickList('forbiddenZones') ?? existing?.forbiddenZones ?? [],
      hookType: pick('hookType') ?? existing?.hookType ?? '',
      hookText: pick('hookText') ?? existing?.hookText,
      coolPointType: pick('coolPointType') ?? existing?.coolPointType,
      involvedCharacters: pickList('involvedCharacters') ?? existing?.involvedCharacters,
      pacingStrategy: pick('pacingStrategy') ?? existing?.pacingStrategy,
    },
  };
}

function summarizeBlueprint(blueprint: ChapterBlueprint): Record<string, unknown> {
  return {
    chapterNumber: blueprint.orderIndex,
    title: blueprint.title,
    CBN: blueprint.CBN,
    CPNs: blueprint.CPNs,
    CEN: blueprint.CEN,
    mustCover: blueprint.mustCover,
    forbiddenZones: blueprint.forbiddenZones,
    hookText: blueprint.hookText ?? null,
    coolPointType: blueprint.coolPointType ?? (blueprint.hookType || null),
  };
}

export class OutlineToolkit implements AgentToolkit {
  readonly staged = new StagedArtifact<OutlineSnapshot>();
  private lastChecked: CheckedOutlineRevision | null = null;
  private checksUsed = 0;

  constructor(private readonly input: OutlineToolkitInput) {
    if (!input.rawText.trim()) throw new Error('OutlineToolkit 需要非空大纲文本');
    this.staged.set({ rawText: input.rawText, outline: input.outline }, { tool: 'initial' });
  }

  listTools(): ToolDescriptor[] {
    const sectionNames = SECTION_LIST.map(([, def]) => def.canonical).join('/');
    return [
      {
        name: 'get_overview',
        description:
          '读大纲总览:规模、卷纲区间、启动包区间、已登记角色/地点/势力名单、伏笔数、蓝图章数。改动后可重读。',
        args: '{}',
        dedupe: false,
      },
      {
        name: 'get_section',
        description: `读某个二级段的 Markdown 正文与该段模板(字段名以模板为准)。段名:${sectionNames}。单章蓝图请用 get_chapters。`,
        args: '{"name":"关键角色规划"}',
        dedupe: false,
      },
      {
        name: 'get_chapters',
        description: `读指定章号区间的单章蓝图(最多 ${OUTLINE_CHAPTER_READ_LIMIT} 章),返回结构化字段。`,
        args: '{"from":1,"to":10}',
        dedupe: false,
      },
      {
        name: 'rewrite_chapters',
        description:
          `暂存写:整章替换/新增若干章蓝图(最多 ${OUTLINE_CHAPTER_WRITE_LIMIT} 章)。未给出的字段沿用该章原稿;写入前按门禁阈值校验格式(标题 ${OUTLINE_COMPLETENESS_POLICY.titleMinChars}–${OUTLINE_COMPLETENESS_POLICY.titleMaxChars} 字、CBN/CEN ${OUTLINE_COMPLETENESS_POLICY.hookMinChars}–${OUTLINE_COMPLETENESS_POLICY.hookMaxChars} 字、CPNs ${OUTLINE_COMPLETENESS_POLICY.minimumCpns}–${OUTLINE_COMPLETENESS_POLICY.maximumCpns} 条),任一章不合格则整批拒绝。`,
        args: '{"chapters":[{"chapterNumber":3,"title":"…","CBN":"…","CPNs":["…"],"CEN":"…","mustCover":["…"],"forbiddenZones":["…"],"hookText":"…","coolPointType":"反转"}]}',
        dedupe: false,
      },
      {
        name: 'replace_section',
        description:
          '暂存写:用新的 Markdown 正文整体替换某个二级段(不含「## 段名」行;字段名、子标题层级必须与模板一致)。替换后会重解析,结构条目归零即拒绝。用于修开篇钩子/必出事件/卷纲/规模等段级问题。',
        args: '{"name":"前50章启动包","body":"- 开篇钩子：…\\n…"}',
        dedupe: false,
      },
      {
        name: 'append_to_section',
        description:
          '暂存写:向某个二级段末尾追加 Markdown 块(如补登记角色:「#### 角色标签」+ 姓名/角色定位/剧情功能…全字段)。追加后重解析,对应结构计数不增即拒绝。',
        args: '{"name":"关键角色规划","body":"#### 新增盟友\\n- 姓名：…\\n- 角色定位：盟友\\n…"}',
        dedupe: false,
      },
      {
        name: 'register_locations',
        description:
          '确定性修复:把卷纲/蓝图已引用但未入表的地名登记进「核心地点」子段(不发 AI 请求)。',
        args: '{"names":["青云宗","黑石城"]}',
        dedupe: false,
      },
      {
        name: 'resolve_character_references',
        description:
          '暂存记:对「未登记角色引用」做语义裁决(批量,最多 30 条)。爵位/别称/官职代称指向已登记角色 → {"reference":"齐王","as":"alias","target":"赵恺"};群体或职务泛称非个体 → {"reference":"两江河道官员","as":"collective"}。确为新具名人物时禁用本工具,改用 append_to_section 补角色块。',
        args: '{"items":[{"reference":"齐王","as":"alias","target":"赵恺"},{"reference":"两江河道官员","as":"collective"}]}',
        dedupe: false,
      },
      {
        name: 'shrink_hooks',
        description:
          '确定性修复:按分句边界收缩所有超长标题/CBN/CEN 到门禁上限(不发 AI 请求)。收不进区间的章会留在 run_checks 里,需 rewrite_chapters。',
        args: '{}',
        dedupe: false,
      },
      {
        name: 'run_checks',
        description:
          '对当前暂存稿跑与落库门禁完全相同的完整性检查(blockers)与内容质检(qualityIssues)。blockers=0 才允许 finish;每次调用消耗 1 次预算。',
        args: '{}',
        dedupe: false,
      },
    ];
  }

  has(tool: string): boolean {
    return this.toolNames().includes(tool);
  }

  toolNames(): string[] {
    return this.listTools().map(tool => tool.name);
  }

  async call(tool: string, args: unknown): Promise<ToolCallResult> {
    if (!isPlainObject(args)) {
      return { ok: false, error: `args 必须是 JSON 对象,收到:${typeof args}` };
    }
    switch (tool) {
      case 'get_overview':
        return this.getOverview();
      case 'get_section':
        return this.getSection(args);
      case 'get_chapters':
        return this.getChapters(args);
      case 'rewrite_chapters':
        return this.rewriteChapters(args);
      case 'replace_section':
        return this.replaceSection(args);
      case 'append_to_section':
        return this.appendToSection(args);
      case 'register_locations':
        return this.registerLocations(args);
      case 'resolve_character_references':
        return this.resolveCharacterReferences(args);
      case 'shrink_hooks':
        return this.shrinkHooks();
      case 'run_checks':
        return this.runChecks();
      default:
        return { ok: false, error: `未知工具:${tool}。可用:${this.toolNames().join('/')}` };
    }
  }

  /** 进展版本:写入或新校验都算进展(runner 停滞检测用) */
  progressVersion(): number {
    return this.staged.revision() * 1000 + this.checksUsed;
  }

  checksRemaining(): number {
    return Math.max(0, this.input.maxChecks - this.checksUsed);
  }

  checksConsumed(): number {
    return this.checksUsed;
  }

  /** finish 前置条件:当前稿必须已校验且 blockers=0;预算用尽时放行(出口门禁仍会 fail-closed) */
  guardFinish(): string | null {
    if (this.staged.isVerified()) return null;
    if (this.checksRemaining() === 0) return null;
    const last = this.staged.lastVerification();
    if (last && last.revision === this.staged.revision()) {
      return `当前稿未通过门禁(${last.blocking} 项 blockers:${last.summary ?? ''})。请按 run_checks 返回的 blockers 逐项修复(章级用 rewrite_chapters,段级用 replace_section/append_to_section,超长钩子先 shrink_hooks)后重新 run_checks;确实无法修复时可再次 finish 说明原因。`;
    }
    return `当前稿(revision ${this.staged.revision()})改动后尚未 run_checks,不能收尾。请先 run_checks(剩余 ${this.checksRemaining()} 次)。`;
  }

  /**
   * 收束:返回最后一次校验过的 revision(不要求通过——出口门禁由调用方按 canApply 判定)。
   * 模型改稿后没复检的改动被丢弃:采用物必须与校验物一致。
   */
  resolveFinal(): OutlineFinalResolution {
    if (!this.lastChecked) {
      // 一次都没校验:对初稿补跑一次确定性检查(零成本),保证返回物有门禁结论
      this.recordCheck();
    }
    const last = this.lastChecked as CheckedOutlineRevision;
    return { ...last, revertedUnchecked: last.revision !== this.staged.revision() };
  }

  /** 对当前暂存稿跑一次校验并记账(初始 kickoff 与 run_checks 共用) */
  recordCheck(): CheckedOutlineRevision {
    const snapshot = this.current();
    const completeness = inspectOutlineCompleteness(snapshot.outline);
    const qualityIssues = inspectOutlineQuality(snapshot.outline);
    const revision = this.staged.revision();
    this.lastChecked = { revision, snapshot, completeness, qualityIssues };
    this.staged.markVerified({
      blocking: completeness.blockers.length,
      summary: completeness.blockers
        .slice(0, 3)
        .map(blocker => clipText(blocker.message, 60))
        .join(' | '),
    });
    return this.lastChecked;
  }

  private current(): OutlineSnapshot {
    const snapshot = this.staged.get();
    if (!snapshot) throw new Error('暂存大纲为空');
    return snapshot;
  }

  /**
   * 暂存写公共路径:重解析 → 解析失败即拒绝 → 交给 verify 做结构校验 → 写入。
   * 返回写入后的 revision 与结构变化;任何拒绝都不改暂存稿。
   */
  private commitRawText(
    nextRawText: string,
    meta: { tool: string; note?: string },
    verify?: (before: OutlineSnapshot, after: OutlineSnapshot) => string | null
  ): ToolCallResult {
    const before = this.current();
    const cleaned = stripInvisibleOutlineChars(nextRawText);
    const parsed = parseExpandedOutline(cleaned);
    if (!parsed) {
      return { ok: false, error: '写入后大纲无法解析(段结构被破坏),已拒绝。请检查二级标题与字段名是否与模板一致。' };
    }
    const after: OutlineSnapshot = { rawText: cleaned, outline: parsed };
    // 裁决台账活在 outline 对象上，重解析不产出该字段：所有写入路径向前携带，
    // 否则任何一次 rewrite/append/shrink 都会把 agent 已做的语义裁决静默清空
    if (before.outline.characterReferenceResolutions) {
      after.outline.characterReferenceResolutions = before.outline.characterReferenceResolutions;
    }
    const rejection = verify?.(before, after) ?? null;
    if (rejection) return { ok: false, error: rejection };
    const revision = this.staged.set(after, meta);
    return {
      ok: true,
      result: {
        revision,
        structureDelta: diffCounts(countStructure(before.outline), countStructure(after.outline)),
        note: '改动尚未校验,收尾前必须 run_checks',
      },
    };
  }

  private getOverview(): ToolCallResult {
    const { outline } = this.current();
    const counts = countStructure(outline);
    return {
      ok: true,
      result: {
        revision: this.staged.revision(),
        verified: this.staged.isVerified(),
        title: outline.title,
        protagonist: outline.storyEngine?.protagonistName ?? null,
        storyScale: outline.storyScale,
        volumes: (outline.volumePlan ?? []).map(volume => ({
          index: volume.volumeIndex,
          title: volume.title,
          chapterRange: volume.chapterRange ?? null,
          keyCharacters: volume.keyCharacters,
        })),
        startupBlocks: (outline.startupPack30?.chapterBlocks ?? []).map(block => ({
          range: block.range,
          objective: clipText(block.objective, 60),
          mustEvents: block.mustEvents,
        })),
        openingHook: outline.startupPack30?.openingHook ?? '',
        characters: (outline.keyCharacters ?? []).map(character => `${character.name}(${character.role})`),
        locations: (outline.worldBuilding?.locations ?? []).map(location => location.name),
        factions: (outline.worldBuilding?.factions ?? []).map(faction => faction.name),
        foreshadows: (outline.foreshadowPlan ?? []).map(item => ({
          id: item.id,
          hint: clipText(item.hint, 40),
          setupChapter: item.setupChapter,
          payoffChapter: item.payoffChapter,
        })),
        counts,
        policy: OUTLINE_COMPLETENESS_POLICY,
      },
    };
  }

  private getSection(args: Record<string, unknown>): ToolCallResult {
    const name = readStringArg(args, 'name');
    if (!name) return { ok: false, error: 'name 必填(二级段名)' };
    if (isBlueprintSectionName(name)) {
      return { ok: false, error: '单章蓝图请用 get_chapters 按区间读取' };
    }
    const def = resolveSection(name);
    if (!def) {
      return {
        ok: false,
        error: `未知段名「${name}」。可用:${SECTION_LIST.map(([, item]) => item.canonical).join('/')}`,
      };
    }
    const body = extractOutlineSectionBody(this.current().rawText, def.aliases);
    return {
      ok: true,
      result: {
        name: def.canonical,
        revision: this.staged.revision(),
        body,
        template: def.template,
      },
    };
  }

  private getChapters(args: Record<string, unknown>): ToolCallResult {
    const blueprints = this.current().outline.chapterBlueprints ?? [];
    const maxChapter = Math.max(
      OUTLINE_COMPLETENESS_POLICY.startupChapterCount,
      ...blueprints.map(item => item.orderIndex)
    );
    const from = readIntArg(args, 'from', 1, 1, maxChapter);
    const to = readIntArg(args, 'to', Math.min(from + OUTLINE_CHAPTER_READ_LIMIT - 1, maxChapter), from, maxChapter);
    if (to - from + 1 > OUTLINE_CHAPTER_READ_LIMIT) {
      return { ok: false, error: `单次最多读 ${OUTLINE_CHAPTER_READ_LIMIT} 章,请缩小区间(from=${from},to=${to})` };
    }
    const byOrder = new Map(blueprints.map(item => [item.orderIndex, item] as const));
    const chapters: Array<Record<string, unknown>> = [];
    const missing: number[] = [];
    for (let chapterNumber = from; chapterNumber <= to; chapterNumber += 1) {
      const blueprint = byOrder.get(chapterNumber);
      if (blueprint) chapters.push(summarizeBlueprint(blueprint));
      else missing.push(chapterNumber);
    }
    return {
      ok: true,
      result: { revision: this.staged.revision(), from, to, chapters, missing },
    };
  }

  private rewriteChapters(args: Record<string, unknown>): ToolCallResult {
    const entries = Array.isArray(args.chapters) ? args.chapters : null;
    if (!entries || entries.length === 0) return { ok: false, error: 'chapters 必须是非空数组' };
    if (entries.length > OUTLINE_CHAPTER_WRITE_LIMIT) {
      return { ok: false, error: `单次最多改 ${OUTLINE_CHAPTER_WRITE_LIMIT} 章,请分批` };
    }
    const before = this.current();
    const existingByOrder = new Map(
      (before.outline.chapterBlueprints ?? []).map(item => [item.orderIndex, item] as const)
    );
    const incoming = new Map<number, ChapterBlueprint>();
    const problems: string[] = [];
    for (const entry of entries) {
      const read = readBlueprintArg(entry, existingByOrder.get(Number((entry as Record<string, unknown>)?.chapterNumber)));
      if (!read.ok) {
        problems.push(read.error);
        continue;
      }
      const formatProblems = validateBlueprintFormat(read.blueprint);
      if (formatProblems.length > 0) {
        problems.push(`第 ${read.blueprint.orderIndex} 章:${formatProblems.join(';')}`);
        continue;
      }
      incoming.set(read.blueprint.orderIndex, read.blueprint);
    }
    if (problems.length > 0) {
      return { ok: false, error: `格式不合格,整批未写入:${problems.join(' / ')}` };
    }

    const merged = new Map(existingByOrder);
    for (const [order, blueprint] of incoming) merged.set(order, blueprint);
    const nextRawText = replaceOutlineSection(
      before.rawText,
      BLUEPRINT_SECTION_ALIASES,
      BLUEPRINT_SECTION_ALIASES[0],
      [...merged.values()]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(serializeBlueprint)
        .join('\n\n')
    );
    const touched = [...incoming.keys()].sort((a, b) => a - b);
    return this.commitRawText(
      nextRawText,
      { tool: 'rewrite_chapters', note: `第 ${touched.join('、')} 章` },
      (_prev, after) => {
        const parsedByOrder = new Map(
          (after.outline.chapterBlueprints ?? []).map(item => [item.orderIndex, item] as const)
        );
        const unusable = touched.filter(order => !isUsableBlueprint(parsedByOrder.get(order)));
        if (unusable.length > 0) {
          return `第 ${unusable.join('、')} 章写入后解析不可用(标题占位或 CBN/CEN 为空),整批已拒绝`;
        }
        const lost = [...existingByOrder.keys()].filter(order => !parsedByOrder.has(order));
        if (lost.length > 0) {
          return `写入导致第 ${lost.join('、')} 章蓝图丢失,整批已拒绝`;
        }
        return null;
      }
    );
  }

  private replaceSection(args: Record<string, unknown>): ToolCallResult {
    const name = readStringArg(args, 'name');
    const rawBody = typeof args.body === 'string' ? args.body : '';
    if (!name) return { ok: false, error: 'name 必填' };
    if (isBlueprintSectionName(name)) {
      return { ok: false, error: '单章蓝图段禁止整段替换,请用 rewrite_chapters 按章改' };
    }
    const def = resolveSection(name);
    if (!def) return { ok: false, error: `未知段名「${name}」` };
    const body = stripLeadingSectionHeading(rawBody);
    if (!body) return { ok: false, error: 'body 不能为空' };
    const before = this.current();
    const nextRawText = replaceOutlineSection(before.rawText, def.aliases, def.canonical, body);
    return this.commitRawText(
      nextRawText,
      { tool: 'replace_section', note: def.canonical },
      (prev, after) => {
        const a = countStructure(prev.outline);
        const b = countStructure(after.outline);
        const zeroed = (Object.keys(a) as Array<keyof StructureCounts>).filter(
          key => a[key] > 0 && b[key] === 0
        );
        if (zeroed.length > 0) {
          return `替换「${def.canonical}」后 ${zeroed.join('/')} 解析为 0 条(原有 ${zeroed.map(key => a[key]).join('/')}),字段名或子标题层级不符模板,已拒绝。请先 get_section 读模板。`;
        }
        return null;
      }
    );
  }

  private appendToSection(args: Record<string, unknown>): ToolCallResult {
    const name = readStringArg(args, 'name');
    const rawBody = typeof args.body === 'string' ? args.body : '';
    if (!name) return { ok: false, error: 'name 必填' };
    if (isBlueprintSectionName(name)) {
      return { ok: false, error: '单章蓝图请用 rewrite_chapters 新增章' };
    }
    const def = resolveSection(name);
    if (!def) return { ok: false, error: `未知段名「${name}」` };
    const body = stripLeadingSectionHeading(rawBody);
    if (!body) return { ok: false, error: 'body 不能为空' };
    const before = this.current();
    const existing = extractOutlineSectionBody(before.rawText, def.aliases);
    const nextRawText = replaceOutlineSection(
      before.rawText,
      def.aliases,
      def.canonical,
      `${existing}\n\n${body}`.trim()
    );
    return this.commitRawText(
      nextRawText,
      { tool: 'append_to_section', note: def.canonical },
      (prev, after) => {
        const a = countStructure(prev.outline);
        const b = countStructure(after.outline);
        const grew = (Object.keys(a) as Array<keyof StructureCounts>).some(key => b[key] > a[key]);
        if (!grew) {
          return `向「${def.canonical}」追加后没有解析出任何新条目(角色/伏笔/地点/势力/支线计数不变),块格式不符模板,已拒绝。请先 get_section 读模板,四级标题「#### 」+ 全字段。`;
        }
        return null;
      }
    );
  }

  /**
   * agent 语义裁决台账写入：未登记引用 → alias(指向登记姓名)/collective(群体泛称)。
   * alias 目标必须在登记表内（笔误名拒绝写入），确为新人物引导走 append_to_section。
   * 台账挂在 outline 上并在所有重解析写入中向前携带（见 commitRawText）。
   */
  private resolveCharacterReferences(args: Record<string, unknown>): ToolCallResult {
    const items = Array.isArray(args.items) ? args.items : null;
    if (!items || items.length === 0) return { ok: false, error: 'items 必须是非空数组' };
    if (items.length > 30) return { ok: false, error: '单次最多裁决 30 条,请分批' };
    const before = this.current();
    const registered = new Set(
      (before.outline.keyCharacters ?? [])
        .map(character => character.name?.trim())
        .filter((name): name is string => Boolean(name)),
    );
    const merged = new Map(
      (before.outline.characterReferenceResolutions ?? [])
        .map(entry => [entry.reference.trim(), entry] as const),
    );
    const added: string[] = [];
    for (const entry of items) {
      if (!isPlainObject(entry)) return { ok: false, error: 'items 每项必须是对象' };
      const reference = readStringArg(entry, 'reference')?.trim();
      const as = readStringArg(entry, 'as');
      const target = readStringArg(entry, 'target')?.trim();
      if (!reference) return { ok: false, error: 'reference 必填' };
      if (as !== 'alias' && as !== 'collective') {
        return { ok: false, error: `as 必须是 alias 或 collective,收到:${as || '(空)'}` };
      }
      if (as === 'alias') {
        if (!target || !registered.has(target)) {
          return {
            ok: false,
            error: `「${reference}」的 alias 目标「${target || '(空)'}」不在已登记角色名单内。别称必须指向已登记姓名;确为新人物请用 append_to_section 补角色块`,
          };
        }
        merged.set(reference, { reference, as, target });
      } else {
        merged.set(reference, { reference, as });
      }
      added.push(reference);
    }
    const nextOutline = {
      ...before.outline,
      characterReferenceResolutions: [...merged.values()],
    };
    const revision = this.staged.set(
      { rawText: before.rawText, outline: nextOutline },
      { tool: 'resolve_character_references', note: added.join('、') },
    );
    return {
      ok: true,
      result: { revision, resolvedCount: added.length, note: '改动尚未校验,收尾前必须 run_checks' },
    };
  }

  private registerLocations(args: Record<string, unknown>): ToolCallResult {    const names = readStringArrayArg(args, 'names');
    if (names.length === 0) return { ok: false, error: 'names 必须是非空字符串数组' };
    const before = this.current();
    const repaired = repairUnregisteredLocations({
      rawText: before.rawText,
      outline: before.outline,
      locationNames: names,
    });
    if (repaired.rawText === before.rawText) {
      return { ok: false, error: repaired.warnings.join(';') || '地点未能登记(缺「核心地点」子段)' };
    }
    const committed = this.commitRawText(repaired.rawText, {
      tool: 'register_locations',
      note: names.join('、'),
    });
    if (!committed.ok) return committed;
    return {
      ok: true,
      result: { ...(committed.result as Record<string, unknown>), warnings: repaired.warnings },
    };
  }

  private shrinkHooks(): ToolCallResult {
    const before = this.current();
    const sanitized = sanitizeOutlineHookLengths(before.rawText, before.outline);
    if (!sanitized) {
      return { ok: true, result: { changed: 0, note: '没有可本地收缩的超长标题/CBN/CEN' } };
    }
    const committed = this.commitRawText(sanitized.rawText, { tool: 'shrink_hooks' });
    if (!committed.ok) return committed;
    return {
      ok: true,
      result: { ...(committed.result as Record<string, unknown>), warnings: sanitized.warnings },
    };
  }

  private runChecks(): ToolCallResult {
    if (this.checksRemaining() === 0) {
      return {
        ok: false,
        error: `校验预算已用尽(${this.input.maxChecks} 次)。请直接输出 action=finish;未复检的改动不会被采用。`,
      };
    }
    if (this.staged.isVerified()) {
      return { ok: false, error: '当前稿已通过门禁,无需重复 run_checks,请直接 finish。' };
    }
    this.checksUsed += 1;
    const checked = this.recordCheck();
    const blockers = checked.completeness.blockers;
    const warnings = checked.completeness.warnings ?? [];
    const chaptersWithBlockers = [
      ...new Set(blockers.map(blocker => blocker.chapterNumber).filter((no): no is number => no !== undefined)),
    ].sort((a, b) => a - b);
    return {
      ok: true,
      result: {
        revision: checked.revision,
        canApply: checked.completeness.canApply,
        blocking: blockers.length,
        checksRemaining: this.checksRemaining(),
        blockers: blockers.slice(0, 30).map(blocker => ({
          kind: blocker.kind,
          chapterNumber: blocker.chapterNumber ?? null,
          message: clipText(blocker.message, 200),
        })),
        blockersOmitted: Math.max(0, blockers.length - 30),
        warnings: warnings.slice(0, 10).map(item => clipText(item.message, 160)),
        qualityIssues: checked.qualityIssues.slice(0, 20).map(issue => ({
          kind: issue.kind,
          chapterNumber: issue.chapterOrder ?? null,
          detail: clipText(issue.detail, 200),
        })),
        hints: {
          chaptersWithBlockers,
          unregisteredCharacters: findUnregisteredCharacterNames(blockers),
          unregisteredLocations: findUnregisteredLocationNames([...blockers, ...warnings]),
        },
      },
    };
  }
}
