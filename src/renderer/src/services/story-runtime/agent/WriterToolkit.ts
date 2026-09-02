/**
 * 章节改稿工具集（docs/agent-architecture-refactor.md P2）：暂存写 + 确定性/语义校验。
 *
 * 写工具只改 `draft`（StagedArtifact，内存），不落库；`run_checks` 通过注入的 ChapterReviewPort
 * 跑与生产完全相同的审查链（事实提取 → canonicalize → ContinuityValidator + 确定性门禁），
 * 并把结果记成「该 revision 已校验」。最终提交物只取**最后一次通过校验的 revision**
 * （见 `resolveFinal()`），保证落库的正文与审查过的正文逐字一致。
 */
import type { ContinuityReport, ExtractedFacts, SceneDraft } from '@/types/story-runtime';

import {
  AgentToolFatalError,
  clipText,
  isPlainObject,
  readStringArg,
  type AgentToolkit,
  type ToolCallResult,
  type ToolDescriptor,
} from './AgentToolkit';
import { StagedArtifact } from './StagedArtifact';
import { sanitizeSceneDraftParagraphs } from '../stripDraftLeakage';
import { normalizeGeneratedChapterTitle } from '@/services/writing/chapterTitle';

/** 审查端口：与引擎主链同一实现（事实提取 + canonicalize + 语义审查 + 确定性门禁） */
export interface ChapterReviewPort {
  review(drafts: SceneDraft[]): Promise<ChapterReviewOutcome>;
}

export interface ChapterReviewOutcome {
  facts: ExtractedFacts;
  report: ContinuityReport;
}

/** 某个 revision 的草稿及其审查结果快照 */
export interface CheckedRevision extends ChapterReviewOutcome {
  revision: number;
  drafts: SceneDraft[];
}

export interface WriterToolkitInput {
  /** 起草引擎产出的初稿（单场景整章）；作为 revision 1 入暂存 */
  initialDrafts: SceneDraft[];
  /** 初稿的审查结果（引擎已跑过一次）；缺省时 agent 必须先 run_checks */
  initialReview?: ChapterReviewOutcome;
  reviewPort: ChapterReviewPort;
  /** run_checks 预算（每次都是一轮完整 AI 审查，成本与旧重写轮等价） */
  maxChecks: number;
  targetWordCount?: number;
}

export interface WriterFinalResolution extends CheckedRevision {
  /** 最终稿是否因「改后未复检」而回退到上一个已校验 revision */
  revertedUnchecked: boolean;
}

