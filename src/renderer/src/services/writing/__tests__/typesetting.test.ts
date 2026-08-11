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
