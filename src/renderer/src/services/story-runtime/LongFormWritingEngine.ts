import type {
  ContinuityIssue,
  ContinuityReport,
  ExtractedFacts,
  FactExtractor,
  LongFormWriteInput,
  LongFormWriteResult,
  SceneDraft,
  StructuredAI,
} from '@/types/story-runtime';

import { AIChapterJudge } from './AIChapterJudge';
import { canonicalizeExtractedFacts } from './FactCanonicalizer';
import {
  ChapterCommitService,
  type ChapterCommitPort,
} from './ChapterCommitService';
import { ContextPackBuilder } from './ContextPackBuilder';
import { ContinuityValidator } from './ContinuityValidator';
import { SceneBeatPlanner } from './SceneBeatPlanner';
import { SceneDraftEngine } from './SceneDraftEngine';
import { sanitizeSceneDraftParagraphs } from './stripDraftLeakage';
import {
  MAX_SUPPLEMENT_ROUNDS,
  MAX_WORD_THRESHOLD,
  buildCondensePrompt,
  buildSupplementPrompt,
  checkWordCount,
  checkWordCountBounds,
  clampProseToMaxWords,
} from '@/services/writing/supplement';
import { countWords } from '@/services/writing/utils';

/** 审核失败后的默认最大重写次数（不含初稿） */
export const DEFAULT_MAX_REWRITE_ROUNDS = 2;

export interface LongFormWritingEngineDependencies {
  ai: StructuredAI;
  factExtractor: FactExtractor;
  commitPort: ChapterCommitPort;
  planner?: SceneBeatPlanner;
  contextBuilder?: ContextPackBuilder;
  validator?: ContinuityValidator;
}

function draftsProse(drafts: SceneDraft[]): string {
  return drafts.flatMap(draft => draft.paragraphs).join('\n\n');
}

/**
 * 从审核问题生成重写提示；优先 blocking，其次 warning。
 */
export function buildRevisionHintsFromReport(report: ContinuityReport): string[] {
  const ranked = [...report.issues].sort((a, b) => {
    const rank = (issue: ContinuityIssue): number =>
      issue.severity === 'blocking' ? 0 : issue.severity === 'warning' ? 1 : 2;
    return rank(a) - rank(b);
  });

  return ranked
    .slice(0, 8)
    .map(issue => {
      const evidence = issue.evidence
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' / ');
      return evidence ? `${issue.message}（证据：${evidence}）` : issue.message;
    })
    .filter(Boolean);
}

function shouldRewrite(report: ContinuityReport): boolean {
  if (report.accepted) return false;
  return report.issues.some(
    issue => issue.severity === 'blocking' || issue.severity === 'warning'
  );
}

export class LongFormWritingEngine {
  private readonly planner: SceneBeatPlanner;
  private readonly contextBuilder: ContextPackBuilder;
  private readonly draftEngine: SceneDraftEngine;
  private readonly validator: ContinuityValidator;
  private readonly commitService: ChapterCommitService;

  constructor(private readonly dependencies: LongFormWritingEngineDependencies) {
    this.planner = dependencies.planner ?? new SceneBeatPlanner();
    this.contextBuilder = dependencies.contextBuilder ?? new ContextPackBuilder();
    this.draftEngine = new SceneDraftEngine(dependencies.ai);
    this.validator =
      dependencies.validator ??
      new ContinuityValidator({
        chapterJudge: new AIChapterJudge(dependencies.ai),
        enableDeepSemantic: true,
      });
    this.commitService = new ChapterCommitService(dependencies.commitPort);
  }

