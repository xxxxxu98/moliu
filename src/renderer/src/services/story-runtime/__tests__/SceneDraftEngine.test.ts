import { describe, expect, it, vi } from 'vitest';

import type {
  CandidateEvent,
  ContextPack,
  SceneBeat,
  ScenePlan,
  StructuredAI,
} from '@/types/story-runtime';

import { coerceSceneDraft, SceneDraftEngine } from '../SceneDraftEngine';
import {
  isStructuralLeakFragment,
  sanitizeSceneDraftParagraphs,
  sanitizeStructuredProseLeakage,
  stripTrailingJsonClosers,
} from '../stripDraftLeakage';

const beat: SceneBeat = {
  id: 'chapter-1:CBN',
  kind: 'CBN',
  order: 0,
  summary: '开篇钩子',
  dependsOn: [],
  candidateEvents: [],
};

const allowed: CandidateEvent[] = [
  {
    id: 'chapter-1:CBN:event:1',
    summary: '开篇钩子',
    participants: [],
    prerequisites: [],
    effects: ['开篇钩子'],
  },
];

describe('coerceSceneDraft', () => {
  it('补齐 AI 漏掉的 sceneId/beatId/candidateEvents', () => {
    const draft = coerceSceneDraft(
      {
        paragraphs: ['夜色压城，林夜推开客栈木门。'],
      },
      beat,
      allowed
    );

    expect(draft).toEqual({
      sceneId: 'chapter-1:CBN:scene',
      beatId: 'chapter-1:CBN',
      paragraphs: ['夜色压城，林夜推开客栈木门。'],
      candidateEvents: allowed,
    });
  });

  it('提取并清洗 chapterTitle（去第X章前缀）', () => {
    const draft = coerceSceneDraft(
      {
        chapterTitle: '第1章 「验尸翻案」',
        paragraphs: ['主角睁开眼。'],
      },
      beat,
      allowed
    );

    expect(draft.chapterTitle).toBe('验尸翻案');
    expect(draft.paragraphs).toEqual(['主角睁开眼。']);
  });

  it('支持中文别名「章节标题」', () => {
    const draft = coerceSceneDraft(
      {
        章节标题: '被反诬入狱',
        paragraphs: ['衙役围了上来。'],
      },
      beat,
      allowed
    );

    expect(draft.chapterTitle).toBe('被反诬入狱');
  });

  it('支持 data 包装层与 content 字段', () => {
    const draft = coerceSceneDraft(
      {
        data: {
          content: '第一段。\n\n第二段。',
        },
      },
      beat,
      allowed
    );

    expect(draft.paragraphs).toEqual(['第一段。', '第二段。']);
    expect(draft.beatId).toBe('chapter-1:CBN');
  });

  it('只保留 allowed 内的 candidateEvents', () => {
    const draft = coerceSceneDraft(
      {
        paragraphs: ['正文'],
        candidateEvents: [
          allowed[0],
          {
            id: 'forged',
            summary: '伪造',
            participants: [],
            prerequisites: [],
            effects: [],
          },
        ],
      },
      beat,
      allowed
    );

    expect(draft.candidateEvents).toEqual(allowed);
  });

  it('剥离 paragraphs 内泄漏的 JSON 骨架，保留叙述正文', () => {
    const draft = coerceSceneDraft(
      {
        paragraphs: [
          '他终究没能说出那句话。',
          '空气像是凝固了。]]',
          'candidateEvents',
          ':',
        ],
        candidateEvents: allowed,
      },
      beat,
      allowed
    );

    expect(draft.paragraphs).toEqual(['他终究没能说出那句话。', '空气像是凝固了。']);
    expect(draft.paragraphs.join('\n')).not.toContain('candidateEvents');
  });

  it('无正文时抛错', () => {
    expect(() => coerceSceneDraft({ foo: 1 }, beat, allowed)).toThrow('未返回可用正文段落');
  });
});

