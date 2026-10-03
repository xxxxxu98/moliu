/**
 * 重复授官双端自冲突检测（2026-09-30 r16 S1-04 实证）：
 * ch34「沈淮受领工部都水司正六品主事官印」、ch49 又「特晋沈淮为工部都水司
 * 正六品主事」——大纲两端各自编码两次授予，正文照写即「已任 15 章的官再授
 * 一遍 + 称谓倒退典吏」。黄签观察项，改写归 outline 修复轮。
 */
import { describe, expect, it } from 'vitest';

import { parseExpandedOutline } from '../../parser/expanded-outline-parser';
import { inspectOutlineCompleteness } from '../../validation/outlineCompleteness';
import { buildOutlineFixture } from './outlineFixture';

function grantWarningsOf(rawText: string) {
  const outline = parseExpandedOutline(rawText);
  if (!outline) throw new Error('夹具无法解析');
  return (inspectOutlineCompleteness(outline).warnings ?? []).filter(
    warning => warning.kind === 'duplicate-title-grant'
  );
}

describe('inspectDuplicateTitleGrants（重复授官双端自冲突黄签）', () => {
  it('同一角色同品同职跨章重复授予 → 黄签带两端章号（r16 S1-04 形态）', () => {
    const raw = buildOutlineFixture({
      chapterOverrides: {
        34: { CPNs: '林川受领工部都水司正六品主事官印；仵作改口' },
        49: { CPNs: '特晋林川为工部都水司正六品主事赐绯袍银鱼袋；卷宗起获' },
      },
    });
    const warnings = grantWarningsOf(raw);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('林川');
    expect(warnings[0]?.message).toContain('正六品主事');
    expect(warnings[0]?.message).toContain('第34章');
    expect(warnings[0]?.message).toContain('第49章');
    expect(warnings[0]?.chapterNumber).toBe(49);
  });

  it('升品改授（正六品主事 → 正五品监正）是合法新官，不报警', () => {
    const raw = buildOutlineFixture({
      chapterOverrides: {
        34: { CPNs: '林川受领工部都水司正六品主事官印；仵作改口' },
        49: { CPNs: '擢升林川为都水监正五品监正赐绯袍；卷宗起获' },
      },
    });
    expect(grantWarningsOf(raw)).toHaveLength(0);
  });

  it('无授予动词的身份提及不报警（提及≠授予）', () => {
    const raw = buildOutlineFixture({
      chapterOverrides: {
        34: { CPNs: '林川受领工部都水司正六品主事官印；仵作改口' },
        40: { CPNs: '林川以都水司正六品主事身份巡河勘验；州府来人' },
      },
    });
    expect(grantWarningsOf(raw)).toHaveLength(0);
  });

  it('默认夹具零授官黄签', () => {
    expect(grantWarningsOf(buildOutlineFixture())).toHaveLength(0);
  });
});