  async write(input: LongFormWriteInput): Promise<LongFormWriteResult> {
    const maxRewriteRounds = Math.max(
      0,
      input.maxRewriteRounds ?? DEFAULT_MAX_REWRITE_ROUNDS
    );
    const plan = this.planner.plan({
      chapter: input.contracts.chapter,
      state: input.state,
      overlay: input.overlay,
    });
    const context = this.contextBuilder.build({
      contracts: input.contracts,
      state: input.state,
      overlay: input.overlay,
      recentScenes: input.recentScenes,
      retrievedScenes: input.retrievedScenes,
      styleGuidance: input.styleGuidance,
      maxTokens: input.maxContextTokens,
    });

    let drafts: SceneDraft[] = [];
    let facts: ExtractedFacts = { events: [], deltas: [], evidence: [] };
    let report: ContinuityReport = {
      accepted: false,
      issues: [],
      checkedDomains: [],
    };
    let rewriteRounds = 0;
    let revisionHints: string[] | undefined;

    while (true) {
      drafts = await this.draftEngine.draft(plan, context, {
        targetWordCount: input.targetWordCount,
        revisionHints,
        rewriteRound: revisionHints ? Math.max(1, rewriteRounds) : undefined,
      });
      // 提交前进补字：避免 SQLite accepted 后仍只有 ~900 字
      drafts = await this.padDraftsToTarget(drafts, input);

      const rawFacts = await this.dependencies.factExtractor.extract({
        projectId: input.projectId,
        chapterNumber: input.contracts.chapter.chapterNumber,
        sceneDrafts: drafts,
        state: input.state,
        overlay: input.overlay,
      });
      // 提取层输出 ≠ 校验契约输入：必须先 canonicalize 再 validate
      const canonical = canonicalizeExtractedFacts({
        facts: rawFacts,
        state: input.state,
        drafts,
        overlay: input.overlay,
      });
      facts = canonical.facts;
      report = await this.validator.validate({
        contracts: input.contracts,
        state: canonical.stateForValidation,
        drafts,
        facts: canonical.facts,
      });

      if (!shouldRewrite(report) || rewriteRounds >= maxRewriteRounds) {
        break;
      }

      const hints = buildRevisionHintsFromReport(report);
      if (hints.length === 0) {
        break;
      }

      rewriteRounds += 1;
      revisionHints = hints;
      console.info(
        `[LongFormWritingEngine] 审核未通过，开始第 ${rewriteRounds}/${maxRewriteRounds} 次重写`,
        hints.slice(0, 3)
      );
    }

    const { commit, receipt } = await this.commitService.commit({
      projectId: input.projectId,
      state: input.state,
      previousOverlay: input.overlay,
      contracts: input.contracts,
      drafts,
      facts,
      report,
    });
    return {
      plan,
      context,
      drafts,
      facts,
      report,
      commit,
      receipt,
      rewriteRounds,
    };
  }

  /**
   * 字数归一：不足则补段，超出则压缩（AI）+ 硬裁兜底，确保落在 [85%, 115%]。
   */
  private async padDraftsToTarget(
    drafts: SceneDraft[],
    input: LongFormWriteInput
  ): Promise<SceneDraft[]> {
    const target = input.targetWordCount ?? 0;
    if (target <= 0 || drafts.length === 0) {
      return drafts;
    }

    const nextDrafts = drafts.map(draft => ({
      ...draft,
      paragraphs: [...draft.paragraphs],
    }));
    let prose = draftsProse(nextDrafts);
    let rounds = 0;

    while (rounds < MAX_SUPPLEMENT_ROUNDS) {
      const check = checkWordCount(prose, target);
      if (!check.needsSupplement) {
        break;
      }

      const maxSupplement = Math.ceil(target * MAX_WORD_THRESHOLD) - check.currentWords;
      if (maxSupplement <= 0) {
        break;
      }

      const additionalWords = Math.min(
        check.shortfall || Math.ceil(target * 0.3),
        maxSupplement
      );
      const round = rounds + 1;
      const prompt = buildSupplementPrompt({
        existingContent: prose,
        targetWordCount: target,
        additionalWords,
        round,
        maxRounds: MAX_SUPPLEMENT_ROUNDS,
        chapterTitle: input.contracts.chapter.title,
        chapterOutline:
          input.contracts.chapter.goal ||
          input.contracts.chapter.CBN ||
          input.contracts.chapter.CEN,
      });

      try {
        const deltaParagraphs = await this.dependencies.ai.generate<string[]>({
          purpose: 'scene-draft',
          schemaName: 'SupplementParagraphs',
          system: [
            '你是网文补充续写引擎。只输出一个 JSON 对象：{"paragraphs":["段落1","段落2"]}',
            '从原文结尾自然续写，不要重复已有内容，不要输出 Markdown 代码块或解释。',
            `本次约补充 ${additionalWords} 字。`,
          ].join('\n'),
          prompt,
          parse: value => {
            const record =
              typeof value === 'object' && value !== null && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {};
            const raw = record.paragraphs ?? record['段落'] ?? value;
            const paragraphs = sanitizeSceneDraftParagraphs(
              Array.isArray(raw)
                ? raw.filter((item): item is string => typeof item === 'string')
                : typeof raw === 'string'
                  ? raw.split(/\n{2,}/u)
                  : []
            );
            if (paragraphs.length === 0) {
              throw new Error('补充续写未返回可用段落');
            }
            return paragraphs;
          },
        });

        if (!deltaParagraphs.length) {
          break;
        }
        nextDrafts[nextDrafts.length - 1].paragraphs.push(...deltaParagraphs);
        prose = draftsProse(nextDrafts);
        rounds = round;
        if (countWords(prose) <= check.currentWords) {
          // 无实质增量则停止，避免空转
          break;
        }
      } catch (error) {
        console.warn(`[LongFormWritingEngine] 第 ${round} 轮补字失败，停止补字:`, error);
        break;
      }
    }

    return this.trimDraftsIfOverTarget(nextDrafts, input);
  }

