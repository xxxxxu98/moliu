import { describe, expect, it, vi } from 'vitest';

import {
  CHAPTER_BLUEPRINT_BATCH_SIZE,
  compactContext,
  completeIncompleteOutline,
  extractOutlineSectionBody,
  extractRequestedChapterBlocks,
  findIncompleteChapterNumbers,
  findUnregisteredCharacterNames,
  findUnregisteredLocationNames,
  repairChapterBlueprints,
  repairUnregisteredLocations,
  replaceOutlineSection,
  sanitizeOutlineHookLengths,
  shrinkHookText,
  stripInvisibleOutlineChars,
} from '../outline-completer';
import { parseExpandedOutline } from '../../parser/expanded-outline-parser';
import type { ExecutableOutline } from '../../types/executable-outline';
import type { OutlineDirection } from '../../types/direction';
import {
  inspectOutlineCompleteness,
  OUTLINE_COMPLETENESS_POLICY,
} from '../../validation/outlineCompleteness';

describe('outline-completer', () => {
  it('替换被截断到文末的单章蓝图 section，并保留前文', () => {
    const raw = `## 故事定位\n- 书名：测试\n\n## 单章蓝图\n### 第1章\n- 标题：旧标题`;
    const next = replaceOutlineSection(
      raw,
      ['单章蓝图', '逐章蓝图'],
      '单章蓝图',
      '### 第1章\n- 标题：新标题\n\n### 第2章\n- 标题：第二章标题',
    );

    expect(next).toContain('## 故事定位');
    expect(next).not.toContain('旧标题');
    expect(next).toContain('### 第2章');
  });

  it('只提取本批要求的章节并按章号去重', () => {
    const blocks = extractRequestedChapterBlocks(
      `这里是说明\n### 第15章\n- 标题：不应接纳\n### 第16章\n- 标题：夜审账本\n- CBN：账本突然少了一页\n### 第17章\n- 标题：旧印翻案\n- CBN：旧印在灯下显出暗纹`,
      [16, 17],
    );

    expect([...blocks.keys()]).toEqual([16, 17]);
    expect(blocks.get(16)).toContain('夜审账本');
    expect(blocks.has(15)).toBe(false);
  });

  it('从完整响应中剥离 section 标题和后续 section', () => {
    const body = extractOutlineSectionBody(
      `## 关键角色规划\n#### 主角\n- 姓名：林川\n\n## 伏笔规划\n#### 短伏笔1`,
      ['关键角色规划', '关键角色'],
    );

    expect(body).toContain('姓名：林川');
    expect(body).not.toContain('伏笔规划');
  });

  it('补章上下文携带既有章节 canon，防止跨批次重启已完成剧情', () => {
    const context = compactContext(
      {
        title: '测试书',
        oneLiner: '一句话',
        premise: '前提',
        storyEngine: {} as ExecutableOutline['storyEngine'],
        volumePlan: [],
        startupPack30: {} as ExecutableOutline['startupPack30'],
        chapterBlueprints: [
          {
            orderIndex: 10,
            title: '三日终局',
            CBN: '期限最后一日当堂对质',
            CPNs: ['主角出示证据', '反派被收押'],
            CEN: '县丞被押往州府候审',
            mustCover: ['洗清冤屈'],
            forbiddenZones: ['不得让县丞恢复原职'],
          },
        ],
      } as ExecutableOutline,
      { title: '方向' } as OutlineDirection,
    );

    expect(context).toContain('"existingChapterCanon"');
    expect(context).toContain('"chapter": 10');
    expect(context).toContain('县丞被押往州府候审');
  });

  it('远离本批的既有章只留标题与 CEN，避免 canon 随批次线性膨胀', () => {
    const blueprint = (orderIndex: number) => ({
      orderIndex,
      title: `第${orderIndex}章标题`,
      CBN: `第${orderIndex}章开场动作钩子`,
      CPNs: [`第${orderIndex}章推进节点`],
      CEN: `第${orderIndex}章章尾悬念`,
      mustCover: [`第${orderIndex}章必出事件`],
      forbiddenZones: [`第${orderIndex}章禁区`],
    });
    const context = compactContext(
      {
        title: '测试书',
        oneLiner: '一句话',
        premise: '前提',
        storyEngine: {} as ExecutableOutline['storyEngine'],
        volumePlan: [],
        startupPack30: {} as ExecutableOutline['startupPack30'],
        chapterBlueprints: [blueprint(1), blueprint(38), blueprint(50)],
      } as ExecutableOutline,
      { title: '方向' } as OutlineDirection,
      [41, 42, 43],
    );

    // 邻接窗口内（38 距 41 只差 3 章）：完整字段，承接关系要能看见
    expect(context).toContain('第38章开场动作钩子');
    expect(context).toContain('第38章禁区');
    // 窗口外：只留标题与 CEN
    expect(context).toContain('第1章标题');
    expect(context).toContain('第1章章尾悬念');
    expect(context).not.toContain('第1章开场动作钩子');
    expect(context).not.toContain('第1章必出事件');
  });

  it('定点识别缺字段或占位标题的章节，不重生成其余章节', () => {
    const chapterBlueprints = Array.from({
      length: OUTLINE_COMPLETENESS_POLICY.startupChapterCount,
    }, (_, index) => ({
      orderIndex: index + 1,
      title: `第${index + 1}章 有效标题`,
      CBN: '主角从上一章悬念切入并立刻采取行动',
      CPNs: ['核验证据', '推进冲突'],
      CEN: '新证据把矛盾推向下一章',
      mustCover: ['完成本章取证'],
      forbiddenZones: ['禁止提前揭晓幕后人'],
    }));
    chapterBlueprints[15].title = '第16章';
    chapterBlueprints[16].CBN = '';

    const incomplete = findIncompleteChapterNumbers({
      chapterBlueprints,
    } as ExecutableOutline);

    expect(incomplete).toEqual([16, 17]);
  });

  it('stripInvisibleOutlineChars 清洗零宽字符且不动正文', () => {
    // 2026-08-16 冒烟：mustCover 尾部 U+200B 导致续写履约匹配失败整章重写
    const raw = '### 第3章\n- mustCover：张洞锁死地窖疑点。\u200b\n- CEN：右掌里传来声音\u200f';
    const cleaned = stripInvisibleOutlineChars(raw);
    expect(cleaned).not.toMatch(/[\u200b-\u200f\u2060\ufeff]/u);
    expect(cleaned).toContain('张洞锁死地窖疑点。');
    // 无零宽字符时原样返回（同一引用）
    const clean = '普通正文，无零宽字符。';
    expect(stripInvisibleOutlineChars(clean)).toBe(clean);
  });

  it('sanitizeOutlineHookLengths 修复 26 字 CBN 并通过门禁（2026-08-25 冒烟实测形态）', () => {
    // 反重力矩阵 relationship-burn：终态 9 章 CBN/CEN 26-27 字超长。
    // 钩子句含尾句号时 trim 不掉，26 字是真实分布形态。
    const cbn26 = '刺耳的断裂巨响在红星大剧场回荡，人群尖叫着涌向出口。';
    expect(cbn26.length).toBe(26);

    const rawWithLongHook = `${MAIN_OUTLINE_TEXT}\n## 单章蓝图\n${buildChapterBlock(1).replace(
      '- CBN：卷宗第1页突然少了一角',
      `- CBN：${cbn26}`,
    )}\n${buildChapterBlock(2)}\n`;
    const parsed = parseExpandedOutline(rawWithLongHook)!;
    const before = inspectOutlineCompleteness(parsed);
    expect(
      before.blockers.filter(blocker => blocker.kind === 'invalid-hook-length').length,
    ).toBeGreaterThan(0);

    const sanitized = sanitizeOutlineHookLengths(rawWithLongHook, parsed);
    expect(sanitized).not.toBeNull();
    const after = inspectOutlineCompleteness(sanitized!.outline);
    expect(
      after.blockers.filter(blocker => blocker.kind === 'invalid-hook-length').length,
    ).toBe(0);
  });

  it('shrinkHookText 硬截断回退不再产出「…的隐」式残句（2026-08-26 绝症当虫治实测形态）', () => {
    // 前半句无逗号、25 字内找不到分句边界时,旧实现按字数硬切,
    // 产出「低声吐露省城权贵正四处求药的隐」这类残句并污染续写开头指令。
    const longHookNoComma = '老中医凑近林舟耳边低声吐露省城权贵正四处求药的隐情与重金悬赏';
    const shrunk = shrinkHookText(longHookNoComma, 25);
    expect(shrunk.length).toBeLessThanOrEqual(25);
    // 不再以半截词收尾:收口点必须是结构助词后沿或完整词
    expect(shrunk).not.toMatch(/(?:的隐|众人眼|拂面而|大石|红木桌)$/u);

    // 有逗号时维持既有行为:切到最后一个分句边界(并补终止符——书审预检红线)
    const longHookWithComma = '老中医凑近林舟耳边，低声吐露省城权贵正四处求药的隐情';
    const shrunkComma = shrinkHookText(longHookWithComma, 25);
    expect(shrunkComma).toBe('老中医凑近林舟耳边，低声吐露省城权贵正四处求药。');
    expect(shrunkComma).not.toMatch(/(?:的隐|隐情)$/u);
    expect(shrunkComma.length).toBeLessThanOrEqual(25);
  });

  it('shrinkHookText 输出始终以终止符收尾（2026-08-27 百章书审：35章CBN无终止符形态）', () => {
    // 超上限且无终止符：截断后必须补终止符且不超限
    const overLimitNoTerminator = '沈淮安把账册拍在案上，冷冷盯着满堂官员不许任何人离开大堂';
    expect([...overLimitNoTerminator].length).toBeGreaterThan(25);
    const out1 = shrinkHookText(overLimitNoTerminator, 25);
    expect(out1).toMatch(/[。！？…]$/u);
    expect(out1.length).toBeLessThanOrEqual(25);

    // 原文已带终止符且在预算内：原样保留
    const alreadyOk = '巡检司的重枷落下，崔晋面如死灰。';
    const out2 = shrinkHookText(alreadyOk, 25);
    expect(out2).toBe(alreadyOk);

    // 带终止符但恰好超限：截断补终止符后落回预算内
    const atLimitWithTerminator = '刺耳的断裂巨响在红星大剧场回荡，人群尖叫着涌向出口。';
    expect([...atLimitWithTerminator].length).toBe(26);
    const out3 = shrinkHookText(atLimitWithTerminator, 25);
    expect(out3).toMatch(/[。！？…]$/u);
    expect(out3.length).toBeLessThanOrEqual(25);
  });
});

