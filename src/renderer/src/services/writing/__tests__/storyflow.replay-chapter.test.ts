/**
 * 章节回放执行器（真实 AI）：把书审 S1 固化的回放用例用当前代码重跑并由 AI 探针判定。
 *
 *   node scripts/storyflow-replay-chapter.mjs run <用例id|用例目录|all> [--samples 2]
 *
 * 与真实环境差异仅限：输入 project 为截断快照（chapterReplay.buildReplaySnapshot，
 * 已知差异见该文件头）；写作链路直接调用 runContinueWriteChapters——与大循环矩阵
 * 同一入口（批量预设、错误分级重试、蓝图再生、记忆提取、AI 配置注入全部同源）。
 * 每个样本从同一快照重新开始，样本间互不污染。
 */
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, it, vi } from 'vitest';

import { UnifiedOutlineGenerator } from '@/services/outline/generators/unified-generator';

import {
  buildReplayProbeRequest,
  buildReplaySnapshot,
  parseReplayCase,
  summarizeReplaySamples,
  type ChapterReplayCase,
  type ReplayProbeVerdict,
  type ReplaySampleResult,
} from './chapterReplay';
import { runContinueWriteChapters } from './continueWriteHarness';
import { resolveContinueWriteRealConfig } from './continueWriteRealConfig';
import { readProjectStoreFile } from './projectStoreFile';
import { createRealStructuredAI, isRealAiEnabled, readRealAiEnvConfig } from './realStructuredAI';
import { injectSettingsStore } from './storyflowClosedLoopHarness';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

/** 单章预算：3 次持久重试 × 慢网关（与补写 runner 同口径） */
const MINUTES_PER_CHAPTER = 45;

interface LoadedCase {
  casePath: string;
  replayCase: ChapterReplayCase;
}

function resolveCases(): LoadedCase[] {
  const raw = process.env.MOLIU_REPLAY_CASES?.trim();
  if (!raw) return [];
  return raw
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .map(casePath => ({
      casePath,
      replayCase: parseReplayCase(JSON.parse(readFileSync(casePath, 'utf8'))),
    }));
}

const loadedCases = resolveCases();
const sampleCount = Math.max(1, Number(process.env.MOLIU_REPLAY_SAMPLES) || 2);
const totalChapters = loadedCases.reduce((sum, item) => sum + item.replayCase.window, 0) * sampleCount;

async function runSample(
  loaded: LoadedCase,
  sample: number,
  runDir: string
): Promise<ReplaySampleResult> {
  const { replayCase, casePath } = loaded;
  const cfg = resolveContinueWriteRealConfig();
  const { project: stored } = readProjectStoreFile(resolve(dirname(casePath), replayCase.snapshot));
  const { project, warnings } = buildReplaySnapshot(stored, replayCase.fromChapter);
  for (const warning of warnings) console.warn(`[replay] ${replayCase.id} 快照差异：${warning}`);

  const runIdPrefix = `replay-${replayCase.id}-s${sample}`;
  const result = await runContinueWriteChapters({
    project,
    fromChapter: replayCase.fromChapter,
    chapterCount: replayCase.window,
    targetWordCount: replayCase.targetWordCount ?? 3000,
    ai: createRealStructuredAI(readRealAiEnvConfig()),
    runIdPrefix,
    persistTrace: true,
    mode: 'batch',
    repairBlueprint: (system: string, user: string, temperature?: number) =>
      new UnifiedOutlineGenerator().callStructuredTextForRoll(system, user, {
        temperature,
        trace: { runId: `${runIdPrefix}-bp-regen-${Date.now()}`, model: cfg.model, provider: cfg.provider },
      }),
    onChapterHydrated: () => injectSettingsStore(cfg),
  });

  const chapters = result.chapters.map(item => ({
    chapterNumber: item.chapterNumber,
    success: item.output.success,
    words: item.output.prose.replace(/\s+/g, '').length,
    ...(item.output.success ? {} : { error: (item.output.error ?? '').slice(0, 300) }),
  }));
  const written = result.chapters
    .filter(item => item.output.success)
    .map(item => ({
      chapterNumber: item.chapterNumber,
      title: item.output.title ?? item.chapter.title,
      prose: item.output.prose,
    }));
  for (const item of written) {
    writeFileSync(
      join(runDir, `s${sample}-ch${String(item.chapterNumber).padStart(3, '0')}.txt`),
      `${item.title}\n\n${item.prose}`,
      'utf8'
    );
  }

  let verdict: ReplayProbeVerdict | null = null;
  if (written.length > 0) {
    const probeAi = createRealStructuredAI(readRealAiEnvConfig());
    const request = buildReplayProbeRequest(replayCase.probe, written);
    verdict = (await probeAi.generate(request)) as ReplayProbeVerdict;
  }
  return {
    sample,
    accepted: chapters.length === replayCase.window && chapters.every(item => item.success),
    chapters,
    verdict,
  };
}

async function runCase(loaded: LoadedCase): Promise<Record<string, unknown>> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const caseDir = dirname(loaded.casePath);
  const runDir = join(caseDir, 'runs', stamp);
  mkdirSync(runDir, { recursive: true });
  const samples: ReplaySampleResult[] = [];
  for (let sample = 1; sample <= sampleCount; sample += 1) {
    try {
      samples.push(await runSample(loaded, sample, runDir));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[replay] ${loaded.replayCase.id} 样本 ${sample} 异常：${message}`);
      samples.push({ sample, accepted: false, chapters: [], verdict: null });
    }
  }
  const summary = { caseId: loaded.replayCase.id, findingId: loaded.replayCase.findingId, ...summarizeReplaySamples(samples) };
  const report = { ...summary, runAt: stamp, samples };
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(report, null, 2), 'utf8');
  // 目录 mtime 是 temp 清理（replay-cases 30 天窗口）的保留依据：
  // 每次回放刷新用例目录与共享快照目录，仍在使用的语料不会被清
  const now = new Date();
  utimesSync(caseDir, now, now);
  utimesSync(dirname(resolve(caseDir, loaded.replayCase.snapshot)), now, now);
  console.info(
    `[replay] case=${summary.caseId} status=${summary.status} recur=${summary.recurrences}/${sampleCount} holes=${summary.holes}`
  );
  return summary;
}

describe('章节回放（真实 AI）', () => {
  it.runIf(isRealAiEnabled() && loadedCases.length > 0)(
    '按用例截断快照重跑并由 AI 探针判定缺陷是否复现',
    async () => {
      const summaries: Array<Record<string, unknown>> = [];
      for (const loaded of loadedCases) {
        summaries.push(await runCase(loaded));
      }
      const suiteRoot = resolve(dirname(loadedCases[0].casePath), '..');
      writeFileSync(
        join(suiteRoot, '_last-suite.json'),
        JSON.stringify({ runAt: new Date().toISOString(), samples: sampleCount, summaries }, null, 2),
        'utf8'
      );
      const failed = summaries.filter(item => item.status !== 'pass');
      if (failed.length > 0) {
        throw new Error(
          `回放未通过 ${failed.length}/${summaries.length}：${failed.map(item => `${item.caseId}=${item.status}`).join(', ')}`
        );
      }
    },
    Math.max(1, totalChapters) * MINUTES_PER_CHAPTER * 60_000
  );
});
