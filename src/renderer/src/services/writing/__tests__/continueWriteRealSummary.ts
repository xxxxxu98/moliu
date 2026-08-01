/**
 * 真 AI 续写冒烟：跑次级摘要（与逐步 dump 解耦）
 * - temp/continue-write.real.summary.json  —— 权威当次摘要
 * - temp/continue-write.real.report.json   —— 同步刷新，避免读到旧 checklist
 * - steps 文件头 run meta
 */
import fs from 'node:fs';
import path from 'node:path';

import type {
  AiTraceRecord,
  RecordingStructuredAI,
} from '@/services/story-runtime/RecordingStructuredAI';
import type { LongFormWriteResult } from '@/types/story-runtime';
import type { WritingTaskBook } from '@/types/writing-v2';
import { countWords } from '@/services/writing/utils';

/** 与 continueWriteHarness.HarnessRuntimeBackend 对齐，避免 summary 反向依赖 harness */
export type ContinueWriteRuntimeBackend = 'sqlite' | 'memory';

export interface ContinueWriteRealStepSummary {
  seq: number;
  purpose: string;
  schemaName: string;
  ms: number;
  hasError: boolean;
}

export interface ContinueWriteRealWordTimeline {
  /** 首份 SceneDraft 正文字数 */
  draftWords: number | null;
  /** 引擎补字/压缩后 drafts 字数 */
  afterPadWords: number | null;
  /** 出口 prose 字数（normalize 后） */
  finalWords: number;
  /** schema=SupplementParagraphs 次数（引擎内补字，≠ Pipeline.supplementRounds） */
  supplementAiRounds: number;
  /** schema=CondenseParagraphs 次数 */
  condenseAiRounds: number;
}

export interface ContinueWriteRealTaskBookSummary {
  present: boolean;
  CBN: string;
  CPNs: string[];
  CEN: string;
  mustCoverCount: number;
  forbiddenZonesCount: number;
}

export interface ContinueWriteRealReceiptSummary {
  commitId: string;
  revision: number;
  acceptedAt: string;
}

export interface ContinueWriteRealPrecheckSummary {
  total: number;
  accepted: number;
  blocked: number;
  blockedCandidateIds: string[];
}

export interface ContinueWriteRealSummary {
  kind: 'continue-write-real-summary';
  at: string;
  runId: string;
  book: string;
  chapterNumber: number;
  provider?: string;
  providerId?: string;
  model?: string;
  success: boolean;
  commitStatus: string;
  commitReasons: string[];
  commitId?: string;
  receipt: ContinueWriteRealReceiptSummary | null;
  reportAccepted: boolean;
  reportIssueCount: number;
  checkedDomains: string[];
  prechecks: ContinueWriteRealPrecheckSummary;
  wordCount: number;
  targetWordCount: number;
  wordTimeline: ContinueWriteRealWordTimeline;
  rewriteRounds: number;
  purposes: string[];
  /** schema 序列，避免两次 scene-draft 被误读为重写 */
  schemas: string[];
  /** purpose+schema 可读流水线 */
  schemaFlow: string;
  steps: ContinueWriteRealStepSummary[];
  stepCount: number;
  totalAiMs: number;
  runtimeBackend?: ContinueWriteRuntimeBackend;
  taskBook: ContinueWriteRealTaskBookSummary;
  tracePath: string;
  stepsPath: string;
  summaryPath: string;
  prosePreview: { head: string; tail: string };
}

export interface PersistContinueWriteRealRunInput {
  book: string;
  chapterNumber: number;
  provider?: string;
  providerId?: string;
  model?: string;
  success: boolean;
  prose: string;
  targetWordCount: number;
  longForm: LongFormWriteResult;
  recording: RecordingStructuredAI;
  taskBook?: WritingTaskBook | null;
  runtimeBackend?: ContinueWriteRuntimeBackend;
  /** 默认 continue-write.real；多章可传 continue-write.real.ch2 */
  fileStem?: string;
  /** 默认 temp/；单测可指向隔离目录 */
  outDir?: string;
}

