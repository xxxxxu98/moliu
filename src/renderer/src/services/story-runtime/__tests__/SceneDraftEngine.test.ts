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

  it('vocabularyTier 按档注入词汇规则；缺省注入 balanced（规则永远在场）', async () => {
    const generate = vi.fn(async () => ({
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

    await engine.draft(plan, context, { vocabularyTier: 'hardcore' });
    let system = (generate.mock.calls[0][0] as { system: string }).system;
    expect(system).toContain('词汇档位·硬核技术流');
    expect(system).toContain('术语落地底线');

    await engine.draft(plan, context, { vocabularyTier: 'plain' });
    system = (generate.mock.calls[1][0] as { system: string }).system;
    expect(system).toContain('词汇档位·小白大白话');
    expect(system).toContain('禁止非日常专业术语');

    await engine.draft(plan, context);
    system = (generate.mock.calls[2][0] as { system: string }).system;
    expect(system).toContain('词汇档位·均衡');
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

  it('上章结尾注入含章界动线硬约束，窗口取末 400 字（g38f r6 ch31/70 实证）', async () => {
    // r6：ch30 末主角随车队押运入峡，ch31 无折返交代瞬移回京师值房；
    // ch69 末定「官船诱敌、三人走旱路」已出发，ch70 折返登船走水路——
    // 旧【上章衔接】只防状态回退、只给末 200 字，动线断裂两头都漏
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 31,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };
    const tail = '前'.repeat(500) + '沈辞提着气死风灯随车队缓缓开拔，径直扎入落鹰峡险地，夜色吞没了最后一面旗。';

    await engine.draft(plan, context, { previousChapterEnding: tail });

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【章界动线】');
    expect(request.system).toContain('禁止无交代地瞬移');
    expect(request.system).toContain('数量禁止无解释增减');
    // 末 400 字窗口：538 字 tail 只注入最后 400 字（前缀被裁、结尾句保留）
    expect(request.system).toContain('径直扎入落鹰峡险地');
    const injected = request.system.match(/「…[^」]+」/)?.[0] ?? '';
    expect(injected.length).toBeLessThanOrEqual(410);
    expect(injected).toContain('径直扎入落鹰峡险地');
  });

  it('纪年锚：有锚时锁全书唯一年号，空锚时禁止发明年号（g38f r6 后50章建元/建昭分裂实证）', async () => {
    // r6：前 150 章年号统一「天兴」，151-200 自创「建元/建昭/宣府元年」平行纪年
    // 9 章——旧锚措辞只拦真实历史年号，没拦模型自创第二套年号；锚为空时更是
    // 没有任何分支，模型自由发挥
    const mk = () =>
      vi.fn(async () => ({ paragraphs: ['开篇。'], candidateEvents: allowed })) as unknown as
        ReturnType<typeof vi.fn>;
    const plan: ScenePlan = {
      chapterNumber: 170,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    const genWithAnchor = mk();
    await new SceneDraftEngine({ generate: genWithAnchor } as unknown as StructuredAI).draft(
      plan,
      context,
      { eraAnchors: ['第150章纪年「天兴二十一年」'] }
    );
    const withAnchor = (genWithAnchor.mock.calls[0][0] as { system: string }).system;
    expect(withAnchor).toContain('【纪年锚·全书唯一年号】');
    expect(withAnchor).toContain('天兴二十一年');
    expect(withAnchor).toContain('禁止发明任何新年号');

    const genNoAnchor = mk();
    await new SceneDraftEngine({ generate: genNoAnchor } as unknown as StructuredAI).draft(
      plan,
      context,
      {}
    );
    const noAnchor = (genNoAnchor.mock.calls[0][0] as { system: string }).system;
    expect(noAnchor).toContain('【纪年锚·未确立年号】');
    expect(noAnchor).toContain('禁止发明年号');
    expect(noAnchor).not.toContain('【纪年锚·全书唯一年号】');
  });

  it('数字锚规则常驻：既成大额数字禁无解释改写（g38f r6 盐税五套口径实证）', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 100,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context, {});

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【数字锚】');
    expect(request.system).toContain('禁止无解释改写既成数字');
  });

  it('numericFacts 传入时注入既成名录（g38f r6 长程数字漂移实证）', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 160,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context, {
      numericFacts: ['第99章既成「两淮盐税岁入实征二百二十万两」'],
    });

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【数字锚·既成名录】');
    expect(request.system).toContain('二百二十万两');
  });

  it('身份锚注入角色卡身份并禁止发明同名姻亲替身（g38f r6 赵宣两身份实证）', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 25,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context, {
      characterIdentityAnchors: [
        { name: '赵宣', identity: '前中期夺嫡争斗策动者，操控江南织造与两淮盐税两大聚宝盆' },
      ],
    });

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【身份锚】');
    expect(request.system).toContain('禁止把具名角色降格/升格');
    expect(request.system).toContain('禁止发明同名的姻亲、替身、门客');
    expect(request.system).toContain('前中期夺嫡争斗策动者');
  });

  it('皇统叙事规则常驻：先帝称谓/驾崩场面/东宫指代/年数验算（g38f r7 实证）', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 194,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context, {});

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【皇统叙事】');
    expect(request.system).toContain('只能用于已驾崩者');
    expect(request.system).toContain('驾崩必须有叙述场面');
    expect(request.system).toContain('不得零叙述直接写新帝即位');
    // 数字锚含落笔前验算句
    expect(request.system).toContain('落笔前先验算');
  });

  it('假死纪律注入：隐匿活动合法+公开现身需揭晓+禁止按死人处理（g38f r8 实证）', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 170,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context, {
      fakedDeathCharacters: [{ name: '陆九霄', chapterIndex: 151 }],
    });

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【假死纪律】');
    expect(request.system).toContain('不是死亡');
    expect(request.system).toContain('只能以隐匿形态');
    expect(request.system).toContain('不得一笔带过');
    expect(request.system).toContain('衣冠道具代替本人');
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

