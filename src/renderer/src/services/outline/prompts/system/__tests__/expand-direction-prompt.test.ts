import { describe, expect, it } from 'vitest';
import {
  buildExpandDirectionPrompt,
  buildVolumePlanSection,
} from '../expand-direction-prompt';
import type { OutlineDirection } from '../../../types/direction';

const sampleDirection: OutlineDirection = {
  id: 'dir-1',
  title: '废柴逆袭',
  oneLiner: '一句话卖点',
  premise: 'premise',
  protagonistArc: '从废柴到巅峰',
  coreConflict: '家族与宗门',
  coolPointStyle: ['打脸'],
  targetEmotions: ['爽'],
  riskNotes: ['节奏过快'],
  recommendationScore: 90,
  longformCapacityNote: '可支撑百万字',
  recommendedReason: '卖点清晰',
};

describe('buildVolumePlanSection', () => {
  it('按建议卷数生成对应数量的卷纲模板', () => {
    const section = buildVolumePlanSection(6);
    expect(section).toContain('### 第1卷');
    expect(section).toContain('### 第6卷');
    expect(section).not.toContain('### 第7卷');
    expect(section.match(/### 第\d+卷/g)?.length).toBe(6);
  });

  it('最少生成 3 卷，最多 48 卷', () => {
    expect(buildVolumePlanSection(1).match(/### 第\d+卷/g)?.length).toBe(3);
    expect(buildVolumePlanSection(20).match(/### 第\d+卷/g)?.length).toBe(20);
    expect(buildVolumePlanSection(100).match(/### 第\d+卷/g)?.length).toBe(48);
  });
});

describe('buildExpandDirectionPrompt', () => {
  it('百万字区间注入动态卷纲与卷数要求', () => {
    const prompt = buildExpandDirectionPrompt({
      seed: '测试种子',
      direction: sampleDirection,
      wordCountRange: '80万-150万字',
    });

    // 80-150万均值约 115万 → 约 7 卷（ceil(1150000/180000)=7）
    expect(prompt.system).toContain('### 第7卷');
    expect(prompt.system).not.toContain('{{VOLUME_PLAN_SECTION}}');
    expect(prompt.user).toMatch(/\d+卷规划要彼此递进/);
    expect(prompt.user).toContain('建议卷数约');
  });

  it('包含「## 单章蓝图」段及 30 章逐章模板（P0-A）', () => {
    const prompt = buildExpandDirectionPrompt({
      seed: '测试种子',
      direction: sampleDirection,
      wordCountRange: '30万-60万字',
    });
    expect(prompt.system).toContain('## 单章蓝图');
    // 30 章逐章占位（第1章 ~ 第30章）
    expect(prompt.system).toContain('### 第1章');
    expect(prompt.system).toContain('### 第30章');
    // 每章必备字段
    expect(prompt.system).toContain('- 标题：');
    expect(prompt.system).toContain('- CBN：');
    expect(prompt.system).toContain('- CEN：');
    expect(prompt.system).toContain('- mustCover：');
    // 第5条硬约束措辞调整：允许 30 章单章蓝图，禁止的是 100 章整本梗概
    expect(prompt.system).toMatch(/禁止把章节展开成 100 章以上/);
    expect(prompt.system).toMatch(/前 30 章的单章蓝图是必需输出/);
  });
});
