import { describe, expect, it, vi } from 'vitest';

import {
  CHAPTER_BLUEPRINT_BATCH_SIZE,
  compactContext,
  completeIncompleteOutline,
  extractOutlineSectionBody,
  extractRequestedChapterBlocks,
  findIncompleteChapterNumbers,
  findUnregisteredCharacterNames,
  repairChapterBlueprints,
  repairUnregisteredCharacters,
  replaceOutlineSection,
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

  it('定向补登记：追加角色块后未登记 blocker 消除', async () => {
    // 卷纲引用两个未登记角色，角色节只有主角
    const seeded = replaceOutlineSection(
      MAIN_OUTLINE_TEXT,
      ['卷纲'],
      '卷纲',
      '### 第1卷\n- 卷标题：初入县衙\n- 卷目标：洗清杀人嫌疑\n- 卷冲突：主角与县丞的权力对抗\n- 关键角色：林川；顾师爷；赵文德',
    );
    const withCharacters = replaceOutlineSection(
      seeded,
      ['关键角色规划', '关键角色'],
      '关键角色规划',
      '#### 主角\n- 姓名：林川\n- 角色定位：主角\n- 剧情功能：推动主线\n- 核心需求：洗清嫌疑\n- 与主角张力：自身\n- 最佳登场时机：第1章\n- 外显目标：升官\n- 隐性需求：回家\n- 核心创伤：蒙冤\n- 角色秘密：现代法医\n- 角色转折点：当众验尸\n- 角色弧线：蒙冤 → 立足 → 翻案\n- 角色资源：验尸术；现代知识\n- 关系变化：林川与钱县丞敌对',
    );
    const outline = parseExpandedOutline(withCharacters)!;
    const names = findUnregisteredCharacterNames(
      inspectOutlineCompleteness(outline).blockers,
    );
    expect(names).toEqual(['顾师爷', '赵文德']);

    const callStructuredTextMode = vi.fn(async (_system: string, user: string) => {
      // 清单中的姓名必须原样下发，模型按清单建档
      expect(user).toContain('顾师爷');
      expect(user).toContain('赵文德');
      return '#### 新增反派师爷\n- 姓名：顾师爷\n- 角色定位：反派\n- 剧情功能：县丞爪牙\n- 核心需求：保住靠山\n- 与主角张力：制造冤案\n- 最佳登场时机：第2章\n- 外显目标：把主角逐出县衙\n- 隐性需求：掩盖旧案\n- 核心创伤：被上司轻视\n- 角色秘密：私改卷宗\n- 角色转折点：被主角当众揭穿\n- 角色弧线：得势 → 失势 → 伏法\n- 角色资源：县丞庇护\n- 关系变化：顾师爷与林川敌对\n\n#### 新增配角\n- 姓名：赵文德\n- 角色定位：配角\n- 剧情功能：传递信息\n- 核心需求：自保\n- 与主角张力：摇摆\n- 最佳登场时机：第3章\n- 外显目标：观望\n- 隐性需求：赎罪\n- 核心创伤：曾构陷好人\n- 角色秘密：藏有真卷宗\n- 角色转折点：交出证据\n- 角色弧线：观望 → 动摇 → 反水\n- 角色资源：卷宗副本\n- 关系变化：赵文德与林川结盟';
    });

    const result = await repairUnregisteredCharacters({
      rawText: withCharacters,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode,
      names,
    });

    expect(result.outline.keyCharacters.map(c => c.name)).toEqual(
      expect.arrayContaining(['林川', '顾师爷', '赵文德']),
    );
    // 修复后不再有未登记角色 blocker
    const nextNames = findUnregisteredCharacterNames(
      inspectOutlineCompleteness(result.outline).blockers,
    );
    expect(nextNames).toEqual([]);
    expect(result.warnings.some(w => w.includes('已补登记 2/2'))).toBe(true);
  }, 30_000);

  it('空响应时不洗掉既有角色节，只记 warning', async () => {
    const withCharacters = replaceOutlineSection(
      MAIN_OUTLINE_TEXT,
      ['关键角色规划', '关键角色'],
      '关键角色规划',
      '#### 主角\n- 姓名：林川\n- 角色定位：主角',
    );
    const outline = parseExpandedOutline(withCharacters)!;

    const result = await repairUnregisteredCharacters({
      rawText: withCharacters,
      outline,
      direction: { title: '方向' } as OutlineDirection,
      options: {},
      callStructuredTextMode: async () => '',
      names: ['顾师爷'],
    });

    expect(result.rawText).toContain('姓名：林川');
    expect(result.warnings.some(w => w.includes('返回空响应'))).toBe(true);
  }, 30_000);

  it('completeIncompleteOutline 主流程接线：补全后仍有未登记角色时自动补登记', async () => {
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

