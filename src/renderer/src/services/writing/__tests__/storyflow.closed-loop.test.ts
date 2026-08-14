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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { isRealAiEnabled } from './realStructuredAI';
import {
  resolveStoryflowArtifactPaths,
  runStoryflowClosedLoop,
} from './storyflowClosedLoopHarness';
import {
  inspectOutlineCompleteness,
  OUTLINE_COMPLETENESS_POLICY,
} from '@/services/outline/validation/outlineCompleteness';
import { checkWordCountBounds } from '@/services/writing/supplement';
import { isPlaceholderChapterTitle } from '@/services/writing/chapterTitle';

// useProjectCreator 依赖 useRouter（仅导航副作用），测试环境注入桩
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// 产物路径：并发矩阵（MOLIU_RUN_SUFFIX）时带后缀隔离，单跑为原固定名
const { summaryPath: SUMMARY_PATH, outlinePath: OUTLINE_PATH, proseDir: PROSE_DIR } =
  resolveStoryflowArtifactPaths();

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? '');
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * 落盘每章正文与 summary（供 smoke 脚本展示与人工评估）。
 * 大纲数据已由 harness 在建章后提前落盘，这里只补正文与汇总。
 */
function writeClosedLoopArtifacts(
  result: Awaited<ReturnType<typeof runStoryflowClosedLoop>>,
  totalMs: number,
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

  // 每章正文落盘，供人工/读者视角评估
  mkdirSync(PROSE_DIR, { recursive: true });
  result.chapterRunResults.forEach((r, i) => {
    writeFileSync(
      join(PROSE_DIR, `ch${String(i + 1).padStart(2, '0')}.txt`),
      r.output.prose,
      'utf8'
    );
  });
  const summary = {
    book: result.project.name,
    mode: 'storyflow-closed-loop',
    status: 'complete',
    requestedChapterCount: envInt('MOLIU_CHAPTER_COUNT', 5),
    completedChapters: result.chapterRunResults.length,
    chapters: outlineChapters.length,
    outlinePath: OUTLINE_PATH,
    proseDir: PROSE_DIR,
    batch: result.chapterRunResults.map((r, i) => ({
      ch: i + 1,
      accepted: r.output.success,
      title: r.output.title,
      words: r.output.prose.length,
      head: r.output.prose.slice(0, 120),
      tail: r.output.prose.slice(-80),
      error: r.output.error ?? null,
    })),
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

describe.runIf(isRealAiEnabled())(
  'storyflow 闭环（真实 AI）：大纲生成 → 应用 → 批量续写',
  () => {
    it(
      '开题中心生成大纲并应用，对生成的网文批量续写全部 accepted',
      async () => {
        const startedAt = Date.now();
        const chapterCount = envInt('MOLIU_CHAPTER_COUNT', 5);
        const targetWordCount = envInt('MOLIU_TARGET_WORDS', 3000);
        const result = await runStoryflowClosedLoop({
          prompt: '一个现代社畜穿越到古代朝堂，凭借现代知识在官场步步高升，卷入皇权之争',
          wordCountRange: '30万-60万',
          chapterCount,
          targetWordCount,
        });
        const totalMs = Date.now() - startedAt;

        // ---------- 汇总落盘（先于断言）----------
        // 断言在落盘之后跑：任何一条断言失败都不该丢掉这一轮（真实 AI 约 70-110 分钟）的正文与
        // summary，否则只能回头从 ai-traces 里手工还原。大纲数据已由 harness 在建章后提前落盘。
        writeClosedLoopArtifacts(result, totalMs);

        // ---------- ① 大纲生成断言 ----------
        expect(result.generatedOutline.title).toBeTruthy();
        const outlineCompleteness = inspectOutlineCompleteness(result.executableOutline);
        expect(outlineCompleteness.blockers).toEqual([]);
        expect((result.generatedOutline.chapters ?? []).length).toBe(
          OUTLINE_COMPLETENESS_POLICY.startupChapterCount,
        );
        expect(result.executableOutline.startupPack30.openingHook).toBeTruthy();
        // 开篇钩子不过长（质量门槛，与 topic-discovery real 冒烟一致）
        expect(result.executableOutline.startupPack30.openingHook.length).toBeLessThanOrEqual(45);

        // ---------- ② 应用大纲断言 ----------
        // plotOutline 含 act/subplot 等非章节节点，章节节点数应与大纲章节数一致
        const chapterNodes = result.project.plotOutline.filter(n => n.type === 'chapter');
        expect(chapterNodes.length).toBe((result.generatedOutline.chapters ?? []).length);
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
        // 默认 5 章覆盖跨章合同；P0 快速回归可通过 MOLIU_CHAPTER_COUNT 缩到 1 章。
        expect(result.chapterRunResults.length).toBe(chapterCount);
        const failed = result.chapterRunResults.filter(r => !r.output.success);
        expect(failed).toEqual([]);
        for (const chapter of result.chapterRunResults) {
          // prose 为最终正文（含补写增量）
          expect(chapter.output.prose.length).toBeGreaterThan(300);
          expect(
            checkWordCountBounds(chapter.output.prose, targetWordCount).status,
          ).toBe('ok');
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
          plotChapterCount: result.projectStorageVerification.plotChapterCount,
        });
        expect(result.postWritePersistence.writtenChapterCount).toBe(chapterCount);

      },
      120 * 60 * 1000, // 真实 AI 全链路批量续写（默认 5 章；10 章真实 AI 实测约 70-110 分钟）
    );
  },
);
