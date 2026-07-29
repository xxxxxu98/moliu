/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import {
  buildGenreSeedHint,
  formatGenreSeedHint,
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
    expect(lines.join('\n')).toContain('常见雷区');
  });
});
