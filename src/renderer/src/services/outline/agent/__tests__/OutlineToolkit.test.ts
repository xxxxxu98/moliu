/**
 * OutlineToolkit 单测：暂存写 + 解析校验 + run_checks 账本 + finish 前置条件 + 未复检回退。
 */
import { describe, expect, it } from 'vitest';

import { parseExpandedOutline } from '../../parser/expanded-outline-parser';
import { inspectOutlineCompleteness } from '../../validation/outlineCompleteness';
import { OutlineToolkit } from '../OutlineToolkit';
import { buildCharacterBlock, buildOutlineFixture } from './outlineFixture';

function makeToolkit(rawText: string, maxChecks = 5): OutlineToolkit {
  const outline = parseExpandedOutline(rawText);
  if (!outline) throw new Error('夹具无法解析');
  return new OutlineToolkit({ rawText, outline, maxChecks });
}

async function ok(toolkit: OutlineToolkit, tool: string, args: unknown = {}): Promise<Record<string, unknown>> {
  const result = await toolkit.call(tool, args);
  if (!result.ok) throw new Error(`${tool} 失败:${result.error}`);
  return result.result as Record<string, unknown>;
}

async function fail(toolkit: OutlineToolkit, tool: string, args: unknown = {}): Promise<string> {
  const result = await toolkit.call(tool, args);
  if (result.ok) throw new Error(`${tool} 预期失败却成功`);
  return result.error;
}

describe('夹具', () => {
  it('默认夹具通过完整性门禁', () => {
    const outline = parseExpandedOutline(buildOutlineFixture());
    expect(outline).not.toBeNull();
    expect(inspectOutlineCompleteness(outline!).canApply).toBe(true);
    expect(outline!.keyCharacters).toHaveLength(10);
    expect(outline!.chapterBlueprints).toHaveLength(50);
  });
});

describe('读工具', () => {
  it('get_overview 返回规模/角色/地点/伏笔与计数', async () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    const overview = await ok(toolkit, 'get_overview');
    expect(overview.protagonist).toBe('林川');
    expect(overview.characters).toHaveLength(10);
    expect(overview.locations).toEqual(['青阳县衙']);
    expect((overview.counts as Record<string, number>).blueprints).toBe(50);
  });

  it('get_chapters 限制单次 10 章并报告缺章', async () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    const page = await ok(toolkit, 'get_chapters', { from: 3, to: 5 });
    expect((page.chapters as unknown[]).length).toBe(3);
    expect((page.chapters as Array<{ chapterNumber: number }>)[0].chapterNumber).toBe(3);
    expect(await fail(toolkit, 'get_chapters', { from: 1, to: 20 })).toContain('最多读 10 章');
  });

  it('get_section 返回正文与模板；蓝图段拒读', async () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    const section = await ok(toolkit, 'get_section', { name: '关键角色规划' });
    expect(section.body as string).toContain('姓名：林川');
    expect(section.template as string).toContain('## 关键角色规划');
    expect(await fail(toolkit, 'get_section', { name: '单章蓝图' })).toContain('get_chapters');
    expect(await fail(toolkit, 'get_section', { name: '不存在的段' })).toContain('未知段名');
  });
});

describe('rewrite_chapters', () => {
  it('格式校验按门禁阈值拒绝整批，暂存稿不变', async () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    const error = await fail(toolkit, 'rewrite_chapters', {
      chapters: [
        { chapterNumber: 3, CBN: '这一句开场钩子明显超过了二十五个字的门禁上限还在继续写下去。' },
        { chapterNumber: 4, CPNs: ['一', '二', '三', '四'] },
      ],
    });
    expect(error).toContain('第 3 章');
    expect(error).toContain('CBN');
    expect(error).toContain('第 4 章');
    expect(error).toContain('CPNs 4 条');
    expect(toolkit.staged.revision()).toBe(1);
  });

  it('只给部分字段时沿用原稿，写入后重解析并保留其余章', async () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    const result = await ok(toolkit, 'rewrite_chapters', {
      chapters: [{ chapterNumber: 3, title: '灯下复验尸格', CBN: '尸格上的墨迹还没干透。' }],
    });
    expect(result.revision).toBe(2);
    const outline = toolkit.staged.get()!.outline;
    const chapter3 = outline.chapterBlueprints!.find(item => item.orderIndex === 3)!;
    expect(chapter3.title).toBe('灯下复验尸格');
    expect(chapter3.CBN).toBe('尸格上的墨迹还没干透。');
    expect(chapter3.CPNs).toEqual(['主角复验尸格', '仵作改口']);
    expect(outline.chapterBlueprints).toHaveLength(50);
    expect(toolkit.staged.isVerified()).toBe(false);
  });

  it('超出启动包范围与缺字段新章都被拒绝', async () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    expect(await fail(toolkit, 'rewrite_chapters', { chapters: [{ chapterNumber: 51, title: '越界章节标题' }] })).toContain(
      '超出启动包范围'
    );
    // 第 7 章存在于夹具；改成引用一个不存在章号需要给全字段
    const raw = buildOutlineFixture().replace(/### 第7章[\s\S]*?(?=### 第8章)/u, '');
    const partial = makeToolkit(raw);
    expect(await fail(partial, 'rewrite_chapters', { chapters: [{ chapterNumber: 7, title: '缺字段的新章' }] })).toContain(
      '缺字段'
    );
  });
});

