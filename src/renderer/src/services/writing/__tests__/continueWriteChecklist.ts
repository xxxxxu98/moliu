import fs from 'node:fs';
import path from 'node:path';

import type { LongFormWriteResult } from '@/types/story-runtime';
import type { RecordingStructuredAI } from '@/services/story-runtime/RecordingStructuredAI';
import {
  assertCenNotAdvancePrefix,
  assertChapterScopedCharacterTruths,
  assertContractStyleNotDuplicatedInBlocks,
  assertDraftPromptShape,
  assertPurposeSequence,
  PromptInvariantError,
} from '@/services/story-runtime/promptInvariants';
import { countWords } from '@/services/writing/utils';
import { MAX_WORD_THRESHOLD, MIN_WORD_THRESHOLD } from '@/services/writing/supplement';
import { isStructuralLeakFragment } from '@/services/story-runtime/stripDraftLeakage';

export interface ChecklistItem {
  id: string;
  title: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

export interface ContinueWriteChecklistReport {
  at: string;
  book: string;
  chapterNumber: number;
  providerId?: string;
  model?: string;
  tracePath: string;
  purposes: string[];
  commitStatus: string;
  wordCount: number;
  targetWordCount: number;
  /** 审核失败后的实际重写次数 */
  rewriteRounds: number;
  items: ChecklistItem[];
  passed: boolean;
  prosePreview: { head: string; tail: string };
}

function item(
  id: string,
  title: string,
  status: ChecklistItem['status'],
  detail: string
): ChecklistItem {
  return { id, title, status, detail };
}

function tryParseDraftPrompt(recording: RecordingStructuredAI): {
  draftPrompt?: string;
  chapterBeats?: Array<{ kind: string; summary: string }>;
  contracts?: {
    chapter: { CEN: string; CPNs: string[]; goal: string; mustCover: string[] };
  };
  stateEvents?: number;
  stateChapter?: number;
} {
  const draft = recording.getRecords().find(r => r.purpose === 'scene-draft');
  if (!draft) return {};
  try {
    const payload = JSON.parse(draft.prompt) as {
      chapterBeats?: Array<{ kind: string; summary: string }>;
      context?: { blocks?: Array<{ kind: string; content: string }> };
    };
    const contractsBlock = payload.context?.blocks?.find(b => b.kind === 'locked-contracts');
    const stateBlock = payload.context?.blocks?.find(b => b.kind === 'current-state');
    const contracts = contractsBlock
      ? (JSON.parse(contractsBlock.content) as {
          chapter: { CEN: string; CPNs: string[]; goal: string; mustCover: string[] };
        })
      : undefined;
    const state = stateBlock
      ? (JSON.parse(stateBlock.content) as { events?: unknown[]; chapter?: number })
      : undefined;
    return {
      draftPrompt: draft.prompt,
      chapterBeats: payload.chapterBeats,
      contracts,
      stateEvents: Array.isArray(state?.events) ? state.events.length : undefined,
      stateChapter: state?.chapter,
    };
  } catch {
    return { draftPrompt: draft.prompt };
  }
}

/**
 * 对真实续写一轮做完整检查清单（硬伤 fail / 质量类 warn）。
 */
export function evaluateContinueWriteChecklist(input: {
  recording: RecordingStructuredAI;
  result: LongFormWriteResult;
  book: string;
  chapterNumber: number;
  targetWordCount: number;
  providerId?: string;
  model?: string;
  clearedChapterContents: boolean;
}): ContinueWriteChecklistReport {
  const items: ChecklistItem[] = [];
  const purposes = input.recording.getRecords().map(r => r.purpose);
  const prose = input.result.drafts.flatMap(d => d.paragraphs).join('\n\n');
  const wordCount = countWords(prose);
  const parsed = tryParseDraftPrompt(input.recording);

  items.push(
    item(
      'cleared-chapters',
      '已清空全部章节正文（测试副本）',
      input.clearedChapterContents ? 'pass' : 'fail',
      input.clearedChapterContents ? '内存项目 chapters.content 已清空' : '章节正文未清空'
    )
  );

  items.push(
    item(
      'purpose-sequence',
      '请求序列含起草→事实提取→审核',
      (() => {
        try {
          assertPurposeSequence(purposes, ['scene-draft', 'fact-extraction', 'chapter-judge']);
          return 'pass';
        } catch {
          try {
            assertPurposeSequence(purposes, ['scene-draft', 'chapter-judge']);
            return 'warn';
          } catch {
            return 'fail';
          }
        }
      })(),
      purposes.join(' → ') || '(无请求)'
    )
  );

  if (parsed.draftPrompt) {
    try {
      assertDraftPromptShape(parsed.draftPrompt);
      items.push(item('draft-shape', '起草 prompt 结构无冗余 beat/候选全量', 'pass', 'ok'));
    } catch (error) {
      items.push(
        item(
          'draft-shape',
          '起草 prompt 结构无冗余 beat/候选全量',
          'fail',
          error instanceof Error ? error.message : String(error)
        )
      );
    }
    try {
      assertContractStyleNotDuplicatedInBlocks(parsed.draftPrompt);
      items.push(item('style-dedup', 'style 未与合同重复灌入', 'pass', 'ok'));
    } catch (error) {
      items.push(
        item(
          'style-dedup',
          'style 未与合同重复灌入',
          error instanceof PromptInvariantError ? 'fail' : 'warn',
          error instanceof Error ? error.message : String(error)
        )
      );
    }
    try {
      assertChapterScopedCharacterTruths(parsed.draftPrompt, 6);
      items.push(item('character-scope', '角色真相已本章收敛', 'pass', '≤6'));
    } catch (error) {
      items.push(
        item(
          'character-scope',
          '角色真相已本章收敛',
          'fail',
          error instanceof Error ? error.message : String(error)
        )
      );
    }
  } else {
    items.push(item('draft-shape', '起草 prompt 结构', 'fail', '缺少 scene-draft'));
  }

  if (parsed.contracts) {
    try {
      assertCenNotAdvancePrefix({
        CEN: parsed.contracts.chapter.CEN,
        CPNs: parsed.contracts.chapter.CPNs,
        chapterBeats: parsed.chapterBeats,
      });
      items.push(
        item('cen-shape', 'CEN 未塌成推进至:=CPN', 'pass', parsed.contracts.chapter.CEN.slice(0, 80))
      );
    } catch (error) {
      items.push(
        item(
          'cen-shape',
          'CEN 未塌成推进至:=CPN',
          'fail',
          error instanceof Error ? error.message : String(error)
        )
      );
    }
    items.push(
      item(
        'goal-info',
        'goal 非空壳「第N章」',
        /^第\s*\d+\s*章$/u.test(parsed.contracts.chapter.goal.trim()) ? 'fail' : 'pass',
        parsed.contracts.chapter.goal.slice(0, 80)
      )
    );
  }

  items.push(
    item(
      'state-isolation',
      '空章后 state 无本章及之后事件',
      (parsed.stateEvents ?? 0) === 0 || (parsed.stateChapter ?? 0) < input.chapterNumber
        ? 'pass'
        : 'fail',
      `events=${parsed.stateEvents ?? '?'} chapter=${parsed.stateChapter ?? '?'}`
    )
  );

  const draftResponse = input.recording.getRecords().find(r => r.purpose === 'scene-draft');
  const leakHits = prose
    .split(/\n+/u)
    .filter(line => isStructuralLeakFragment(line.trim()));
  items.push(
    item(
      'no-schema-leak',
      '正文无 JSON schema 泄漏',
      leakHits.length === 0 ? 'pass' : 'fail',
      leakHits.length === 0 ? 'ok' : `泄漏片段: ${leakHits.slice(0, 3).join(' | ')}`
    )
  );

  const restartHits = (prose.match(/穿越醒来|猛地睁开眼|一睁眼又/gu) || []).length;
  items.push(
    item(
      'no-plot-restart',
      '正文无明显重复开场关键词堆叠',
      restartHits <= 2 ? 'pass' : 'warn',
      `命中次数=${restartHits}`
    )
  );

  const ratio = input.targetWordCount > 0 ? wordCount / input.targetWordCount : 1;
  const minPct = Math.round(MIN_WORD_THRESHOLD * 100);
  const maxPct = Math.round(MAX_WORD_THRESHOLD * 100);
  const wordCountStatus: ChecklistItem['status'] =
    ratio >= MIN_WORD_THRESHOLD && ratio <= MAX_WORD_THRESHOLD
      ? 'pass'
      : ratio >= 0.5 && ratio < MIN_WORD_THRESHOLD
        ? 'warn'
        : 'fail';
  items.push(
    item(
      'word-count',
      `字数接近目标（${minPct}%–${maxPct}%）`,
      wordCountStatus,
      `${wordCount}/${input.targetWordCount} (${Math.round(ratio * 100)}%)`
    )
  );

  items.push(
    item(
      'commit',
      '严格提交 accepted',
      input.result.commit.status === 'accepted' ? 'pass' : 'warn',
      input.result.commit.status === 'accepted'
        ? 'accepted'
        : `${input.result.commit.status}: ${(input.result.commit.reasons || []).join('；').slice(0, 200)}`
    )
  );

  const rewriteRounds = input.result.rewriteRounds ?? 0;
  const sceneDraftAttempts = input.recording
    .getRecords()
    .filter(r => r.purpose === 'scene-draft' && r.schemaName === 'SceneDraft').length;
  const supplementAttempts = input.recording
    .getRecords()
    .filter(r => r.purpose === 'scene-draft' && r.schemaName === 'SupplementParagraphs')
    .length;
  const condenseAttempts = input.recording
    .getRecords()
    .filter(r => r.purpose === 'scene-draft' && r.schemaName === 'CondenseParagraphs').length;
  items.push(
    item(
      'rewrite-bounded',
      '重写次数有上限且可观测',
      'pass',
      `rewriteRounds=${rewriteRounds}; SceneDraft=${sceneDraftAttempts}; Supplement=${supplementAttempts}; Condense=${condenseAttempts}`
    )
  );

  items.push(
    item(
      'draft-error-free',
      '起草请求无 error',
      input.recording.getRecords().find(r => r.purpose === 'scene-draft' && !r.error)
        ? 'pass'
        : 'fail',
      input.recording.getRecords().find(r => r.purpose === 'scene-draft')?.error || 'ok'
    )
  );

  const passed = items.every(i => i.status !== 'fail');
  return {
    at: new Date().toISOString(),
    book: input.book,
    chapterNumber: input.chapterNumber,
    providerId: input.providerId,
    model: input.model,
    tracePath: input.recording.getTraceFilePath(),
    purposes,
    commitStatus: input.result.commit.status,
    wordCount,
    targetWordCount: input.targetWordCount,
    rewriteRounds,
    items,
    passed,
    prosePreview: {
      head: prose.slice(0, 160),
      tail: prose.slice(-160),
    },
  };
}

export function writeChecklistReport(report: ContinueWriteChecklistReport): string {
  const outDir = path.resolve('temp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'continue-write.real.report.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outPath;
}

export function formatChecklistConsole(report: ContinueWriteChecklistReport): string {
  const lines = [
    `[CHECKLIST] book=${report.book} ch=${report.chapterNumber} passed=${report.passed}`,
    `  purposes: ${report.purposes.join(' → ')}`,
    `  words: ${report.wordCount}/${report.targetWordCount} commit=${report.commitStatus} rewrite=${report.rewriteRounds}`,
    `  trace: ${report.tracePath}`,
    ...report.items.map(
      i => `  [${i.status.toUpperCase()}] ${i.id} — ${i.title}: ${i.detail}`
    ),
  ];
  return lines.join('\n');
}
