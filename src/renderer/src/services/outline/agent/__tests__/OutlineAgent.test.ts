/**
 * OutlineAgent 单测：脚本化 transport 驱动 AgentLoopRunner，验证
 * 初稿已合格时零请求短路 / 读-改-检-finish 主路径 / 改后未复检回退 / 用户取消上抛。
 */
import { describe, expect, it } from 'vitest';

import type { AgentLoopTransport, AgentMessage } from '@/services/story-runtime/agent/AgentLoopRunner';

import { parseExpandedOutline } from '../../parser/expanded-outline-parser';
import type { OutlineDirection } from '../../types/direction';
import { runOutlineRepairAgent } from '../OutlineAgent';
import { buildCharacterBlock, buildOutlineFixture } from './outlineFixture';

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

/** 按轮次回放脚本；每轮可拿到完整消息数组做断言 */
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

function lastUserJson(messages: AgentMessage[]): Record<string, unknown> {
  const last = [...messages].reverse().find(message => message.role === 'user');
  return JSON.parse(last?.content ?? '{}') as Record<string, unknown>;
}

describe('runOutlineRepairAgent', () => {
  it('初稿已通过门禁且零质检问题:不发任何请求直接返回', async () => {
    const rawText = buildOutlineFixture();
    const transport = scripted([() => ({ action: 'finish' })]);
    const result = await runOutlineRepairAgent({
      rawText,
      outline: parseExpandedOutline(rawText)!,
      direction: DIRECTION,
      transport,
    });
    expect(result.agentRan).toBe(false);
    expect(transport.rounds).toBe(0);
    expect(result.completeness.canApply).toBe(true);
    expect(result.rawText).toBe(rawText);
  });

  it('主路径:kickoff 带 blockers → 读章 → 改章+补角色 → run_checks → finish', async () => {
    const rawText = buildOutlineFixture({
      chapterOverrides: { 9: { title: '第9章' } },
      extraVolumeCharacters: ['陈药师'],
    });
    const progress: string[] = [];
    const transport = scripted([
      messages => {
        const kickoff = lastUserJson(messages) as { initialCheck: { blocking: number; blockers: Array<{ kind: string }> } };
        expect(kickoff.initialCheck.blocking).toBeGreaterThan(0);
        expect(kickoff.initialCheck.blockers.map(item => item.kind)).toEqual(
          expect.arrayContaining(['placeholder-title', 'unknown-character-reference'])
        );
        expect(messages[0].content).toContain('rewrite_chapters');
        return {
          thought: '先读第 9 章',
          action: 'tool_call',
          calls: [
            { tool: 'get_chapters', args: { from: 9, to: 9 } },
            { tool: 'get_section', args: { name: '关键角色规划' } },
          ],
        };
      },
      messages => {
        const results = (lastUserJson(messages) as { results: Array<{ tool: string; ok: boolean }> }).results;
        expect(results.map(item => item.tool)).toEqual(['get_chapters', 'get_section']);
        expect(results.every(item => item.ok)).toBe(true);
        return {
          action: 'tool_call',
          tool: 'rewrite_chapters',
          args: { chapters: [{ chapterNumber: 9, title: '夜审第九宗旧案' }] },
        };
      },
      () => ({
        action: 'tool_call',
        tool: 'append_to_section',
        args: { name: '关键角色规划', body: buildCharacterBlock('陈药师', '盟友', 11) },
      }),
      () => ({ action: 'tool_call', tool: 'run_checks', args: {} }),
      messages => {
        const results = (lastUserJson(messages) as { results: Array<{ result: { blocking: number; canApply: boolean } }> }).results;
        expect(results[0].result.blocking).toBe(0);
        expect(results[0].result.canApply).toBe(true);
        return { action: 'finish', summary: '改第 9 章标题,补登记陈药师' };
      },
    ]);

    const result = await runOutlineRepairAgent({
      rawText,
      outline: parseExpandedOutline(rawText)!,
      direction: DIRECTION,
      transport,
      onProgress: message => progress.push(message),
    });

    expect(result.agentRan).toBe(true);
    expect(result.finishReason).toBe('model-finish');
    expect(result.completeness.canApply).toBe(true);
    expect(result.revertedUnchecked).toBe(false);
    expect(result.checksUsed).toBe(1);
    expect(result.outline.keyCharacters.map(item => item.name)).toContain('陈药师');
    expect(result.outline.chapterBlueprints!.find(item => item.orderIndex === 9)!.title).toBe('夜审第九宗旧案');
    expect(result.rawText).toContain('夜审第九宗旧案');
    expect(result.stats.byTool.rewrite_chapters).toBe(1);
    expect(progress.some(message => message.includes('开始修复'))).toBe(true);
    expect(progress.some(message => message.includes('结束'))).toBe(true);
  });

  it('改稿后直接 finish 被拒;连续拒绝后 stall 收束并回退到已校验稿', async () => {
    const rawText = buildOutlineFixture({ chapterOverrides: { 9: { title: '第9章' } } });
    const transport = scripted([
      () => ({
        action: 'tool_call',
        tool: 'rewrite_chapters',
        args: { chapters: [{ chapterNumber: 9, title: '夜审第九宗旧案' }] },
      }),
      messages => {
        // 第一次 finish 会被 guardFinish 拒绝(改后未 run_checks),之后模型固执重复 finish
        const last = [...messages].reverse().find(message => message.role === 'user')?.content ?? '';
        if (transport.rounds > 2) expect(last).toContain('尚未 run_checks');
        return { action: 'finish', summary: '我觉得改好了' };
      },
    ]);

    const result = await runOutlineRepairAgent({
      rawText,
      outline: parseExpandedOutline(rawText)!,
      direction: DIRECTION,
      transport,
      loopOptions: { maxFinishRejections: 2 },
    });

    expect(result.finishReason).toBe('stall');
    expect(result.revertedUnchecked).toBe(true);
    // 回退到初稿:第 9 章标题仍是占位,门禁不通过 → 调用方 fail-closed
    expect(result.outline.chapterBlueprints!.find(item => item.orderIndex === 9)!.title).toBe('第9章');
    expect(result.completeness.canApply).toBe(false);
    expect(result.warnings.some(message => message.includes('未复检'))).toBe(true);
    expect(result.warnings.some(message => message.includes('stall'))).toBe(true);
  });

  it('用户取消:AbortError 原样上抛', async () => {
    const rawText = buildOutlineFixture({ chapterOverrides: { 9: { title: '第9章' } } });
    const controller = new AbortController();
    const transport: AgentLoopTransport = {
      async send() {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      },
    };
    await expect(
      runOutlineRepairAgent({
        rawText,
        outline: parseExpandedOutline(rawText)!,
        direction: DIRECTION,
        transport,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('transport 持久失败:按 protocol-error 收束,返回初稿门禁结论', async () => {
    const rawText = buildOutlineFixture({ chapterOverrides: { 9: { title: '第9章' } } });
    const transport: AgentLoopTransport = {
      async send() {
        throw new Error('网关 502');
      },
    };
    const result = await runOutlineRepairAgent({
      rawText,
      outline: parseExpandedOutline(rawText)!,
      direction: DIRECTION,
      transport,
    });
    expect(result.finishReason).toBe('protocol-error');
    expect(result.completeness.canApply).toBe(false);
    expect(result.revertedUnchecked).toBe(false);
  });
});
