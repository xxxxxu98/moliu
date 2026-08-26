/**
 * Storyflow 闭环测试（真实 AI）：开题中心大纲生成 → 应用 → 批量续写
 *
 *   npm run smoke:storyflow:real
 *
 * 与真实环境完全对齐：
 * 1. 大纲生成：UnifiedOutlineGenerator.generateDirections → expandDirection
 *    （开题中心 TopicDiscoveryBoard prompt 玩法同路径，真实 AI fetch）
 * 2. 应用大纲：mapExecutableOutlineToGeneratedOutline → useProjectCreator.createProject
 *    （真实执行 buildPlotOutline/buildCharacters/buildVolumes 等构建链）
 * 3. 建章：useChapterOutlineGenerator.createChapters（结构化节点 CBN/CPNs/CEN 落库）
 * 4. 批量续写：runContinueWriteChapters（BATCH_CONTINUE_PRESET，与 useBatchWriter 同路径）
 *
 * 仅真实模式：未设置 REAL_AI=1 时整个 describe 跳过（不做 mock 替代）。
 * AI 配置复用 temp/continue-write.real.config.json（resolveContinueWriteRealConfig）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { isRealAiEnabled } from './realStructuredAI';
import {
  DEFAULT_STORYFLOW_CHAPTER_COUNT,
  resolveStoryflowArtifactPaths,
  runStoryflowClosedLoop,
} from './storyflowClosedLoopHarness';
import {
  inspectOutlineCompleteness,
  OUTLINE_COMPLETENESS_POLICY,
} from '@/services/outline/validation/outlineCompleteness';
import { AVG_WORDS_PER_CHAPTER, parseWordCountRange } from '@/services/outline/utils';
import { checkWordCountBounds } from '@/services/writing/supplement';
import { isPlaceholderChapterTitle } from '@/services/writing/chapterTitle';
import {
  runStoryflowReaderEvaluation,
  type StoryflowReaderEvaluationSummary,
} from './storyflowReaderEvaluation';

// useProjectCreator 依赖 useRouter（仅导航副作用），测试环境注入桩
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// 产物路径：并发矩阵（MOLIU_RUN_SUFFIX）时带后缀隔离，单跑为原固定名
const {
  summaryPath: SUMMARY_PATH,
  outlinePath: OUTLINE_PATH,
  proseDir: PROSE_DIR,
} = resolveStoryflowArtifactPaths();

/**
 * 测试总超时：默认按章数动态预算 = 章数 × 1.5 分钟 + 50 分钟固定开销（大纲生成 +
 * 滚动续纲 + 读者影子评审 ~0.5 分钟/章已含在 1.5 里，50 分钟兜大纲与评审基础耗时）。
 * 依据 2026-08-24 反重力 gemini3.7-flash 100 章实测：写作 150min + 评审 50min，
 * 旧固定 120min 默认在 67/100 章处被杀。MOLIU_TEST_TIMEOUT_MIN 显式设置仍最高优先。
 */
const chapterCountForBudget = envInt('MOLIU_CHAPTER_COUNT', DEFAULT_STORYFLOW_CHAPTER_COUNT);
const DEFAULT_TIMEOUT_MIN = Math.ceil(chapterCountForBudget * 1.5) + 50;
const TEST_TIMEOUT_MS = envInt('MOLIU_TEST_TIMEOUT_MIN', DEFAULT_TIMEOUT_MIN) * 60_000;

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? '');
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * 开题提示可配置：MOLIU_STORYFLOW_PROMPT_FILE（文件路径，读取全文 trim）>
 * MOLIU_STORYFLOW_PROMPT（内联文本）> 默认一句话。
 * 支持长企划文本（如 temp/text.md 整份开题文档）直接当开题输入。
 */