function formatJson(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** 从 AI response 抽取正文段落（SceneDraft / SupplementParagraphs / CondenseParagraphs） */
export function extractParagraphsFromResponse(response: unknown): string[] {
  if (Array.isArray(response)) {
    return response.filter((item): item is string => typeof item === 'string');
  }
  const record = asRecord(response);
  if (!record) return [];
  const raw = record.paragraphs ?? record['段落'];
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string');
  }
  if (typeof raw === 'string') {
    return raw.split(/\n{2,}/u).map(part => part.trim()).filter(Boolean);
  }
  return [];
}

export function buildStepSummaries(
  records: readonly AiTraceRecord[]
): ContinueWriteRealStepSummary[] {
  return records.map(record => ({
    seq: record.seq,
    purpose: record.purpose,
    schemaName: record.schemaName,
    ms: record.ms,
    hasError: Boolean(record.error),
  }));
}

export function deriveWordTimeline(
  records: readonly AiTraceRecord[],
  longForm: LongFormWriteResult,
  finalProse: string
): ContinueWriteRealWordTimeline {
  const firstDraft = records.find(record => record.schemaName === 'SceneDraft');
  const draftWords = firstDraft
    ? countWords(extractParagraphsFromResponse(firstDraft.response).join('\n'))
    : null;
  const afterPadProse = (longForm.drafts ?? [])
    .flatMap(draft => draft.paragraphs ?? [])
    .join('\n\n');
  return {
    draftWords: draftWords && draftWords > 0 ? draftWords : null,
    afterPadWords: afterPadProse ? countWords(afterPadProse) : null,
    finalWords: countWords(finalProse),
    supplementAiRounds: records.filter(r => r.schemaName === 'SupplementParagraphs').length,
    condenseAiRounds: records.filter(r => r.schemaName === 'CondenseParagraphs').length,
  };
}

export function summarizeTaskBook(
  taskBook: WritingTaskBook | null | undefined
): ContinueWriteRealTaskBookSummary {
  if (!taskBook) {
    return {
      present: false,
      CBN: '',
      CPNs: [],
      CEN: '',
      mustCoverCount: 0,
      forbiddenZonesCount: 0,
    };
  }
  return {
    present: true,
    CBN: (taskBook.CBN ?? '').slice(0, 120),
    CPNs: (taskBook.CPNs ?? []).map(item => item.slice(0, 80)),
    CEN: (taskBook.CEN ?? '').slice(0, 120),
    mustCoverCount: taskBook.mustCover?.length ?? 0,
    forbiddenZonesCount: taskBook.forbiddenZones?.length ?? 0,
  };
}

export function summarizePrechecks(
  longForm: LongFormWriteResult
): ContinueWriteRealPrecheckSummary {
  const prechecks = longForm.plan?.prechecks ?? [];
  const blocked = prechecks.filter(item => !item.accepted);
  return {
    total: prechecks.length,
    accepted: prechecks.length - blocked.length,
    blocked: blocked.length,
    blockedCandidateIds: blocked.map(item => item.candidateId),
  };
}

export function formatRunMetaHeader(summary: ContinueWriteRealSummary): string {
  const receipt = summary.receipt
    ? `${summary.receipt.commitId}@rev${summary.receipt.revision}`
    : '-';
  const pad =
    summary.wordTimeline.draftWords != null
      ? `${summary.wordTimeline.draftWords}→pad${summary.wordTimeline.afterPadWords ?? '-'}→final${summary.wordTimeline.finalWords}`
      : `final${summary.wordTimeline.finalWords}`;
  return [
    '========== RUN META ==========',
    `at=${summary.at}`,
    `runId=${summary.runId}`,
    `book=${summary.book} chapter=${summary.chapterNumber}`,
    `provider=${summary.provider ?? '-'} providerId=${summary.providerId ?? '-'} model=${summary.model ?? '-'}`,
    `runtimeBackend=${summary.runtimeBackend ?? '-'}`,
    `success=${summary.success} commit=${summary.commitStatus} rewrite=${summary.rewriteRounds}`,
    `receipt=${receipt} reportAccepted=${summary.reportAccepted} reportIssues=${summary.reportIssueCount}`,
    `prechecks=${summary.prechecks.accepted}/${summary.prechecks.total} blocked=${summary.prechecks.blocked}`,
    `words=${summary.wordCount}/${summary.targetWordCount} timeline=${pad} ` +
      `suppAi=${summary.wordTimeline.supplementAiRounds} condAi=${summary.wordTimeline.condenseAiRounds}`,
    `taskBook=${summary.taskBook.present ? 'yes' : 'no'} ` +
      `mustCover=${summary.taskBook.mustCoverCount} forbidden=${summary.taskBook.forbiddenZonesCount}`,
    `steps=${summary.stepCount} totalAiMs=${summary.totalAiMs}`,
    `schemaFlow=${summary.schemaFlow || '(none)'}`,
    `purposes=${summary.purposes.join(' → ') || '(none)'}`,
    `trace=${summary.tracePath}`,
    `summary=${summary.summaryPath}`,
    '========== END RUN META ==========',
  ].join('\n');
}