describe('段级写工具', () => {
  it('replace_section 改开篇钩子后解析同步；蓝图段禁止整段替换', async () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    const section = await ok(toolkit, 'get_section', { name: '前50章启动包' });
    const body = (section.body as string).replace('一睁眼正趴在尸体上', '尸体的手指动了一下');
    await ok(toolkit, 'replace_section', { name: '## 前50章启动包', body: `## 前50章启动包\n${body}` });
    expect(toolkit.staged.get()!.outline.startupPack30.openingHook).toBe('尸体的手指动了一下');
    expect(toolkit.staged.get()!.outline.startupPack30.chapterBlocks).toHaveLength(1);
    expect(await fail(toolkit, 'replace_section', { name: '单章蓝图', body: 'x' })).toContain('rewrite_chapters');
  });

  it('replace_section 把结构段替换成解析为空的内容时拒绝', async () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    const error = await fail(toolkit, 'replace_section', {
      name: '关键角色规划',
      body: '这里没有任何符合模板的角色块',
    });
    expect(error).toContain('解析为 0 条');
    expect(toolkit.staged.get()!.outline.keyCharacters).toHaveLength(10);
  });

  it('append_to_section 追加角色块后计数增长；不可解析块被拒绝', async () => {
    const toolkit = makeToolkit(buildOutlineFixture({ extraVolumeCharacters: ['陈药师'] }));
    const initial = toolkit.recordCheck();
    expect(initial.completeness.blockers.some(item => item.kind === 'unknown-character-reference')).toBe(true);

    expect(await fail(toolkit, 'append_to_section', { name: '关键角色规划', body: '陈药师是个好人' })).toContain(
      '没有解析出任何新条目'
    );
    const result = await ok(toolkit, 'append_to_section', {
      name: '关键角色规划',
      body: buildCharacterBlock('陈药师', '盟友', 11),
    });
    expect((result.structureDelta as Record<string, string>).characters).toBe('10→11');
    const recheck = toolkit.recordCheck();
    expect(recheck.completeness.blockers.filter(item => item.kind === 'unknown-character-reference')).toEqual([]);
  });

  it('register_locations 确定性登记地点', async () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    const result = await ok(toolkit, 'register_locations', { names: ['江州府衙'] });
    expect((result.structureDelta as Record<string, string>).locations).toBe('1→2');
    expect(toolkit.staged.get()!.outline.worldBuilding!.locations.map(item => item.name)).toContain('江州府衙');
  });

  it('shrink_hooks 本地收缩超长 CBN', async () => {
    const toolkit = makeToolkit(
      buildOutlineFixture({
        chapterOverrides: { 5: { CBN: '县丞派来的差役在天亮之前，把整间验尸房翻了个底朝天。' } },
      })
    );
    expect(toolkit.recordCheck().completeness.blockers.some(item => item.kind === 'invalid-hook-length')).toBe(true);
    const result = await ok(toolkit, 'shrink_hooks');
    expect(result.revision).toBe(2);
    const chapter5 = toolkit.staged.get()!.outline.chapterBlueprints!.find(item => item.orderIndex === 5)!;
    expect([...chapter5.CBN].length).toBeLessThanOrEqual(25);
    const noop = await ok(toolkit, 'shrink_hooks');
    expect(noop.changed).toBe(0);
  });
});

