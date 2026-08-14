import { describe, expect, it } from 'vitest';

import type { OutlineDirection } from '@/services/outline/types/direction';
import { OUTLINE_COMPLETENESS_POLICY } from '@/services/outline/validation/outlineCompleteness';
import { buildExpandDirectionPrompt } from '../expand-direction-prompt';
import {
  buildSkeletonStepPrompt,
  buildVolumePlanStepPrompt,
  buildStartupStepPrompt,
  buildCastStepPrompt,
  buildRhythmStepPrompt,
  OUTLINE_GENERATION_STEPS,
  type StepBuildContext,
} from '../expand-direction-steps';

const STARTUP_CHAPTER_COUNT = OUTLINE_COMPLETENESS_POLICY.startupChapterCount;

const DIRECTION: OutlineDirection = {
  id: 'dir-1',
  title: '验尸官破奇案',
  oneLiner: '现代法医穿越古代断案',
  premise: '法医林川穿越成古代仵作',
  protagonistArc: '仵作 → 县衙刑名 → 提刑官',
  coreConflict: '用现代法医学对抗古代官场黑幕',
  coolPointStyle: ['技术碾压', '当众打脸'],
  targetEmotions: ['爽快', '悬疑'],
  riskNotes: ['技术细节别太硬'],
  longformCapacityNote: '案件可分层',
  recommendedReason: '题材稀缺、爽点密集',
} as OutlineDirection;

function buildCtx(overrides: Partial<StepBuildContext> = {}): StepBuildContext {
  return {
    seed: '一个法医穿越的故事',
    direction: DIRECTION,
    wordCountRange: '100万-200万字',
    enhancementBrief: undefined,
    accumulatedRawText: '',
    ...overrides,
  };
}

describe('expand-direction-prompt 段模板组合（零回归）', () => {
  it('buildExpandDirectionPrompt 组合后含全部 14 个二级段、# 主方案 与 额外规则', () => {
    const built = buildExpandDirectionPrompt({
      seed: '种子',
      direction: DIRECTION,
      wordCountRange: '100万-200万字',
    });

    const expectedSections = [
      '## 故事定位',
      '## 核心驱动',
      '## 金手指设定',
      '## 故事规模规划',
      '## 四幕结构',
      '## 卷纲',
      '## 世界与势力规划',
      `## 前${STARTUP_CHAPTER_COUNT}章启动包`,
      '## 主要支线',
      '## 故事线规划',
      '## 情绪与爽点节奏',
      '## 卖点承载规划',
      '## 关键角色规划',
      '## 伏笔规划',
    ];
    for (const section of expectedSections) {
      expect(built.system, `应含 ${section}`).toContain(section);
    }
    expect(built.system).toContain('# 主方案');
    expect(built.system).toContain('额外规则：');
    // 动态占位符应被替换
    expect(built.system).not.toContain('{{VOLUME_PLAN_SECTION}}');
    expect(built.system).not.toContain('{{STARTUP_BLOCK_SECTION}}');
  });
});

