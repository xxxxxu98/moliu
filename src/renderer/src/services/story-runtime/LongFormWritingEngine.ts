import type {
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
  buildSupplementPrompt,
  checkWordCount,
} from '@/services/writing/supplement';
import { countWords } from '@/services/writing/utils';

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
    let drafts = await this.draftEngine.draft(plan, context, {
      targetWordCount: input.targetWordCount,
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
    const report = await this.validator.validate({
      contracts: input.contracts,
      state: canonical.stateForValidation,
      drafts,
      facts: canonical.facts,
    });
    const { commit, receipt } = await this.commitService.commit({
      projectId: input.projectId,
      state: input.state,
      previousOverlay: input.overlay,
      contracts: input.contracts,
      drafts,
      facts: canonical.facts,
      report,
    });
    return { plan, context, drafts, facts: canonical.facts, report, commit, receipt };
  }

  /**
   * 字数不足时在内存中补段，确保后续 SQLite commit / 编辑器投影都是达标正文。
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

    return nextDrafts;
  }
}