/** 主请求不再内联单章蓝图后的最小主方案：足够解析出合法 ExecutableOutline */
const MAIN_OUTLINE_TEXT = `# 主方案

## 故事定位
- 标题：验尸官升官记
- 一句话卖点：现代法医穿越古代查案升官

## 卷纲
### 第1卷
- 卷标题：初入县衙
- 卷目标：洗清杀人嫌疑
- 卷冲突：主角与县丞的权力对抗

## 前50章启动包
- 开篇钩子：一睁眼正趴在尸体上
- 对读者的承诺：每章都有翻案反转

### 1-5章
- 目标：建立验尸金手指与首轮冤案
- 必出事件：主角当众验出真凶
- 必留钩子：县丞连夜销毁卷宗
- 本块禁区：不能揭示主角穿越身份
- 节奏要求：快节奏
- 读者期待：看主角打脸县丞
`;

function buildChapterBlock(chapterNumber: number): string {
  return `### 第${chapterNumber}章
- 标题：夜审第${chapterNumber}宗旧案
- CBN：卷宗第${chapterNumber}页突然少了一角
- CPNs：主角复验尸格；仵作改口
- CEN：新证据把矛头指向县丞
- mustCover：完成本章复验
- 禁区：不得揭晓幕后主使
- 章尾钩子文案：这一页是谁撕的
- 爽点类型：反转`;
}