describe('resolve_character_references（agent 语义裁决台账）', () => {
  // 2026-09-03 语义正则塔退役:头衔/爵位/群体代称不再本地豁免,未裁决即 blocker
  it('未裁决的爵位/群体引用产生 blocker；批量 alias/collective 裁决后 run_checks 清零', async () => {
    const toolkit = makeToolkit(
      buildOutlineFixture({ extraVolumeCharacters: ['齐王', '两江河道官员'] })
    );
    const before = await ok(toolkit, 'run_checks');
    const unknownBefore = (before.blockers as Array<{ kind: string; message: string }>).filter(
      item => item.kind === 'unknown-character-reference'
    );
    expect(unknownBefore).toHaveLength(2);

    await ok(toolkit, 'resolve_character_references', {
      items: [
        { reference: '齐王', as: 'alias', target: '林川' },
        { reference: '两江河道官员', as: 'collective' },
      ],
    });
    const after = await ok(toolkit, 'run_checks');
    expect(after.blocking).toBe(0);
    expect(after.canApply).toBe(true);
  });

  it('alias 指向登记表外姓名整批拒绝，台账未写入', async () => {
    const toolkit = makeToolkit(buildOutlineFixture({ extraVolumeCharacters: ['晋王'] }));
    const error = await fail(toolkit, 'resolve_character_references', {
      items: [
        { reference: '晋王', as: 'alias', target: '不存在的名字' },
        { reference: '太后', as: 'collective' },
      ],
    });
    expect(error).toContain('不在已登记角色名单内');
    expect(toolkit.staged.revision()).toBe(1);
    expect(toolkit.staged.get()!.outline.characterReferenceResolutions).toBeUndefined();
  });

  it('裁决台账在后续重解析写入后保留，不被冲掉', async () => {
    const toolkit = makeToolkit(buildOutlineFixture({ extraVolumeCharacters: ['太后'] }));
    await ok(toolkit, 'resolve_character_references', {
      items: [{ reference: '太后', as: 'alias', target: '林川' }],
    });
    // 再做一次普通文本写入(触发整份 rawText 重解析)
    await ok(toolkit, 'rewrite_chapters', { chapters: [{ chapterNumber: 3, title: '灯下复验尸格' }] });
    const outline = toolkit.staged.get()!.outline;
    expect(outline.characterReferenceResolutions).toEqual([
      { reference: '太后', as: 'alias', target: '林川' },
    ]);
    const check = await ok(toolkit, 'run_checks');
    expect(check.blocking).toBe(0);
  });
});

describe('run_checks / guardFinish / resolveFinal', () => {
  it('初稿有阻断:finish 被拒;修复并复检后放行', async () => {
    const toolkit = makeToolkit(
      buildOutlineFixture({ chapterOverrides: { 9: { title: '第9章' } } }),
      3
    );
    toolkit.recordCheck();
    expect(toolkit.guardFinish()).toContain('未通过门禁');

    await ok(toolkit, 'rewrite_chapters', { chapters: [{ chapterNumber: 9, title: '夜审第九宗旧案' }] });
    expect(toolkit.guardFinish()).toContain('尚未 run_checks');

    const check = await ok(toolkit, 'run_checks');
    expect(check.blocking).toBe(0);
    expect(check.canApply).toBe(true);
    expect(check.checksRemaining).toBe(2);
    expect(toolkit.guardFinish()).toBeNull();
    expect(await fail(toolkit, 'run_checks')).toContain('无需重复');
  });

  it('run_checks 返回 blockers 分组提示（未登记角色/地点、涉及章号）', async () => {
    const toolkit = makeToolkit(
      buildOutlineFixture({
        extraVolumeCharacters: ['陈药师'],
        chapterOverrides: { 12: { title: '第12章' } },
      })
    );
    const check = await ok(toolkit, 'run_checks');
    const hints = check.hints as { chaptersWithBlockers: number[]; unregisteredCharacters: string[] };
    expect(hints.unregisteredCharacters).toEqual(['陈药师']);
    expect(hints.chaptersWithBlockers).toContain(12);
    expect(check.blocking as number).toBeGreaterThan(0);
  });

  it('预算用尽:run_checks 拒绝且 guardFinish 放行', async () => {
    const toolkit = makeToolkit(buildOutlineFixture({ chapterOverrides: { 2: { title: '第2章' } } }), 1);
    await ok(toolkit, 'run_checks');
    await ok(toolkit, 'rewrite_chapters', { chapters: [{ chapterNumber: 2, title: '夜审第二宗旧案' }] });
    expect(await fail(toolkit, 'run_checks')).toContain('预算已用尽');
    expect(toolkit.guardFinish()).toBeNull();
  });

  it('resolveFinal 只采用最后一次校验过的 revision，未复检改动回退', async () => {
    const toolkit = makeToolkit(buildOutlineFixture({ chapterOverrides: { 2: { title: '第2章' } } }));
    const initial = toolkit.recordCheck();
    await ok(toolkit, 'rewrite_chapters', { chapters: [{ chapterNumber: 2, title: '夜审第二宗旧案' }] });
    const final = toolkit.resolveFinal();
    expect(final.revertedUnchecked).toBe(true);
    expect(final.revision).toBe(initial.revision);
    expect(final.snapshot.outline.chapterBlueprints!.find(item => item.orderIndex === 2)!.title).toBe('第2章');
  });

  it('一次都没校验时 resolveFinal 自动补跑确定性检查', () => {
    const toolkit = makeToolkit(buildOutlineFixture());
    const final = toolkit.resolveFinal();
    expect(final.completeness.canApply).toBe(true);
    expect(final.revertedUnchecked).toBe(false);
  });
});
