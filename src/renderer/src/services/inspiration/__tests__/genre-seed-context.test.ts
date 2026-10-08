/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import {
  buildGenreSeedHint,
  buildMixGenreHints,
  formatGenreSeedHint,
  formatMixGenreHints,
} from '@/services/inspiration/genre-seed-context';

describe('genre-seed-context', () => {
  it('matches 修仙 profile and returns readable hooks/coolpoints', () => {
    const hint = buildGenreSeedHint('修仙');
    expect(hint).not.toBeNull();
    expect(hint?.profileId).toBe('xianxia');
    expect(hint?.preferredHooks.length).toBeGreaterThan(0);
    expect(hint?.preferredCoolPoints.length).toBeGreaterThan(0);
    expect(hint?.typicalOpening).toBeTruthy();
    expect(hint?.commonRisks.length).toBeGreaterThan(0);
  });

  it('fuzzy matches extended genre names', () => {
    const hint = buildGenreSeedHint('都市爽文');
    expect(hint?.name).toBe('都市');
  });

  it('returns null for unknown genres instead of forcing urban', () => {
    expect(buildGenreSeedHint('完全不存在的冷门题材XYZ')).toBeNull();
    expect(buildGenreSeedHint('')).toBeNull();
  });

  it('formats hint into prompt lines', () => {
    const hint = buildGenreSeedHint('玄幻');
    expect(hint).not.toBeNull();
    const lines = formatGenreSeedHint(hint!);
    expect(lines.join('\n')).toContain('题材专属约束');
    expect(lines.join('\n')).toContain('偏好开篇钩子');
    expect(lines.join('\n')).toContain('读者预期锚点');
  });

  it('prefers the profileId declared on genre tags over substring matching', () => {
    // 回归：「都市异能」曾被部分匹配吞成「都市」
    expect(buildGenreSeedHint('都市异能')?.profileId).toBe('urban-power');
    expect(buildGenreSeedHint('宫斗')?.profileId).toBe('palace');
    expect(buildGenreSeedHint('宅斗')?.profileId).toBe('palace');
    expect(buildGenreSeedHint('古言')?.profileId).toBe('ancient-romance');
    expect(buildGenreSeedHint('高武')?.profileId).toBe('high-martial');
  });

  it('resolves brain-hole genres through their declared profile', () => {
    expect(buildGenreSeedHint('规则怪谈')?.profileId).toBe('rule-horror');
    expect(buildGenreSeedHint('全民转职')?.profileId).toBe('high-martial');
  });

  it('dedupes mix hints by profile and excludes the primary genre', () => {
    const hints = buildMixGenreHints(['修仙', '规则怪谈', '仙侠', '完全不存在的冷门题材XYZ'], 'xianxia');
    expect(hints.map(h => h.profileId)).toEqual(['rule-horror']);
  });

  it('keeps every resolvable mix genre when no primary is given', () => {
    const hints = buildMixGenreHints(['修仙', '都市异能', '修仙']);
    expect(hints.map(h => h.profileId)).toEqual(['xianxia', 'urban-power']);
  });

  it('formats mix hints as compact secondary-genre lines', () => {
    expect(formatMixGenreHints([])).toEqual([]);
    const lines = formatMixGenreHints(buildMixGenreHints(['规则怪谈']));
    expect(lines[0]).toContain('混搭副题材读者预期');
    expect(lines[1]).toMatch(/^- 「规则怪谈」偏好钩子：.+；偏好爽点：.+/);
  });
});
