/**
 * 章节回放（release-loop 分钟级回归）的纯逻辑：快照截断 + AI 探针 + 样本汇总。
 *
 * 用途：把书审里的一条 S1 固化为可重复实验——取成书 store，截断到「写第 N 章之前」
 * 的状态，用当前代码只重跑第 N..N+W-1 章，再由 AI 探针判定缺陷是否复现。
 * 200 章长跑才暴露的后半本问题（在押回潮、皇统过渡）由此不必等 1000 分钟重跑。
 *
 * 约束：
 * - 快照截断是确定性数据重建，不做任何语义判断；「缺陷是否复现」只交 AI 探针
 *   （规范 §9.4：语义终审交 AI）。
 * - 与原始写作时刻的已知差异（回放报告须声明）：人物表与后续蓝图为终局版本；
 *   已回收伏笔按计划回收章推断回退（store 未记录实际回收章）。
 */
import type { Project } from '@/types/project';
import type { StructuredAIRequest } from '@/types/story-runtime';

/** 回放用例文件 schema 版本 */
export const REPLAY_CASE_SCHEMA_VERSION = 'replay-case/v1';

/** AI 探针：已知前情 + 一个「是=缺陷复现」的核查问题 */
export interface ReplayProbe {
  /** 回放起点之前已成立的事实（台账口径，如「崔显第139章已下狱」） */
  context: string;
  /** 是/否问题，回答「是」表示缺陷在回放正文中复现 */
  question: string;
}

/** 回放用例（temp/replay-cases/<id>/case.json） */
export interface ChapterReplayCase {
  schemaVersion: typeof REPLAY_CASE_SCHEMA_VERSION;
  id: string;
  /** 对应 docs/quality-ledger 中的 Finding id */
  findingId?: string;
  /** 源 store 路径（仅溯源；回放读 snapshot） */
  sourceStore: string;
  /** 相对 case.json 所在目录的 store 快照路径（.json.gz） */
  snapshot: string;
  /** 回放起始章（1 基） */
  fromChapter: number;
  /** 连续回放章数（跨章缺陷需要 ≥2） */
  window: number;
  targetWordCount?: number;
  probe: ReplayProbe;
}

/** AI 探针结论 */
export interface ReplayProbeVerdict {
  defectPresent: boolean;
  confidence: 'high' | 'medium' | 'low';
  quotes: string[];
  reason: string;
}

/** 单个样本（一次完整回放）的结果 */
export interface ReplaySampleResult {
  sample: number;
  /** 窗口内全部章节均通过门禁提交 */
  accepted: boolean;
  chapters: Array<{ chapterNumber: number; success: boolean; words: number; error?: string }>;
  verdict: ReplayProbeVerdict | null;
}

/** 用例级结论：pass=缺陷未复现且全部提交；recur=任一样本复现；hole=未复现但有章未提交 */
export type ReplayCaseStatus = 'pass' | 'recur' | 'hole';

