// 历史拒稿教训账本回归：族归一（message 模式，非位置 id）、弱信号/噪音过滤、
// 合并计数与容量封顶、topRejectionLessons 阈值、renderRejectionLessonRules 渲染口径。
import { describe, expect, it } from 'vitest';

import {
  LESSON_FAMILIES,
  REJECTION_LESSON_MAX_ENTRIES,
  isCountableRejectionIssue,
  mergeRejectionLessons,
  renderRejectionLessonRules,
  topRejectionLessons,
} from '../rejectionLessons';
import type { ContinuityIssue } from '@/types/story-runtime';

function issue(
  id: string,
  message: string,
  severity: ContinuityIssue['severity'] = 'blocking'
): ContinuityIssue {
  return { id, domain: 'fulfillment', severity, message, evidence: [] };
}

describe('lessonKeyOf（族归一，经 mergeRejectionLessons 体现）', () => {
  it('同一族不同 id/措辞归并到同一 key', () => {
    const lessons = mergeRejectionLessons(undefined, [
      issue('node-verbatim-overlap-ch5', '节点原句照抄：与 mustCover 节点 LCS≥12'),
      issue('fulfillment-3', '正文包含「节点抄用」形态的原文搬运', 'warning'),
    ], 5);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].key).toBe('node-verbatim');
    expect(lessons[0].count).toBe(2);
  });

  it('判官语义问题按 type 归族：fact_conflict 与数字蒸发分族', () => {
    const lessons = mergeRejectionLessons(undefined, [
      issue('knowledge-1', '语义问题[fact_conflict] 第2段: 与既成状态冲突'),
      issue('inventory-2', '数字蒸发/改写：既成1000000斤，本章写成1200000斤'),
    ], 9);
    const keys = lessons.map(l => l.key);
    expect(keys).toContain('fact-conflict');
    expect(keys).toContain('numeric-ledger');
  });

  it('弱信号族 warning 计入，普通 warning 是噪音不计', () => {
    expect(isCountableRejectionIssue(issue('x-1', '段落节奏均匀化（cv=0.12）', 'warning'))).toBe(true);
    expect(isCountableRejectionIssue(issue('x-2', '叙述段过重：中位 210 字', 'warning'))).toBe(true);
    expect(isCountableRejectionIssue(issue('x-3', '语义问题[ooc] 次要配角口吻偏差', 'warning'))).toBe(false);
    expect(isCountableRejectionIssue(issue('x-4', '任意 blocking', 'blocking'))).toBe(true);
  });

  it('未匹配族的 blocking 走 other: 前缀归一', () => {
    const lessons = mergeRejectionLessons(undefined, [
      issue('entity-4', '未知实体：事件引用了未登记角色王五'),
      issue('entity-9', '未知实体：事件引用了未登记角色赵六'),
    ], 3);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].key.startsWith('other:')).toBe(true);
    expect(lessons[0].count).toBe(2);
  });
});

describe('mergeRejectionLessons / topRejectionLessons', () => {
  it('跨章累计刷新例证与章号，按 count 降序', () => {
    let lessons = mergeRejectionLessons(undefined, [
      issue('f-1', '触发本章禁区：御剑入城'),
    ], 5, '2026-10-12T01:00:00Z');
    lessons = mergeRejectionLessons(lessons, [
      issue('f-2', '触发本章禁区：私放人犯'),
    ], 12, '2026-10-12T02:00:00Z');
    expect(lessons[0]).toMatchObject({
      key: 'forbidden-zone',
      count: 2,
      lastChapter: 12,
      lastMessage: '触发本章禁区：私放人犯',
    });
  });

  it('容量封顶：超限条目按 count 降序截断', () => {
    const many = Array.from({ length: REJECTION_LESSON_MAX_ENTRIES + 5 }, (_, i) =>
      issue(`f-${i}`, `未知缺陷形态${i}：具体描述`)
    );
    const lessons = mergeRejectionLessons(undefined, many, 1);
    expect(lessons).toHaveLength(REJECTION_LESSON_MAX_ENTRIES);
  });

  it('topRejectionLessons：单次不复发不注入', () => {
    const lessons = mergeRejectionLessons(undefined, [
      issue('a-1', '触发本章禁区：X'),
      issue('b-1', '未履约节点：调查进展'),
    ], 1);
    expect(topRejectionLessons(lessons)).toHaveLength(0);
    const twice = mergeRejectionLessons(lessons, [issue('a-2', '触发本章禁区：Y')], 2);
    expect(topRejectionLessons(twice).map(l => l.key)).toEqual(['forbidden-zone']);
  });
});

describe('renderRejectionLessonRules（SSOT 渲染）', () => {
  it('空账本零注入；高频族输出指令+计数+例证', () => {
    expect(renderRejectionLessonRules(undefined)).toEqual([]);
    expect(renderRejectionLessonRules([])).toEqual([]);
    const lessons = mergeRejectionLessons(undefined, [
      issue('n-1', '节点原句照抄：与 CBN 节点逐字重叠'),
      issue('n-2', '节点抄用：mustCover 原句入正文'),
    ], 7);
    const lines = renderRejectionLessonRules(lessons);
    expect(lines[0]).toContain('【历史拒稿教训】');
    expect(lines[1]).toContain('已复发 2 次');
    expect(lines[1]).toContain('最近第 7 章');
    expect(lines[1]).toContain('逐字搬进正文');
  });

  it('LESSON_FAMILIES 的指令都是祈使反例句（防渲染出空调行）', () => {
    for (const family of LESSON_FAMILIES) {
      expect(family.directive.trim().length).toBeGreaterThan(8);
    }
  });
});
