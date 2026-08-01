/**
 * 真 AI 续写冒烟：与正式 App 路径对齐
 *
 * - 单章：WritingOrchestratorV2 同入口 executeSmartContinue（SMART_CONTINUE_PRESET）
 * - 多章：useBatchWriter 同路径 ChapterWritingPipeline + BATCH_CONTINUE_PRESET
 *
 * 配置：temp/continue-write.real.config.json
 * 运行：
 * - 单章：npm run smoke:continue-write:real
 * - 多章：npm run smoke:continue-write:real:multi（默认 3 章；或配置 chapterCount / MOLIU_CHAPTER_COUNT）
 *
 * 产物：
 * - 单章：temp/continue-write.real.summary.json / steps.txt / report.json
 * - 多章：temp/continue-write.real.multi.summary.json / steps.txt / report.json
 * - temp/ai-traces/continue-write-real-*.jsonl
 */
import { describe, expect, it } from 'vitest';

import { countWords } from '@/services/writing/utils';
import { executeSmartContinue } from '@/services/writing/smartContinue';

import {
  runContinueWriteChapters,
  runContinueWritePipelineFromLocalProject,
  toPipelineProject,
} from './continueWriteHarness';
import { resolveContinueWriteRealConfig } from './continueWriteRealConfig';
import {
  formatMultiSummaryConsole,
  formatSummaryConsole,
  persistContinueWriteRealMultiRun,
  persistContinueWriteRealRun,
} from './continueWriteRealSummary';
import {
  clearAllChapterContents,
  ensureLocalChapterSlots,
  loadLocalMoliuProject,
} from './loadLocalMoliuProject';
import { createRealStructuredAI, isRealAiEnabled } from './realStructuredAI';

