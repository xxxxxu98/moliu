/**
 * @vitest-environment happy-dom
 *
 * 网文排版：轻量规范化（尊重模型分段）
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeWebnovelParagraphs,
  analyzeParagraphDensity,
  buildTypesettingIssues,
  buildWritingRulesWithTypesetting,
  repairOrphanClosingQuotes,
  TYPESETTING_HARD_RULES,
  EXTREME_PARAGRAPH_CHARS,
} from '../typesetting';
import { Gate8Typesetting } from '../../gates/Gate8Typesetting';
import { createEmptyChanges } from '../../state/ChangesProtocol';
import type { GateContext } from '../../gates/types';
import type { StateSnapshot } from '../../state/types';

function makeEmptySnapshot(): StateSnapshot {
  return {
    projectId: 'test',
    chapter: 1,
    characters: {},
    characterAppearances: {},
    relationships: {},
    characterLocations: {},
    conflicts: {},
    foreshadows: {},
    plotNodes: [],
    locations: {},
    locationFeatures: {},
    factions: {},
    timeline: { currentTime: '', elapsed: '', currentChapter: 1, anchors: [] },
    worldRules: [],
    items: {},
    secrets: {},
    oaths: {},
    deadlines: {},
    createdAt: '',
    updatedAt: '',
  } as StateSnapshot;
}

describe('normalizeWebnovelParagraphs（少动刀）', () => {
  it('不主动拆没有换行的超长单段，保留模型原文结构', () => {
    const dense =
      '他走到窗前看着夜色。心里想着刚才发生的一切。觉得这一切都像是一场梦。但他知道这不是梦。他得面对现实。门外传来脚步声。有人在敲门。';
    const result = normalizeWebnovelParagraphs(dense);
    expect(result.split(/\n\s*\n/).filter(Boolean).length).toBe(1);
    expect(result).toContain('门外传来脚步声');
  });

  it('保留模型已有空行分段', () => {
    const text = '他走到窗前。\n\n窗外很黑。';
    expect(normalizeWebnovelParagraphs(text)).toBe(text);
  });

  it('把模型单换行提升为标准空行，并清理受限标点', () => {
    const text = '他看见四个字——“粮税私记”。\n“下官……下官冤枉。”';
    expect(normalizeWebnovelParagraphs(text)).toBe(
      '他看见四个字：“粮税私记”。\n\n“下官，下官冤枉。”'
    );
  });

  it('不主动合并过碎叙述', () => {
    const sparse = ['天亮了。', '鸟在叫。', '他起床洗了把脸。'].join('\n\n');
    const result = normalizeWebnovelParagraphs(sparse);
    expect(result.split(/\n\s*\n/).filter(Boolean).length).toBe(3);
  });

  it('压缩多余空行', () => {
    const text = '第一段。\n\n\n\n第二段。';
    expect(normalizeWebnovelParagraphs(text)).toBe('第一段。\n\n第二段。');
  });

  it('修补段首误置的收引号', () => {
    const qR = '\u201D';
    const broken = [`公子是想瞒天过海？`, `${qR}此言一出，满堂哗然。`];
    const repaired = repairOrphanClosingQuotes(broken);
    expect(repaired).toEqual([`公子是想瞒天过海？${qR}此言一出，满堂哗然。`]);

    const normalized = normalizeWebnovelParagraphs(broken.join('\n\n'));
    expect(normalized.startsWith(qR)).toBe(false);
    expect(normalized).toContain(`瞒天过海？${qR}`);
  });

  it('场景短拍保持原样', () => {
    const text = ['他回到屋里。', '翌日', '晨光透过窗棂。', '他沉默了。'].join('\n\n');
    expect(normalizeWebnovelParagraphs(text)).toBe(text);
  });

  it('整章 ASCII 直引号归一为中文弯引号（2026-08-26 绝症当虫治第 6 章实测形态）', () => {
    const straight = `"把枪拿开，别挡着我救人。"林舟语气平静。
"快住手！生石灰遇水放热！"老医生尖叫着阻拦。
他说完了，转身就走。`;
    const normalized = normalizeWebnovelParagraphs(straight);
    expect(normalized).toContain('\u201C把枪拿开，别挡着我救人。\u201D');
    expect(normalized).toContain('\u201C快住手！生石灰遇水放热！\u201D');
    // 叙述段不受影响
    expect(normalized).toContain('他说完了，转身就走。');
    // 归一后引号配平,门禁不再失衡
    const openCount = (normalized.match(/\u201C/gu) ?? []).length;
    const closeCount = (normalized.match(/\u201D/gu) ?? []).length;
    expect(openCount).toBe(closeCount);
  });

  it('段内对话丢闭引号时在段末补齐（免整章重写）', () => {
    const qL = '\u201C';
    const qR = '\u201D';
    const unterminated = `${qL}快住手！你这是在用杀树虫的强碱土农药活活烧穿赵总的食道和胃壁！`;
    const normalized = normalizeWebnovelParagraphs(unterminated);
    expect(normalized.endsWith(qR)).toBe(true);
    expect(normalized.startsWith(qL)).toBe(true);

    // 非对话段（不以开引号起头）不补
    const narration = '老医生吓得魂飞魄散，连滚带爬地冲上前想要抢夺药碗。';
    expect(normalizeWebnovelParagraphs(narration)).toBe(narration);
  });

  it('已有弯引号的正文不触动直引号（混合形态保守处理）', () => {
    const mixed = '\u201C他说什么？\u201D\n英文缩写 "OK" 出现在叙述里。';
    const normalized = normalizeWebnovelParagraphs(mixed);
    // 弯引号存在时直引号保持原样,不做位置推断
    expect(normalized).toContain('"OK"');
  });
});

describe('analyzeParagraphDensity / buildTypesettingIssues', () => {
  it('识别过密段落', () => {
    const wall = '甲'.repeat(EXTREME_PARAGRAPH_CHARS + 20) + '。';
    const stats = analyzeParagraphDensity(wall);
    expect(stats.extremeParagraphCount).toBe(1);
    const issues = buildTypesettingIssues(wall);
    expect(issues.some(i => i.severity === 'high')).toBe(true);
  });

  it('轻量 normalize 不改变段数', () => {
    const dense =
      '他走到窗前看着夜色。心里想着刚才发生的一切。觉得这一切都像是一场梦。但他知道这不是梦。他得面对现实。门外传来脚步声。有人在敲门。';
    const before = analyzeParagraphDensity(dense);
    const after = analyzeParagraphDensity(normalizeWebnovelParagraphs(dense));
    expect(after.paragraphCount).toBe(before.paragraphCount);
  });

  it('paragraphLengthCV：均匀中长段趋近 0，长短交错明显偏大', () => {
    // 14 段每段约 170 字（矩阵实测的 AI 腔形态）
    const uniform = Array.from({ length: 14 }, (_, i) => '字'.repeat(168 + (i % 3))).join('\n\n');
    const uniformStats = analyzeParagraphDensity(normalizeWebnovelParagraphs(uniform));
    expect(uniformStats.paragraphLengthCV).toBeLessThan(0.05);

    // 短拍与长段交错（人类网文节奏）
    const mixed = [
      '“你敢！”周砚猛地起身。',
      '长叙述段。'.repeat(40),
      '他没接话。',
      '长叙述段。'.repeat(45),
      '“按律，这个字不能签。”',
      '长叙述段。'.repeat(38),
      '灯花爆了一声。',
      '长叙述段。'.repeat(42),
      '“那就换个写法。”',
      '长叙述段。'.repeat(40),
      '他搁下笔。',
      '长叙述段。'.repeat(44),
      '“明日再来。”',
      '长叙述段。'.repeat(39),
    ].join('\n\n');
    const mixedStats = analyzeParagraphDensity(normalizeWebnovelParagraphs(mixed));
    expect(mixedStats.paragraphLengthCV).toBeGreaterThan(0.25);
  });

  it('段落均匀化（段数够、平均中长、cv 过低）报 medium 段落节奏信号', () => {
    // 2026-08-18 双 gemini 矩阵实测形态：13-18 段、均值 150-190 字、cv 0.07-0.13
    const uniform = Array.from({ length: 14 }, () => '字'.repeat(170)).join('\n\n');
    const issues = buildTypesettingIssues(uniform);
    expect(
      issues.some(i => i.severity === 'medium' && i.description.includes('段落节奏均匀化'))
    ).toBe(true);
  });

  it('长短交错的正常节奏不报均匀化', () => {
    const mixed = [
      '“你敢！”周砚猛地起身。',
      '长叙述段。'.repeat(40),
      '他没接话。',
      '长叙述段。'.repeat(45),
      '“按律，这个字不能签。”',
      '长叙述段。'.repeat(38),
      '灯花爆了一声。',
      '长叙述段。'.repeat(42),
      '“那就换个写法。”',
      '长叙述段。'.repeat(40),
      '他搁下笔。',
      '长叙述段。'.repeat(44),
      '“明日再来。”',
      '长叙述段。'.repeat(39),
    ].join('\n\n');
    const issues = buildTypesettingIssues(mixed);
    expect(issues.some(i => i.description.includes('段落节奏均匀化'))).toBe(false);
  });

  it('段数不足或平均过短时不报均匀化（碎段问题归既有检测）', () => {
    // 8 段均匀中长段：段数不够，统计无意义
    const few = Array.from({ length: 8 }, () => '字'.repeat(170)).join('\n\n');
    expect(buildTypesettingIssues(few).some(i => i.description.includes('段落节奏均匀化'))).toBe(false);

    // 14 段均匀但平均只有 60 字：碎段问题，不是均匀化节奏问题
    const shortUniform = Array.from({ length: 14 }, () => '字'.repeat(60)).join('\n\n');
    expect(
      buildTypesettingIssues(shortUniform).some(i => i.description.includes('段落节奏均匀化'))
    ).toBe(false);
  });
});

describe('buildTypesettingIssues 生产硬门禁', () => {
  it('单段超过 420 字时直接报告 high', () => {
    const issues = buildTypesettingIssues(`${'长段内容。'.repeat(90)}\n\n正常收束。`);
    expect(issues.some(issue => issue.severity === 'high' && issue.description.includes('段落过密'))).toBe(true);
  });

  it('中文对话引号未闭合时报告 high', () => {
    // 段落中段出现的开引号未闭合(非段首对话形态)由门禁报 high 触发重写;
    // 段首整段对话丢尾引号已被 normalize 层 repairUnterminatedDialogueQuotes 自动修补
    const issues = buildTypesettingIssues('他没有回答，只把账本合上，低声说：“你到底看见了什么？\n\n风把灯吹灭了。');
    expect(issues.some(issue => issue.severity === 'high' && issue.description.includes('引号未闭合'))).toBe(true);
  });

  it('连续五个碎段时报告 high', () => {
    const issues = buildTypesettingIssues(['他抬头。', '门响了。', '风停了。', '灯灭了。', '脚步近了。'].join('\n\n'));
    expect(issues.some(issue => issue.severity === 'high' && issue.description.includes('连续碎段'))).toBe(true);
  });

  it('通篇裸台词（提示语加冒号、全章无引号）报告 high', () => {
    const issues = buildTypesettingIssues(
      [
        '一个压低的嗓音凑到他耳边，带着一股子哄人的意味：陛下，太医说了，这参汤要趁热用。',
        '他忽然笑了一声，声音还带着方才的哑：都慌什么，朕说的是实情。',
        '张嬷嬷端着碗的手一僵，低声道：老奴一个奴婢，怎么敢碰陛下的御药。',
      ].join('\n\n')
    );
    expect(
      issues.some(issue => issue.severity === 'high' && issue.description.includes('对话未使用中文引号'))
    ).toBe(true);
  });

  it('整章用单弯引号写对话时升格为双引号，不再误判为裸台词', () => {
    // smoke:storyflow:real 第 1 章回归：模型整章用 ‘…’ 写对话（成对可读），
    // 旧口径按「全章无引号」阻断并整章重写，白烧一轮真实请求。
    const prose = [
      '狱卒蹲下来，脸凑到栅栏前，咧嘴笑了笑：‘赵书办，醒啦？你按个手印，咱们都省事。’',
      '赵文远没急着答话，先端起碗把那半碗水喝了，才慢慢展开那张纸。',
      '他抬头看向堂上，声音不高不低：‘大人，小人有三处疑问，想请这位老吏答一答。’',
    ].join('\n\n');

    expect(normalizeWebnovelParagraphs(prose)).toContain('“赵书办，醒啦？');
    expect(
      buildTypesettingIssues(prose).some(issue => issue.description.includes('对话未使用中文引号'))
    ).toBe(false);
  });

  it('双引号内嵌套的单引号不被升格', () => {
    const prose = '他压低声音：“顾庸只说了一句‘走’，就再没开口。”';
    expect(normalizeWebnovelParagraphs(prose)).toBe(prose);
  });

  it('正常引号对话与叙述冒号不误报', () => {
    const issues = buildTypesettingIssues(
      [
        '他把三样东西摆在案上：账页的撕口，从外头别过的门闩，还有后颈上那两处伤。',
        '“大人要把这案子按畏罪自尽销掉，得先圆这三件事。”周砚把牛皮纸推过去，语气不高。',
        '司务额上沁出一层细汗，往门口退了半步，扯出个干笑。',
      ].join('\n\n')
    );
    expect(issues.some(issue => issue.description.includes('对话未使用中文引号'))).toBe(false);
  });
});

describe('buildWritingRulesWithTypesetting', () => {
  it('始终包含排版硬约束且声明不自动拆段', () => {
    const rules = buildWritingRulesWithTypesetting(null);
    expect(rules).toContain('手机网文排版');
    expect(rules).toContain('不会替你拆段');
    expect(rules).toContain(TYPESETTING_HARD_RULES.slice(0, 20));
  });

  it('追加任务书段落', () => {
    const rules = buildWritingRulesWithTypesetting('=== 写作任务书 ===\n测试');
    expect(rules).toContain('手机网文排版');
    expect(rules).toContain('写作任务书');
  });
});

describe('Gate8Typesetting', () => {
  it('正常正文应通过', async () => {
    const prose = '他走到窗前。心里很乱。\n\n门外有脚步声。有人敲门。';
    const gate = new Gate8Typesetting();
    const ctx: GateContext = {
      chapter: 1,
      prose,
      changes: createEmptyChanges(1),
      snapshot: makeEmptySnapshot(),
    };
    const result = await gate.run(ctx, {
      maxUnknownEntities: 5,
      maxUnnamedExtras: 3,
      maxMissingBlueprintRoles: 1,
      minChapterWords: 100,
      enableSemanticGate: false,
      allowAIFlavorDegradedPass: true,
    });
    expect(result.passed).toBe(true);
  });

  it('超长无标点墙应 high 失败（靠重写反馈，不靠静默拆段）', async () => {
    const wall = '他'.repeat(EXTREME_PARAGRAPH_CHARS + 50);
    const gate = new Gate8Typesetting();
    const ctx: GateContext = {
      chapter: 1,
      prose: wall,
      changes: createEmptyChanges(1),
      snapshot: makeEmptySnapshot(),
    };
    const result = await gate.run(ctx, {
      maxUnknownEntities: 5,
      maxUnnamedExtras: 3,
      maxMissingBlueprintRoles: 1,
      minChapterWords: 100,
      enableSemanticGate: false,
      allowAIFlavorDegradedPass: true,
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.category).toBe('typesetting');
  });
});