describe('expand-direction-steps 分步 builder', () => {
  it('步1 骨架：system 含 6 个骨架段模板与聚焦指令，user 含种子与方向', () => {
    const built = buildSkeletonStepPrompt(buildCtx());

    expect(built.system).toContain('## 故事定位');
    expect(built.system).toContain('## 核心驱动');
    expect(built.system).toContain('## 金手指设定');
    expect(built.system).toContain('## 故事规模规划');
    expect(built.system).toContain('## 四幕结构');
    expect(built.system).toContain('## 世界与势力规划');
    expect(built.system).toContain('本次只需输出以下 6 个二级标题段');
    // 骨架步的 user 含种子
    expect(built.user).toContain('一个法医穿越的故事');
    expect(built.user).toContain('验尸官破奇案');
  });

  it('步2 卷纲：system 含动态卷数模板，user 含已确定方案上下文', () => {
    const accumulated = `## 故事定位\n- 标题：测试书\n\n## 核心驱动\n- 主角姓名：林川\n\n## 故事规模规划\n- 建议卷数：8`;
    const built = buildVolumePlanStepPrompt(buildCtx({ accumulatedRawText: accumulated }));

    expect(built.system).toContain('## 卷纲');
    expect(built.system).toContain('### 第1卷');
    expect(built.system).toContain('本次只需输出以下 1 个二级标题段');
    // user 提取了上下文段
    expect(built.user).toContain('测试书');
    expect(built.user).toContain('林川');
    expect(built.user).toContain('建议卷数：8');
  });

  it('步3 启动包：system 含 10 个 5 章块模板（1-5 至 46-50）', () => {
    const built = buildStartupStepPrompt(buildCtx());

    expect(built.system).toContain(`## 前${STARTUP_CHAPTER_COUNT}章启动包`);
    expect(built.system).toContain('### 1-5章');
    expect(built.system).toContain(`### 46-${STARTUP_CHAPTER_COUNT}章`);
    expect(built.system).toContain('本次只需输出以下 1 个二级标题段');
  });

  it('步4 角色伏笔：system 含角色段与伏笔段模板', () => {
    const accumulated = `## 核心驱动\n- 主角姓名：林川`;
    const built = buildCastStepPrompt(buildCtx({ accumulatedRawText: accumulated }));

    expect(built.system).toContain('## 关键角色规划');
    expect(built.system).toContain('## 伏笔规划');
    expect(built.system).toContain('本次只需输出以下 2 个二级标题段');
    // user 提取了主角姓名上下文
    expect(built.user).toContain('林川');
  });

  it('步5 节奏包装：system 含 4 个节奏段模板', () => {
    const built = buildRhythmStepPrompt(buildCtx());

    expect(built.system).toContain('## 主要支线');
    expect(built.system).toContain('## 故事线规划');
    expect(built.system).toContain('## 情绪与爽点节奏');
    expect(built.system).toContain('## 卖点承载规划');
    expect(built.system).toContain('本次只需输出以下 4 个二级标题段');
  });

  it('enhancementBrief 仅出现在步1 user，不泄漏到后续步骤', () => {
    const withBrief = buildCtx({ enhancementBrief: '强化势力博弈线' });
    expect(buildSkeletonStepPrompt(withBrief).user).toContain('强化势力博弈线');
    // 后续步骤的 user 不含 enhancementBrief（只含已确定方案上下文）
    expect(buildVolumePlanStepPrompt(withBrief).user).not.toContain('强化势力博弈线');
    expect(buildStartupStepPrompt(withBrief).user).not.toContain('强化势力博弈线');
  });
});

describe('OUTLINE_GENERATION_STEPS 配置', () => {
  it('共 5 步，前 3 步硬必需，后 2 步软降级', () => {
    expect(OUTLINE_GENERATION_STEPS).toHaveLength(5);
    const ids = OUTLINE_GENERATION_STEPS.map(step => step.id);
    expect(ids).toEqual(['skeleton', 'volumePlan', 'startup', 'cast', 'rhythm']);
    expect(OUTLINE_GENERATION_STEPS[0].required).toBe(true);
    expect(OUTLINE_GENERATION_STEPS[1].required).toBe(true);
    expect(OUTLINE_GENERATION_STEPS[2].required).toBe(true);
    expect(OUTLINE_GENERATION_STEPS[3].required).toBe(false);
    expect(OUTLINE_GENERATION_STEPS[4].required).toBe(false);
  });

  it('每步都有进度文案、段定义与 builder', () => {
    for (const step of OUTLINE_GENERATION_STEPS) {
      expect(step.progressMessage.length).toBeGreaterThan(0);
      expect(step.sections.length).toBeGreaterThan(0);
      expect(typeof step.build).toBe('function');
      // 每个段的 canonical 与 aliases 都有值
      for (const section of step.sections) {
        expect(section.canonical.length).toBeGreaterThan(0);
        expect(section.aliases.length).toBeGreaterThan(0);
        expect(section.aliases).toContain(section.canonical);
      }
    }
  });
});
