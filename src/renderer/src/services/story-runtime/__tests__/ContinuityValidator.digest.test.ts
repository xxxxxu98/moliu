import { describe, expect, it } from 'vitest';

import { dropStaleCustodyForDigest } from '../ContinuityValidator';

describe('stateDigest 押地残留兜底（2026-09-30 r16 ch114 成洞实证）', () => {
  // 提取侧 implyCustodyClearOnReversal 已随逆转 delta 自动清 custody；此处
  // 兜住旧 store 回放与任何绕过提取层的写入路径——判官读到「custody:天牢」
  // 会按在押连拒已复职角色的正确章节。
  it('status 为逆转族时丢弃残留 custody，其余属性原样保留', () => {
    const out = dropStaleCustodyForDigest({
      status: '复职',
      custody: '天牢',
      title: '江宁冬漕验工使·正五品',
    });
    expect(out).toEqual({ status: '复职', title: '江宁冬漕验工使·正五品' });
  });

  it('status 为在押族时 custody 保留（合法关押地）', () => {
    const attributes = { status: '下狱', custody: '天牢' };
    expect(dropStaleCustodyForDigest(attributes)).toBe(attributes);
  });

  it('无 status / 无 custody / undefined 均原样返回', () => {
    expect(dropStaleCustodyForDigest({ title: '御史' })).toEqual({ title: '御史' });
    expect(dropStaleCustodyForDigest({ status: '复职' })).toEqual({ status: '复职' });
    expect(dropStaleCustodyForDigest(undefined)).toBeUndefined();
  });
});