  /**
   * 超上限时先 AI 压缩一轮；仍超则硬裁到 maxWords，保住开头与章末。
   */
  private async trimDraftsIfOverTarget(
    drafts: SceneDraft[],
    input: LongFormWriteInput
  ): Promise<SceneDraft[]> {
    const target = input.targetWordCount ?? 0;
    if (target <= 0 || drafts.length === 0) {
      return drafts;
    }

    const nextDrafts = drafts.map(draft => ({
      ...draft,
      paragraphs: [...draft.paragraphs],
    }));
    let prose = draftsProse(nextDrafts);
    let bounds = checkWordCountBounds(prose, target);
    if (bounds.status !== 'over') {
      return nextDrafts;
    }

    const outline =
      input.contracts.chapter.goal ||
      input.contracts.chapter.CBN ||
      input.contracts.chapter.CEN;

    try {
      const condensedParagraphs = await this.dependencies.ai.generate<string[]>({
        purpose: 'scene-draft',
        schemaName: 'CondenseParagraphs',
        system: [
          '你是网文压缩改写引擎。只输出一个 JSON 对象：{"paragraphs":["段落1","段落2"]}',
          `当前约 ${bounds.currentWords} 字，必须压缩到 ${bounds.minWords}–${bounds.maxWords} 字（目标 ${target}）。`,
          '保留全部关键情节与章末钩子，删除注水与重复；不要输出 Markdown 代码块或解释。',
        ].join('\n'),
        prompt: buildCondensePrompt({
          existingContent: prose,
          targetWordCount: target,
          minWords: bounds.minWords,
          maxWords: bounds.maxWords,
          chapterTitle: input.contracts.chapter.title,
          chapterOutline: outline,
        }),
        parse: value => {
          const record =
            typeof value === 'object' && value !== null && !Array.isArray(value)
              ? (value as Record<string, unknown>)
              : {};
          const raw = record.paragraphs ?? record['段落'] ?? value;
          const paragraphs = sanitizeSceneDraftParagraphs(
            Array.isArray(raw)
              ? raw.filter((item): item is string => typeof item === 'string')
              : typeof raw === 'string'
                ? raw.split(/\n{2,}/u)
                : []
          );
          if (paragraphs.length === 0) {
            throw new Error('压缩改写未返回可用段落');
          }
          return paragraphs;
        },
      });

      if (condensedParagraphs.length > 0) {
        nextDrafts[0] = {
          ...nextDrafts[0],
          paragraphs: condensedParagraphs,
        };
        // 整章压缩后只保留一份草稿
        nextDrafts.splice(1);
        prose = draftsProse(nextDrafts);
        bounds = checkWordCountBounds(prose, target);
      }
    } catch (error) {
      console.warn('[LongFormWritingEngine] 超长压缩失败，将硬裁到上限:', error);
    }

    if (bounds.status === 'over') {
      const clamped = clampProseToMaxWords(prose, bounds.maxWords);
      const paragraphs = sanitizeSceneDraftParagraphs(
        clamped
          .split(/\n{2,}/u)
          .map(part => part.trim())
          .filter(Boolean)
      );
      nextDrafts[0] = {
        ...nextDrafts[0],
        paragraphs: paragraphs.length > 0 ? paragraphs : [clamped],
      };
      nextDrafts.splice(1);
      console.info(
        `[LongFormWritingEngine] 字数超上限，硬裁 ${bounds.currentWords} → ${countWords(draftsProse(nextDrafts))}（上限 ${bounds.maxWords}）`
      );
    }

    return nextDrafts;
  }
}