function isRealMultiEnabled(): boolean {
  if (!isRealAiEnabled()) return false;
  const flag = (process.env.REAL_AI_MULTI || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return true;
  try {
    return resolveContinueWriteRealConfig().chapterCount >= 2;
  } catch {
    return false;
  }
}

describe.skipIf(!isRealAiEnabled())('continueWrite REAL AI · Pipeline 正式路径', () => {
  it(
    '清空全部章节 → executeSmartContinue 第1章：真实流程并打印逐步输入输出',
    async () => {
      expect(typeof executeSmartContinue).toBe('function');

      const cfg = resolveContinueWriteRealConfig();
      const chapterNumber = 1;
      const loaded = loadLocalMoliuProject({
        projectId: cfg.projectId,
        projectName: cfg.projectName,
      });
      const project = clearAllChapterContents(loaded);
      const cleared = (project.chapters ?? []).every(ch => !(ch.content || '').trim());
      expect(cleared).toBe(true);

      const ai = createRealStructuredAI({
        provider: cfg.provider,
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
      });

      const { recording, output, runtimeBackend } = await runContinueWritePipelineFromLocalProject({
        project,
        chapterNumber,
        targetWordCount: cfg.targetWordCount,
        ai,
        runId: `continue-write-real-${project.id}-from-ch${chapterNumber}-${Date.now()}`,
        persistTrace: true,
        model: cfg.model,
        provider: cfg.provider,
      });

      await recording.flush();

      const longForm = output.longFormResult;
      expect(longForm).toBeTruthy();
      expect(output.success).toBe(true);
      expect(output.prose.length).toBeGreaterThan(50);
      expect(longForm!.drafts.length).toBeGreaterThan(0);
      expect(output.taskBook).toBeTruthy();

      const { summary, summaryPath, stepsPath } = persistContinueWriteRealRun({
        book: project.name,
        chapterNumber,
        provider: cfg.provider,
        providerId: cfg.providerId,
        model: cfg.model,
        success: output.success,
        prose: output.prose,
        targetWordCount: cfg.targetWordCount,
        longForm: longForm!,
        recording,
        taskBook: output.taskBook,
        runtimeBackend,
      });

      const words = countWords(output.prose);
      // eslint-disable-next-line no-console
      console.log(formatSummaryConsole(summary));
      // eslint-disable-next-line no-console
      console.log(
        `[REAL_AI] book=${project.name} ch=${chapterNumber} success=${output.success} ` +
          `commit=${longForm!.commit.status} words=${words}/${cfg.targetWordCount} ` +
          `rewrite=${longForm!.rewriteRounds ?? 0} model=${cfg.model} ` +
          `trace=${recording.getTraceFilePath()} steps=${stepsPath} summary=${summaryPath}`
      );
      // eslint-disable-next-line no-console
      console.log(`[REAL_AI] prose.head=\n${output.prose.slice(0, 300)}`);
      // eslint-disable-next-line no-console
      console.log(`[REAL_AI] prose.tail=\n${output.prose.slice(-300)}`);
    },
    600_000
  );
});

describe.skipIf(!isRealMultiEnabled())('continueWrite REAL AI · 多章批量续写', () => {
  it(
    '清空全部章节 → 连续多章 BATCH_CONTINUE（与 useBatchWriter 同路径）',
    async () => {
      expect(typeof executeSmartContinue).toBe('function');

      const cfg = resolveContinueWriteRealConfig();
      const fromChapter = cfg.chapterNumber > 0 ? cfg.chapterNumber : 1;
      const chapterCount = Math.max(3, cfg.chapterCount);
      const neededSlots = fromChapter + chapterCount - 1;
      const loaded = loadLocalMoliuProject({
        projectId: cfg.projectId,
        projectName: cfg.projectName,
      });
      const outlineChapterCount = (loaded.plotOutline ?? []).filter(
        node => node && typeof node === 'object' && (node as { type?: string }).type === 'chapter'
      ).length;
      expect(Math.max((loaded.chapters ?? []).length, outlineChapterCount)).toBeGreaterThanOrEqual(
        neededSlots
      );

      const projectLocal = clearAllChapterContents(
        ensureLocalChapterSlots(loaded, neededSlots)
      );
      expect((projectLocal.chapters ?? []).length).toBeGreaterThanOrEqual(neededSlots);
      const ai = createRealStructuredAI({
        provider: cfg.provider,
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
      });

      const multi = await runContinueWriteChapters({
        project: toPipelineProject(projectLocal),
        fromChapter,
        chapterCount,
        targetWordCount: cfg.targetWordCount,
        ai,
        runIdPrefix: `continue-write-real-${projectLocal.id}-batch`,
        persistTrace: true,
        model: cfg.model,
        provider: cfg.provider,
        mode: 'batch',
      });

      // 失败章也落盘，便于排查（断言放在持久化之后）
      const chapterSummaries = multi.chapters
        .filter(item => item.output.longFormResult)
        .map(item => {
          const longForm = item.output.longFormResult!;
          return persistContinueWriteRealRun({
            book: projectLocal.name,
            chapterNumber: item.chapterNumber,
            provider: cfg.provider,
            providerId: cfg.providerId,
            model: cfg.model,
            success: item.output.success,
            prose: item.output.prose,
            targetWordCount: cfg.targetWordCount,
            longForm,
            recording: item.recording,
            taskBook: item.taskBook,
            runtimeBackend: multi.runtimeBackend,
            fileStem: `continue-write.real.ch${item.chapterNumber}`,
          }).summary;
        });

      if (chapterSummaries.length > 0) {
        const { summary, summaryPath, stepsPath } = persistContinueWriteRealMultiRun({
          book: projectLocal.name,
          fromChapter,
          chapterCount,
          provider: cfg.provider,
          providerId: cfg.providerId,
          model: cfg.model,
          runtimeBackend: multi.runtimeBackend,
          chapterSummaries,
          mode: multi.mode,
        });
        // eslint-disable-next-line no-console
        console.log(formatMultiSummaryConsole(summary));
        for (const item of chapterSummaries) {
          // eslint-disable-next-line no-console
          console.log(formatSummaryConsole(item));
        }
        // eslint-disable-next-line no-console
        console.log(
          `[REAL_AI_MULTI] mode=${multi.mode} summary=${summaryPath} steps=${stepsPath} ` +
            `chapters=${chapterSummaries.map(item => `ch${item.chapterNumber}:${item.wordCount}w`).join(',')}`
        );
      }

      expect(multi.mode).toBe('batch');
      expect(multi.chapters.length).toBe(chapterCount);
      expect(multi.chapters.every(item => item.mode === 'batch')).toBe(true);
      for (const item of multi.chapters) {
        expect(item.output.success).toBe(true);
        expect(item.output.prose.length).toBeGreaterThan(50);
        expect(item.output.longFormResult).toBeTruthy();
        expect(item.output.longFormResult!.commit.status).toBe('accepted');
      }
    },
    1_800_000
  );
});