/** 快照截断结果；warnings 记录快照与原始写作时刻可能不一致之处 */
export interface ReplaySnapshot {
  project: Project;
  warnings: string[];
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * 把成书 project 截断为「即将写第 fromChapter 章」时的状态。
 * 起始章及之后的正文/写作状态清空，章记忆只保留起始章之前（chapterIndex 为 1 基），
 * 起始章之后才埋设/回收的伏笔回退状态。
 */
export function buildReplaySnapshot(project: Project, fromChapter: number): ReplaySnapshot {
  if (!Number.isInteger(fromChapter) || fromChapter < 1) {
    throw new Error(`回放起始章非法：${fromChapter}`);
  }
  const snapshot = structuredClone(project);
  const warnings: string[] = [];
  if (!snapshot.chapters.some(chapter => chapter.orderIndex + 1 === fromChapter)) {
    throw new Error(`store 中不存在第 ${fromChapter} 章`);
  }

  const holesBefore: number[] = [];
  for (const chapter of snapshot.chapters) {
    const chapterNumber = chapter.orderIndex + 1;
    if (chapterNumber < fromChapter) {
      if (!chapter.content.trim()) holesBefore.push(chapterNumber);
      continue;
    }
    chapter.content = '';
    chapter.wordCount = 0;
    chapter.status = 'draft';
    chapter.writeStatus = 'pending';
    chapter.isGenerated = false;
    delete chapter.generatedAt;
    delete chapter.lastError;
    delete chapter.lastErrorKind;
    delete chapter.lastErrorAt;
  }
  if (holesBefore.length > 0) {
    warnings.push(`起始章前存在空章 ${holesBefore.join(',')}，回放上下文与原始写作时刻不同`);
  }

  snapshot.chapterMemories = (snapshot.chapterMemories ?? []).filter(
    memory => (memory.chapterIndex ?? 0) < fromChapter
  );
  const rolledBack = rollBackForeshadows(snapshot, fromChapter);
  if (rolledBack > 0) {
    warnings.push(`${rolledBack} 条伏笔按计划章推断回退状态（store 无实际回收章记录）`);
  }
  snapshot.wordCount = snapshot.chapters.reduce((sum, chapter) => sum + (chapter.wordCount ?? 0), 0);
  return { project: snapshot, warnings };
}

/** 起始章及之后才埋设的回退为 planned；计划在起始章及之后回收的 resolved 回退为 buried */
function rollBackForeshadows(snapshot: Project, fromChapter: number): number {
  let rolledBack = 0;
  for (const foreshadow of snapshot.foreshadows ?? []) {
    if (foreshadow.status === 'planned' || foreshadow.status === 'abandoned') continue;
    const plantedChapter = foreshadow.actualPlantedChapter ?? foreshadow.createdChapter;
    if (isFiniteNumber(plantedChapter) && plantedChapter >= fromChapter) {
      foreshadow.status = 'planned';
      delete foreshadow.actualPlantedChapter;
      rolledBack += 1;
      continue;
    }
    const payoffChapter = foreshadow.payoffChapter ?? foreshadow.suggestedResolutionChapter;
    if (foreshadow.status === 'resolved' && (!isFiniteNumber(payoffChapter) || payoffChapter >= fromChapter)) {
      foreshadow.status = 'buried';
      rolledBack += 1;
    }
  }
  return rolledBack;
}

const PROBE_SYSTEM = [
  '你是长篇网络小说的连续性核查员。',
  '只依据【已知前情】与【待查正文】判断，不得推测正文之外的情节。',
  'defectPresent=true 仅当问题确实出现在待查正文中，且 quotes 能给出正文原句作证；',
  '正文中已有合理交代（如释放、越狱、平反、回忆、转述）时 defectPresent=false。',
  '输出 JSON：{"defectPresent":boolean,"confidence":"high|medium|low","quotes":[正文原句],"reason":"一句话理由"}',
].join('\n');

/** 构造 AI 探针请求（语义终审交 AI，规范 §9.4） */
export function buildReplayProbeRequest(
  probe: ReplayProbe,
  chapters: Array<{ chapterNumber: number; title: string; prose: string }>
): StructuredAIRequest<ReplayProbeVerdict> {
  const body = chapters
    .map(chapter => `=== 第${chapter.chapterNumber}章 ${chapter.title} ===\n${chapter.prose}`)
    .join('\n\n');
  return {
    purpose: 'chapter-review',
    system: PROBE_SYSTEM,
    schemaName: 'ReplayProbeVerdict',
    prompt: `【已知前情】\n${probe.context}\n\n【核查问题】\n${probe.question}\n\n【待查正文】\n${body}`,
    parse: parseReplayProbeVerdict,
  };
}

/** 解析探针输出；声称复现却无原文引用时降为 low 置信度 */
export function parseReplayProbeVerdict(value: unknown): ReplayProbeVerdict {
  if (!value || typeof value !== 'object') {
    throw new Error('探针输出不是 JSON 对象');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.defectPresent !== 'boolean') {
    throw new Error('探针输出缺少布尔字段 defectPresent');
  }
  const quotes = Array.isArray(raw.quotes)
    ? raw.quotes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const confidence = raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low';
  return {
    defectPresent: raw.defectPresent,
    confidence: raw.defectPresent && quotes.length === 0 ? 'low' : confidence,
    quotes,
    reason: typeof raw.reason === 'string' ? raw.reason : '',
  };
}

/** 汇总多样本结论：复现优先于成洞，全部干净才算 pass */
export function summarizeReplaySamples(samples: ReplaySampleResult[]): {
  status: ReplayCaseStatus;
  recurrences: number;
  holes: number;
} {
  const recurrences = samples.filter(sample => sample.verdict?.defectPresent === true).length;
  const holes = samples.filter(sample => !sample.accepted).length;
  const status: ReplayCaseStatus = recurrences > 0 ? 'recur' : holes > 0 ? 'hole' : 'pass';
  return { status, recurrences, holes };
}

/** 校验回放用例文件结构 */
export function parseReplayCase(value: unknown): ChapterReplayCase {
  const raw = value as Partial<ChapterReplayCase> | null;
  if (!raw || raw.schemaVersion !== REPLAY_CASE_SCHEMA_VERSION) {
    throw new Error(`回放用例 schemaVersion 必须为 ${REPLAY_CASE_SCHEMA_VERSION}`);
  }
  const problems: string[] = [];
  if (!raw.id) problems.push('id');
  if (!raw.snapshot) problems.push('snapshot');
  if (!Number.isInteger(raw.fromChapter) || (raw.fromChapter ?? 0) < 1) problems.push('fromChapter');
  if (!Number.isInteger(raw.window) || (raw.window ?? 0) < 1) problems.push('window');
  if (!raw.probe?.context?.trim() || !raw.probe?.question?.trim()) problems.push('probe.context/question');
  if (problems.length > 0) {
    throw new Error(`回放用例 ${raw.id ?? '?'} 字段非法：${problems.join('、')}`);
  }
  return raw as ChapterReplayCase;
}
