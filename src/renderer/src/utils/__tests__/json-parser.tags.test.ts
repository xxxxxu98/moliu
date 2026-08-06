/**
 * @vitest-environment happy-dom
 *
 * P0 缺陷4回归：robustJsonParse 在 jsonrepair 之前剥离推理/安全审查 meta 标签，
 * 防止 <think>/<ds_safety> 及其内容被 jsonrepair 吸收成字符串值污染正文。
 *
 * 真实样本来自 smoke:storyflow:real（deepseek-v4-flash）：supplement 补写轮返回的
 * 末尾截断 <ds_safety> 块（无闭合），jsonrepair 把它当成 paragraphs 字符串吸收，
 * 最终正文末尾混入约 100 字安全审查 meta 文本。
 */
import { describe, it, expect } from 'vitest';
import { robustJsonParse } from '../json-parser';

describe('robustJsonParse 推理/安全审查标签剥离', () => {
  it('剥离末尾截断的 <ds_safety> 块，paragraphs 不含 meta 文本', () => {
    // 真实泄漏样本（节选）：合法 JSON 后跟未闭合 <ds_safety> 到结尾
    const raw = `{"paragraphs":["朝堂哗然，议论声如沸鼎。"]}。{
}。ăn  <ds_safety>用户输入是网文续写任务，要求根据给定的小说章节结尾和未完成节点，补充约145字的内容。内容完全围绕虚构的古代朝堂故事展开，未涉及任何现实政治人物。`;
    const result = robustJsonParse<{ paragraphs: string[] }>(raw, {
      expectedType: 'object',
    });
    expect(result.success).toBe(true);
    const paragraphs = result.data?.paragraphs ?? [];
    expect(paragraphs.length).toBeGreaterThan(0);
    const joined = paragraphs.join('\n');
    // 正文保留
    expect(joined).toContain('朝堂哗然');
    // meta 文本被剥净
    expect(joined).not.toContain('ds_safety');
    expect(joined).not.toContain('用户输入');
    expect(joined).not.toContain('虚构的古代朝堂故事展开');
    // JSON 残片杂质（}]}。{、ăn）也被剥掉
    expect(joined).not.toContain('ăn');
  });

  it('剥离成对 <think>...</think> 推理链', () => {
    const raw = `<think>我需要输出一个 JSON 对象，包含 paragraphs 数组。</think>
{"paragraphs":["李默睁开眼，一股腐臭味扑鼻而来。"]}`;
    const result = robustJsonParse<{ paragraphs: string[] }>(raw, {
      expectedType: 'object',
    });
    expect(result.success).toBe(true);
    const joined = (result.data?.paragraphs ?? []).join('\n');
    expect(joined).toContain('李默睁开眼');
    expect(joined).not.toContain('think');
    expect(joined).not.toContain('我需要输出');
  });

  it('干净 JSON（无 meta 标签）不受影响', () => {
    const raw = '{"paragraphs":["第一段正文。","第二段正文。"]}';
    const result = robustJsonParse<{ paragraphs: string[] }>(raw, {
      expectedType: 'object',
    });
    expect(result.success).toBe(true);
    expect(result.data?.paragraphs).toEqual(['第一段正文。', '第二段正文。']);
  });

  it('剥离多组成对 think 标签', () => {
    const raw = `<think>先想一下结构。</think>{"paragraphs":["段一"]}<think>再确认下。</think>`;
    const result = robustJsonParse<{ paragraphs: string[] }>(raw, {
      expectedType: 'object',
    });
    expect(result.success).toBe(true);
    expect(result.data?.paragraphs).toEqual(['段一']);
  });
});
