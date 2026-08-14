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

  it('整句陈述里的逗号不再被当成并列切分（只按分号分阶）', () => {
    // 实测回归：升级路径三阶被切成 11 个碎片落库，之后原样注入写作 prompt 灌噪音
    const block =
      '升级路径：初阶为应急工具，主角用来破案自保，应付差事；进阶为管理体系，主角用来推动漕运改革；终极为治国框架，主角用来重塑朝堂规则';
    const result = extractMultiValueField(block, '升级路径');

    expect(result).toHaveLength(3);
    expect(result[0]).toBe('初阶为应急工具，主角用来破案自保，应付差事');
    expect(result[2]).toBe('终极为治国框架，主角用来重塑朝堂规则');
  });

  it('无强分隔符的整句话保持完整，不按逗号打碎', () => {
    const block = '势力版图：前期夹缝求生，中期被三方拉扯，后期成为改革支点';
    const result = extractMultiValueField(block, '势力版图');
    expect(result).toEqual(['前期夹缝求生，中期被三方拉扯，后期成为改革支点']);
  });

  it('短词组并列仍按逗号切分', () => {
    const block = '涉及角色：赵文远，顾庸，范通判';
    const result = extractMultiValueField(block, '涉及角色');
    expect(result).toEqual(['赵文远', '顾庸', '范通判']);
  });

  // ---------- 缺陷修复：单行内联编号切分 ----------
  // AI 常把 CPNs/mustCover 写成同一行的内联编号：
  //   `- CPNs：1. 陈默穿越，发现自己是大梁七品小吏 2. 陈默用现代法医思维 3. 陈默破案`
  // 旧实现：extractNumberedItems 只认"编号独占一行"，对单行内联无能为力；
  // fallback 标点切分按逗号拆，把序号「2.」「3.」粘到前半句尾部，产出碎片。
  it('单行内联编号（1. xxx 2. yyy 3. zzz）正确切分，序号不串号', () => {
    const block =
      '- CPNs：1. 陈默穿越，发现自己是大梁七品小吏 2. 陈默用现代法医思维，发现尸体上的关键线索 3. 陈默破案，获得同僚认可';
    const result = extractMultiValueField(block, 'CPNs');
    expect(result).toHaveLength(3);
    // 每项无序号前缀
    expect(result[0]).toBe('陈默穿越，发现自己是大梁七品小吏');
    expect(result[1]).toBe('陈默用现代法医思维，发现尸体上的关键线索');
    expect(result[2]).toBe('陈默破案，获得同僚认可');
    // 关键：序号不串号
    expect(result.join(' ')).not.toMatch(/小吏\s*2\./);
    expect(result.every(item => !/^\d+[.、)]/.test(item))).toBe(true);
  });

  it('单行内联编号对 mustCover 同样生效（共用 extractMultiValueField）', () => {
    const block =
      '- mustCover：1. 穿越醒来 2. 验尸场景 3. 初步破案 4. 衙门危机';
    const result = extractMultiValueField(block, 'mustCover');
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('穿越醒来');
    expect(result[3]).toBe('衙门危机');
  });

  it('含数值的文本（500两银子、第5章、2026年）不被误切为编号项', () => {
    // 这些场景数字紧贴汉字，不满足「标点/空白 + 数字 + 编号标点 + 空白」模式
    const block = '- CPNs：主角发现500两银子账目对不上；第5章才揭示真相；时间定格在2026年';
    const result = extractMultiValueField(block, 'CPNs');
    // 无内联编号 → 走标点切分（分号），3 项
    expect(result).toHaveLength(3);
    expect(result[0]).toContain('500两银子');
    expect(result[1]).toContain('第5章');
    expect(result[2]).toContain('2026年');
  });
});