function resolveStoryflowPrompt(): { prompt: string; source: string; wordCountRange?: string } {
  const fromFile = process.env.MOLIU_STORYFLOW_PROMPT_FILE?.trim();
  if (fromFile) {
    return { prompt: readFileSync(fromFile, 'utf8').trim(), source: fromFile };
  }
  const inline = process.env.MOLIU_STORYFLOW_PROMPT?.trim();
  if (inline) {
    return { prompt: inline, source: 'MOLIU_STORYFLOW_PROMPT' };
  }
  const scenarioId = process.env.MOLIU_STORYFLOW_SCENARIO_ID?.trim();
  if (scenarioId) {
    const scenarioPath = join(process.cwd(), 'scripts', 'fixtures', 'storyflow-scenarios.json');
    const scenarios = JSON.parse(readFileSync(scenarioPath, 'utf8')) as Array<{
      id: string;
      prompt: string;
      wordCountRange: string;
    }>;
    const scenario = scenarios.find(item => item.id === scenarioId);
    if (!scenario) {
      throw new Error(
        `未知 MOLIU_STORYFLOW_SCENARIO_ID=${scenarioId}（可用：${scenarios.map(item => item.id).join(', ')}）`
      );
    }
    return {
      prompt: scenario.prompt,
      source: `scenario:${scenario.id}`,
      wordCountRange: scenario.wordCountRange,
    };
  }
  return {
    prompt: '一个现代社畜穿越到古代朝堂，凭借现代知识在官场步步高升，卷入皇权之争',
    source: 'default',
  };
}

/**
 * 落盘每章正文与 summary（供 smoke 脚本展示与人工评估）。
 * 大纲数据已由 harness 在建章后提前落盘，这里只补正文与汇总。
 */
