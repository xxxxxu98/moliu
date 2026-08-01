import { describe, expect, it } from 'vitest';

import {
  CHAPTER_TITLE_PROMPT_RULES,
  formatStoredChapterTitle,
  isPlaceholderChapterTitle,
  normalizeGeneratedChapterTitle,
  prependTitleLineForPersist,
} from '../chapterTitle';

describe('chapterTitle', () => {
  describe('CHAPTER_TITLE_PROMPT_RULES', () => {
    it('包含口语正例、公文味反例与长度指引', () => {
      const text = CHAPTER_TITLE_PROMPT_RULES.join('\n');
      expect(text).toContain('拜师学艺');
      expect(text).toContain('被骗了');
      expect(text).toContain('公堂指凶');
      expect(text).toContain('别端着');
      expect(text).toContain('这尸体怎么验都不对劲');
      expect(text).toContain('6–16');
      expect(text).toContain('22');
    });
  });

  describe('isPlaceholderChapterTitle', () => {
    it('空与「第N章」视为占位', () => {
      expect(isPlaceholderChapterTitle(null)).toBe(true);
      expect(isPlaceholderChapterTitle('')).toBe(true);
      expect(isPlaceholderChapterTitle('第1章')).toBe(true);
      expect(isPlaceholderChapterTitle('第十二章')).toBe(true);
      expect(isPlaceholderChapterTitle('第3章未命名')).toBe(true);
    });

    it('已有具体标题不覆盖', () => {
      expect(isPlaceholderChapterTitle('验尸翻案')).toBe(false);
      expect(isPlaceholderChapterTitle('第1章 验尸翻案')).toBe(false);
    });
  });

  describe('normalizeGeneratedChapterTitle', () => {
    it('去掉第X章前缀与引号', () => {
      expect(normalizeGeneratedChapterTitle('第1章 验尸翻案')).toBe('验尸翻案');
      expect(normalizeGeneratedChapterTitle('「被反诬入狱」')).toBe('被反诬入狱');
    });

    it('过短或非字符串返回 null；超长按上限截断', () => {
      expect(normalizeGeneratedChapterTitle('啊')).toBe(null);
      expect(normalizeGeneratedChapterTitle(12)).toBe(null);
      const long = '这具尸体怎么验来验去都透着一股说不清的古怪味道啊';
      const normalized = normalizeGeneratedChapterTitle(long);
      expect(normalized).toBeTruthy();
      const chineseLen = (normalized ?? '').replace(/[^\u4e00-\u9fa5]/gu, '').length;
      expect(chineseLen).toBeLessThanOrEqual(22);
    });
  });

  describe('format / prepend', () => {
    it('组装落库标题与正文头', () => {
      expect(formatStoredChapterTitle(2, '第一次赚钱')).toBe('第2章 第一次赚钱');
      expect(prependTitleLineForPersist(2, '第一次赚钱', '正文开头。')).toBe(
        '第2章 第一次赚钱\n\n正文开头。'
      );
    });
  });
});
