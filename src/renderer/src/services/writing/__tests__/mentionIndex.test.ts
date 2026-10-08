/**
 * @vitest-environment happy-dom
 *
 * 提及索引（2026-10-05 借鉴 Novelcrafter）+ 台账显著性（借鉴 Sudowrite
 * Saliency Engine）+ 正文指纹（作者正典配套）。
 */

import { describe, expect, it } from 'vitest';
import { buildMentionEvidence } from '../mentionIndex';
import { formatNumericAnchorLines } from '../numericLedger';
import { contentFingerprint } from '../utils';
import type { SceneChunk } from '@/types/story-runtime';
import type { NumericLedgerEntry } from '@/types/project';

function chunkOf(chapterIndex: number, text: string, participants: string[] = []): SceneChunk {
  return {
    id: `scene-${chapterIndex}`,
    chapterId: `chapter-${chapterIndex}`,
    chapterIndex,
    order: 0,
    title: `第${chapterIndex + 1}章场景`,
    text,
    participants,
    locations: [],
    sourceTrace: [],
  };
}

describe('buildMentionEvidence（判官跨章仲裁的逐字证据）', () => {
  const chunks = [
    chunkOf(2, '周巡在黑市捏碎了假灵石，摊主恼羞成怒。'),
    chunkOf(9, '周巡一针刺穿蛮牛眼眶，全场死寂。'),
    chunkOf(10, '赵莽亮出三百万信用点的血印借据拦住去路。'),
    chunkOf(13, '苏晓晓抱着一摞档案匆匆赶来。'),
  ];

  it('取 ceiling=chapterNumber-2 及以前的出现；命中角色的最近片段并格式化', () => {
    const lines = buildMentionEvidence(chunks, {
      chapterNumber: 15,
      names: [{ name: '赵莽' }, { name: '周巡' }, { name: '路人甲' }],
    });
    // 第15章 → 只取 ≤13 章；周巡最近出现是第10章（第13章是苏晓晓的块，无周巡）
    expect(lines.some(l => l.startsWith('赵莽｜第11章：') && l.includes('三百万信用点'))).toBe(true);
    expect(lines.some(l => l.startsWith('周巡｜第10章：') && l.includes('眼眶'))).toBe(true);
    expect(lines.some(l => l.includes('路人甲'))).toBe(false);
    expect(lines.every(l => l.includes('「…'))).toBe(true);
  });

  it('别名命中与角色数上限 6；无场景返回空', () => {
    const lines = buildMentionEvidence([chunkOf(3, '小巡子低头不语。')], {
      chapterNumber: 5,
      names: [{ name: '周巡', aliases: ['小巡子'] }],
    });
    expect(lines.some(l => l.startsWith('周巡｜第4章：') && l.includes('小巡子'))).toBe(true);
    expect(buildMentionEvidence([], { chapterNumber: 5, names: [{ name: '周巡' }] })).toEqual([]);
  });
});

describe('台账显著性过滤（本章相关旧账优先于不相关新账）', () => {
  it('与蓝图相关的旧账在被截断前优先注入', () => {
    // 15 条不相关的新账 + 1 条很旧但与本章相关的债务账
    const ledger: NumericLedgerEntry[] = Array.from({ length: 15 }, (_, i) => ({
      object: `无关对象${i}`,
      amount: i,
      unit: '个',
      chapterIndex: 30 + i,
    }));
    ledger.push({ object: '周巡家欠金刚重工债务总额', amount: 3000000, unit: '信用点', chapterIndex: 5 });
    const lines = formatNumericAnchorLines(ledger, 50, '本章周巡与金刚重工对账，涉及债务与信用点');
    expect(lines.some(l => l.includes('周巡家欠金刚重工债务总额'))).toBe(true);
    // 无 hint 时（旧行为）：最新 12 条全是不相关新账，旧债务账被挤出
    const linesNoHint = formatNumericAnchorLines(ledger, 50);
    expect(linesNoHint.some(l => l.includes('周巡家欠金刚重工债务总额'))).toBe(false);
  });
});

describe('contentFingerprint（作者手改检测）', () => {
  it('同文同指纹，改一字即变', () => {
    const a = contentFingerprint('周巡按下了确认键。');
    expect(contentFingerprint('周巡按下了确认键。')).toBe(a);
    expect(contentFingerprint('周巡按下了确认键！')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});
