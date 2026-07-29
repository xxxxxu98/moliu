import type {
  ChapterCommit,
  ChapterCommitReceipt,
  ContinuityReport,
  ContractPack,
  ExtractedFacts,
  ProvisionalStateOverlay,
  SceneDraft,
  StoryState,
} from '@/types/story-runtime';

export interface ChapterCommitPort {
  commitChapter(commit: ChapterCommit): Promise<ChapterCommitReceipt>;
  saveRejectedDraft?(commit: ChapterCommit): Promise<void>;
}

export interface ChapterCommitInput {
  projectId: string;
  state: StoryState;
  previousOverlay?: ProvisionalStateOverlay;
  contracts: ContractPack;
  drafts: SceneDraft[];
  facts: ExtractedFacts;
  report: ContinuityReport;
}

export interface ChapterCommitResult {
  commit: ChapterCommit;
  receipt?: ChapterCommitReceipt;
}

function stableRevisionId(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class ChapterCommitService {
  constructor(private readonly port: ChapterCommitPort) {}

  async commit(input: ChapterCommitInput): Promise<ChapterCommitResult> {
    const chapterNumber = input.contracts.chapter.chapterNumber;
    const overlay: ProvisionalStateOverlay = {
      baseChapter: input.state.chapter,
      deltas: [...(input.previousOverlay?.deltas ?? []), ...input.facts.deltas],
      events: [
        ...(input.previousOverlay?.events ?? []),
        ...input.facts.events.map(event => ({ ...event, provisional: true })),
      ],
    };
    const blockingIssues = input.report.issues.filter(issue => issue.severity === 'blocking');
    const status = input.report.accepted && blockingIssues.length === 0 ? 'accepted' : 'rejected';
    const reasons =
      status === 'accepted'
        ? []
        : blockingIssues.length > 0
          ? blockingIssues.map(issue => issue.message)
          : ['连续性校验未通过'];
    const commit: ChapterCommit = {
      id: `${input.projectId}:chapter:${chapterNumber}:commit:${stableRevisionId({
        drafts: input.drafts,
        facts: input.facts,
      })}`,
      projectId: input.projectId,
      chapterNumber,
      status,
      baseState: structuredClone(input.state),
      contractPack: input.contracts,
      sceneDrafts: input.drafts,
      extractedFacts: input.facts,
      validation: input.report,
      overlay,
      reasons,
    };

    if (status === 'rejected') {
      await this.port.saveRejectedDraft?.(commit);
      return { commit };
    }
    const receipt = await this.port.commitChapter(commit);
    return { commit, receipt };
  }
}
