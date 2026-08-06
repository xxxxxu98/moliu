import { describe, expect, it } from 'vitest';

import { dedupProse } from '../proseDedup';

describe('dedupProse 正文确定性去重', () => {
  it('空/纯空白输入返回空串', () => {
    expect(dedupProse('')).toBe('');
    expect(dedupProse('   \n\n  ')).toBe('');
  });

  it('无重复的正文原样返回（不误伤）', () => {
    const prose = '陈渡睁开眼，发现自己跪在公堂上。\n\n师爷把认罪书推到他面前。';
    expect(dedupProse(prose)).toBe(prose);
  });

  it('① 相邻段落完全相同 → 删除重复段', () => {
    const prose = ['陈渡走进军工坊。', '陈渡走进军工坊。', '老匠人都在摸鱼。'].join(
      '\n\n'
    );
    const expected = '陈渡走进军工坊。\n\n老匠人都在摸鱼。';
    expect(dedupProse(prose)).toBe(expected);
  });

  it('② 段内连续相同句 → 折叠为一句（治「签也得签」类重复）', () => {
    const prose = '师爷冷笑。师爷冷笑。师爷冷笑。他签了字。';
    expect(dedupProse(prose)).toBe('师爷冷笑。他签了字。');
  });

  it('② 段内连续重复但跨标点仍判定为同句', () => {
    const prose = '你完蛋了！你完蛋了！你完蛋了！';
    expect(dedupProse(prose)).toBe('你完蛋了！');
  });

  it('② 段末同一台词连续重复 → 折叠（治 ch1 实测「你签也得签」章末重复）', () => {
    // 模拟真实 case：正文叙述 + 章末师爷台词原样重复两次
    const prose =
      '烛影在墙上晃动。陈渡闭上眼。公堂上只剩下师爷的冷笑：你签也得签，不签也得签！你签也得签，不签也得签！';
    const result = dedupProse(prose);
    // 连续重复的台词折叠为一次
    expect(result.match(/你签也得签/g)?.length).toBe(1);
  });

  it('③ 章末段与前文中间段整段相同 → 删除章末段（首尾呼应除外）', () => {
    const prose = [
      '开场独有内容。',
      '中段：师爷拍桌，认罪书摊开。',
      '中段：师爷拍桌，认罪书摊开。',
    ].join('\n\n');
    const result = dedupProse(prose);
    const paras = result.split('\n\n');
    // 章末段==中段（非首段）→ 删除章末段；相邻段重复也删了中段的一份
    expect(paras.some(p => p.includes('开场'))).toBe(true);
    expect(paras.some(p => p.includes('中段'))).toBe(true);
    expect(paras.filter(p => p.includes('中段'))).toHaveLength(1);
  });

  it('回归保护：首尾呼应（末段==首段）不被误删', () => {
    const prose = [
      '这一夜，谁也没睡。',
      '中间发生了许多事。',
      '这一夜，谁也没睡。',
    ].join('\n\n');
    // 首尾段相同属于修辞呼应，应完整保留
    expect(dedupProse(prose)).toBe(prose);
  });

  it('回归保护：排比（间隔重复，非相邻）不被误删', () => {
    // 「他来了」间隔出现，非连续相邻，应保留排比效果
    const prose = '他来了。风停了。他来了。雨住了。他来了。';
    expect(dedupProse(prose)).toBe(prose);
  });

  it('回归保护：仅 1-2 段时不做章末去重', () => {
    const prose = '第一段。第二段。';
    expect(dedupProse(prose)).toBe(prose);
  });

  it('混合场景：相邻段重复 + 段内连续重复同时存在', () => {
    const prose = [
      '陈渡被押进来。',
      '陈渡被押进来。',
      '师爷拍桌。师爷拍桌。认罪书摊开。',
    ].join('\n\n');
    const result = dedupProse(prose);
    const paras = result.split('\n\n');
    expect(paras[0]).toBe('陈渡被押进来。');
    expect(paras[1]).toBe('师爷拍桌。认罪书摊开。');
  });
});
