import { describe, expect, it } from 'vitest';
import {
  buildExpandDirectionPrompt,
  buildStartupBlockSection,
  buildVolumePlanSection,
} from '../expand-direction-prompt';
import type { OutlineDirection } from '../../../types/direction';
import { OUTLINE_COMPLETENESS_POLICY } from '../../../validation/outlineCompleteness';

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

  it('主请求不再内联单章蓝图，改由后续分批拆章', () => {
    const prompt = buildExpandDirectionPrompt({
      seed: '测试种子',
      direction: sampleDirection,
      wordCountRange: '30万-60万字',
    });
    expect(prompt.system).not.toMatch(/^## 单章蓝图\s*$/m);
    expect(prompt.system).not.toMatch(/^### 第\d+章\s*$/m);
    expect(prompt.system).toMatch(/逐章拆解会在后续请求中分批完成/);
  });

  it('启动包按 5 章一块覆盖到第 50 章', () => {
    const prompt = buildExpandDirectionPrompt({
      seed: '测试种子',
      direction: sampleDirection,
      wordCountRange: '30万-60万字',
    });
    expect(prompt.system).toContain(`## 前${OUTLINE_COMPLETENESS_POLICY.startupChapterCount}章启动包`);
    expect(prompt.system).not.toContain('{{STARTUP_BLOCK_SECTION}}');
    expect(prompt.system).toContain('### 1-5章');
    expect(prompt.system).toContain('### 46-50章');
    expect(prompt.system.match(/### \d+-\d+章/g)?.length).toBe(10);
  });
});

describe('buildStartupBlockSection', () => {
  it('末块按剩余章数收口，不越过总章数', () => {
    const section = buildStartupBlockSection(12, 5);
    expect(section.match(/### \d+-\d+章/g)).toEqual(['### 1-5章', '### 6-10章', '### 11-12章']);
  });
});