function writeClosedLoopArtifacts(
  result: Awaited<ReturnType<typeof runStoryflowClosedLoop>>,
  totalMs: number,
  promptContext: { prompt: string; promptSource: string },
  readerEvaluation: StoryflowReaderEvaluationSummary
): void {
  const outlineChapters = result.generatedOutline.chapters ?? [];

  // runtimeBackend 校验：SQLite native ABI 与 Node 不一致时会降级内存 API，
  // 此时状态持久化/查询/commit 语义与生产 SQLite 不一致，存储相关行为不具备真实代表性，需醒目告警。
  const warnings: string[] = [];
  if (result.runtimeBackend !== 'sqlite') {
    warnings.push(
      `runtimeBackend=${result.runtimeBackend}：StoryRuntime SQLite 不可用已降级内存 API，` +
        `状态持久化/查询/commit 语义与生产 SQLite 不一致，结果中存储相关行为不具备真实代表性。`
    );
  }
  // 大纲阶段软质量信号（reviewer 回退/补全失败等）进 summary 顶部告警：
  // 不代表失败，但必须醒目——524 跳过 review 这类网关抖动曾在此隐形，只能翻 trace 发现。
  if (result.outlineWarnings.length > 0) {
    warnings.push(
      `大纲阶段 warnings（${result.outlineWarnings.length} 条，详见 outlineWarnings 字段）`
    );
  }
  if (readerEvaluation.warnings.length > 0) {
    warnings.push(`读者评审 warnings（${readerEvaluation.warnings.length} 条，影子模式不阻断）`);
  }
  if (readerEvaluation.errors.length > 0) {
    warnings.push(
      `读者评审失败（${readerEvaluation.errors.length} 条，详见 readerEvaluation.errors）`
    );
  }

  // 每章正文落盘，供人工/读者视角评估
  mkdirSync(PROSE_DIR, { recursive: true });
  result.chapterRunResults.forEach((r, i) => {
    writeFileSync(
      join(PROSE_DIR, `ch${String(i + 1).padStart(2, '0')}.txt`),
      r.output.prose,
      'utf8'
    );
  });
  const rewriteRounds = result.chapterRunResults.map(
    chapter => chapter.output.longFormResult?.rewriteRounds ?? 0
  );
  const writerRecords = result.chapterRunResults.flatMap(chapter => [
    ...chapter.recording.getRecords(),
  ]);
  const writerLatencies = writerRecords.map(record => record.ms).sort((a, b) => a - b);
  const percentile = (values: number[], ratio: number): number | null => {
    if (values.length === 0) return null;
    return values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
  };
  const requestCountsByPurpose = writerRecords.reduce<Record<string, number>>((counts, record) => {
    counts[record.purpose] = (counts[record.purpose] ?? 0) + 1;
    return counts;
  }, {});
  const repairMetrics = {
    firstPassChapters: rewriteRounds.filter(rounds => rounds === 0).length,
    firstPassRate:
      rewriteRounds.length > 0
        ? Number(
            (rewriteRounds.filter(rounds => rounds === 0).length / rewriteRounds.length).toFixed(3)
          )
        : 0,
    rewrittenChapters: rewriteRounds.filter(rounds => rounds > 0).length,
    totalRewriteRounds: rewriteRounds.reduce((sum, rounds) => sum + rounds, 0),
    averageRewriteRounds:
      rewriteRounds.length > 0
        ? Number(
            (rewriteRounds.reduce((sum, rounds) => sum + rounds, 0) / rewriteRounds.length).toFixed(
              2
            )
          )
        : 0,
    pipelineAttempts: result.chapterRunResults.reduce(
      (sum, chapter) => sum + chapter.output.attempts,
      0
    ),
  };
  const runtimeMetrics = {
    requestCount: writerRecords.length,
    requestCountsByPurpose,
    latencyP50Ms: percentile(writerLatencies, 0.5),
    latencyP95Ms: percentile(writerLatencies, 0.95),
    latencyMaxMs: writerLatencies.length > 0 ? writerLatencies[writerLatencies.length - 1] : null,
  };
  const summary = {
    book: result.project.name,
    mode: 'storyflow-closed-loop',
    status: 'complete',
    scenarioId: process.env.MOLIU_STORYFLOW_SCENARIO_ID || null,
    evaluationVersion: readerEvaluation.version,
    promptSource: promptContext.promptSource,
    promptChars: promptContext.prompt.length,
    requestedChapterCount: envInt('MOLIU_CHAPTER_COUNT', DEFAULT_STORYFLOW_CHAPTER_COUNT),
    phaseTimings: result.phaseTimings,
    completedChapters: result.chapterRunResults.length,
    chapters: outlineChapters.length,
    outlinePath: OUTLINE_PATH,
    proseDir: PROSE_DIR,
    batch: result.chapterRunResults.map((r, i) => {
      // 段落节奏指标（AI 腔信号）：cv=段长变异系数，健康网文 ≥0.25，
      // 均匀中长段（cv<0.14 且段数≥12）是机器腔节奏。落盘供 triage/人工抽查明趋势。
      const paras = r.output.prose
        .split(/\n\s*\n/u)
        .map(p => p.trim())
        .filter(Boolean);
      const lens = paras.map(p => p.length);
      const avgLen = lens.length > 0 ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
      const cv =
        lens.length > 1 && avgLen > 0
          ? Math.sqrt(lens.reduce((a, b) => a + (b - avgLen) ** 2, 0) / lens.length) / avgLen
          : 0;
      return {
        ch: i + 1,
        accepted: r.output.success,
        title: r.output.title,
        words: r.output.prose.length,
        paras: paras.length,
        paraCv: Number(cv.toFixed(2)),
        attempts: r.output.attempts,
        rewriteRounds: r.output.longFormResult?.rewriteRounds ?? 0,
        gateIssues: (r.output.gateResult?.allIssues ?? []).map(issue => ({
          category: issue.category,
          severity: issue.severity,
          location: issue.location,
          description: issue.description,
          evidence: issue.evidence,
        })),
        head: r.output.prose.slice(0, 120),
        tail: r.output.prose.slice(-80),
        error: r.output.error ?? null,
      };
    }),
    // 续写后 plotOutline 章节标题（验证 chapterTitle 回写：应不再是「第N章」纯序号）
    plotOutlineTitles: (result.project.plotOutline ?? [])
      .filter(n => n.type === 'chapter')
      .slice(0, 10)
      .map(n => ({ orderIndex: n.orderIndex, title: n.title })),
    runtimeBackend: result.runtimeBackend,
    runtimeBackendAuthentic: result.runtimeBackend === 'sqlite',
    runtimeVerification: result.runtimeVerification,
    projectStorageVerification: result.projectStorageVerification,
    postWritePersistence: result.postWritePersistence,
    // 大纲阶段 warnings 全量落盘：reviewer 回退原因、补全/定点修复失败等软质量信号，
    // 与 warnings 顶部的计数告警配套，供冒烟后人工评估是否影响本轮产出质量。
    outlineWarnings: result.outlineWarnings,
    repairMetrics,
    runtimeMetrics,
    readerEvaluation,
    provider: result.cfg.provider,
    model: result.cfg.model,
    totalMs,
    warnings,
  };
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log(`[storyflow:real] summary=${SUMMARY_PATH}`);
  console.log(`[storyflow:real] ${JSON.stringify(summary)}`);
  // 降级告警单独醒目打印，避免淹没在 summary 长文本里
  for (const w of warnings) {
    console.warn(`[storyflow:real] ⚠️ WARNING: ${w}`);
  }
}

