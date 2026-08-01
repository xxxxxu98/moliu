import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { executeSmartContinue } from '@/services/writing/smartContinue';
import { SMART_CONTINUE_PRESET } from '@/services/writing/chapterWritePresets';

describe('smartContinue SSOT', () => {
  it('executeSmartContinue 与 WritingOrchestratorV2 共用同一入口模块', () => {
    const v2Path = path.resolve(
      __dirname,
      '../WritingOrchestratorV2.ts'
    );
    const source = readFileSync(v2Path, 'utf8');
    expect(source).toContain("from './smartContinue'");
    expect(source).toContain('executeSmartContinue');
    expect(source).not.toMatch(/\.\.\.SMART_CONTINUE_PRESET/);
    expect(typeof executeSmartContinue).toBe('function');
    expect(SMART_CONTINUE_PRESET.enablePreflight).toBe(true);
  });
});
