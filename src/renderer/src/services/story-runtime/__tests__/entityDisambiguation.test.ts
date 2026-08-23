import { describe, it, expect } from 'vitest';
import { matchBySurnameAndTitle } from '../entityDisambiguation';
import type { StoryEntity } from '@/types/story-runtime';

function makeCharacter(id: string, name: string): StoryEntity {
  return {
    id,
    kind: 'character',
    name,
    aliases: [],
    attributes: {},
    knownBy: [],
    sourceTrace: [],
  };
}

describe('matchBySurnameAndTitle', () => {
  const entities = [
    makeCharacter('char-song', '宋怀远'),
    makeCharacter('char-zhou', '周荣成'),
    makeCharacter('char-du', '杜长青'),
  ];

  it('姓氏+称谓归并到同姓唯一候选（宋教授→宋怀远）', () => {
    expect(matchBySurnameAndTitle('宋教授', entities)).toBe('char-song');
    expect(matchBySurnameAndTitle('周老板', entities)).toBe('char-zhou');
    expect(matchBySurnameAndTitle('杜院士', entities)).toBe('char-du');
  });

  it('老/小/阿 + 姓 前缀归并（老宋→宋怀远）', () => {
    expect(matchBySurnameAndTitle('老宋', entities)).toBe('char-song');
    expect(matchBySurnameAndTitle('小顾', [makeCharacter('char-gu', '顾巡')])).toBe('char-gu');
  });

  it('完整本名不做称谓消歧（返回 undefined 走别名表）', () => {
    expect(matchBySurnameAndTitle('宋怀远', entities)).toBeUndefined();
    expect(matchBySurnameAndTitle('顾巡', entities)).toBeUndefined();
  });

  it('多义姓氏（两个同姓候选）不合并', () => {
    const ambiguous = [...entities, makeCharacter('char-song2', '宋青书')];
    expect(matchBySurnameAndTitle('宋教授', ambiguous)).toBeUndefined();
  });

  it('无关姓氏返回 undefined', () => {
    expect(matchBySurnameAndTitle('王教授', entities)).toBeUndefined();
  });

  it('非称谓后缀不匹配（防误合并普通人名）', () => {
    // 「宋青书」是完整人名不是称谓，不应被拆成 姓宋+称谓「青书」
    expect(matchBySurnameAndTitle('宋青书', entities)).toBeUndefined();
  });

  it('非中文引用不处理', () => {
    expect(matchBySurnameAndTitle('Professor Song', entities)).toBeUndefined();
  });
});
