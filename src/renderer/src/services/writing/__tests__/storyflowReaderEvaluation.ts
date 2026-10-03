import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ReaderQualityJudge,
  READER_EVALUATION_VERSION,
  type ReaderChapterEvaluation,
  type ReaderEvaluationContext,
  type ReaderOutlineEvaluation,
  type ReaderWindowChapter,
  type ReaderWindowEvaluation,
} from '@/services/story-runtime/readerQualityJudge';
import { RecordingStructuredAI } from '@/services/story-runtime/RecordingStructuredAI';
import { normalizeVocabularyTier } from '@/services/story-runtime/proseRules';

import {
  resolveReaderJudgeConfig,
  type ResolvedReaderJudgeConfig,
} from './continueWriteRealConfig';
import { createRealStructuredAI } from './realStructuredAI';
import type { StoryflowClosedLoopResult } from './storyflowClosedLoopHarness';

export interface ReaderQualityThresholds {
  outlineWarningBelow: number;
  openingThreeAverageWarningBelow: number;
  chapterWarningBelow: number;
  consecutiveLowBelow: number;
  consecutiveLowCount: number;
  windowWarningBelow: number;
  coreDimensionWarningBelow: number;
}

export const DEFAULT_READER_QUALITY_THRESHOLDS: ReaderQualityThresholds = {
  outlineWarningBelow: 75,
  openingThreeAverageWarningBelow: 78,
  chapterWarningBelow: 60,
  consecutiveLowBelow: 68,
  consecutiveLowCount: 3,
  windowWarningBelow: 70,
  coreDimensionWarningBelow: 50,
};

export interface StoryflowReaderEvaluationSummary {
  version: string;
  mode: 'shadow';
  enabled: boolean;
  evaluator: {
    provider: string;
    providerId?: string;
    model?: string;
    independentFromWriter: boolean;
    selectionReason: ResolvedReaderJudgeConfig['selectionReason'];
  };
  thresholds: ReaderQualityThresholds;
  outline: ReaderOutlineEvaluation | null;
  chapters: ReaderChapterEvaluation[];
  windows: ReaderWindowEvaluation[];
  metrics: {
    chapterCount: number;
    chapterAverage: number | null;
    chapterMedian: number | null;
    chapterMinimum: number | null;
    openingThreeAverage: number | null;
    continueReadingNoCount: number;
    lowChapterCount: number;
    lowWindowCount: number;
    consecutiveLowRuns: Array<{ fromChapter: number; toChapter: number }>;
  };
  warnings: string[];
  errors: string[];
  durationMs: number;
}

function isEnabled(): boolean {
  return !/^(?:0|false|no)$/iu.test(process.env.MOLIU_READER_EVAL?.trim() ?? '');
}

function envPositiveInt(name: string, fallbackMs: number): number {
  const raw = Number(process.env[name]?.trim());
  return Number.isFinite(raw) && raw > 0 ? raw : fallbackMs;
}

// 评审请求级超时：网关挂起形态（连接建立但永不返回）不会 throw，裸 await 会把
// 整个闭环测试拖到 vitest 24h 超时墙。超时按既有 catch 语义记入 errors，不阻断测试。
// 惰性读取环境变量：测试可在运行时注入小阈值。
function requestTimeoutMs(): number {
  return envPositiveInt('MOLIU_READER_EVAL_REQUEST_TIMEOUT_MS', 300_000);
}
// 评审总预算：200 章逐章评审在通道劣化时全部超时也要封顶，耗尽后剩余章跳过。
function totalBudgetMs(): number {
  return envPositiveInt('MOLIU_READER_EVAL_TOTAL_BUDGET_MS', 1_800_000);
}

