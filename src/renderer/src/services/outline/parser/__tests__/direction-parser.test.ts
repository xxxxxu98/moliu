/**
 * direction-parser 单测
 *
 * 锁定两类回归：
 * 1. 模型重复输出同一方向卡（连同标题/卖点/premise/核心冲突逐字重复）时，按内容签名去重，
 *    且去重后 id 重新连续编号（避免 direction-1/3/5 跳号）。
 * 2. 残缺块（只有「一句话卖点」、其它核心字段全空）不应通过过滤——旧实现把标题 fallback
 *    「方向方案N」也算作 1 个有效字段，导致残缺块凑够 2（fallback 标题 + oneLiner）就混进列表，
 *    产生「只有一句话卖点、其余全空」的混乱卡。
 */
import { describe, expect, it } from 'vitest';

import { parseDirections } from '../direction-parser';

/** 一个内容完整、可正常解析的方向块（与 direction-prompt 输出格式一致） */
function fullBlock(no: number, title: string, oneLiner: string): string {
  return `## 方向方案${no}
- 标题：${title}
- 一句话卖点：${oneLiner}
- premise：故事前提
- 主角成长路径：从弱到强
- 核心冲突：资源与权力的争夺
- 爽点风格：打脸、升级
- 目标情绪：热血、爽快
- 风险提示：节奏
- 长篇承载力：前30章完成开局，后续持续升级
- 推荐理由：升级体系清晰
- 推荐分：85`;
}

describe('parseDirections', () => {
  it('正常解析 3 个内容不同的方向卡，id 连续', () => {
    const raw = [
      fullBlock(1, '凡人修仙', '凡人逆袭'),
      fullBlock(2, '都市神医', '重生行医'),
      fullBlock(3, '星际机甲', '机甲争霸'),
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(3);
    expect(result.map(d => d.id)).toEqual(['direction-1', 'direction-2', 'direction-3']);
    expect(result.map(d => d.title)).toEqual(['凡人修仙', '都市神医', '星际机甲']);
  });

  it('模型重复输出同一方向卡时按内容签名去重，重排 id', () => {
    // 真实场景：模型把 3 张正常卡后面又原样重复了一遍，外加一张残缺卡 → 原始 7 条
    const raw = [
      fullBlock(1, '凡人修仙', '凡人逆袭'),
      fullBlock(2, '都市神医', '重生行医'),
      fullBlock(3, '星际机甲', '机甲争霸'),
      // 逐字重复的三张
      fullBlock(4, '凡人修仙', '凡人逆袭'),
      fullBlock(5, '都市神医', '重生行医'),
      fullBlock(6, '星际机甲', '机甲争霸'),
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(3);
    expect(result.map(d => d.id)).toEqual(['direction-1', 'direction-2', 'direction-3']);
    expect(result.map(d => d.title)).toEqual(['凡人修仙', '都市神医', '星际机甲']);
  });

  it('残缺块（仅一句话卖点、标题靠 fallback）被过滤，不产生混乱空壳卡', () => {
    // 旧 bug：fallback 标题「方向方案N」被算作 1 个有效字段，
    // 残缺块凑够 2（fallback + oneLiner）就通过，渲染出「只有一句话卖点」的空壳卡
    const raw = [
      fullBlock(1, '凡人修仙', '凡人逆袭'),
      fullBlock(2, '都市神医', '重生行医'),
      fullBlock(3, '星际机甲', '机甲争霸'),
      `## 方向方案4
- 一句话卖点：孤零零的一句话卖点，其它什么都没有`,
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(3);
    // 残缺卡绝不应出现
    expect(result.some(d => d.oneLiner === '孤零零的一句话卖点，其它什么都没有')).toBe(false);
    expect(result.map(d => d.id)).toEqual(['direction-1', 'direction-2', 'direction-3']);
  });

  it('残缺块被过滤后，去重与 id 重排仍正常工作', () => {
    const raw = [
      fullBlock(1, '凡人修仙', '凡人逆袭'),
      fullBlock(2, '都市神医', '重生行医'),
      `## 方向方案3
- 一句话卖点：只有卖点的残缺卡`,
      // 重复第一张
      fullBlock(4, '凡人修仙', '凡人逆袭'),
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(2);
    expect(result.map(d => d.title)).toEqual(['凡人修仙', '都市神医']);
    expect(result.map(d => d.id)).toEqual(['direction-1', 'direction-2']);
  });

  it('premise/核心冲突差异即视为不同方向（签名不全等则保留）', () => {
    // 标题与卖点相同但 premise 不同，应判为两张不同卡，避免误删真实差异
    const raw = [
      `## 方向方案1
- 标题：同名故事
- 一句话卖点：同款卖点
- premise：前提A
- 核心冲突：冲突A`,
      `## 方向方案2
- 标题：同名故事
- 一句话卖点：同款卖点
- premise：前提B
- 核心冲突：冲突B`,
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(2);
  });

  it('全空块（四项核心字段都缺）被过滤', () => {
    const raw = [
      fullBlock(1, '凡人修仙', '凡人逆袭'),
      `## 方向方案2
- 爽点风格：打脸
- 目标情绪：热血`,
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('凡人修仙');
  });

  it('签名大小写与首尾空白不影响去重判定', () => {
    const raw = [
      fullBlock(1, '凡人修仙', '凡人逆袭'),
      // 同内容但标题/卖点前后加空白；签名 trim + lowercase 后应判重
      fullBlock(2, '  凡人修仙  ', ' 凡人逆袭 '),
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(1);
  });
});
