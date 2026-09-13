/**
 * 单章蓝图再生：写作期履约连续失败时，把失败归因反转到蓝图本身并重写它。
 *
 * 背景（根治方案 ①）：repairChapterBlueprints 只在生成管线被引用，大纲落库开始
 * 写作后失联——坏蓝图的债全部由履约重试硬扛，重写 N 轮也修不好「合同本身有病」。
 * 本模块让批量层在「同章履约域连续失败 ≥N 次」后触发：
 * 1. 确定性体检先行（isCrossChapterGoal / 空壳 CEN / 模板 CBN），命中病可直接定向改；
 * 2. 未命中确定性病也允许 AI 再生一次（以已写状态为基底，复用滚动续纲的上下文构建）；
 * 3. 预算护栏：每章生命周期最多再生 maxRegenerationsPerChapter 次。
 */

import type { PlotNode, Project } from '@/types/project';
import type { ChapterBlueprint } from '../types/executable-outline';
import {
  buildRollBlueprintPrompt,
  buildRollContextBase,
  parseBlueprintBlocks,
} from './outline-roller';
import {
  isCrossChapterGoal,
  isHollowChapterHook,
} from '@/services/story-runtime/chapterBlueprintNormalize';

/** 同一章履约失败达到该次数后触发蓝图体检/再生 */
export const FULFILLMENT_FAILURE_TRIGGER = 2;

/** 单章生命周期内蓝图再生次数上限（防止死循环换一种形式回来） */
export const MAX_REGENERATIONS_PER_CHAPTER = 1;

export interface BlueprintDefect {
  kind: 'over-scoped-mustcover' | 'hollow-cen' | 'template-cbn' | 'empty-fields';
  detail: string;
}

/**
 * 确定性蓝图体检：能直接指认「这章合同为什么不可履约」的病。
 * 与滚动质检同口径（subset），但面向单章、无需批内相邻比较。
 */
export function inspectChapterBlueprintDefects(node: PlotNode): BlueprintDefect[] {
  return inspectBlueprintObjectDefects({
    orderIndex: (node.orderIndex ?? 0) + 1,
    title: node.title,
    summary: node.description,
    CBN: node.CBN,
    CPNs: node.CPNs,
    CEN: node.CEN,
    mustCover: node.mustCover,
  });
}

/** 体检的纯函数核：PlotNode 与再生产物（ChapterBlueprint 形状）共用同一套规则 */
export function inspectBlueprintObjectDefects(input: {
  orderIndex: number;
  title?: string;
  summary?: string;
  CBN?: string;
  CPNs?: string[];
  CEN?: string;
  mustCover?: string[];
}): BlueprintDefect[] {
  const defects: BlueprintDefect[] = [];
  const mustCover = input.mustCover ?? [];
  const overScoped = mustCover.find(item => isCrossChapterGoal(item));
  if (overScoped) {
    defects.push({
      kind: 'over-scoped-mustcover',
      detail: `mustCover「${overScoped.slice(0, 30)}」是整卷/全书级跨章目标，单章无法兑现`,
    });
  }
  if ((input.CEN ?? '').trim() && isHollowChapterHook(input.CEN ?? '', input.CPNs ?? [])) {
    defects.push({
      kind: 'hollow-cen',
      detail: `CEN「${input.CEN!.slice(0, 30)}」是零信息量空壳钩子`,
    });
  }
  if (/^(?:开场承接|承接上[章段](?:结尾)?)[：:]/u.test((input.CBN ?? '').trim())) {
    defects.push({
      kind: 'template-cbn',
      detail: `CBN「${input.CBN!.slice(0, 30)}」是承接模板话术而非本章新事件`,
    });
  }
  if (
    mustCover.length === 0 ||
    !(input.CBN ?? '').trim() ||
    !(input.CEN ?? '').trim()
  ) {
    defects.push({ kind: 'empty-fields', detail: 'CBN/CEN/mustCover 存在空缺，合同不完整' });
  }
  return defects;
}

