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
