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

  it('要求三个方向标题命名格式错开，禁止清一色冒号或清一色短句', () => {
    const prompt = buildDirectionPrompt({
      seed: '退休魔王在小区当保安',
      wordCountRange: '100万-300万',
    });

    expect(prompt.system).toContain('标题风格多样性');
    expect(prompt.system).toContain('冒号格式与不带冒号的短句式都要出现');
    expect(prompt.system).toContain('禁止三张卡全部使用同一格式');
  });
});
