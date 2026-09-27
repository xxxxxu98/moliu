import { describe, expect, it, vi } from 'vitest';

import type {
  ChapterCommit,
  ChapterCommitReceipt,
  ExtractedFacts,
  SceneDraft,
} from '@/types/story-runtime';

import { classifyError } from '@/utils/ai-error-classify';

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
  it('覆盖实体、知识、物品、时间因果、履约和证据域并接受合法事实', async () => {
    const report = await new ContinuityValidator().validate({
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

  it('阻断未知实体、物品负数、缺失因果与无证据事件', async () => {
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
    const report = await new ContinuityValidator().validate({
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

  it('功能性临时身份被抽成未知实体时只告警，不单独阻断提交', async () => {
    const facts = makeFacts();
    facts.events[0] = {
      ...facts.events[0],
      participants: ['绿袍官员'],
    };
    const report = await new ContinuityValidator().validate({
      contracts: makeContracts(),
      state: makeState(),
      drafts: [makeDraft()],
      facts,
    });

    expect(report.accepted).toBe(true);
    expect(report.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('未知实体 绿袍官员'),
      }),
    ]);
  });

  it('字面未命中时交给统一 ChapterJudge，同义改写可判通过', async () => {
    const judge = {
      judge: vi.fn(async () => ({
        fulfillment: [
          {
            node: '当众指出凶手是县令公子',
            fulfilled: true,
            evidence: ['他当众揭穿真凶竟是县令的儿子'],
            reason: '语义已兑现指认真凶',
          },
        ],
        forbidden: [],
        issues: [],
      })),
    };
    const contracts = makeContracts();
    contracts.chapter.mustCover = ['当众指出凶手是县令公子'];
    contracts.chapter.forbidden = [];
    const report = await new ContinuityValidator({
      chapterJudge: judge,
      enableDeepSemantic: false,
    }).validate({
      contracts,
      state: makeState(),
      drafts: [
        {
          sceneId: 'scene-1',
          beatId: 'beat-1',
          paragraphs: ['堂上死寂。他当众揭穿真凶竟是县令的儿子，四座哗然。'],
          candidateEvents: [],
        },
      ],
      facts: { events: [], deltas: [], evidence: [] },
    });

    expect(judge.judge).toHaveBeenCalledOnce();
    expect(report.accepted).toBe(true);
    expect(report.issues.filter(issue => issue.domain === 'fulfillment')).toEqual([]);
  });

  it('ChapterJudge 一次返回未履约与语义问题时均写入报告', async () => {
    const contracts = makeContracts();
    contracts.chapter.mustCover = ['当众指出凶手是县令公子'];
    contracts.chapter.forbidden = [];
    const report = await new ContinuityValidator({
      chapterJudge: {
        judge: async () => ({
          fulfillment: [
            {
              node: '当众指出凶手是县令公子',
              fulfilled: false,
              evidence: [],
              reason: '正文仅写验尸，未当众指认凶手',
            },
          ],
          forbidden: [],
          issues: [
            {
              type: 'logic_gap',
              severity: 'high',
              location: '中段',
              description: '前后说法矛盾',
              evidence: ['……'],
            },
          ],
        }),
      },
      enableDeepSemantic: true,
    }).validate({
      contracts,
      state: makeState(),
      drafts: [
        {
          sceneId: 'scene-1',
          beatId: 'beat-1',
          paragraphs: ['魔宗偏殿里，众人围着尸身验看伤口。'],
          candidateEvents: [],
        },
      ],
      facts: { events: [], deltas: [], evidence: [] },
    });

    expect(report.accepted).toBe(false);
    expect(report.issues.some(issue => issue.message.includes('未当众指认凶手'))).toBe(true);
    expect(report.issues.some(issue => issue.message.includes('logic_gap'))).toBe(true);
  });

  // 真实回归：smoke:storyflow:real（opencode/deepseek-v4-flash）第 2 章 chapter-judge 返回空响应，
  // 被包成 [review-unavailable] 后 classifyError 判 transient=false，引擎重试预算失效，
  // 批量续写在第 2 章整体中止。瞬态失败必须原样抛出，让步骤级重试真正跑起来。
  it('ChapterJudge 瞬态失败（空响应/截断）原样抛出，不包成 review-unavailable', async () => {
    const contracts = makeContracts();
    contracts.chapter.mustCover = ['当众指出凶手是县令公子'];
    contracts.chapter.forbidden = [];
    const error = await new ContinuityValidator({
      chapterJudge: {
        judge: async () => {
          throw new Error('AI 返回的结构化 JSON 无法解析：Unexpected end of JSON input');
        },
      },
      enableDeepSemantic: true,
    })
      .validate({
        contracts,
        state: makeState(),
        drafts: [makeDraft()],
        facts: makeFacts(),
      })
      .then(() => null)
      .catch((err: unknown) => err as Error);

    expect(error?.message).toContain('AI 返回的结构化 JSON 无法解析');
    expect(error?.message).not.toContain('[review-unavailable]');
    expect(classifyError(error).transient).toBe(true);
  });

  it('ChapterJudge 持久失败仍包成 review-unavailable，避免被当成未履约驱动整章重写', async () => {
    const contracts = makeContracts();
    contracts.chapter.mustCover = ['当众指出凶手是县令公子'];
    contracts.chapter.forbidden = [];
    const validate = new ContinuityValidator({
      chapterJudge: {
        judge: async () => {
          throw new Error('结构校验失败: judgment.fulfillment 必须为数组');
        },
      },
      enableDeepSemantic: true,
    }).validate({
      contracts,
      state: makeState(),
      drafts: [makeDraft()],
      facts: makeFacts(),
    });

    await expect(validate).rejects.toThrow('[review-unavailable]');
  });

  it('字面履约已通过且关闭深度语义时不调用 ChapterJudge', async () => {
    const judge = { judge: vi.fn(async () => ({ fulfillment: [], forbidden: [], issues: [] })) };
    const contracts = makeContracts();
    contracts.chapter.forbidden = [];
    const report = await new ContinuityValidator({
      chapterJudge: judge,
      enableDeepSemantic: false,
    }).validate({
      contracts,
      state: makeState(),
      drafts: [makeDraft()],
      facts: makeFacts(),
    });
    expect(judge.judge).not.toHaveBeenCalled();
    expect(report.accepted).toBe(true);
  });

  it('fact_conflict 无条件 blocking：即使 domain 不在 blockingDomains 中也判 accepted=false（P2-B）', async () => {
    const contracts = makeContracts();
    contracts.chapter.mustCover = ['守卫盘查'];
    contracts.chapter.forbidden = [];
    // 故意把 entity（fact_conflict 映射的 domain）从 blockingDomains 移除，
    // 验证 fact_conflict 仍无条件 blocking，不依赖 blockingDomains 配置
    contracts.review.blockingDomains = ['causality', 'fulfillment', 'evidence'];

    const report = await new ContinuityValidator({
      chapterJudge: {
        judge: async () => ({
          fulfillment: [
            { node: '守卫盘查', fulfilled: true, evidence: ['守卫盘查了林夜的路引'], reason: '已兑现' },
          ],
          forbidden: [],
          issues: [
            {
              type: 'fact_conflict',
              severity: 'medium', // 故意用 medium，证明与 severity 无关、只看 type
              location: '末段',
              description: '上章已死的王五本章再次活动',
              evidence: ['王五笑道'],
            },
          ],
        }),
      },
      enableDeepSemantic: true,
    }).validate({
      contracts,
      state: makeState(),
      drafts: [makeDraft()],
      facts: makeFacts(),
    });

    // fact_conflict 一律 blocking → accepted=false，触发重写/拒收
    expect(report.accepted).toBe(false);
    expect(
      report.issues.some(
        issue => issue.severity === 'blocking' && issue.message.includes('fact_conflict'),
      ),
    ).toBe(true);
  });

  it('判官报出的「节点原句照抄」保持 warning 级不阻断提交（node-verbatim-survived 哲学）', async () => {
    const contracts = makeContracts();
    contracts.review.blockingDomains = ['causality', 'fulfillment', 'evidence'];
    contracts.review.maxWarnings = 3;
    const report = await new ContinuityValidator({
      chapterJudge: {
        judge: async () => ({
          fulfillment: [
            { node: '守卫盘查', fulfilled: true, evidence: ['守卫盘查了林夜的路引'], reason: '已兑现' },
          ],
          forbidden: [],
          issues: [
            {
              type: 'logic_gap',
              severity: 'high',
              location: '首段',
              description: '正文与大纲节点存在连续13字逐字相同（节点原句照抄）',
              evidence: ['守卫盘查了林夜的路引'],
            },
          ],
        }),
      },
      enableDeepSemantic: true,
    }).validate({
      contracts,
      state: makeState(),
      drafts: [makeDraft()],
      facts: makeFacts(),
    });

    expect(report.accepted).toBe(true);
    const verbatimIssue = report.issues.find(i => i.message.includes('节点原句照抄'));
    expect(verbatimIssue).toBeDefined();
    expect(verbatimIssue?.severity).toBe('warning');
    expect(verbatimIssue?.domain).toBe('fulfillment');
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
