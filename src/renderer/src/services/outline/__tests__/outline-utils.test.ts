/**
 * @vitest-environment happy-dom
 *
 * P1 缺陷1 + P2 缺陷2 回归：outline parser utils
 * - stripStructuredNodeBlock：剥离 outline 末尾的「--- 结构化节点 ---」块
 * - extractMultiValueField：编号列表（1./2./3.）正确切分
 */
import { describe, it, expect } from 'vitest';
import {
  stripStructuredNodeBlock,
  extractMultiValueField,
} from '../parser/utils';

describe('stripStructuredNodeBlock', () => {
  it('剥离末尾的结构化节点块，保留散文大纲', () => {
    const outline = '李默穿越后遭遇命案，需在三天内查清真相。\n\n--- 结构化节点 ---\n【CBN】李默验尸发现银票\n【CPNs】1. 穿越\n2. 验尸\n【CEN】系统提示证据不足';
    expect(stripStructuredNodeBlock(outline)).toBe('李默穿越后遭遇命案，需在三天内查清真相。');
  });

  it('剥离后不含 CBN/CPNs/结构化节点 标记', () => {
    const outline = '散文大纲内容。\n\n--- 结构化节点 ---\n【CBN】xx\n【CEN】yy';
    const result = stripStructuredNodeBlock(outline);
    expect(result).toBe('散文大纲内容。');
    expect(result).not.toContain('结构化节点');
    expect(result).not.toContain('【CBN】');
  });

  it('无结构化节点标记时原样返回', () => {
    const outline = '纯粹的散文大纲，没有任何结构化节点。';
    expect(stripStructuredNodeBlock(outline)).toBe(outline);
  });

  it('空字符串安全返回空', () => {
    expect(stripStructuredNodeBlock('')).toBe('');
  });
});

describe('extractMultiValueField 编号列表解析', () => {
  it('识别 1./2./3. 编号列表，每项独立（不串号）', () => {
    const block = `CPNs：
1. 李默穿越成九品主簿，正在验尸现场
2. 知府王德骂他"废物"，连个案子都查不清
3. 系统提示"尸体嘴里的银票是知府贪污的军饷"`;
    const result = extractMultiValueField(block, 'CPNs');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('李默穿越成九品主簿，正在验尸现场');
    expect(result[1]).toContain('知府王德骂他');
    expect(result[1]).not.toContain('1.');
    expect(result[2]).toContain('系统提示');
    // 关键：编号 "2." 不应串到前一项尾部
    expect(result.join(' ')).not.toMatch(/现场\s*2\./);
  });

  it('编号项续行正确归并', () => {
    const block = `CPNs：
1. 第一行内容
续行内容
2. 第二行`;
    const result = extractMultiValueField(block, 'CPNs');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('第一行内容 续行内容');
    expect(result[1]).toBe('第二行');
  });

  it('单行逗号/顿号并列仍走 fallback 正常切分', () => {
    const block = 'CPNs：穿越场景、验尸场景、系统初现';
    const result = extractMultiValueField(block, 'CPNs');
    expect(result).toEqual(['穿越场景', '验尸场景', '系统初现']);
  });

  it('编号用顿号、右括号也能识别', () => {
    const block = `mustCover：
1、穿越场景
2、验尸场景
3、系统初现`;
    const result = extractMultiValueField(block, 'mustCover');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('穿越场景');
  });

  it('无编号时 fallback 到标点切分', () => {
    const block = 'mustCover：A，B；C';
    const result = extractMultiValueField(block, 'mustCover');
    expect(result).toEqual(['A', 'B', 'C']);
  });
});
