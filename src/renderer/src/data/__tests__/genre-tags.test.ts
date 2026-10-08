/**
 * 元素混搭标签数据守护：名称唯一、分类与 Profile 引用有效、女频覆盖不回退。
 *
 * 面板与提示词都按 name 判定选中 / 注入，重名会导致两个按钮同亮、Profile 错配，
 * 因此唯一性约束必须由测试守住，而不是靠人工审查。
 */

import { describe, expect, it } from 'vitest';
import { GENRE_PROFILES } from '@/data/genre-profiles';
import { GENRE_TAG_CATEGORIES, genreTags } from '@/data/genre-tags';
import { SETTING_ELEMENT_CATEGORIES, settingElements } from '@/data/setting-elements';
import { BRAIN_GENRES } from '@/services/inspiration/fallback/genre-pool';

/** 返回数组中出现超过一次的值 */
function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

const profileIds = new Set(GENRE_PROFILES.map(p => p.id));

describe('genre tags / setting elements data', () => {
  it('keeps ids unique within each pool', () => {
    expect(findDuplicates(genreTags.map(t => t.id))).toEqual([]);
    expect(findDuplicates(settingElements.map(e => e.id))).toEqual([]);
    expect(findDuplicates(BRAIN_GENRES.map(g => g.id))).toEqual([]);
  });

  it('keeps names globally unique across genre tags, brain genres and setting elements', () => {
    const allNames = [
      ...genreTags.map(t => t.name),
      ...BRAIN_GENRES.map(g => g.name),
      ...settingElements.map(e => e.name),
    ];
    expect(findDuplicates(allNames)).toEqual([]);
  });

  it('references only existing genre profiles', () => {
    const dangling = [...genreTags, ...BRAIN_GENRES]
      .filter(tag => tag.profileId && !profileIds.has(tag.profileId))
      .map(tag => `${tag.name}→${tag.profileId}`);
    expect(dangling).toEqual([]);
  });

  it('assigns every tag to a declared category and leaves no category empty', () => {
    const genreCategoryIds = new Set(GENRE_TAG_CATEGORIES.map(c => c.id));
    expect(genreTags.filter(t => !genreCategoryIds.has(t.category)).map(t => t.name)).toEqual([]);
    for (const cat of GENRE_TAG_CATEGORIES) {
      expect(genreTags.some(t => t.category === cat.id), cat.label).toBe(true);
    }

    const elementCategoryIds = new Set(SETTING_ELEMENT_CATEGORIES.map(c => c.id));
    expect(
      settingElements.filter(e => !elementCategoryIds.has(e.category)).map(e => e.name)
    ).toEqual([]);
    for (const cat of SETTING_ELEMENT_CATEGORIES) {
      expect(settingElements.some(e => e.category === cat.id), cat.label).toBe(true);
    }
  });

  it('keeps female-audience coverage for both genres and setting elements', () => {
    const femaleGenres = [...genreTags, ...BRAIN_GENRES].filter(t => t.audience === 'female');
    const femaleElements = settingElements.filter(e => e.audience === 'female');
    expect(femaleGenres.length).toBeGreaterThanOrEqual(10);
    expect(femaleElements.length).toBeGreaterThanOrEqual(10);
  });

  it('excludes formats and review-risk labels from genre tags', () => {
    const names = new Set(genreTags.map(t => t.name));
    for (const banned of ['网文', '轻小说', '绅士']) {
      expect(names.has(banned), banned).toBe(false);
    }
  });
});
