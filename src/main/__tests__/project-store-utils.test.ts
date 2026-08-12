import { describe, expect, it } from 'vitest';

import { mergeProjectUpdate } from '../project-store-utils';

describe('mergeProjectUpdate', () => {
  it('局部更新 metadata 时保留大纲定位、启动包和卷计划', () => {
    interface TestProject {
      id: string;
      updatedAt: string;
      metadata?: {
        outlinePositioning?: { genres: string[] };
        startupPack?: { openingHook: string };
        volumePlans?: Array<{ volumeIndex: number }>;
        outlineProgress?: number;
      };
    }
    const current: TestProject = {
      id: 'project-1',
      updatedAt: 'old',
      metadata: {
        outlinePositioning: { genres: ['悬疑'] },
        startupPack: { openingHook: '铃响了' },
        volumePlans: [{ volumeIndex: 1 }],
        outlineProgress: 30,
      },
    };

    const result = mergeProjectUpdate<TestProject>(
      current,
      { metadata: { outlineProgress: 40 } },
      'new',
    );

    expect(result.metadata).toEqual({
      outlinePositioning: { genres: ['悬疑'] },
      startupPack: { openingHook: '铃响了' },
      volumePlans: [{ volumeIndex: 1 }],
      outlineProgress: 40,
    });
    expect(result.updatedAt).toBe('new');
  });

  it('未更新 metadata 时保留原对象', () => {
    const metadata = { outlineProgress: 30 };
    const result = mergeProjectUpdate(
      { id: 'project-1', name: '旧名', updatedAt: 'old', metadata },
      { name: '新名' },
      'new',
    );

    expect(result.metadata).toBe(metadata);
    expect(result.name).toBe('新名');
  });
});