describe('SceneDraftEngine.draft', () => {
  it('只发起一次 AI 请求并返回单份整章正文', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。', '推进。', '章末钩子。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);

    const cpn: SceneBeat = {
      id: 'chapter-1:CPN-1',
      kind: 'CPN',
      order: 1,
      summary: '推进',
      dependsOn: ['chapter-1:CBN'],
      candidateEvents: [
        {
          id: 'chapter-1:CPN-1:event:1',
          summary: '推进',
          participants: [],
          prerequisites: [],
          effects: [],
        },
      ],
    };
    const cen: SceneBeat = {
      id: 'chapter-1:CEN',
      kind: 'CEN',
      order: 2,
      summary: '章末钩子',
      dependsOn: ['chapter-1:CPN-1'],
      candidateEvents: [
        {
          id: 'chapter-1:CEN:event:1',
          summary: '章末钩子',
          participants: [],
          prerequisites: [],
          effects: [],
        },
      ],
    };
    const plan: ScenePlan = {
      chapterNumber: 1,
      beats: [
        { ...beat, candidateEvents: allowed },
        cpn,
        cen,
      ],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    const drafts = await engine.draft(plan, context);

    expect(generate).toHaveBeenCalledTimes(1);
    const prompt = JSON.parse((generate.mock.calls[0][0] as { prompt: string }).prompt) as {
      primaryBeatId: string;
      allowedCandidateEventIds: string[];
      beat?: unknown;
      allowedCandidateEvents?: unknown;
      writingRules: { mustCoverInOrder?: unknown };
    };
    expect(prompt.primaryBeatId).toBe('chapter-1:CBN');
    expect(prompt.allowedCandidateEventIds.length).toBeGreaterThan(0);
    expect(prompt.beat).toBeUndefined();
    expect(prompt.allowedCandidateEvents).toBeUndefined();
    expect(prompt.writingRules.mustCoverInOrder).toBeUndefined();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].beatId).toBe('chapter-1:CBN');
    expect(drafts[0].paragraphs).toEqual(['开篇。', '推进。', '章末钩子。']);
  });

  it('system prompt 要求同轮输出口语风 chapterTitle', async () => {
    const generate = vi.fn(async () => ({
      chapterTitle: '这尸体不对劲',
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 1,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    const drafts = await engine.draft(plan, context);

    const request = generate.mock.calls[0][0] as { system: string; prompt: string };
    expect(request.system).toContain('chapterTitle');
    expect(request.system).toContain('不要加「第X章」前缀');
    expect(request.system).toContain('拜师学艺');
    expect(request.system).toContain('公堂指凶');
    expect(request.system).toContain('别端着');
    expect(request.system).toContain('本章范围');
    expect(request.system).toContain('章末约束');
    const prompt = JSON.parse(request.prompt) as {
      titleHints: { vibe: string; length: { prefer: string } };
      requiredOutput: { chapterTitle: string };
      writingRules: {
        scopeThisChapterOnly?: boolean;
        endOnCEN?: boolean;
      };
    };
    expect(prompt.titleHints.vibe).toContain('口语');
    expect(prompt.titleHints.length.prefer).toContain('6-16');
    expect(prompt.requiredOutput.chapterTitle).toContain('这尸体怎么验都不对劲');
    expect(prompt.writingRules.scopeThisChapterOnly).toBe(true);
    expect(prompt.writingRules.endOnCEN).toBe(true);
    expect(drafts[0].chapterTitle).toBe('这尸体不对劲');
  });

  it('字数规则同时声明上下限，并写入 writingRules', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。', '推进。', '章末钩子。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 1,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context, { targetWordCount: 3000 });

    const request = generate.mock.calls[0][0] as { system: string; prompt: string };
    // MIN_WORD_THRESHOLD=0.80：3000 → 下限 2400；MAX_WORD_THRESHOLD=1.15 → 上限 3450
    expect(request.system).toContain('2400–3450');
    expect(request.system).toContain('80%–115%');
    expect(request.system).toContain('高于 3450');
    const prompt = JSON.parse(request.prompt) as {
      writingRules: {
        minWordCount: number | null;
        maxWordCount: number | null;
        targetWordCount: number | null;
      };
    };
    expect(prompt.writingRules).toEqual({
      mode: 'single-shot-chapter',
      forbidPlotRestart: true,
      scopeThisChapterOnly: true,
      endOnCEN: true,
      forbidFutureChapterPayoffs: true,
      targetWordCount: 3000,
      minWordCount: 2400, // MIN_WORD_THRESHOLD=0.80 × 3000
      maxWordCount: 3450,
    });
  });

  it('candidateEvents 支持仅 id 列表', () => {
    const draft = coerceSceneDraft(
      {
        paragraphs: ['正文'],
        candidateEvents: [allowed[0].id],
      },
      beat,
      allowed
    );
    expect(draft.candidateEvents).toEqual(allowed);
  });
});

describe('stripDraftLeakage', () => {
  it('识别纯 schema 泄漏片段', () => {
    expect(isStructuralLeakFragment('candidateEvents')).toBe(true);
    expect(isStructuralLeakFragment(':')).toBe(true);
    expect(isStructuralLeakFragment(']]')).toBe(true);
    expect(isStructuralLeakFragment('他看了她一眼。')).toBe(false);
  });

  it('只剥离段末粘连的 JSON 闭括号', () => {
    expect(stripTrailingJsonClosers('空气像是凝固了。]]')).toBe('空气像是凝固了。');
    expect(stripTrailingJsonClosers('正常正文。')).toBe('正常正文。');
  });

  it('sanitizeStructuredProseLeakage 不改写正常分段', () => {
    const prose = '第一段。\n\n第二段。';
    expect(sanitizeStructuredProseLeakage(prose)).toBe(prose);
  });

  it('sanitizeSceneDraftParagraphs 去掉泄漏段', () => {
    expect(
      sanitizeSceneDraftParagraphs(['正文。]]', 'candidateEvents', ':', '下一段。'])
    ).toEqual(['正文。', '下一段。']);
  });
});
