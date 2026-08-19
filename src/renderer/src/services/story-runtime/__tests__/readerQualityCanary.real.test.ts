import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ReaderQualityJudge } from '../readerQualityJudge';
import { RecordingStructuredAI } from '../RecordingStructuredAI';
import {
  resolveContinueWriteRealConfig,
  resolveReaderJudgeConfig,
} from '@/services/writing/__tests__/continueWriteRealConfig';
import {
  createRealStructuredAI,
  isRealAiEnabled,
} from '@/services/writing/__tests__/realStructuredAI';

interface CanaryCase {
  id: string;
  genre: string;
  targetReader: string;
  good: { title: string; prose: string };
  mutated: { title: string; prose: string };
}

describe.runIf(isRealAiEnabled())('读者评审质量变异真实冒烟', () => {
  it(
    '明显劣化文本的读者评分显著低于正常文本',
    async () => {
      const writer = resolveContinueWriteRealConfig();
      const evaluator = resolveReaderJudgeConfig(writer);
      const recording = new RecordingStructuredAI(
        createRealStructuredAI({
          provider: evaluator.provider,
          apiKey: evaluator.apiKey,
          model: evaluator.model,
          baseUrl: evaluator.baseUrl,
        }),
        {
          runId: `reader-canary-${Date.now()}`,
          provider: evaluator.provider,
          model: evaluator.model,
        }
      );
      const judge = new ReaderQualityJudge(recording);
      const cases = JSON.parse(
        readFileSync(
          join(process.cwd(), 'scripts', 'fixtures', 'reader-eval-canaries.json'),
          'utf8'
        )
      ) as CanaryCase[];
      const deltas: number[] = [];

      for (const [index, canary] of cases.entries()) {
        const context = {
          title: canary.id,
          genre: canary.genre,
          targetReader: canary.targetReader,
        };
        const good = await judge.evaluateChapter({
          context,
          chapter: index + 1,
          title: canary.good.title,
          prose: canary.good.prose,
        });
        const mutated = await judge.evaluateChapter({
          context,
          chapter: index + 1,
          title: canary.mutated.title,
          prose: canary.mutated.prose,
        });
        deltas.push(good.score - mutated.score);
        expect(mutated.score, `${canary.id} 劣化文本不应高于正常文本`).toBeLessThan(good.score);
        expect(mutated.issues.length, `${canary.id} 劣化文本应有证据问题`).toBeGreaterThan(0);
      }

      const averageDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
      expect(averageDelta).toBeGreaterThanOrEqual(8);
      await recording.flush();
    },
    20 * 60_000
  );
});