export function buildTraceDump(
  records: readonly AiTraceRecord[],
  metaHeader?: string
): string {
  const lines: string[] = [];
  if (metaHeader) {
    lines.push(metaHeader);
    lines.push('');
  }
  lines.push(`========== AI TRACE (${records.length} steps) ==========`);
  for (const record of records) {
    lines.push('');
    const modelTag = record.model ? ` | model=${record.model}` : '';
    lines.push(
      `----- STEP ${record.seq} | ${record.purpose} | ${record.schemaName} | ${record.ms}ms${modelTag} -----`
    );
    if (record.error) {
      lines.push(`[ERROR]\n${record.error}`);
    }
    lines.push(`[SYSTEM]\n${record.system}`);
    lines.push(`[PROMPT / INPUT]\n${formatJson(record.prompt)}`);
    lines.push(
      `[RESPONSE / OUTPUT]\n${
        record.response === undefined ? '(无返回)' : formatJson(record.response)
      }`
    );
  }
  lines.push('');
  lines.push('========== END AI TRACE ==========');
  return lines.join('\n');
}

export function buildContinueWriteRealSummary(
  input: PersistContinueWriteRealRunInput
): ContinueWriteRealSummary {
  const outDir = path.resolve(input.outDir ?? 'temp');
  const relBase = path.relative(process.cwd(), outDir).replace(/\\/g, '/') || 'temp';
  const fileStem = input.fileStem ?? 'continue-write.real';
  const summaryPathRel = `${relBase}/${fileStem}.summary.json`;
  const stepsPathRel = `${relBase}/${fileStem}.steps.txt`;

  const records = input.recording.getRecords();
  const prose = input.prose;
  const steps = buildStepSummaries(records);
  const schemas = records.map(record => record.schemaName);
  const wordTimeline = deriveWordTimeline(records, input.longForm, prose);
  const receipt = input.longForm.receipt
    ? {
        commitId: input.longForm.receipt.commitId,
        revision: input.longForm.receipt.revision,
        acceptedAt: input.longForm.receipt.acceptedAt,
      }
    : null;
  const report = input.longForm.report;
  return {
    kind: 'continue-write-real-summary',
    at: new Date().toISOString(),
    runId: input.recording.runId,
    book: input.book,
    chapterNumber: input.chapterNumber,
    provider: input.provider ?? input.recording.provider,
    providerId: input.providerId,
    model: input.model ?? input.recording.model,
    success: input.success,
    commitStatus: input.longForm.commit.status,
    commitReasons: input.longForm.commit.reasons ?? [],
    commitId: input.longForm.commit.id,
    receipt,
    reportAccepted: report?.accepted ?? false,
    reportIssueCount: report?.issues?.length ?? 0,
    checkedDomains: report?.checkedDomains ?? [],
    prechecks: summarizePrechecks(input.longForm),
    wordCount: countWords(prose),
    targetWordCount: input.targetWordCount,
    wordTimeline,
    rewriteRounds: input.longForm.rewriteRounds ?? 0,
    purposes: records.map(r => r.purpose),
    schemas,
    schemaFlow: steps.map(step => `${step.purpose}:${step.schemaName}`).join(' → '),
    steps,
    stepCount: records.length,
    totalAiMs: records.reduce((sum, r) => sum + (r.ms || 0), 0),
    runtimeBackend: input.runtimeBackend,
    taskBook: summarizeTaskBook(input.taskBook ?? null),
    tracePath: input.recording.getTraceFilePath(),
    stepsPath: stepsPathRel,
    summaryPath: summaryPathRel,
    prosePreview: {
      head: prose.slice(0, 160),
      tail: prose.slice(-160),
    },
  };
}

