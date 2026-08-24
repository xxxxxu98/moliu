import { afterEach, describe, expect, it, vi } from 'vitest';

const providers = [
  {
    id: 'first-provider',
    name: '其他模型',
    provider: 'openai',
    modelName: 'other-model',
    apiKey: 'other-key',
    enabled: true,
  },
  {
    id: 'agif-provider',
    name: '反重力-gemini-3.7-flash',
    provider: 'openai',
    modelName: 'gemini-3.7-flash-high',
    baseUrl: 'http://127.0.0.1:8045/v1',
    apiKey: 'agif-key',
    enabled: true,
  },
];

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => JSON.stringify({ aiProviders: providers })),
  },
}));

vi.mock('@/stores/settings.store', () => ({
  migrateMaxTokens: vi.fn((value: unknown) => value),
}));

import { resolveReaderJudgeConfig, type ResolvedRealAiConfig } from './continueWriteRealConfig';

const writer: ResolvedRealAiConfig = {
  provider: 'openai',
  providerId: 'writer-provider',
  apiKey: 'writer-key',
  model: 'writer-model',
  projectId: '',
  chapterNumber: 1,
  chapterCount: 1,
  emptyRewrite: true,
  targetWordCount: 3000,
  configPath: 'test.json',
};

describe('resolveReaderJudgeConfig', () => {
  afterEach(() => {
    delete process.env.MOLIU_READER_JUDGE_PROVIDER_ID;
  });

  it('默认优先选择反重力-gemini-3.7-flash，而不是配置列表第一项', () => {
    expect(resolveReaderJudgeConfig(writer)).toMatchObject({
      providerId: 'agif-provider',
      model: 'gemini-3.7-flash-high',
      baseUrl: 'http://127.0.0.1:8045/v1',
      independentFromWriter: true,
      selectionReason: 'default-judge-provider',
    });
  });

  it('显式环境变量仍覆盖默认裁判', () => {
    process.env.MOLIU_READER_JUDGE_PROVIDER_ID = 'first-provider';

    expect(resolveReaderJudgeConfig(writer)).toMatchObject({
      providerId: 'first-provider',
      model: 'other-model',
      selectionReason: 'explicit',
    });
  });
});
