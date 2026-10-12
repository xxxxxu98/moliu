// 大纲修复 agent 的读者判官反馈接线（⑥ 判官反向闭环）：
// 确定性门禁全绿但读者问题 blocking 时必须跑修复回合，findings 进 kickoff 且优先级最高。
import { describe, expect, it } from 'vitest';

import type { AgentLoopTransport, AgentMessage } from '@/services/story-runtime/agent/AgentLoopRunner';

import { parseExpandedOutline } from '../../parser/expanded-outline-parser';
import type { OutlineDirection } from '../../types/direction';
import { runOutlineRepairAgent, type OutlineReaderFeedback } from '../OutlineAgent';
import { buildOutlineFixture } from './outlineFixture';

const DIRECTION: OutlineDirection = {
  id: 'd1',
  title: '验尸官升官记',
  oneLiner: '现代法医穿越古代查案升官',
  premise: '穿越成验尸小吏的法医靠翻案一路升官',
  protagonistArc: '小吏 → 州府 → 刑部',
  coreConflict: '主角与县丞的权力对抗',
  coolPointStyle: ['翻案打脸'],
  targetEmotions: ['爽', '悬疑'],
  riskNotes: [],
  recommendationScore: 9,
  recommendedReason: '题材成熟',
};

function scripted(steps: Array<(messages: AgentMessage[]) => unknown>): AgentLoopTransport & { rounds: number } {
  let index = 0;
  const transport = {
    rounds: 0,
    async send(messages: AgentMessage[]) {
      transport.rounds += 1;
      const step = steps[index] ?? steps[steps.length - 1];
      index += 1;
      return JSON.stringify(step(messages));
    },
  };
  return transport;
}

function lastUserContent(messages: AgentMessage[]): string {
  return [...messages].reverse().find(message => message.role === 'user')?.content ?? '';
}

const BLOCKING_FEEDBACK: OutlineReaderFeedback = {
  score: 72,
  wouldStartReading: false,
  summary: '开篇钩子弱，卖点不聚焦',
  issues: [
    {
      id: 'reader.openingAttraction-1',
      severity: 'critical',
      description: '黄金三章没有形成追读钩子，第一章开场是日常交代',
      blocking: true,
      suggestion: '把第 1 章 CBN 改成命案现场直接冲突，主角当场验尸打脸',
    },
    { id: 'reader.payoffPlanning-2', severity: 'medium', description: '非 blocking 陪跑项', blocking: false },
  ],
};

describe('runOutlineRepairAgent × readerFeedback', () => {
  it('确定性门禁全绿但读者 blocking → 必须跑修复回合，findings 进 kickoff', async () => {
    const rawText = buildOutlineFixture();
    const transport = scripted([
      messages => {
        const kickoff = lastUserContent(messages);
        expect(kickoff).toContain('readerJudge');
        expect(kickoff).toContain('开篇钩子弱');
        expect(kickoff).toContain('优先级高于一切门禁黄签');
        expect(kickoff).toContain('initialCheck'); // 原确定性检查节仍在
        return { action: 'tool_call', tool: 'run_checks', args: {} };
      },
      () => ({ action: 'finish', summary: '按判官建议重写第 1 章钩子' }),
    ]);
    const result = await runOutlineRepairAgent({
      rawText,
      outline: parseExpandedOutline(rawText)!,
      direction: DIRECTION,
      transport,
      readerFeedback: BLOCKING_FEEDBACK,
    });
    expect(result.agentRan).toBe(true);
    expect(transport.rounds).toBe(2);
    expect(result.completeness.canApply).toBe(true);
  });

  it('读者反馈无 blocking → 仍走零请求短路', async () => {
    const rawText = buildOutlineFixture();
    const transport = scripted([() => ({ action: 'finish' })]);
    const result = await runOutlineRepairAgent({
      rawText,
      outline: parseExpandedOutline(rawText)!,
      direction: DIRECTION,
      transport,
      readerFeedback: {
        score: 88,
        wouldStartReading: true,
        issues: [{ id: 'r-1', severity: 'low', description: '小瑕疵', blocking: false }],
      },
    });
    expect(result.agentRan).toBe(false);
    expect(transport.rounds).toBe(0);
  });
});