export function persistContinueWriteRealRun(input: PersistContinueWriteRealRunInput): {
  summary: ContinueWriteRealSummary;
  summaryPath: string;
  stepsPath: string;
  reportPath: string;
} {
  const outDir = path.resolve(input.outDir ?? 'temp');
  fs.mkdirSync(outDir, { recursive: true });
  const fileStem = input.fileStem ?? 'continue-write.real';
  const summary = buildContinueWriteRealSummary(input);
  const summaryPath = path.join(outDir, `${fileStem}.summary.json`);
  const stepsPath = path.join(outDir, `${fileStem}.steps.txt`);
  const reportPath = path.join(outDir, `${fileStem}.report.json`);

  const dump = buildTraceDump(input.recording.getRecords(), formatRunMetaHeader(summary));
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(stepsPath, `${dump}\n`, 'utf8');
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        ...summary,
        note: `本文件已与当次跑次同步；权威摘要见 ${fileStem}.summary.json`,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  return { summary, summaryPath, stepsPath, reportPath };
}

export function formatSummaryConsole(summary: ContinueWriteRealSummary): string {
  const pad =
    summary.wordTimeline.draftWords != null
      ? `${summary.wordTimeline.draftWords}→${summary.wordTimeline.afterPadWords ?? '-'}→${summary.wordTimeline.finalWords}`
      : String(summary.wordTimeline.finalWords);
  return [
    `[REAL_AI_SUMMARY] book=${summary.book} ch=${summary.chapterNumber} success=${summary.success}`,
    `  commit=${summary.commitStatus} receipt=${summary.receipt?.commitId ?? '-'} rewrite=${summary.rewriteRounds}`,
    `  words=${summary.wordCount}/${summary.targetWordCount} timeline=${pad} ` +
      `suppAi=${summary.wordTimeline.supplementAiRounds} condAi=${summary.wordTimeline.condenseAiRounds}`,
    `  reportAccepted=${summary.reportAccepted} issues=${summary.reportIssueCount} ` +
      `prechecks=${summary.prechecks.accepted}/${summary.prechecks.total}`,
    `  runtime=${summary.runtimeBackend ?? '-'} taskBook=${summary.taskBook.present ? 'yes' : 'no'} ` +
      `mustCover=${summary.taskBook.mustCoverCount}`,
    `  model=${summary.model ?? '-'} provider=${summary.provider ?? '-'} steps=${summary.stepCount} totalAiMs=${summary.totalAiMs}`,
    `  schemaFlow=${summary.schemaFlow}`,
    `  trace=${summary.tracePath}`,
    `  steps=${summary.stepsPath}`,
    `  summary=${summary.summaryPath}`,
  ].join('\n');
}

export interface ContinueWriteRealMultiSummary {
  kind: 'continue-write-real-multi-summary';
  at: string;
  book: string;
  fromChapter: number;
  chapterCount: number;
  /** smart | batch；多章正式路径为 batch */
  mode?: string;
  success: boolean;
  completedChapters: number;
  runtimeBackend?: ContinueWriteRuntimeBackend;
  provider?: string;
  providerId?: string;
  model?: string;
  totalAiMs: number;
  totalWords: number;
  chapters: ContinueWriteRealSummary[];
  summaryPath: string;
  stepsPath: string;
}

