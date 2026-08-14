import { describe, expect, it } from 'vitest';

import { buildDirectionPrompt } from '../direction-prompt';

describe('buildDirectionPrompt', () => {
  it('默认禁止把现实题材种子擅自改成超自然题材', () => {
    const prompt = buildDirectionPrompt({
      seed: '现代社畜穿越古代朝堂，凭现代知识升官',
      wordCountRange: '30万-60万',
    });

    expect(prompt.system).toContain('创意种子没有明确出现超自然');
    expect(prompt.system).toContain('禁止擅自添加');
  });

  it('用户明确授权后允许跨题材扩展', () => {
    const prompt = buildDirectionPrompt({
      seed: '现代社畜穿越古代朝堂',
      wordCountRange: '30万-60万',
      creativeExpansionMode: 'allow-cross-genre',
    });

    expect(prompt.system).toContain('用户已允许跨题材扩展');
  });
});
