/**
 * 灵感种子系统提示词回归。
 *
 * 真实事故：种子的书名要求只给了不带冒号的句式库但留了「自创句式」口子，
 * 而 AI 对「网文书名」的默认想象是《主标：副标》格式，导致开题中心一批
 * 种子标题清一色带冒号。要求同批书名风格必须混排：冒号格式与短句式都要出现。
 */
import { describe, expect, it } from 'vitest';

import { buildStorySeedsSystemPrompt } from '../topic-discovery-prompts';

describe('buildStorySeedsSystemPrompt 书名风格多样性', () => {
  it('系统提示词要求同批种子冒号格式与短句式并存', () => {
    const system = buildStorySeedsSystemPrompt('standard');

    expect(system).toContain('书名风格多样性');
    expect(system).toContain('冒号格式与不带冒号的短句式都要出现');
    expect(system).toContain('禁止整批清一色冒号格式');
  });

  it('各玩法模式（twist/dice/mix）都保留书名风格多样性要求', () => {
    for (const playStyle of ['twist', 'dice', 'mix'] as const) {
      const system = buildStorySeedsSystemPrompt(playStyle);
      expect(system).toContain('书名风格多样性');
    }
  });
});
