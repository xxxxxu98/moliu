/**
 * 本地组合式创意引擎验收测试
 * 验收标准：离线降级种子不再命中「题材·逆袭/觉醒/重生/破局/登顶」模板，
 * 且 oneLiner 不再使用旧模板句式，批量输出保持多样性。
 */

import { describe, it, expect } from 'vitest';
import { buildCreativeSeeds } from '../local-engine';

const LEGACY_TITLE_PATTERN = /·(逆袭|觉醒|重生|破局|登顶)$/;
const LEGACY_ONELINER_PATTERN = /从被低估走向掌控全局/;

function batch(count = 4, overrides: Record<string, unknown> = {}) {
  return buildCreativeSeeds({
    count,
    playStyle: 'standard',
    audience: 'general',
    platform: 'general',
    length: 'long',
    exclude: new Set(),
    ...overrides,
  });
}

describe('local-engine 创意验收', () => {
  it('连续 5 批种子标题均不命中旧「题材·逆袭」模板', () => {
    for (let i = 0; i < 5; i += 1) {
      const seeds = batch(4);
      for (const seed of seeds) {
        expect(seed.title).not.toMatch(LEGACY_TITLE_PATTERN);
        expect(seed.title).not.toContain('·');
        expect(seed.oneLiner).not.toMatch(LEGACY_ONELINER_PATTERN);
      }
    }
  });

  it('批量输出标题有足够多样性', () => {
    const titles = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      for (const seed of batch(4)) {
        titles.add(seed.title);
      }
    }
    expect(titles.size).toBeGreaterThanOrEqual(10);
  });

  it('每条种子都包含完整创意字段', () => {
    const seeds = batch(4);
    for (const seed of seeds) {
      expect(seed.title.length).toBeGreaterThan(2);
      expect(seed.oneLiner.length).toBeGreaterThan(15);
      expect(seed.hook.length).toBeGreaterThan(0);
      expect(seed.coolPoint.length).toBeGreaterThan(0);
      expect(seed.mechanism?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('短篇玩法 oneLiner 含完结/反转', () => {
    const seeds = batch(3, { length: 'short' });
    for (const seed of seeds) {
      expect(seed.oneLiner).toMatch(/完结|反转/);
      expect(seed.length).toBe('short');
    }
  });
});
