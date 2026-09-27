/**
 * 读者评审补测（真实 AI）：对既有书的终稿正文离线重跑 ReaderQualityJudge。
 *
 *   node scripts/storyflow-reader-reeval.mjs <project-store.json> [--step N] [--outline]
 *
 * 场景（2026-09-23 g38f 500ch）：生成轮读者评审整段死于网关限流（500 次 503），
 * 四指标无数据。本测试逐章补评并即时落盘 jsonl（断点续跑），结尾汇总
 * 章均/中位/最低/p10/弃读数对照硬门禁 85/86/65。
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { isRealAiEnabled, readRealAiEnvConfig, createRealStructuredAI } from './realStructuredAI';
import { ReaderQualityJudge } from '@/services/story-runtime/readerQualityJudge';
import type { Project } from '@/types/project';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

interface ReeValOptions {
  storePath: string;
  step: number;
  withOutline: boolean;
  outPath: string;
}

function resolveReeValOptions(): ReeValOptions | null {
  const storePath = process.env.MOLIU_REEVAL_STORE?.trim();
  if (!storePath) return null;
  return {
    storePath,
    step: Number(process.env.MOLIU_REEVAL_STEP) > 0 ? Number(process.env.MOLIU_REEVAL_STEP) : 1,
    withOutline: process.env.MOLIU_REEVAL_OUTLINE === '1',
    outPath: process.env.MOLIU_REEVAL_OUT?.trim() || 'temp/reader-reeval/fallback.jsonl',
  };
}

function loadProjectFromStore(storePath: string): Project {
  const root = JSON.parse(readFileSync(storePath, 'utf8')) as Record<string, unknown>;
  const rawProjects = root.projects as unknown;
  const project = Array.isArray(rawProjects)
    ? (rawProjects[0] as Project)
    : rawProjects && typeof rawProjects === 'object'
      ? (Object.values(rawProjects)[0] as Project)
      : (root as unknown as Project);
  if (!project || !Array.isArray(project.chapters)) {
    throw new Error('store 中找不到带 chapters 的项目');
  }
  return project;
}

interface StoredChapterEval {
  chapter: number;
  score: number;
  continueReading: boolean;
  lowDimension?: { key: string; score: number };
}

async function runReaderReeval(options: ReeValOptions): Promise<StoredChapterEval[]> {
  const project = loadProjectFromStore(options.storePath);
  const chapters = [...project.chapters].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const ai = createRealStructuredAI(readRealAiEnvConfig());
  const judge = new ReaderQualityJudge(ai);
  const meta = (project as unknown as { genre?: string; targetReader?: string; positioning?: string });
  const context = {
    title: project.title ?? project.name ?? '未命名',
    genre: meta.genre ?? '权谋查账爽文',
    targetReader: meta.targetReader ?? '男频网文连续追更读者',
    positioning: meta.positioning,
  };

  mkdirSync(dirname(options.outPath), { recursive: true });
  const done = new Set<number>();
  if (existsSync(options.outPath)) {
    for (const line of readFileSync(options.outPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as { chapter?: number; skipped?: boolean };
        // 跳过章不算完成：新一轮重跑时重试（当轮两次失败不代表永远失败）
        if (parsed.chapter && !parsed.skipped) done.add(parsed.chapter);
      } catch { /* 脏行忽略 */ }
    }
  }

  const results: StoredChapterEval[] = [];
  let previousTail = '';
  for (const chapter of chapters) {
    const n = (chapter.orderIndex ?? 0) + 1;
    const prose = (chapter.content ?? '').trim();
    if (n % options.step !== 0 || !prose) continue;
    if (done.has(n)) continue;
    // 单章评审失败软兜底（2026-09-25 r10a 实证：单章响应被判定 schema 拒绝
    // （ZodError）直接崩掉整跑 23 分钟、断点前 132 章白等）：重试一次，仍失败
    // 则记录跳过章并继续后续章——汇总只认有 score 的行，跳过章重跑时再试。
    let evaluation: Awaited<ReturnType<typeof judge.evaluateChapter>> | undefined;
    let lastError = '';
    for (let attempt = 1; attempt <= 2 && !evaluation; attempt += 1) {
      try {
        evaluation = await judge.evaluateChapter({
          context,
          chapter: n,
          title: chapter.title ?? `第${n}章`,
          previousTail: previousTail || undefined,
          prose,
        });
      } catch (error) {
        lastError = String(error).slice(0, 160);
        console.warn(`[reader-reeval] 第${n}章评审失败（attempt ${attempt}/2）：${lastError}`);
      }
    }
    if (!evaluation) {
      appendFileSync(options.outPath, `${JSON.stringify({ chapter: n, skipped: true, reason: lastError })}\n`, 'utf8');
      console.warn(`[reader-reeval] 第${n}章两次评审失败，跳过并记录（不阻塞后续章）`);
      previousTail = prose.slice(-400);
      continue;
    }
    const record: StoredChapterEval & { summary: string } = {
      chapter: n,
      score: evaluation.score,
      continueReading: evaluation.continueReading,
      summary: (evaluation.summary ?? '').slice(0, 120),
    };
    const dims = Object.entries(evaluation.dimensions) as [string, number][];
    const low = dims.sort((a, b) => a[1] - b[1])[0];
    if (low && low[1] < 60) record.lowDimension = { key: low[0], score: low[1] };
    appendFileSync(options.outPath, `${JSON.stringify(record)}\n`, 'utf8');
    results.push(record);
    console.info(`[reader-reeval] 第${n}章 score=${evaluation.score} continue=${evaluation.continueReading}`);
    previousTail = prose.slice(-400);
  }

  if (options.withOutline) {
    const outlineEvaluation = await judge.evaluateOutline({
      context,
      outline: (project.plotOutline ?? chapters.map(c => c.outline)).slice(0, 120),
    });
    appendFileSync(options.outPath, `${JSON.stringify({ outline: true, score: outlineEvaluation.score, wouldStartReading: outlineEvaluation.wouldStartReading })}\n`, 'utf8');
    console.info(`[reader-reeval] 大纲 score=${outlineEvaluation.score} wouldStart=${outlineEvaluation.wouldStartReading}`);
  }

  // 汇总（含断点续跑的历史行）
  const all: StoredChapterEval[] = [];
  if (existsSync(options.outPath)) {
    for (const line of readFileSync(options.outPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as StoredChapterEval;
        if (rec.chapter && typeof rec.score === 'number') all.push(rec);
      } catch { /* 忽略 */ }
    }
  }
  const scores = all.map(r => r.score).sort((a, b) => a - b);
  if (scores.length > 0) {
    const summary = {
      evaluated: scores.length,
      average: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
      median: Number(scores[Math.floor(scores.length / 2)].toFixed(1)),
      minimum: scores[0],
      p10: scores[Math.floor(scores.length * 0.1)],
      continueReadingNo: all.filter(r => !r.continueReading).length,
      gates: { average: 85, median: 86, minimum: 65 },
    };
    appendFileSync(options.outPath, `${JSON.stringify({ summary: true, ...summary })}\n`, 'utf8');
    console.info('[reader-reeval] 汇总:', JSON.stringify(summary));
  }
  return all;
}

const reevalOptions = resolveReeValOptions();

describe('读者评审补测（真实 AI）', () => {
  it.runIf(isRealAiEnabled() && reevalOptions !== null)(
    '离线重跑读者评审并落盘四指标',
    async () => {
      const results = await runReaderReeval(reevalOptions!);
      // 全量/抽样下都应至少评出 1 章；断点续跑已完成时允许直接复用历史
      expect(results.length).toBeGreaterThan(0);
    },
    // 预算：抽样章数 × 单次评审（正常 3-8s，慢网关 30s）+ 60s 常数
    Math.max(10, Math.ceil(500 / (reevalOptions?.step ?? 1)) * 30 + 60) * 60_000,
  );
});
