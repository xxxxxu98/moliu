import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RecordingStructuredAI } from '@/services/story-runtime/RecordingStructuredAI';
import type { LongFormWriteResult, StructuredAI } from '@/types/story-runtime';
import type { WritingTaskBook } from '@/types/writing-v2';

import {
  buildTraceDump,
  deriveWordTimeline,
  formatRunMetaHeader,
  persistContinueWriteRealRun,
  summarizeTaskBook,
} from './continueWriteRealSummary';

function makeFakeLongForm(overrides?: Partial<LongFormWriteResult>): LongFormWriteResult {
  return {
    plan: {
      chapterNumber: 1,
      beats: [],
      prechecks: [
        { candidateId: 'e1', accepted: true, reasons: [] },
        { candidateId: 'e2', accepted: false, reasons: ['blocked'] },
      ],
    },
    context: { blocks: [], totalTokenEstimate: 0, omitted: [] },
    drafts: [
      {
        sceneId: 's1',
        beatId: 'b1',
        paragraphs: ['甲乙丙丁戊己庚辛壬癸'.repeat(20)],
        candidateEvents: [],
      },
    ],
    facts: { events: [], deltas: [], evidence: [] },
    report: {
      accepted: true,
      issues: [],
      checkedDomains: ['fulfillment', 'forbidden'],
    },
    commit: {
      id: 'commit-unit',
      projectId: 'proj',
      chapterNumber: 1,
      status: 'accepted',
      baseState: {} as LongFormWriteResult['commit']['baseState'],
      contractPack: {} as LongFormWriteResult['commit']['contractPack'],
      sceneDrafts: [],
      extractedFacts: { events: [], deltas: [], evidence: [] },
      validation: { accepted: true, issues: [], checkedDomains: [] },
      overlay: {} as LongFormWriteResult['commit']['overlay'],
      reasons: [],
    },
    receipt: {
      commitId: 'commit-unit',
      revision: 3,
      acceptedAt: '2026-08-01T00:00:00.000Z',
    },
    rewriteRounds: 0,
    ...overrides,
  };
}

function makeTaskBook(): WritingTaskBook {
  return {
    hardConstraints: {
      goal: '三日内翻案',
    },
    CBN: '开场穿越验尸',
    CPNs: ['指出真凶', '反诬入狱'],
    CEN: '三日内翻案',
    mustCover: ['穿越醒来正在验尸'],
    forbiddenZones: ['不能揭示盐铁走私网的全貌'],
    styleGuidance: {
      reasoning: [],
      antiPatterns: [],
      protagonistOOCAlert: [],
    },
  };
}

describe('continueWriteRealSummary', () => {
  it('落盘 summary + steps 头 meta，并刷新 report.json', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moliu-cw-summary-'));
    const draftText = '甲乙丙丁戊己庚辛壬癸'.repeat(30);
    const inner: StructuredAI = {
      async generate() {
        return {
          sceneId: 'chapter-1:CBN:scene',
          beatId: 'chapter-1:CBN',
          paragraphs: [draftText],
          candidateEvents: [],
        };
      },
    };
    const recording = new RecordingStructuredAI(inner, {
      runId: 'continue-write-real-summary-unit',
      persist: false,
      model: 'unit-model',
      provider: 'openai',
    });
    await recording.generate({
      purpose: 'scene-draft',
      schemaName: 'SceneDraft',
      system: 'sys',
      prompt: '{"chapterNumber":1}',
      parse: value => value,
    });
    await recording.generate({
      purpose: 'scene-draft',
      schemaName: 'SupplementParagraphs',
      system: 'sys',
      prompt: '{"additionalWords":100}',
      parse: value => value,
    });

    const longForm = makeFakeLongForm();
    const taskBook = makeTaskBook();
    const { summary, summaryPath, stepsPath, reportPath } = persistContinueWriteRealRun({
      book: '单元书',
      chapterNumber: 1,
      provider: 'openai',
      providerId: 'provider-unit',
      model: 'unit-model',
      success: true,
      prose: draftText,
      targetWordCount: 300,
      longForm,
      recording,
      taskBook,
      runtimeBackend: 'memory',
      outDir,
    });

    expect(summary.kind).toBe('continue-write-real-summary');
    expect(summary.runId).toBe('continue-write-real-summary-unit');
    expect(summary.model).toBe('unit-model');
    expect(summary.purposes).toEqual(['scene-draft', 'scene-draft']);
    expect(summary.schemas).toEqual(['SceneDraft', 'SupplementParagraphs']);
    expect(summary.schemaFlow).toBe(
      'scene-draft:SceneDraft → scene-draft:SupplementParagraphs'
    );
    expect(summary.stepCount).toBe(2);
    expect(summary.runtimeBackend).toBe('memory');
    expect(summary.taskBook.present).toBe(true);
    expect(summary.taskBook.mustCoverCount).toBe(1);
    expect(summary.receipt?.commitId).toBe('commit-unit');
    expect(summary.reportAccepted).toBe(true);
    expect(summary.prechecks.blocked).toBe(1);
    expect(summary.wordTimeline.supplementAiRounds).toBe(1);
    expect(summary.wordTimeline.draftWords).toBeGreaterThan(0);

    const summaryJson = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
      kind: string;
      runId: string;
      schemaFlow: string;
    };
    expect(summaryJson.kind).toBe('continue-write-real-summary');
    expect(summaryJson.runId).toBe('continue-write-real-summary-unit');
    expect(summaryJson.schemaFlow).toContain('SupplementParagraphs');

    const steps = fs.readFileSync(stepsPath, 'utf8');
    expect(steps).toContain('========== RUN META ==========');
    expect(steps).toContain('model=unit-model');
    expect(steps).toContain('runtimeBackend=memory');
    expect(steps).toContain('schemaFlow=');
    expect(steps).toContain('========== AI TRACE (2 steps) ==========');

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
      kind: string;
      note?: string;
    };
    expect(report.kind).toBe('continue-write-real-summary');
    expect(report.note).toContain('continue-write.real.summary.json');

    const meta = formatRunMetaHeader(summary);
    expect(meta).toContain('receipt=commit-unit@rev3');
    expect(meta).toContain('taskBook=yes');
    expect(buildTraceDump(recording.getRecords(), meta)).toContain('model=unit-model');

    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('deriveWordTimeline / summarizeTaskBook 可独立复用', () => {
    const longForm = makeFakeLongForm();
    const records = [
      {
        seq: 1,
        runId: 'r',
        purpose: 'scene-draft' as const,
        schemaName: 'SceneDraft',
        system: '',
        prompt: '',
        response: { paragraphs: ['一二三四五六七八九十'.repeat(10)] },
        ms: 1,
        at: '',
      },
      {
        seq: 2,
        runId: 'r',
        purpose: 'scene-draft' as const,
        schemaName: 'SupplementParagraphs',
        system: '',
        prompt: '',
        response: { paragraphs: ['补写一段'] },
        ms: 1,
        at: '',
      },
    ];
    const timeline = deriveWordTimeline(records, longForm, '最终正文一二三');
    expect(timeline.draftWords).toBe(100);
    expect(timeline.supplementAiRounds).toBe(1);
    expect(timeline.finalWords).toBeGreaterThan(0);

    const tb = summarizeTaskBook(makeTaskBook());
    expect(tb.present).toBe(true);
    expect(tb.CPNs).toHaveLength(2);
    expect(summarizeTaskBook(null).present).toBe(false);
  });
});