describe('repairChapterBlueprints', () => {
  it('按批补齐缺失章节，批次数与批大小一致', async () => {
    const outline = parseExpandedOutline(MAIN_OUTLINE_TEXT)!;
    const chapterNumbers = Array.from({ length: 50 }, (_, index) => index + 1);
    const callStructuredTextMode = vi.fn(async (_system: string, user: string) => {
      const requested = (user.match(/【只需补写的章号】\n([^\n]+)/u)?.[1] ?? '')
        .split('、')
        .map(Number);
      return requested.map(buildChapterBlock).join('\n\n');
    });

    const result = await repairChapterBlueprints({
      rawText: MAIN_OUTLINE_TEXT,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
      chapterNumbers,
      phase: '补全',
    });

    expect(callStructuredTextMode).toHaveBeenCalledTimes(50 / CHAPTER_BLUEPRINT_BATCH_SIZE);
    expect(result.outline.chapterBlueprints).toHaveLength(50);
    expect(result.outline.chapterBlueprints?.map(item => item.orderIndex)).toEqual(chapterNumbers);
    expect(result.warnings).toEqual([]);
  });

  it('重写已有章节时不产生重复章块', async () => {
    const seeded = replaceOutlineSection(
      MAIN_OUTLINE_TEXT,
      ['单章蓝图', '逐章蓝图'],
      '单章蓝图',
      [1, 2].map(buildChapterBlock).join('\n\n'),
    );
    const outline = parseExpandedOutline(seeded)!;

    const result = await repairChapterBlueprints({
      rawText: seeded,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode: async () => `### 第2章
- 标题：改写后的夜审旧案
- CBN：卷宗被人从中间撕走一页
- CPNs：主角复验尸格
- CEN：撕页人留下了官靴泥印
- mustCover：锁定撕页人
- 禁区：不得揭晓幕后主使
- 章尾钩子文案：泥印是谁留下的
- 爽点类型：解谜`,
      chapterNumbers: [2],
      phase: '定点修复',
    });

    const blueprints = result.outline.chapterBlueprints ?? [];
    expect(blueprints.map(item => item.orderIndex)).toEqual([1, 2]);
    expect(blueprints[1].title).toBe('改写后的夜审旧案');
    expect(result.rawText.match(/^### 第2章$/gmu)).toHaveLength(1);
  });

  it('把本章具体违规写进提示词，仅告知字数区间不足以让模型压缩超长钩子', async () => {
    const seeded = replaceOutlineSection(
      MAIN_OUTLINE_TEXT,
      ['单章蓝图', '逐章蓝图'],
      '单章蓝图',
      [1, 2].map(buildChapterBlock).join('\n\n'),
    );
    const outline = parseExpandedOutline(seeded)!;
    let capturedUser = '';

    await repairChapterBlueprints({
      rawText: seeded,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode: async (_system: string, user: string) => {
        capturedUser = user;
        return buildChapterBlock(2);
      },
      chapterNumbers: [2],
      phase: '定点修复',
      issuesByChapter: new Map([[2, ['第2章 CBN 长度 28 字，必须为 8～25 字']]]),
    });

    expect(capturedUser).toContain('本次必须修掉的格式违规');
    expect(capturedUser).toContain('第2章 CBN 长度 28 字，必须为 8～25 字');
  });

  it('初版蓝图批次合入时对未到期伏笔做词面消毒 + 提示词带时序禁令（glm ch20 死锁形态）', async () => {
    // 2026-09-10 受害样本：初版第 20 章蓝图 mustCover「笔迹比对定性补账出自行家
    // 手笔」vs 伏笔台账 setupChapter=22——蓝图层无词面拦截，写作端三连拒成洞。
    const outline = parseExpandedOutline(MAIN_OUTLINE_TEXT)!;
    outline.foreshadowPlan = [
      {
        id: 'f-deadlock',
        hint: '青阳亏空是被行家手笔补平的，补账笔法规整带着一整套暗记，与官面账房的野路子完全两样',
        type: 'ability',
        importance: 'main',
        setupPhase: '',
        payoffPhase: '',
        setupChapter: 10,
        payoffChapter: 20,
        carrierCharacter: '',
        linkedConflict: '',
        payoffValue: '',
      },
    ];
    let capturedUser = '';

    const result = await repairChapterBlueprints({
      rawText: MAIN_OUTLINE_TEXT,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode: async (_system: string, user: string) => {
        capturedUser = user;
        return `### 第2章
- 标题：灯下比对笔迹
- 概要：沈砚把补账与改笔并排比对，从墨点暗记里看出端倪，锁定补账出自行家手笔
- CBN：灯下两页账并排摊开
- CPNs：比对补账与改笔的笔法；从墨点暗记辨出成套手法
- CEN：这手字不是县衙养得起的
- mustCover：笔迹比对定性补账出自行家手笔
- 禁区：不得直接点出补账人姓名
- 章尾钩子文案：这手字到底是谁教的
- 爽点类型：解谜`;
      },
      chapterNumbers: [2],
      phase: '补全',
    });

    // prompt 层：未到期伏笔进入时序禁令清单
    expect(capturedUser).toContain('本批伏笔时序禁令');
    expect(capturedUser).toContain('埋设第10章');
    // 产物层：冲突条目被词面消毒剥掉，warning 留痕
    expect(result.warnings.join('\n')).toContain('伏笔时序消毒');
    const bp = result.outline.chapterBlueprints?.find(item => item.orderIndex === 2);
    expect(bp?.mustCover.join('\n') + (bp?.CPNs ?? []).join('\n')).not.toContain('行家手笔');
  });

  // 矩阵实测（minimax-m3/glm 网关）：蓝图批次请求「成功」但返回 0 字——无错误事件、
  // 不进任何重试链，这批章永远缺失 → fail-closed。现在空响应批次按瞬态退避重试。
  it('批次返回空响应时退避重试，重试成功后照常拼装', async () => {
    const outline = parseExpandedOutline(MAIN_OUTLINE_TEXT)!;
    const callStructuredTextMode = vi.fn(async () => {
      const calls = callStructuredTextMode.mock.calls.length;
      // 首次空响应（模拟网关抖动），第二次正常返回
      if (calls <= 1) return '';
      return [1].map(buildChapterBlock).join('\n\n');
    });

    const result = await repairChapterBlueprints({
      rawText: MAIN_OUTLINE_TEXT,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
      chapterNumbers: [1],
      phase: '补全',
    });

    // 空了一次 → 重试一次 → 共 2 次调用
    expect(callStructuredTextMode).toHaveBeenCalledTimes(2);
    // 重试成功后蓝图照常补上
    expect(result.outline.chapterBlueprints?.map(item => item.orderIndex)).toEqual([1]);
    // 记录了空响应重试的 warning
    expect(result.warnings.some(w => w.includes('返回空响应'))).toBe(true);
  }, 30_000);

  it('批次连续空响应重试耗尽后不再硬重试，只记 warning（不硬造内容）', async () => {
    const outline = parseExpandedOutline(MAIN_OUTLINE_TEXT)!;
    const callStructuredTextMode = vi.fn(async () => '');

    const result = await repairChapterBlueprints({
      rawText: MAIN_OUTLINE_TEXT,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
      chapterNumbers: [1],
      phase: '补全',
    });

    // 3 次尝试（1 次原始 + 2 次重试）后放弃，不无限重试
    expect(callStructuredTextMode).toHaveBeenCalledTimes(3);
    expect(result.warnings.some(w => w.includes('返回空响应'))).toBe(true);
    // 「补全」阶段空响应批次只记缺章 warning，不触发小批补发（补发只留给定点修复轮）
    expect(
      result.warnings.some(w => w.includes('仍有 1/1 章未解出')),
    ).toBe(true);
  }, 30_000);

  // 真实请求层的空响应是抛错（unified-generator「API 未返回内容」），不是返回空串；
  // 分类器已把它归为瞬态，但 completer 批次层必须吞掉这种异常形态继续拼装，
  // 否则外层整体重试会废掉本批之前已成功的所有批次。
  it('批次请求抛「API 未返回内容」时退避重试，重试成功后照常拼装', async () => {
    const outline = parseExpandedOutline(MAIN_OUTLINE_TEXT)!;
    const callStructuredTextMode = vi.fn(async () => {
      if (callStructuredTextMode.mock.calls.length <= 2) {
        throw new Error('API 未返回内容');
      }
      return [1].map(buildChapterBlock).join('\n\n');
    });

    const result = await repairChapterBlueprints({
      rawText: MAIN_OUTLINE_TEXT,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
      chapterNumbers: [1],
      phase: '补全',
    });

    expect(callStructuredTextMode).toHaveBeenCalledTimes(3);
    expect(result.outline.chapterBlueprints?.map(item => item.orderIndex)).toEqual([1]);
    expect(result.warnings.some(w => w.includes('瞬态失败'))).toBe(true);
  }, 30_000);

  it('批次抛非空响应错误时原样上抛，不吞异常', async () => {
    const outline = parseExpandedOutline(MAIN_OUTLINE_TEXT)!;
    const callStructuredTextMode = vi.fn(async () => {
      throw new Error('大纲输出被长度上限截断：正文 82 字、推理 9599 字');
    });

    await expect(repairChapterBlueprints({
      rawText: MAIN_OUTLINE_TEXT,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
      chapterNumbers: [1],
      phase: '补全',
    })).rejects.toThrow('长度上限截断');
    expect(callStructuredTextMode).toHaveBeenCalledTimes(1);
  }, 30_000);

  // 2026-08-18 opencode 矩阵实测：并发池里批1 成功（227s 完整 10 章块），批2 瞬态重试
  // 耗尽上抛 → Promise.all 一拒全弃，已成功批次成果被整体丢弃，expandDirection 返回
  // null、角色/伏笔补齐全部没机会跑。现在失败批只记 warning，缺章交给定点修复轮。
  it('并发批次部分重试耗尽时保留成功批次成果，不整体作废', async () => {
    const outline = parseExpandedOutline(MAIN_OUTLINE_TEXT)!;
    const chapterNumbers = Array.from(
      { length: CHAPTER_BLUEPRINT_BATCH_SIZE * 2 },
      (_, index) => index + 1,
    );
    const callStructuredTextMode = vi.fn(async (_system: string, user: string) => {
      const requested = (user.match(/【只需补写的章号】\n([^\n]+)/u)?.[1] ?? '')
        .split('、')
        .map(Number);
      if (requested[0] > CHAPTER_BLUEPRINT_BATCH_SIZE) {
        throw new Error('大纲流式响应提前中断：已收到 0 字，未见结束标记');
      }
      return requested.map(buildChapterBlock).join('\n\n');
    });

    const result = await repairChapterBlueprints({
      rawText: MAIN_OUTLINE_TEXT,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
      chapterNumbers,
      phase: '补全',
    });

    // 第 1 批（1-10 章）成果保留，第 2 批（11-20 章）只记 warning
    expect(result.outline.chapterBlueprints?.map(item => item.orderIndex))
      .toEqual(Array.from({ length: CHAPTER_BLUEPRINT_BATCH_SIZE }, (_, index) => index + 1));
    expect(result.warnings.some(w => w.includes('重试耗尽仍失败'))).toBe(true);
    expect(result.warnings.some(w => w.includes('仍有 10/10 章未解出'))).toBe(true);
  }, 60_000);

  it('并发批次全部重试耗尽时仍上抛，触发外层整体重试', async () => {
    const outline = parseExpandedOutline(MAIN_OUTLINE_TEXT)!;
    const chapterNumbers = Array.from(
      { length: CHAPTER_BLUEPRINT_BATCH_SIZE * 2 },
      (_, index) => index + 1,
    );
    const callStructuredTextMode = vi.fn(async () => {
      throw new Error('大纲流式响应提前中断：已收到 0 字，未见结束标记');
    });

    await expect(repairChapterBlueprints({
      rawText: MAIN_OUTLINE_TEXT,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
      chapterNumbers,
      phase: '补全',
    })).rejects.toThrow('流式响应提前中断');
    // 每批 1 次原始 + 2 次重试，共 2 批
    expect(callStructuredTextMode).toHaveBeenCalledTimes(6);
  }, 60_000);

  it('串行批次部分重试耗尽时同样保留成功批次成果', async () => {
    process.env.MOLIU_OUTLINE_BATCH_CONCURRENCY = '1';
    try {
      const outline = parseExpandedOutline(MAIN_OUTLINE_TEXT)!;
      const chapterNumbers = Array.from(
        { length: CHAPTER_BLUEPRINT_BATCH_SIZE * 2 },
        (_, index) => index + 1,
      );
      const callStructuredTextMode = vi.fn(async (_system: string, user: string) => {
        const requested = (user.match(/【只需补写的章号】\n([^\n]+)/u)?.[1] ?? '')
          .split('、')
          .map(Number);
        if (requested[0] > CHAPTER_BLUEPRINT_BATCH_SIZE) {
          throw new Error('read ECONNRESET');
        }
        return requested.map(buildChapterBlock).join('\n\n');
      });

      const result = await repairChapterBlueprints({
        rawText: MAIN_OUTLINE_TEXT,
        outline,
        direction: { title: '方向' } as OutlineDirection,
        options: {},
        callStructuredTextMode,
        chapterNumbers,
        phase: '补全',
      });

      expect(result.outline.chapterBlueprints?.map(item => item.orderIndex))
        .toEqual(Array.from({ length: CHAPTER_BLUEPRINT_BATCH_SIZE }, (_, index) => index + 1));
      expect(result.warnings.some(w => w.includes('重试耗尽仍失败'))).toBe(true);
    } finally {
      delete process.env.MOLIU_OUTLINE_BATCH_CONCURRENCY;
    }
  }, 60_000);
});

describe('completeIncompleteOutline 空响应防护', () => {
  // 主方案已带可用蓝图与足量角色/伏笔时才便于隔离测「补全请求空响应」的影响面；
  // 这里构造只缺角色的输入：蓝图批次不需要跑（1-50 章全可用），角色补全必然触发。
  const buildCompleteOutlineText = (): string => {
    const chapters = Array.from(
      { length: OUTLINE_COMPLETENESS_POLICY.startupChapterCount },
      (_, index) => buildChapterBlock(index + 1),
    ).join('\n\n');
    return replaceOutlineSection(
      MAIN_OUTLINE_TEXT,
      ['单章蓝图', '逐章蓝图'],
      '单章蓝图',
      chapters,
    );
  };

  it('角色补全连续空响应时不把已有节洗成空节，只记 warning', async () => {
    const seeded = buildCompleteOutlineText();
    // 预置已有角色节内容，验证空响应不会把它替换掉
    const seededWithCharacters = replaceOutlineSection(
      seeded,
      ['关键角色规划', '关键角色'],
      '关键角色规划',
      '#### 主角\n- 姓名：林川\n- 角色定位：主角',
    );
    const outlineWithCharacters = parseExpandedOutline(seededWithCharacters)!;
    expect(outlineWithCharacters.keyCharacters.length).toBeGreaterThan(0);

    const callStructuredTextMode = vi.fn(async () => {
      throw new Error('API 未返回内容');
    });

    const result = await completeIncompleteOutline({
      rawText: seededWithCharacters,
      outline: outlineWithCharacters,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
    });

    // 已有角色节原样保留（没被空节洗掉）
    expect(result.rawText).toContain('姓名：林川');
    expect(result.outline.keyCharacters.length).toBe(outlineWithCharacters.keyCharacters.length);
    expect(result.warnings.some(w => w.includes('空响应'))).toBe(true);
    // 角色(2)+角色补量(2)+伏笔(2)+伏笔补量(2)：每处空响应重试 2 次耗尽后即跳过，
    // 不得进入无限补量循环
    expect(callStructuredTextMode.mock.calls.length).toBeLessThanOrEqual(8);
  }, 60_000);
});

describe('未登记角色修复通道', () => {
  const blockerMsg = (name: string) =>
    `第1卷关键角色引用了未登记角色「${name}」；必须补入关键角色规划或改用已登记角色`;

  it('从门禁 blockers 提取未登记角色名并按出现顺序去重', () => {
    const names = findUnregisteredCharacterNames([
      { kind: 'unknown-character-reference', message: blockerMsg('顾师爷') },
      { kind: 'unknown-character-reference', message: blockerMsg('赵文德') },
      { kind: 'unknown-character-reference', message: blockerMsg('顾师爷') },
      { kind: 'protagonist-name-mismatch', message: '核心驱动中的主角「沈砚」未进入关键角色规划，角色真源不一致' },
      { kind: 'invalid-hook-length', message: '第3章 CBN 超长', chapterNumber: 3 },
    ] as never[]);

    expect(names).toEqual(['顾师爷', '赵文德', '沈砚']);
  });

  it('completeIncompleteOutline 角色补全响应含卷纲引用姓名时，出口无未登记 blocker（语义补登记归 agent）', async () => {
    const chapters = Array.from(
      { length: OUTLINE_COMPLETENESS_POLICY.startupChapterCount },
      (_, index) => buildChapterBlock(index + 1),
    ).join('\n\n');
    const seeded = replaceOutlineSection(
      MAIN_OUTLINE_TEXT,
      ['单章蓝图', '逐章蓝图'],
      '单章蓝图',
      chapters,
    );
    // 卷纲引用未登记角色，角色节为空（数量不足 + 未登记双缺口）
    const withVolume = replaceOutlineSection(
      seeded,
      ['卷纲'],
      '卷纲',
      '### 第1卷\n- 卷标题：初入县衙\n- 卷目标：洗清杀人嫌疑\n- 卷冲突：主角与县丞的权力对抗\n- 关键角色：林川；顾师爷',
    );
    const outline = parseExpandedOutline(withVolume)!;

    // 角色补全整体替换节：包含卷纲引用的顾师爷（源头约束生效的形态）
    const callStructuredTextMode = vi.fn(async () =>
      '#### 主角\n- 姓名：林川\n- 角色定位：主角\n#### 盟友一\n- 姓名：周仵作\n- 角色定位：盟友\n#### 盟友二\n- 姓名：孙捕头\n- 角色定位：盟友\n#### 反派一\n- 姓名：钱县丞\n- 角色定位：反派\n#### 反派二\n- 姓名：顾师爷\n- 角色定位：反派\n#### 反派三\n- 姓名：李主簿\n- 角色定位：反派\n#### 导师\n- 姓名：王神医\n- 角色定位：导师\n#### 配角一\n- 姓名：赵掌柜\n- 角色定位：配角\n#### 配角二\n- 姓名：吴铁匠\n- 角色定位：配角\n#### 配角三\n- 姓名：郑书吏\n- 角色定位：配角');

    const result = await completeIncompleteOutline({
      rawText: withVolume,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
    });

    expect(
      result.outline.keyCharacters.map(c => c.name),
    ).toEqual(expect.arrayContaining(['顾师爷']));
    const names = findUnregisteredCharacterNames(
      inspectOutlineCompleteness(result.outline).blockers,
    );
    expect(names).toEqual([]);
  }, 60_000);
});

describe('repairUnregisteredLocations', () => {
  const WORLD_OUTLINE_TEXT = `# 主方案

## 世界与势力规划
### 核心地点
#### 江城市
- 名称：江城市
- 层级：city
- 剧情功能：主线舞台
#### 清河县
- 名称：清河县
- 层级：district
- 剧情功能：第一卷案发地
#### 汉东省
- 名称：汉东省
- 层级：province
- 剧情功能：行政区背景

### 关键势力
#### 市局
- 名称：市局
- 势力定位：执法
- 核心目标：破案
`;

  function makeOutlineWithVolumeRef(rawText: string, refText: string): {
    rawText: string;
    outline: ExecutableOutline;
  } {
    const withVolume = replaceOutlineSection(
      rawText,
      ['卷纲'],
      '卷纲',
      `### 第1卷\n- 卷标题：初入县衙\n- 卷目标：${refText}\n- 卷冲突：对抗`
    );
    return { rawText: withVolume, outline: parseExpandedOutline(withVolume)! };
  }

  function locationHits(outline: ExecutableOutline) {
    // 2026-08-28 降级：地点命中在 warnings（非阻断），补登记通道合并读取
    const report = inspectOutlineCompleteness(outline);
    return [...report.blockers, ...(report.warnings ?? [])].filter(
      blocker => blocker.kind === 'unknown-location-reference'
    );
  }

  it('从 blockers+warnings 提取未登记地点名', () => {
    const { outline } = makeOutlineWithVolumeRef(
      WORLD_OUTLINE_TEXT,
      '主角在南江市揭开真相'
    );
    expect(findUnregisteredLocationNames(locationHits(outline))).toEqual(['南江市']);
  });

  it('把未登记地点补进核心地点子段，命中消除', () => {
    const { rawText, outline } = makeOutlineWithVolumeRef(
      WORLD_OUTLINE_TEXT,
      '主角在南江市揭开真相'
    );
    const before = locationHits(outline);
    expect(before.length).toBeGreaterThan(0);

    const result = repairUnregisteredLocations({
      rawText,
      outline,
      locationNames: findUnregisteredLocationNames(locationHits(outline)),
    });

    const after = locationHits(result.outline);
    expect(after).toEqual([]);
    // 补登记条目可被 parser 识别为 location
    expect(
      (result.outline.worldBuilding?.locations ?? []).map(location => location.name)
    ).toEqual(expect.arrayContaining(['江城市', '南江市']));
    expect(result.warnings.join(' ')).toContain('已补登记');
  });

  it('缺核心地点子段时跳过并警告（不破坏原稿）', () => {
    const noWorldText = `# 主方案\n\n## 卷纲\n### 第1卷\n- 卷标题：卷一\n- 卷目标：主角在南江市行动\n- 卷冲突：对抗`;
    const outline = parseExpandedOutline(noWorldText)!;
    const result = repairUnregisteredLocations({
      rawText: noWorldText,
      outline,
      locationNames: ['南江市'],
    });
    expect(result.rawText).toBe(noWorldText);
    expect(result.warnings.join(' ')).toContain('无法补登记');
  });
});