describe.runIf(isRealAiEnabled())('storyflow 闭环（真实 AI）：大纲生成 → 应用 → 批量续写', () => {
  it(
    '开题中心生成大纲并应用，对生成的网文批量续写全部 accepted',
    async () => {
      const startedAt = Date.now();
      const chapterCount = envInt('MOLIU_CHAPTER_COUNT', DEFAULT_STORYFLOW_CHAPTER_COUNT);
      const targetWordCount = envInt('MOLIU_TARGET_WORDS', 3000);
      const {
        prompt,
        source: promptSource,
        wordCountRange: scenarioWordCountRange,
      } = resolveStoryflowPrompt();
      // 规模联动：大纲字数区间必须撑得起请求章数（按 AVG_WORDS_PER_CHAPTER=2500 折算），
      // 否则大纲按小书规划（如 45 万字/180 章）、写作却要写 500 章，后半本没有大纲约束。
      // 默认 30万-60万 只够约 240 章；超过时按章数放大到对应百万级长篇区间再交给
      // buildWordCountBreakdown 统一换算卷数/每卷章数。场景矩阵与显式 MOLIU_STORYFLOW_WORD_RANGE
      // 不做联动（它们对规模有独立要求）。
      const impliedWords = chapterCount * AVG_WORDS_PER_CHAPTER;
      const defaultRangeFits = parseWordCountRange('30万-60万') >= impliedWords;
      const wordCountRange =
        process.env.MOLIU_STORYFLOW_WORD_RANGE?.trim() ||
        scenarioWordCountRange ||
        (defaultRangeFits
          ? '30万-60万'
          : `${Math.floor((impliedWords * 0.95) / 10000)}万-${Math.ceil((impliedWords * 1.2) / 10000)}万`);
      const result = await runStoryflowClosedLoop({
        prompt,
        wordCountRange,
        chapterCount,
        targetWordCount,
      });
      const totalMs = Date.now() - startedAt;

      // ---------- 汇总落盘（先于断言）----------
      // 断言在落盘之后跑：任何一条断言失败都不该丢掉这一轮（真实 AI 约 70-110 分钟）的正文与
      // summary，否则只能回头从 ai-traces 里手工还原。大纲数据已由 harness 在建章后提前落盘。
      const readerEvaluation = await runStoryflowReaderEvaluation(result);
      writeClosedLoopArtifacts(result, totalMs, { prompt, promptSource }, readerEvaluation);

      // ---------- ① 大纲生成断言 ----------
      expect(result.generatedOutline.title).toBeTruthy();
      const outlineCompleteness = inspectOutlineCompleteness(result.executableOutline);
      expect(outlineCompleteness.blockers).toEqual([]);
      expect((result.generatedOutline.chapters ?? []).length).toBe(
        OUTLINE_COMPLETENESS_POLICY.startupChapterCount
      );
      expect(result.executableOutline.startupPack30.openingHook).toBeTruthy();
      // 开篇钩子不过长（质量门槛，与 topic-discovery real 冒烟一致）
      expect(result.executableOutline.startupPack30.openingHook.length).toBeLessThanOrEqual(45);

      // ---------- ② 应用大纲断言 ----------
      // plotOutline 含 act/subplot 等非章节节点；长跑超过启动包时还应包含滚动续写槽。
      const chapterNodes = result.project.plotOutline.filter(n => n.type === 'chapter');
      expect(chapterNodes.length).toBe(
        Math.max((result.generatedOutline.chapters ?? []).length, chapterCount)
      );
      expect(result.project.characters.length).toBeGreaterThan(0);
      expect(result.project.characters.length).toBeGreaterThanOrEqual(10);
      expect(result.project.foreshadows.length).toBeGreaterThanOrEqual(10);
      expect(result.project.volumes.length).toBeGreaterThan(0);
      // 结构化节点透传：plotOutline 首章带 CBN
      expect(chapterNodes[0].CBN).toBeTruthy();
      // 建章数量 = 大纲章节数
      expect(result.createdChapterIds.length).toBe((result.generatedOutline.chapters ?? []).length);
      const startupChapterCount = OUTLINE_COMPLETENESS_POLICY.startupChapterCount;
      expect(result.projectStorageVerification).toMatchObject({
        chapterCount: startupChapterCount,
        plotChapterCount: startupChapterCount,
        linkedPlotChapterCount: startupChapterCount,
        structuredPlotChapterCount: startupChapterCount,
      });
      expect(result.projectStorageVerification.characterCount).toBeGreaterThanOrEqual(10);
      expect(result.projectStorageVerification.foreshadowCount).toBeGreaterThanOrEqual(10);
      expect(result.projectStorageVerification.volumeCount).toBeGreaterThan(0);
      // 建章必须把章纲描述写进 chapter.outline，只剩结构化节点块等于丢了整章章纲
      expect(result.projectStorageVerification.chapterOutlineTextCount).toBe(startupChapterCount);
      // 大纲定位（题材/文风/读者/情绪）必须随项目落盘，否则续写端拿不到定位约束
      expect(result.projectStorageVerification.positioningPersisted).toBe(true);

      // ---------- ③ 批量续写断言 ----------
      // 默认 80 章覆盖更长连续正文；P0 快速回归可通过 MOLIU_CHAPTER_COUNT 缩到 1 章。
      expect(result.chapterRunResults.length).toBe(chapterCount);
      const failed = result.chapterRunResults.filter(r => !r.output.success);
      expect(failed).toEqual([]);
      for (const chapter of result.chapterRunResults) {
        // prose 为最终正文（含补写增量）
        expect(chapter.output.prose.length).toBeGreaterThan(300);
        expect(checkWordCountBounds(chapter.output.prose, targetWordCount).status).toBe('ok');
      }

      // ---------- ④ 真实持久化断言 ----------
      expect(result.runtimeBackend).toBe('sqlite');
      expect(result.runtimeVerification.health.ok).toBe(true);
      expect(result.runtimeVerification.health.pendingOutbox).toBe(0);
      expect(result.runtimeVerification.acceptedDrafts).toBe(chapterCount);
      expect(result.runtimeVerification.latestSnapshotChapter).toBe(chapterCount);
      expect(result.runtimeVerification.sceneChunks).toBeGreaterThanOrEqual(chapterCount);
      expect(result.runtimeVerification.events).toBeGreaterThan(0);

      const persistedChapterTitles = (result.project.plotOutline ?? [])
        .filter(node => node.type === 'chapter')
        .slice(0, chapterCount)
        .map(node => node.title);
      expect(persistedChapterTitles).toHaveLength(chapterCount);
      expect(persistedChapterTitles.every(title => !isPlaceholderChapterTitle(title))).toBe(true);

      // 写作链路不得回头覆盖大纲阶段的关键数据：批量续写结束后重新冷读，
      // 角色/伏笔/卷/章节蓝图数量必须与建章后一致，正文也必须真的落进项目。
      expect(result.postWritePersistence).toMatchObject({
        characterCount: result.projectStorageVerification.characterCount,
        foreshadowCount: result.projectStorageVerification.foreshadowCount,
        volumeCount: result.projectStorageVerification.volumeCount,
      });
      expect(result.postWritePersistence.plotChapterCount).toBe(
        Math.max(result.projectStorageVerification.plotChapterCount, chapterCount)
      );
      expect(result.postWritePersistence.writtenChapterCount).toBe(chapterCount);
    },
    TEST_TIMEOUT_MS // 真实 AI 全链路批量续写（默认 2 小时；慢模型用 MOLIU_TEST_TIMEOUT_MIN 放宽，矩阵实测 qwen3.8-max 需 3 小时+）
  );
});