export interface RegenerateChapterBlueprintParams {
  project: Project;
  /** 待再生章的章号（1-based） */
  chapterNumber: number;
  callStructuredText: (system: string, user: string, temperature: number) => Promise<string>;
}

export interface RegenerateChapterBlueprintResult {
  blueprint?: ChapterBlueprint;
  /** 触发再生的确定性缺陷清单（AI 修复 prompt 的靶向输入） */
  defects: BlueprintDefect[];
  error?: string;
}

/**
 * 以「已写状态」为基底再生单章蓝图。上下文基底与滚动续纲共用
 * （buildRollContextBase 取真实收束状态/活跃伏笔/卷锚点），差异只在章号收窄到一章，
 * 并把确定性体检出的缺陷作为靶向修复指令注入。
 */
export async function regenerateChapterBlueprint(
  params: RegenerateChapterBlueprintParams
): Promise<RegenerateChapterBlueprintResult> {
  const { project, chapterNumber, callStructuredText } = params;
  const nodes = (project.plotOutline ?? [])
    .filter(node => node?.type === 'chapter')
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const targetNode = nodes[chapterNumber - 1];
  if (!targetNode) {
    return { defects: [], error: `第 ${chapterNumber} 章没有 plot 节点，无法再生蓝图` };
  }
  const defects = inspectChapterBlueprintDefects(targetNode);
  // 上章既有规划收束，作为承接链
  const recentBlueprintEndings = nodes
    .filter(node => (node.orderIndex ?? 0) + 1 < chapterNumber && Boolean(node.CEN?.trim()))
    .slice(-2)
    .map(node => `第${(node.orderIndex ?? 0) + 1}章《${node.title}》收束：${node.CEN!.trim()}`);

  const base = buildRollContextBase(project, chapterNumber);
  const defectLines = defects.length > 0
    ? defects.map(defect => `第${chapterNumber}章 ${defect.detail}`)
    : [`第${chapterNumber}章 经多轮写作仍无法履约，合同与已写状态脱节；请结合收束状态推演一个本章可兑现的新事件线`];

  const prompt = buildRollBlueprintPrompt({
    base,
    chapterNumbers: [chapterNumber],
    recentBlueprintEndings,
    issues: defectLines,
  });

  try {
    const generated = await callStructuredText(prompt.system, prompt.user, 0.25);
    const blueprint = parseBlueprintBlocks(generated, [chapterNumber]).get(chapterNumber);
    if (!blueprint) {
      return { defects, error: `第 ${chapterNumber} 章蓝图再生响应无法解析出本章内容` };
    }
    // 复检门禁：再生产物缺陷数不得超过原稿，且不得出现原稿没有的新类别
    // （尤其 empty-fields——原稿至少 mustCover 非空，残缺稿换进去等于烧掉
    // 唯一再生预算还恶化合同）。不达标则放弃采用（保留原稿），失败只走文本重试。
    const nextDefects = inspectBlueprintObjectDefects({
      orderIndex: chapterNumber,
      title: blueprint.title,
      summary: blueprint.summary,
      CBN: blueprint.CBN,
      CPNs: blueprint.CPNs,
      CEN: blueprint.CEN,
      mustCover: blueprint.mustCover,
    });
    const originalKinds = new Set(defects.map(defect => defect.kind));
    const hasNewKind = nextDefects.some(defect => !originalKinds.has(defect.kind));
    if (nextDefects.length > defects.length || hasNewKind) {
      return {
        defects,
        error:
          `再生产物复检未通过（缺陷 ${defects.length}→${nextDefects.length}${hasNewKind ? '，含新类别' : ''}），放弃采用：` +
          nextDefects.map(defect => `${defect.kind}:${defect.detail}`).join('；'),
      };
    }
    return { blueprint, defects };
  } catch (error) {
    return {
      defects,
      error: `蓝图再生请求失败：${error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120)}`,
    };
  }
}

/**
 * 把再生后的蓝图折算成 Chapter 实体的文本字段更新。
 *
 * pipeline 组装合同时 goal/角色白名单来自 Chapter.outline / plotSummary，
 * 只改 plotOutline 节点的话硬约束是新蓝图、引导与白名单仍是旧蓝图——
 * 合同半新半旧。重试前必须两侧同步。
 */