describe('黄金三章专用规则注入', () => {
  it('第一章(chapterNumber=0)注入世界观窗口规则', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 0,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context);

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【黄金开篇】');
    expect(request.system).toContain('【第一章·世界观窗口】');
    expect(request.system).toContain('【第一章·主角人设】');
    expect(request.system).toContain('【第一章·开场钩子】');
    expect(request.system).toContain('【第一章·金手指露出】');
    expect(request.system).toContain('只能嵌在正在发生的动作和对白里');
    expect(request.system).toContain('前 3 段内必须出现');
    // 不应包含第二章或第三章的规则
    expect(request.system).not.toContain('【第二章·');
    expect(request.system).not.toContain('【第三章·');
  });

  it('第二章(chapterNumber=1)注入主线目标规则', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['续写。'],
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

    await engine.draft(plan, context);

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【黄金开篇】');
    expect(request.system).toContain('【第二章·主线目标】');
    expect(request.system).toContain('【第二章·首个爽点】');
    expect(request.system).toContain('【第二章·对立建立】');
    expect(request.system).toContain('【第二章·期待感】');
    expect(request.system).toContain('压制→反击→小胜');
    // 不应包含第一章或第三章的规则
    expect(request.system).not.toContain('【第一章·');
    expect(request.system).not.toContain('【第三章·');
  });

  it('第三章(chapterNumber=2)注入金手指展示规则', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['第三章。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 2,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context);

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【黄金开篇】');
    expect(request.system).toContain('【第三章·金手指展示】');
    expect(request.system).toContain('【第三章·拉仇恨】');
    expect(request.system).toContain('【第三章·信息差】');
    expect(request.system).toContain('【第三章·长线悬念】');
    expect(request.system).toContain('【第三章·钩子强度】');
    expect(request.system).toContain('必须是 strong 级');
    expect(request.system).toContain('碾压');
    // 不应包含第一章或第二章的规则
    expect(request.system).not.toContain('【第一章·');
    expect(request.system).not.toContain('【第二章·');
  });

  it('第四章及以后(chapterNumber>=3)不注入黄金三章规则', async () => {    const generate = vi.fn(async () => ({
      paragraphs: ['普通章节。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 3,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context);

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).not.toContain('【黄金开篇】');
    expect(request.system).not.toContain('【第一章·');
    expect(request.system).not.toContain('【第二章·');
    expect(request.system).not.toContain('【第三章·');
    expect(request.system).not.toContain('世界观窗口');
    expect(request.system).not.toContain('金手指展示');
  });

  it('黄金三章规则包含开篇段落密度约束', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['开篇。'],
      candidateEvents: allowed,
    }));
    const ai: StructuredAI = { generate };
    const engine = new SceneDraftEngine(ai);
    const plan: ScenePlan = {
      chapterNumber: 0,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };
    const context: ContextPack = { blocks: [], totalTokenEstimate: 0, omitted: [] };

    await engine.draft(plan, context);

      const request = generate.mock.calls[0][0] as { system: string };
      expect(request.system).toContain('【开篇段落强制短促】');
      expect(request.system).toContain('80～180');
      expect(request.system).toContain('连续叙述段≤2段');
      expect(request.system).toContain('对话占比≥35%');
    });
  });

  it('未闭合悬念清单注入【未闭合悬念承接】规则块(2026-10-01 P1.1)', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['承接正文。'],
      candidateEvents: allowed,
    }));
    const engine = new SceneDraftEngine({ generate });
    const plan: ScenePlan = {
      chapterNumber: 6,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };

    await engine.draft(
      plan,
      { blocks: [], totalTokenEstimate: 0, omitted: [] },
      {
        recentChapterCliffhangers: [
          '第5章：「窗外劲弩直射陆衡面门」',
          '第4章：「密信上的火漆印属于宫中」',
        ],
      },
    );

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).toContain('【未闭合悬念承接】');
    expect(request.system).toContain('第5章：「窗外劲弩直射陆衡面门」');
    expect(request.system).toContain('第4章：「密信上的火漆印属于宫中」');
    expect(request.system).toContain('禁止全部无视另起炉灶');
    expect(request.system).toContain('以上章正文事实为准');
  });

  it('无悬念清单时不注入空规则块', async () => {
    const generate = vi.fn(async () => ({
      paragraphs: ['正文。'],
      candidateEvents: allowed,
    }));
    const engine = new SceneDraftEngine({ generate });
    const plan: ScenePlan = {
      chapterNumber: 6,
      beats: [{ ...beat, candidateEvents: allowed }],
      prechecks: [],
    };

    await engine.draft(plan, { blocks: [], totalTokenEstimate: 0, omitted: [] });

    const request = generate.mock.calls[0][0] as { system: string };
    expect(request.system).not.toContain('【未闭合悬念承接】');
  });
