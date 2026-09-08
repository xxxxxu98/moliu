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
    expect(request.system).toContain('禁区最高优先级');
    expect(request.system).toContain('不得现身、说话、发声');
    expect(request.system).toContain('章末约束');
    // 对话引号规则（2026-08-24 gemini3.7flash 冒烟 7 章 dialogue-quotes 后强化）：
    // 锁住三个具体形态——成对中文引号、禁半角引号、禁提示语后裸接台词
    expect(request.system).toContain('成对中文引号');
    expect(request.system).toContain('半角引号');
    expect(request.system).toContain('裸接台词');
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

  it('角色类 futureReveals 升级为【登场禁令】硬规则，事实类留在揭示禁区', async () => {
    // 2026-09-04 r5 裴天禄(提前46章)/r7 过江龙(提前3章)实证：角色 embargo 混在
    // 事实软规则里被 writer 无视。角色类条目（上游以「角色"X"…」格式产出）单列。
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 76,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context, {
      futureReveals: [
        { description: '角色“裴天禄”不得登场或被揭示（计划：第122章）', notBeforeChapter: 122 },
        { description: '盐引背后的皇室宗亲身份', notBeforeChapter: 90 },
      ],
    } as never);

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【登场禁令】');
    expect(request.system).toContain('裴天禄');
    expect(request.system).toContain('只能完全不出现');
    expect(request.system).toContain('【未来揭示禁区】');
    // 角色条目不再重复出现在事实揭示区
    const factZone = request.system.slice(request.system.indexOf('【未来揭示禁区】'));
    expect(factZone).not.toContain('裴天禄');
    expect(factZone).toContain('盐引背后的皇室宗亲身份');
  });

  it('terminalFateCharacters 渲染【命运终态禁令】，死者只可向后引用', async () => {
    // 2026-09-06 g38f-200chr2 ch184 实证：写手自发发明「已驾崩皇帝病危急报」
    // 复活钩子，fact_conflict 五连拒整章死。起草侧禁令 + 出场白名单剔除双防线。
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 184,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context, {
      terminalFateCharacters: [
        { name: '赵乾', status: '驾崩' },
        { name: '孙茂才', status: '死亡' },
      ],
    });

    const request = generate.mock.calls[0][0] as { system: string; prompt: string };
    expect(request.system).toContain('【命运终态禁令】');
    expect(request.system).toContain('赵乾（已驾崩）');
    expect(request.system).toContain('孙茂才（已死亡）');
    expect(request.system).toContain('禁止以任何「仍然存活」的形态出现');
    expect(request.system).toContain('病危、晕厥、遇袭待救');
    expect(request.system).toContain('回忆、追述、遗物');
    const prompt = JSON.parse(request.prompt) as {
      writingRules: { terminalFateCharacters?: string[] };
    };
    expect(prompt.writingRules.terminalFateCharacters).toEqual(['赵乾（已驾崩）', '孙茂才（已死亡）']);
  });

  it('repair 模式显式解锁冲突发明内容的整体删除', async () => {
    // 同上 ch184 死锁根因：重写指令「未涉及情节保持稳定」把首稿自发发明的
    // 复活钩子当稳定基底保留 5 轮。修复模式必须给 fact_conflict 指向的场景
    // 开删除/改写逃生口。
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 184,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context, {
      revisionPlan: { mode: 'repair', hints: ['角色赵乾已驾崩，不得写其病危'] },
      rewriteRound: 1,
    });

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【修复模式】');
    expect(request.system).toContain('与全书既有事实冲突的内容');
    expect(request.system).toContain('不受「保持稳定」保护');
  });

  it('已有正式标题时只要求回填，不再注入整套拟标题规则', async () => {
    // 大纲链路的章节标题非占位，pipeline 只在占位时采纳生成标题，
    // 再让模型拟一个等于白占十余行 system 指令与注意力。
    const generate = vi.fn(async () => ({
      chapterTitle: '睁眼就替人顶罪画押',
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

    await engine.draft(plan, context, { existingChapterTitle: '睁眼就替人顶罪画押' });

    const request = generate.mock.calls[0][0] as { system: string; prompt: string };
    expect(request.system).toContain('直接原样回填「睁眼就替人顶罪画押」');
    expect(request.system).not.toContain('拜师学艺');
    const prompt = JSON.parse(request.prompt) as {
      titleHints: { fixedTitle?: string; vibe?: string };
      requiredOutput: { chapterTitle: string };
    };
    expect(prompt.titleHints.fixedTitle).toBe('睁眼就替人顶罪画押');
    expect(prompt.titleHints.vibe).toBeUndefined();
    expect(prompt.requiredOutput.chapterTitle).toBe('睁眼就替人顶罪画押');
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
    // MIN_WORD_THRESHOLD=0.80：3000 → 下限 2400；MAX_WORD_THRESHOLD=1.18 → 上限 3540
    expect(request.system).toContain('2400–3540');
    expect(request.system).toContain('80%–118%');
    expect(request.system).toContain('高于 3540');
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
      maxWordCount: 3540,
      allowedAppearanceNames: [],
      terminalFateCharacters: [],
      futureReveals: [],
    });
  });

  it('超长重写使用 compress 模式，不再注入禁止压缩', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['压缩后的正文。'],
      candidateEvents: allowed,
    }));
    const engine = new SceneDraftEngine({ generate });
    const plan: ScenePlan = {
      chapterNumber: 1,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };

    await engine.draft(
      plan,
      { blocks: [], totalTokenEstimate: 0, omitted: [] },
      {
        targetWordCount: 3000,
        revisionPlan: {
          mode: 'compress',
          hints: ['字数严重超限：当前约 5000 字'],
          minWords: 2400,
          maxWords: 3540,
        },
      },
    );

    const request = generate.mock.calls[0][0] as { system: string; prompt: string };
    expect(request.system).toContain('【压缩模式】');
    expect(request.system).not.toContain('【禁止压缩】');
    expect(JSON.parse(request.prompt).revisionFeedback.mode).toBe('compress');
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
