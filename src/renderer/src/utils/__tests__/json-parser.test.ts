/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  robustJsonParse,
  fixUnescapedControlCharsInJsonStrings,
} from '../json-parser';

describe('robustJsonParse', () => {
  it('解析含未转义换行的 JSON 字符串', () => {
    const raw = `{
  "version": "1.0",
  "chapter": 1,
  "changes": [
    {
      "type": "timeline",
      "currentTime": "次日",
      "event": "下山",
      "evidence": "他抬起头。
门外有人敲门。"
    }
  ]
}`;
    const result = robustJsonParse(raw, { expectedType: 'object' });
    expect(result.success).toBe(true);
    expect((result.data as { chapter: number }).chapter).toBe(1);
  });

  it('纯文本不应被误判为成功对象', () => {
    const result = robustJsonParse('这不是 JSON', { expectedType: 'object' });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain('Failed to parse JSON after all strategies');
  });

  it('fixUnescapedControlCharsInJsonStrings 转义裸换行', () => {
    const input = '{"a": "x\ny"}';
    const fixed = fixUnescapedControlCharsInJsonStrings(input);
    expect(fixed).toBe('{"a": "x\\ny"}');
    expect(() => JSON.parse(fixed)).not.toThrow();
  });
});
