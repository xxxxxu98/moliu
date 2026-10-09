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

  it('「标题+一句话卖点」薄卡被新门槛过滤（缺 premise 与核心冲突，展开种子信息量不足）', () => {
    // 这类卡能凑满旧门槛（标题真值 + oneLiner = 2 个有效字段），
    // 但 expandDirection 全靠 premise/核心冲突派生故事引擎——对着一句话展开=让模型猜整本书
    const raw = [
      fullBlock(1, '凡人修仙', '凡人逆袭'),
      `## 方向方案2
- 标题：有一张真标题的薄卡
- 一句话卖点：卖点很吸睛但没有前提和冲突`,
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('凡人修仙');
  });

  it('只有 premise 没有核心冲突的卡可通过（两字段任居其一即达种子最低信息量）', () => {
    const raw = [
      fullBlock(1, '凡人修仙', '凡人逆袭'),
      `## 方向方案2
- 标题：只有前提的卡
- 一句话卖点：卖点表述
- premise：一个足够具体的故事前提描述`,
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(2);
    expect(result[1].title).toBe('只有前提的卡');
  });

  // ---- 格式变体归一化（qwen-3.8-2b 真实受害样本，2026-09-10 矩阵 27s 全灭根因）----
  // 模型把约定的「## 方向方案1 / - 标题：」偏离成「# 方案一：xxx」+「**标题：**」，
  // 三个变体叠加：heading 中文数字、字段行 markdown 粗体包裹、premise 英文字段名大写。
  const qwenVariantBlock = (no: string, name: string, title: string, premise: string) => `# 方案${no}：${name}
**标题：** ${title}

**一句话卖点：** 穿越者靠现代思维在朝堂立足。

**Premise：** ${premise}

**主角成长路径：**
- 第1-30章：从被边缘化的县令身份起步
- 第31-60章：升任知府，统筹郡城事务

**核心冲突：**
- 朝堂权贵集团 vs. 被效率革命颠覆的基层官僚体系
- 主角的改革与既得利益集团的系统性反扑`;

  it('qwen 变体：中文数字 heading + 粗体字段 + Premise 大写可解析出全部方向卡', () => {
    const raw = [
      qwenVariantBlock('一', '制度重构师', '《朝堂之内，我是规则修改者》', '主角穿越成低微县令，用现代管理学重构地方治理体系。'),
      qwenVariantBlock('二', '信息炼金师', '《朝堂之上，我是情报炼金术士》', '主角穿越成被贬御史，把朝堂斗争转化为可控的信息战。'),
      qwenVariantBlock('三', '资本操盘手', '《朝堂之外，我操盘一场帝国游戏》', '主角以商人身份用资本运作介入朝堂博弈。'),
      '## 综合对比与最终推荐',
    ].join('\n\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(3);
    expect(result[0].title).toBe('《朝堂之内，我是规则修改者》');
    expect(result[0].premise).toContain('管理学');
    // 核心冲突的 bullet 值（无冒号的列表行）应被续行收集
    expect(result[0].coreConflict).toContain('朝堂权贵集团');
  });

  it('qwen 变体：标准格式与粗体格式混排时均可解析', () => {
    const raw = [
      fullBlock(1, '凡人修仙', '凡人逆袭'),
      qwenVariantBlock('二', '信息炼金师', '《信息战》', '把政治斗争转化为信息战。'),
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(2);
    expect(result[1].premise).toContain('信息战');
  });

  it('lfm 变体：闭合粗体在冒号前（**一句话卖点**：）可解析', () => {
    // lfm2.5-2.6b 真实形态（2026-09-10 双 2B 对比矩阵）：粗体只包字段名，
    // 冒号落在粗体之外——与 qwen 的 `**一句话卖点：**` 是两种不同变体
    const raw = [
      `## 方向方案一：《官道：用流程治乱局》
**一句话卖点**：主角穿越成三品县令，用现代行政管理流程把腐朽的官场程序化。

**premise**： 主角穿越到大明万历年间，成为三品县令。

**核心冲突**：制度规则与人情关系的正面碰撞`,
      `## 方向方案二
**标题：** 《我在官场搞基建》
**一句话卖点：** 用现代工程学在皇权倾轧中立足。
**premise：** 主角穿越成被贬的京城侍郎。`,
    ].join('\n');

    const result = parseDirections(raw);

    expect(result).toHaveLength(2);
    expect(result[0].oneLiner).toContain('三品县令');
    expect(result[0].premise).toContain('万历');
    expect(result[1].premise).toContain('侍郎');
  });

  it('旧格式没有档位和补强时，不从承载力正文猜档位', () => {
    const result = parseDirections(fullBlock(1, '凡人修仙', '凡人逆袭'));

    expect(result[0]?.longformCapacityTier).toBeNull();
    expect(result[0]?.longformGaps).toEqual([]);
  });

  it('只接受自标注的英文档位，并把补强短语拆开', () => {
    const raw = `## 方向方案1
- 标题：凡人修仙
- 一句话卖点：凡人逆袭
- premise：故事前提里写满地图、反派、升级
- 核心冲突：资源与权力的争夺
- 长篇承载力：地图持续扩张，反派很多，升级很快
- 长篇承载力档位：strong
- 长篇补强：补势力梯度、补长期悬念、补地图、补第四个`;

    const result = parseDirections(raw);

    expect(result[0]?.longformCapacityTier).toBe('strong');
    expect(result[0]?.longformGaps).toEqual(['补势力梯度', '补长期悬念', '补地图']);
    expect(result[0]?.longformCapacityNote).toContain('地图');
  });

  it('档位写成句子或补强写「无」时，档位为空、补强为空列表', () => {
    const raw = `## 方向方案1
- 标题：凡人修仙
- 一句话卖点：凡人逆袭
- premise：故事前提
- 核心冲突：资源与权力的争夺
- 长篇承载力：这个方向承载力很强
- 长篇承载力档位：很强
- 长篇补强：无`;

    const result = parseDirections(raw);

    expect(result[0]?.longformCapacityTier).toBeNull();
    expect(result[0]?.longformGaps).toEqual([]);
  });
});
