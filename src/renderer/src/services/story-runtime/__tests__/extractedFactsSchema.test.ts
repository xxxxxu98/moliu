import { describe, expect, it } from 'vitest';

import { coerceIdString, extractedFactsSchema, parseSchema } from '../schemas';

describe('extractedFactsSchema participants 容错', () => {
  it('coerceIdString 支持字符串与 {id,name} 对象', () => {
    expect(coerceIdString('主角')).toBe('主角');
    expect(coerceIdString({ id: 'char-1', name: '主角' })).toBe('char-1');
    expect(coerceIdString({ name: '反派甲' })).toBe('反派甲');
    expect(coerceIdString({})).toBeUndefined();
  });

  it('participants / causes 为对象数组时仍可通过校验', () => {
    const raw = {
      events: [
        {
          id: 'chapter-3:event:1',
          chapter: 3,
          sceneId: 'chapter-3:CBN:scene',
          type: 'conflict',
          summary: '主角被栽赃财物失窃再次入狱',
          participants: [
            { id: 'char-hero', name: '主角' },
            { name: '爪牙甲' },
            '反派甲',
          ],
          causes: [{ id: 'chapter-2:CBN:event:11' }, 'chapter-2:CBN:event:10'],
          effects: ['再次入狱'],
          evidence: ['爪牙甲冷笑一声：“无罪？你偷了库房'],
        },
      ],
      deltas: [],
      evidence: ['爪牙甲冷笑一声：“无罪？你偷了库房'],
    };

    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events[0].participants).toEqual(['char-hero', '爪牙甲', '反派甲']);
    expect(parsed.events[0].causes).toEqual([
      'chapter-2:CBN:event:11',
      'chapter-2:CBN:event:10',
    ]);
  });
});

describe('extractedFactsSchema 顶层缺失字段软兜底', () => {
  it('模型只返回 events（缺 deltas/evidence）不再抛错，缺失数组回填 []', () => {
    const raw = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'conflict',
          summary: '主角入狱',
          participants: ['char-hero'],
          causes: [],
          effects: ['入狱'],
          evidence: ['正文原句'],
        },
      ],
      // 缺 deltas 和 evidence
    };

    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events).toHaveLength(1);
    expect(parsed.deltas).toEqual([]); // 软兜底为空数组
    expect(parsed.evidence).toEqual([]); // 软兜底为空数组
  });

  it('完全空对象 {} 能通过校验，全部字段回填 []', () => {
    const parsed = parseSchema(extractedFactsSchema, {}, '事实提取结果');
    expect(parsed.events).toEqual([]);
    expect(parsed.deltas).toEqual([]);
    expect(parsed.evidence).toEqual([]);
  });

  it('字段值为非数组（如 null/string）也回填 []', () => {
    const raw = {
      events: null,
      deltas: 'not an array',
      evidence: undefined,
    };
    const parsed = parseSchema(extractedFactsSchema, raw, '事实提取结果');
    expect(parsed.events).toEqual([]);
    expect(parsed.deltas).toEqual([]);
    expect(parsed.evidence).toEqual([]);
  });

  it('内层 event 结构错误仍然抛出（不掩盖真实结构问题）', () => {
    const raw = {
      events: [
        {
          // 缺 id/sceneId 等必填字段
          chapter: 1,
          summary: 'x',
        },
      ],
      deltas: [],
      evidence: [],
    };
    expect(() => parseSchema(extractedFactsSchema, raw, '事实提取结果')).toThrow();
  });
});