export async function withDeadline<T>(p: Promise<T>, label: string): Promise<T> {
  const timeoutMs = requestTimeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`评审请求超时（${timeoutMs}ms）：${label}`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  return values.length > 0
    ? round1(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round1((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function findConsecutiveLowRuns(
  evaluations: ReaderChapterEvaluation[],
  threshold: number,
  requiredCount: number
): Array<{ fromChapter: number; toChapter: number }> {
  const runs: Array<{ fromChapter: number; toChapter: number }> = [];
  let start: number | null = null;
  let previous = -1;
  for (const evaluation of evaluations) {
    const isContinuous = start !== null && evaluation.chapter === previous + 1;
    if (evaluation.score < threshold) {
      if (start === null || !isContinuous) start = evaluation.chapter;
      previous = evaluation.chapter;
      continue;
    }
    if (start !== null && previous - start + 1 >= requiredCount) {
      runs.push({ fromChapter: start, toChapter: previous });
    }
    start = null;
    previous = -1;
  }
  if (start !== null && previous - start + 1 >= requiredCount) {
    runs.push({ fromChapter: start, toChapter: previous });
  }
  return runs;
}

function buildContext(result: StoryflowClosedLoopResult): ReaderEvaluationContext {
  const positioning = result.executableOutline.positioning;
  const scenarioId = process.env.MOLIU_STORYFLOW_SCENARIO_ID?.trim();
  let expected: { genre?: string; targetReader?: string } | null = null;
  if (scenarioId) {
    try {
      const scenarios = JSON.parse(
        readFileSync(join(process.cwd(), 'scripts', 'fixtures', 'storyflow-scenarios.json'), 'utf8')
      ) as Array<{ id: string; genre: string; targetReader: string }>;
      expected = scenarios.find(item => item.id === scenarioId) ?? null;
    } catch {
      // 场景定位只增强评审上下文；读取失败时仍可使用大纲自己的定位继续影子评审。
    }
  }
  return {
    title: result.generatedOutline.title,
    genre:
      expected?.genre ||
      positioning.genreTags?.join('、') ||
      result.generatedOutline.genres?.join('、') ||
      '未指定题材',
    targetReader:
      expected?.targetReader || positioning.targetReaders.join('、') || '通用中文网文读者',
    // 词汇档位：与写作侧同源归一化（显式输出优先，缺失由风格关键词推导）
    vocabularyTier: normalizeVocabularyTier({
      tier: positioning.vocabularyTier,
      styleKeywords: positioning.styleKeywords,
      targetReaders: positioning.targetReaders,
    }),
    positioning: [
      expected
        ? `大纲自产定位：${positioning.genreTags?.join('、') || '-'} / ${positioning.targetReaders.join('、') || '-'}`
        : '',
      positioning.coreEmotions.length > 0 ? `核心情绪：${positioning.coreEmotions.join('、')}` : '',
      positioning.sellingPoints.length > 0
        ? `核心卖点：${positioning.sellingPoints.join('、')}`
        : '',
      positioning.styleKeywords.length > 0 ? `文风：${positioning.styleKeywords.join('、')}` : '',
    ]
      .filter(Boolean)
      .join('；'),
  };
}

function selectedWindowEnds(chapterCount: number): number[] {
  return [3, 5, 10, 20, 40].filter(end => end <= chapterCount);
}

function buildWindowChapters(
  result: StoryflowClosedLoopResult,
  chapterEvaluations: ReaderChapterEvaluation[],
  endChapter: number
): ReaderWindowChapter[] {
  const fromChapter = endChapter <= 5 ? 1 : endChapter - 4;
  return result.chapterRunResults
    .filter(item => item.chapterNumber >= fromChapter && item.chapterNumber <= endChapter)
    .map(item => {
      const evaluation = chapterEvaluations.find(row => row.chapter === item.chapterNumber);
      return {
        chapter: item.chapterNumber,
        title: item.output.title || item.chapter.title || `第${item.chapterNumber}章`,
        summary: evaluation?.summary,
        head: item.output.prose.slice(0, 500),
        tail: item.output.prose.slice(-500),
        prose: item.output.prose,
      };
    });
}

function dimensionMinimum<T extends object>(dimensions: T): number {
  const values = Object.values(dimensions) as number[];
  return values.length > 0 ? Math.min(...values) : 100;
}

function collectWarnings(
  outline: ReaderOutlineEvaluation | null,
  chapters: ReaderChapterEvaluation[],
  windows: ReaderWindowEvaluation[],
  thresholds: ReaderQualityThresholds
): string[] {
  const warnings: string[] = [];
  if (outline && outline.score < thresholds.outlineWarningBelow) {
    warnings.push(`大纲读者评分 ${outline.score} < ${thresholds.outlineWarningBelow}`);
  }
  if (outline && dimensionMinimum(outline.dimensions) < thresholds.coreDimensionWarningBelow) {
    warnings.push(`大纲存在低于 ${thresholds.coreDimensionWarningBelow} 的核心维度`);
  }
  const opening = chapters.filter(item => item.chapter <= 3);
  const openingAverage = average(opening.map(item => item.score));
  if (
    opening.length === 3 &&
    openingAverage !== null &&
    openingAverage < thresholds.openingThreeAverageWarningBelow
  ) {
    warnings.push(`黄金三章平均 ${openingAverage} < ${thresholds.openingThreeAverageWarningBelow}`);
  }
  const lowChapters = chapters.filter(item => item.score < thresholds.chapterWarningBelow);
  if (lowChapters.length > 0) {
    warnings.push(
      `低分章节 ${lowChapters.map(item => `ch${item.chapter}=${item.score}`).join('、')}`
    );
  }
  const noContinue = chapters.filter(item => !item.continueReading);
  if (noContinue.length > 0) {
    warnings.push(`读者不愿继续阅读：${noContinue.map(item => `ch${item.chapter}`).join('、')}`);
  }
  const lowWindows = windows.filter(item => item.score < thresholds.windowWarningBelow);
  if (lowWindows.length > 0) {
    warnings.push(
      `低分跨章窗口 ${lowWindows.map(item => `${item.fromChapter}-${item.toChapter}=${item.score}`).join('、')}`
    );
  }
  return warnings;
}

/**
 * 真 AI Storyflow 的独立读者评审。影子模式只产出结构化观测数据，不改变章节 accepted。
 */
export async function runStoryflowReaderEvaluation(
  result: StoryflowClosedLoopResult
): Promise<StoryflowReaderEvaluationSummary> {
  const startedAt = Date.now();
  const thresholds = DEFAULT_READER_QUALITY_THRESHOLDS;
  const enabled = isEnabled();
  let evaluatorConfig: ResolvedReaderJudgeConfig = {
    provider: result.cfg.provider,
    providerId: result.cfg.providerId,
    apiKey: result.cfg.apiKey,
    model: result.cfg.model,
    baseUrl: result.cfg.baseUrl,
    independentFromWriter: false,
    selectionReason: 'writer-fallback',
  };
  const base: StoryflowReaderEvaluationSummary = {
    version: READER_EVALUATION_VERSION,
    mode: 'shadow',
    enabled,
    evaluator: {
      provider: evaluatorConfig.provider,
      providerId: evaluatorConfig.providerId,
      model: evaluatorConfig.model,
      independentFromWriter: evaluatorConfig.independentFromWriter,
      selectionReason: evaluatorConfig.selectionReason,
    },
    thresholds,
    outline: null,
    chapters: [],
    windows: [],
    metrics: {
      chapterCount: 0,
      chapterAverage: null,
      chapterMedian: null,
      chapterMinimum: null,
      openingThreeAverage: null,
      continueReadingNoCount: 0,
      lowChapterCount: 0,
      lowWindowCount: 0,
      consecutiveLowRuns: [],
    },
    warnings: [],
    errors: [],
    durationMs: 0,
  };
  if (!base.enabled) return base;
  try {
    evaluatorConfig = resolveReaderJudgeConfig(result.cfg);
    base.evaluator = {
      provider: evaluatorConfig.provider,
      providerId: evaluatorConfig.providerId,
      model: evaluatorConfig.model,
      independentFromWriter: evaluatorConfig.independentFromWriter,
      selectionReason: evaluatorConfig.selectionReason,
    };
  } catch (error) {
    base.errors.push(`读者评审配置失败：${error instanceof Error ? error.message : String(error)}`);
    base.durationMs = Date.now() - startedAt;
    return base;
  }

  const runSuffix = (process.env.MOLIU_RUN_SUFFIX || '').trim();
  const runId = `storyflow-${runSuffix ? `${runSuffix}-` : ''}reader-${Date.now()}`;
  const recording = new RecordingStructuredAI(
    createRealStructuredAI({
      provider: evaluatorConfig.provider,
      apiKey: evaluatorConfig.apiKey,
      model: evaluatorConfig.model,
      baseUrl: evaluatorConfig.baseUrl,
    }),
    {
      runId,
      persist: true,
      provider: evaluatorConfig.provider,
      model: evaluatorConfig.model,
    }
  );
  const judge = new ReaderQualityJudge(recording);
  const context = buildContext(result);

  try {
    base.outline = await withDeadline(
      judge.evaluateOutline({
        context,
        outline: result.executableOutline,
      }),
      '大纲读者评审'
    );
  } catch (error) {
    base.errors.push(`大纲读者评审失败：${error instanceof Error ? error.message : String(error)}`);
  }

  let previousTail = '';
  const budgetMs = totalBudgetMs();
  for (const chapter of result.chapterRunResults) {
    if (Date.now() - startedAt > budgetMs) {
      const remaining = result.chapterRunResults.length - base.chapters.length - base.errors.filter(e => e.includes('读者评审失败')).length;
      base.warnings.push(
        `评审总预算（${budgetMs}ms）耗尽，跳过剩余约 ${remaining} 章的逐章评审`
      );
      break;
    }
    try {
      const evaluation = await withDeadline(
        judge.evaluateChapter({
          context,
          chapter: chapter.chapterNumber,
          title: chapter.output.title || chapter.chapter.title || `第${chapter.chapterNumber}章`,
          previousTail,
          prose: chapter.output.prose,
        }),
        `第${chapter.chapterNumber}章读者评审`
      );
      base.chapters.push(evaluation);
    } catch (error) {
      base.errors.push(
        `第${chapter.chapterNumber}章读者评审失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
    previousTail = chapter.output.prose.slice(-1_500);
  }

  for (const endChapter of selectedWindowEnds(result.chapterRunResults.length)) {
    const chapters = buildWindowChapters(result, base.chapters, endChapter);
    if (chapters.length === 0) continue;
    try {
      base.windows.push(
        await withDeadline(judge.evaluateWindow({ context, chapters }), `${chapters[0].chapter}-${endChapter}章窗口评审`)
      );
    } catch (error) {
      base.errors.push(
        `${chapters[0].chapter}-${endChapter}章窗口评审失败：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  await recording.flush();
  const scores = base.chapters.map(item => item.score);
  const consecutiveLowRuns = findConsecutiveLowRuns(
    base.chapters,
    thresholds.consecutiveLowBelow,
    thresholds.consecutiveLowCount
  );
  base.metrics = {
    chapterCount: base.chapters.length,
    chapterAverage: average(scores),
    chapterMedian: median(scores),
    chapterMinimum: scores.length > 0 ? Math.min(...scores) : null,
    openingThreeAverage: average(
      base.chapters.filter(item => item.chapter <= 3).map(item => item.score)
    ),
    continueReadingNoCount: base.chapters.filter(item => !item.continueReading).length,
    lowChapterCount: base.chapters.filter(item => item.score < thresholds.chapterWarningBelow)
      .length,
    lowWindowCount: base.windows.filter(item => item.score < thresholds.windowWarningBelow).length,
    consecutiveLowRuns,
  };
  base.warnings = collectWarnings(base.outline, base.chapters, base.windows, thresholds);
  if (!evaluatorConfig.independentFromWriter) {
    base.warnings.unshift('没有可用的独立读者评审模型，本轮回退写作模型自评；结果仅供低置信度观察');
  }
  if (consecutiveLowRuns.length > 0) {
    base.warnings.push(
      `连续低分区间：${consecutiveLowRuns.map(run => `${run.fromChapter}-${run.toChapter}`).join('、')}`
    );
  }
  base.durationMs = Date.now() - startedAt;
  return base;
}