export function persistContinueWriteRealMultiRun(input: {
  book: string;
  fromChapter: number;
  chapterCount: number;
  provider?: string;
  providerId?: string;
  model?: string;
  runtimeBackend?: ContinueWriteRuntimeBackend;
  chapterSummaries: ContinueWriteRealSummary[];
  mode?: string;
  outDir?: string;
}): {
  summary: ContinueWriteRealMultiSummary;
  summaryPath: string;
  stepsPath: string;
  reportPath: string;
} {
  const outDir = path.resolve(input.outDir ?? 'temp');
  fs.mkdirSync(outDir, { recursive: true });
  const relBase = path.relative(process.cwd(), outDir).replace(/\\/g, '/') || 'temp';
  const summaryPathRel = `${relBase}/continue-write.real.multi.summary.json`;
  const stepsPathRel = `${relBase}/continue-write.real.multi.steps.txt`;
  const summaryPath = path.join(outDir, 'continue-write.real.multi.summary.json');
  const stepsPath = path.join(outDir, 'continue-write.real.multi.steps.txt');
  const reportPath = path.join(outDir, 'continue-write.real.multi.report.json');

  const chapters = input.chapterSummaries;
  const summary: ContinueWriteRealMultiSummary = {
    kind: 'continue-write-real-multi-summary',
    at: new Date().toISOString(),
    book: input.book,
    fromChapter: input.fromChapter,
    chapterCount: input.chapterCount,
    mode: input.mode ?? 'batch',
    success: chapters.length === input.chapterCount && chapters.every(item => item.success),
    completedChapters: chapters.length,
    runtimeBackend: input.runtimeBackend,
    provider: input.provider,
    providerId: input.providerId,
    model: input.model,
    totalAiMs: chapters.reduce((sum, item) => sum + item.totalAiMs, 0),
    totalWords: chapters.reduce((sum, item) => sum + item.wordCount, 0),
    chapters,
    summaryPath: summaryPathRel,
    stepsPath: stepsPathRel,
  };

  const dump = [
    '========== MULTI RUN META ==========',
    `at=${summary.at}`,
    `book=${summary.book} from=${summary.fromChapter} count=${summary.chapterCount} mode=${summary.mode}`,
    `success=${summary.success} completed=${summary.completedChapters}/${summary.chapterCount}`,
    `runtimeBackend=${summary.runtimeBackend ?? '-'} model=${summary.model ?? '-'}`,
    `totalWords=${summary.totalWords} totalAiMs=${summary.totalAiMs}`,
    `chapters=${chapters.map(item => `ch${item.chapterNumber}:${item.commitStatus}:${item.wordCount}w`).join(' → ') || '(none)'}`,
    '========== END MULTI RUN META ==========',
    '',
    ...chapters.flatMap(item => [
      '',
      `########## CHAPTER ${item.chapterNumber} ##########`,
      formatRunMetaHeader(item),
      `schemaFlow=${item.schemaFlow}`,
      `trace=${item.tracePath}`,
      `prose.head=${item.prosePreview.head.replace(/\n/g, '\\n')}`,
      `prose.tail=${item.prosePreview.tail.replace(/\n/g, '\\n')}`,
    ]),
    '',
  ].join('\n');

  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(stepsPath, `${dump}\n`, 'utf8');
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        ...summary,
        note: '本文件已与当次多章跑次同步；权威摘要见 continue-write.real.multi.summary.json',
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  return { summary, summaryPath, stepsPath, reportPath };
}

export function formatMultiSummaryConsole(summary: ContinueWriteRealMultiSummary): string {
  return [
    `[REAL_AI_MULTI] book=${summary.book} from=${summary.fromChapter} count=${summary.chapterCount} mode=${summary.mode ?? '-'} success=${summary.success}`,
    `  completed=${summary.completedChapters}/${summary.chapterCount} runtime=${summary.runtimeBackend ?? '-'}`,
    `  totalWords=${summary.totalWords} totalAiMs=${summary.totalAiMs} model=${summary.model ?? '-'}`,
    `  chapters=${summary.chapters.map(item => `ch${item.chapterNumber}:${item.commitStatus}:${item.wordCount}w`).join(' → ')}`,
    `  summary=${summary.summaryPath}`,
    `  steps=${summary.stepsPath}`,
  ].join('\n');
}