export function blueprintToChapterUpdate(blueprint: ChapterBlueprint): {
  outline: string;
  plotSummary: string;
} {
  const structured = [
    '--- 结构化节点 ---',
    `【CBN】${blueprint.CBN}`,
    ...(blueprint.CPNs.length ? [`【CPNs】${blueprint.CPNs.join('\n')}`] : []),
    `【CEN】${blueprint.CEN}`,
    ...(blueprint.mustCover.length ? [`【必须覆盖】${blueprint.mustCover.join('、')}`] : []),
    ...(blueprint.forbiddenZones.length ? [`【禁区】${blueprint.forbiddenZones.join('、')}`] : []),
  ].join('\n');
  return {
    outline: `${blueprint.summary || blueprint.title}\n\n${structured}`,
    plotSummary: `CBN: ${blueprint.CBN}\nCEN: ${blueprint.CEN}`,
  };
}

/**
 * 把再生后的蓝图回写到项目 plotOutline 的对应章节节点（仅替换合同字段，
 * 不动 id/orderIndex/chapterId，位置兜底与 chapterId 绑定关系保持不变）。
 */
export function applyBlueprintToPlotNode(
  nodes: PlotNode[],
  chapterNumber: number,
  blueprint: ChapterBlueprint,
): PlotNode | undefined {
  const sorted = [...nodes]
    .filter(node => node?.type === 'chapter')
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const target = sorted[chapterNumber - 1];
  if (!target) return undefined;
  const normalized = {
    title: blueprint.title,
    CBN: blueprint.CBN,
    CPNs: blueprint.CPNs,
    CEN: blueprint.CEN,
    mustCover: blueprint.mustCover,
    keyEvents: blueprint.mustCover,
    description: blueprint.summary || target.description,
  };
  Object.assign(target, normalized);
  return target;
}

/** 批量层的逐章履约失败计数器（带每章再生预算） */
export class BlueprintRepairLedger {
  private readonly failures = new Map<string, number>();
  private readonly regenerations = new Map<string, number>();

  constructor(private readonly maxPerChapter = MAX_REGENERATIONS_PER_CHAPTER) {}

  recordFailure(chapterId: string): number {
    const next = (this.failures.get(chapterId) ?? 0) + 1;
    this.failures.set(chapterId, next);
    return next;
  }

  shouldTrigger(chapterId: string): boolean {
    return (
      (this.failures.get(chapterId) ?? 0) >= FULFILLMENT_FAILURE_TRIGGER &&
      (this.regenerations.get(chapterId) ?? 0) < this.maxPerChapter
    );
  }

  markRegenerated(chapterId: string): void {
    this.regenerations.set(chapterId, (this.regenerations.get(chapterId) ?? 0) + 1);
    // 清零失败计数：再生后的新一轮失败从头计，为下一次（若预算还有）攒证据
    this.failures.set(chapterId, 0);
  }

  resetChapter(chapterId: string): void {
    this.failures.delete(chapterId);
  }
}

/** 判断失败消息是否属于「履约域」（值得归因到蓝图本身）的失败。
 *  2026-09-13 r4 扩展：命运禁区拒稿与跨章状态 fact_conflict 同属「合同与台账
 *  矛盾」——过期蓝图节点要求已下狱/已死亡角色以自由身出场，写作端两头违约，
 *  纯重试永远修不好（r4 ch187 齐王下狱后率兵攻午门五连拒成洞实证），
 *  必须归因蓝图触发再生（再生提示词带命运锁，会改走【解除】或移除该角色）。 */
const FULFILLMENT_FAILURE_RE =
  /未履约|未兑现|mustCover|履约|fulfillment|未完成.{0,8}(事件|节点|目标)|触发本章禁区|fact_conflict/u;

export function isFulfillmentDomainFailure(message: string | undefined): boolean {
  return Boolean(message && FULFILLMENT_FAILURE_RE.test(message));
}