function countWords(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function draftsProse(drafts: SceneDraft[]): string {
  return drafts.flatMap(draft => draft.paragraphs).join('\n\n');
}

function summarizeIssues(report: ContinuityReport): Array<Record<string, unknown>> {
  return [...report.issues]
    .sort((a, b) => (a.severity === 'blocking' ? 0 : 1) - (b.severity === 'blocking' ? 0 : 1))
    .slice(0, 12)
    .map(issue => ({
      id: issue.id,
      severity: issue.severity,
      message: clipText(issue.message, 240),
      evidence: issue.evidence.slice(0, 2).map(item => clipText(item, 120)),
    }));
}

export class WriterToolkit implements AgentToolkit {
  readonly draft = new StagedArtifact<SceneDraft[]>();
  private lastChecked: CheckedRevision | null = null;
  private checksUsed = 0;

  constructor(private readonly input: WriterToolkitInput) {
    if (input.initialDrafts.length === 0) {
      throw new Error('WriterToolkit 需要至少一份初稿');
    }
    const revision = this.draft.set(cloneDrafts(input.initialDrafts), { tool: 'initial-draft' });
    if (input.initialReview) {
      this.lastChecked = { revision, drafts: cloneDrafts(input.initialDrafts), ...input.initialReview };
      this.draft.markVerified({
        blocking: countBlocking(input.initialReview.report),
        summary: input.initialReview.report.accepted ? '初审通过' : '初审未通过',
      });
    }
  }

  listTools(): ToolDescriptor[] {
    return [
      {
        name: 'get_draft',
        description: '读当前暂存稿:带段落索引的全文(改稿前先读,索引以此为准)。',
        args: '{}',
        dedupe: false,
      },
      {
        name: 'revise_paragraphs',
        description:
          '局部改稿:按索引替换/删除段落(text 为空串=删除),可在某段之后插入新段。只改有问题的段落,未涉及段落保持原样。',
        args: '{"edits":[{"index":3,"text":"改后的整段正文"}],"insertAfter":[{"index":5,"paragraphs":["新段1","新段2"]}]}',
        dedupe: false,
      },
      {
        name: 'submit_draft',
        description: '整章重写:用新的段落数组整体替换暂存稿(问题遍布全章时才用;局部问题用 revise_paragraphs)。',
        args: '{"paragraphs":["段落1","段落2"],"chapterTitle":"可选"}',
        dedupe: false,
      },
      {
        name: 'run_checks',
        description:
          '对当前暂存稿跑完整审查(事实提取+连续性/履约判官+字数/排版/章界重演门禁),返回 blocking/warning 问题清单。每次调用消耗 1 次预算;blocking=0 才允许 finish。',
        args: '{}',
        dedupe: false,
      },
    ];
  }

  has(tool: string): boolean {
    return this.toolNames().includes(tool);
  }

  toolNames(): string[] {
    return this.listTools().map(tool => tool.name);
  }

  async call(tool: string, args: unknown): Promise<ToolCallResult> {
    if (!isPlainObject(args)) {
      return { ok: false, error: `args 必须是 JSON 对象,收到:${typeof args}` };
    }
    switch (tool) {
      case 'get_draft':
        return this.getDraft();
      case 'revise_paragraphs':
        return this.reviseParagraphs(args);
      case 'submit_draft':
        return this.submitDraft(args);
      case 'run_checks':
        return this.runChecks();
      default:
        return { ok: false, error: `未知工具:${tool}。可用:${this.toolNames().join('/')}` };
    }
  }

  /** 进展版本:改稿或新校验都算进展(runner 停滞检测用) */
  progressVersion(): number {
    return this.draft.revision() * 1000 + this.checksUsed;
  }

  checksRemaining(): number {
    return Math.max(0, this.input.maxChecks - this.checksUsed);
  }

  checksConsumed(): number {
    return this.checksUsed;
  }

  /** finish 前置条件:当前稿必须已校验且 blocking=0;预算用尽时放行(提交仍走门禁,按 rejected 处理) */
  guardFinish(): string | null {
    if (this.draft.isVerified()) return null;
    if (this.checksRemaining() === 0) return null;
    const last = this.draft.lastVerification();
    if (last && last.revision === this.draft.revision()) {
      return `当前稿未通过审查(${last.blocking} 项 blocking:${last.summary ?? ''})。请先用 get_draft 定位、必要时用查询工具核实事实,再 revise_paragraphs 修复后重新 run_checks;确实无法修复时可再次 finish 说明原因。`;
    }
    return `当前稿(revision ${this.draft.revision()})改动后尚未 run_checks,不能收尾。请先 run_checks(剩余 ${this.checksRemaining()} 次)。`;
  }

  /**
   * 收束:返回最后一次通过审查链的 revision。若模型改稿后没复检(预算用尽/停滞),
   * 未审查的改动被丢弃——落库物必须与审查物一致。
   */
  resolveFinal(): WriterFinalResolution {
    if (!this.lastChecked) {
      throw new Error('WriterToolkit 未执行过任何审查,无法收束');
    }
    return {
      ...this.lastChecked,
      revertedUnchecked: this.lastChecked.revision !== this.draft.revision(),
    };
  }

  private currentDrafts(): SceneDraft[] {
    const drafts = this.draft.get();
    if (!drafts) throw new Error('暂存稿为空');
    return drafts;
  }

  private getDraft(): ToolCallResult {
    const drafts = this.currentDrafts();
    const paragraphs = drafts.flatMap(draft => draft.paragraphs);
    return {
      ok: true,
      result: {
        revision: this.draft.revision(),
        chapterTitle: drafts.map(draft => draft.chapterTitle).find(Boolean) ?? null,
        words: countWords(paragraphs.join('')),
        targetWordCount: this.input.targetWordCount ?? null,
        verified: this.draft.isVerified(),
        paragraphs: paragraphs.map((text, index) => ({ index, text })),
      },
    };
  }

  private reviseParagraphs(args: Record<string, unknown>): ToolCallResult {
    const drafts = this.currentDrafts();
    const flat = drafts.flatMap(draft => draft.paragraphs);
    const edits = Array.isArray(args.edits) ? args.edits : [];
    const inserts = Array.isArray(args.insertAfter) ? args.insertAfter : [];
    if (edits.length === 0 && inserts.length === 0) {
      return { ok: false, error: 'edits 与 insertAfter 至少提供一个非空数组' };
    }

    const replaced = new Map<number, string | null>();
    for (const entry of edits) {
      if (!isPlainObject(entry)) return { ok: false, error: 'edits 每项必须是 {index,text} 对象' };
      const index = Number(entry.index);
      if (!Number.isInteger(index) || index < 0 || index >= flat.length) {
        return { ok: false, error: `edits.index=${String(entry.index)} 越界(当前 0..${flat.length - 1}),请先 get_draft 取最新索引` };
      }
      if (typeof entry.text !== 'string') return { ok: false, error: `edits[index=${index}].text 必须是字符串(空串表示删除)` };
      replaced.set(index, entry.text.trim() ? entry.text : null);
    }
    const inserted = new Map<number, string[]>();
    for (const entry of inserts) {
      if (!isPlainObject(entry)) return { ok: false, error: 'insertAfter 每项必须是 {index,paragraphs} 对象' };
      const index = Number(entry.index);
      if (!Number.isInteger(index) || index < -1 || index >= flat.length) {
        return { ok: false, error: `insertAfter.index=${String(entry.index)} 越界(-1 表示插到开头,最大 ${flat.length - 1})` };
      }
      const paragraphs = Array.isArray(entry.paragraphs)
        ? entry.paragraphs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      if (paragraphs.length === 0) return { ok: false, error: `insertAfter[index=${index}].paragraphs 不能为空` };
      inserted.set(index, [...(inserted.get(index) ?? []), ...paragraphs]);
    }

    const next: string[] = [...(inserted.get(-1) ?? [])];
    for (let index = 0; index < flat.length; index += 1) {
      const replacement = replaced.has(index) ? replaced.get(index) : flat[index];
      if (replacement !== null && replacement !== undefined) next.push(replacement);
      next.push(...(inserted.get(index) ?? []));
    }
    const sanitized = sanitizeSceneDraftParagraphs(next);
    if (sanitized.length === 0) {
      return { ok: false, error: '改稿后正文为空,已拒绝' };
    }
    // 整章单场景是既定形态(起草/补字/压缩都只产出 drafts[0]);多场景时索引按扁平顺序,改后合并为单场景
    const revision = this.draft.update(
      current => [{ ...current[0], paragraphs: sanitized }],
      { tool: 'revise_paragraphs', note: `${replaced.size} 处替换/删除,${inserted.size} 处插入` }
    );
    return {
      ok: true,
      result: {
        revision,
        paragraphCount: sanitized.length,
        words: countWords(sanitized.join('')),
        note: '改动尚未审查,收尾前必须 run_checks',
      },
    };
  }

  private submitDraft(args: Record<string, unknown>): ToolCallResult {
    const raw = Array.isArray(args.paragraphs) ? args.paragraphs : null;
    if (!raw) return { ok: false, error: 'paragraphs 必须是字符串数组' };
    const paragraphs = sanitizeSceneDraftParagraphs(
      raw.filter((item): item is string => typeof item === 'string')
    );
    if (paragraphs.length === 0) return { ok: false, error: 'paragraphs 无可用正文段落' };
    const title = normalizeGeneratedChapterTitle(readStringArg(args, 'chapterTitle')) ?? undefined;
    const base = this.currentDrafts()[0];
    const revision = this.draft.set(
      [{ ...base, paragraphs, ...(title ? { chapterTitle: title } : {}) }],
      { tool: 'submit_draft' }
    );
    return {
      ok: true,
      result: {
        revision,
        paragraphCount: paragraphs.length,
        words: countWords(paragraphs.join('')),
        note: '整章已替换,收尾前必须 run_checks',
      },
    };
  }

  private async runChecks(): Promise<ToolCallResult> {
    if (this.checksRemaining() === 0) {
      return {
        ok: false,
        error: `审查预算已用尽(${this.input.maxChecks} 次)。请直接输出 action=finish;未复检的改动不会被采用。`,
      };
    }
    if (this.draft.isVerified()) {
      return {
        ok: false,
        error: '当前稿已通过审查,无需重复 run_checks,请直接 finish。',
      };
    }
    const drafts = cloneDrafts(this.currentDrafts());
    this.checksUsed += 1;
    let outcome: ChapterReviewOutcome;
    try {
      outcome = await this.input.reviewPort.review(drafts);
    } catch (error) {
      // 审查链不可用(含 [review-unavailable])对模型而言无解,必须冒泡让批量层停章
      if ((error instanceof DOMException || error instanceof Error) && error.name === 'AbortError') {
        throw error;
      }
      throw new AgentToolFatalError(
        `run_checks 审查链失败:${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
    const revision = this.draft.revision();
    this.lastChecked = { revision, drafts, ...outcome };
    const blocking = countBlocking(outcome.report);
    this.draft.markVerified({
      blocking,
      summary: outcome.report.issues
        .filter(issue => issue.severity === 'blocking')
        .slice(0, 3)
        .map(issue => clipText(issue.message, 60))
        .join(' | '),
    });
    return {
      ok: true,
      result: {
        revision,
        accepted: outcome.report.accepted,
        blocking,
        warnings: outcome.report.issues.filter(issue => issue.severity === 'warning').length,
        checksRemaining: this.checksRemaining(),
        words: countWords(draftsProse(drafts).replace(/\n/g, '')),
        issues: summarizeIssues(outcome.report),
      },
    };
  }
}

function countBlocking(report: ContinuityReport): number {
  return report.issues.filter(issue => issue.severity === 'blocking').length;
}

function cloneDrafts(drafts: SceneDraft[]): SceneDraft[] {
  return drafts.map(draft => ({
    ...draft,
    paragraphs: [...draft.paragraphs],
    candidateEvents: [...draft.candidateEvents],
  }));
}
