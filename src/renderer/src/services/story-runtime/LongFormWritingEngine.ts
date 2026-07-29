import type {
  FactExtractor,
  LongFormWriteInput,
  LongFormWriteResult,
  StructuredAI,
} from '@/types/story-runtime';

import {
  ChapterCommitService,
  type ChapterCommitPort,
} from './ChapterCommitService';
import { ContextPackBuilder } from './ContextPackBuilder';
import { ContinuityValidator } from './ContinuityValidator';
import { SceneBeatPlanner } from './SceneBeatPlanner';
import { SceneDraftEngine } from './SceneDraftEngine';

export interface LongFormWritingEngineDependencies {
  ai: StructuredAI;
  factExtractor: FactExtractor;
  commitPort: ChapterCommitPort;
  planner?: SceneBeatPlanner;
  contextBuilder?: ContextPackBuilder;
  validator?: ContinuityValidator;
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
    this.validator = dependencies.validator ?? new ContinuityValidator();
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
    const drafts = await this.draftEngine.draft(plan, context);
    const facts = await this.dependencies.factExtractor.extract({
      projectId: input.projectId,
      chapterNumber: input.contracts.chapter.chapterNumber,
      sceneDrafts: drafts,
      state: input.state,
      overlay: input.overlay,
    });
    const report = this.validator.validate({
      contracts: input.contracts,
      state: input.state,
      overlay: input.overlay,
      drafts,
      facts,
    });
    const { commit, receipt } = await this.commitService.commit({
      projectId: input.projectId,
      state: input.state,
      previousOverlay: input.overlay,
      contracts: input.contracts,
      drafts,
      facts,
      report,
    });
    return { plan, context, drafts, facts, report, commit, receipt };
  }
}
