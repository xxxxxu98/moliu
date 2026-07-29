import { describe, expect, it, vi } from 'vitest';

import type {
  ChapterCommit,
  ChapterCommitReceipt,
  ExtractedFacts,
  SceneDraft,
} from '@/types/story-runtime';

import { ChapterCommitService, type ChapterCommitPort } from '../ChapterCommitService';
import { ContinuityValidator } from '../ContinuityValidator';
import { makeContracts, makeState } from './testFixtures';

function makeDraft(): SceneDraft {
  return {
    sceneId: 'scene-1',
    beatId: 'chapter-2:CPN-1',
    paragraphs: ['守卫盘查了林夜的路引，随后放行。'],
    candidateEvents: [],
  };
}

function makeFacts(): ExtractedFacts {
  return {
    events: [
      {
        id: 'event-1',
        chapter: 2,
        sceneId: 'scene-1',
        type: 'checkpoint',
        summary: '守卫盘查后放行',
        participants: ['hero'],
        causes: [],
        effects: ['守卫盘查'],
        evidence: ['守卫盘查了林夜的路引'],
        timestamp: '2026-01-02T00:00:00.000Z',
      },
    ],
    deltas: [],
    evidence: ['守卫盘查了林夜的路引'],
  };
}

describe('ContinuityValidator', () => {
  it('覆盖实体、知识、物品、时间因果、履约和证据域并接受合法事实', () => {
    const report = new ContinuityValidator().validate({
      contracts: makeContracts(),
      state: makeState(),
      drafts: [makeDraft()],
      facts: makeFacts(),
    });

    expect(report.accepted).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.checkedDomains).toEqual([
      'entity',
      'knowledge',
      'inventory',
      'timeline',
      'causality',
      'fulfillment',
      'evidence',
    ]);
  });

  it('阻断未知实体、物品负数、缺失因果与无证据事件', () => {
    const facts = makeFacts();
    facts.events[0] = {
      ...facts.events[0],
      participants: ['ghost'],
      causes: ['missing-event'],
      evidence: [],
    };
    facts.deltas.push({
      operation: 'increment',
      path: 'inventory.hero.sword',
      value: -2,
      evidence: '剑已遗失',
    });
    const report = new ContinuityValidator().validate({
      contracts: makeContracts(),
      state: makeState(),
      drafts: [makeDraft()],
      facts,
    });

    expect(report.accepted).toBe(false);
    expect(new Set(report.issues.map(issue => issue.domain))).toEqual(
      new Set(['entity', 'causality', 'inventory', 'evidence'])
    );
  });
});

describe('ChapterCommitService', () => {
  it('accepted 才调用 IPC 提交端口', async () => {
    const receipt: ChapterCommitReceipt = {
      commitId: 'commit-1',
      revision: 1,
      acceptedAt: '2026-01-02T00:00:00.000Z',
    };
    const commitChapter = vi.fn<(commit: ChapterCommit) => Promise<ChapterCommitReceipt>>(
      async () => receipt
    );
    const port: ChapterCommitPort = { commitChapter };
    const service = new ChapterCommitService(port);
    const result = await service.commit({
      projectId: 'project-1',
      state: makeState(),
      contracts: makeContracts(),
      drafts: [makeDraft()],
      facts: makeFacts(),
      report: { accepted: true, issues: [], checkedDomains: ['evidence'] },
    });

    expect(result.commit.status).toBe('accepted');
    expect(result.receipt).toEqual(receipt);
    expect(result.commit.overlay.events[0].provisional).toBe(true);
    expect(commitChapter).toHaveBeenCalledOnce();
  });

  it('rejected 不调用 IPC', async () => {
    const commitChapter = vi.fn<(commit: ChapterCommit) => Promise<ChapterCommitReceipt>>();
    const saveRejectedDraft = vi.fn<(commit: ChapterCommit) => Promise<void>>(async () => undefined);
    const service = new ChapterCommitService({ commitChapter, saveRejectedDraft });
    const result = await service.commit({
      projectId: 'project-1',
      state: makeState(),
      contracts: makeContracts(),
      drafts: [makeDraft()],
      facts: makeFacts(),
      report: {
        accepted: false,
        issues: [
          {
            id: 'evidence-1',
            domain: 'evidence',
            severity: 'blocking',
            message: '缺少证据',
            evidence: [],
          },
        ],
        checkedDomains: ['evidence'],
      },
    });

    expect(result.commit.status).toBe('rejected');
    expect(result.receipt).toBeUndefined();
    expect(commitChapter).not.toHaveBeenCalled();
    expect(saveRejectedDraft).toHaveBeenCalledOnce();
  });
});
