/**
 * @vitest-environment happy-dom
 *
 * L4 生成层单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  ChangesPromptInjector,
  ModelRouter,
  DrafterRetryLoop,
} from '../index';
import { CHANGES_DELIMITER } from '../../state/types';
import type { GatePipelineResult } from '../../gates/types';
import type { ChangesPayload } from '../../state/types';

// ============================================================
// ChangesPromptInjector
// ============================================================

describe('ChangesPromptInjector', () => {
  const injector = new ChangesPromptInjector();

  it('注入 CHANGES 协议要求', () => {
    const result = injector.inject('写一章');
    expect(result.prompt).toContain(CHANGES_DELIMITER);
    expect(result.prompt).toContain('写一章');
  });

  it('includeExamples 控制示例', () => {
    const withExamples = injector.inject('p', { includeExamples: true });
    const without = injector.inject('p', { includeExamples: false });
    expect(withExamples.prompt.length).toBeGreaterThan(without.prompt.length);
  });
});

// ============================================================
// ModelRouter
// ============================================================

describe('ModelRouter', () => {
  it('未配置角色用默认模型', () => {
    const router = new ModelRouter('gpt-4o');
    expect(router.getModel('drafter')).toBe('gpt-4o');
    expect(router.getModel('planner')).toBe('gpt-4o');
  });

  it('配置后返回指定模型', () => {
    const router = new ModelRouter('gpt-4o', {
      models: { gate: 'gpt-4o-mini' },
    });
    expect(router.getModel('gate')).toBe('gpt-4o-mini');
    expect(router.getModel('drafter')).toBe('gpt-4o');
  });

  it('各角色参数不同', () => {
    const router = new ModelRouter('default');
    const drafterParams = router.getParams('drafter');
    const gateParams = router.getParams('gate');
    expect(drafterParams.temperature).toBeGreaterThan(gateParams.temperature);
  });
});

// ============================================================
// DrafterRetryLoop
// ============================================================

describe('DrafterRetryLoop', () => {
  function makeDrafter(outputs: string[]) {
    let callIdx = 0;
    return {
      drafter: {
        async draft(_prompt: string, _params: any) {
          const out = outputs[Math.min(callIdx, outputs.length - 1)];
          callIdx++;
          return out;
        },
      },
      // 辅助：返回调用次数
      getCallCount: () => callIdx,
    };
  }

  function makeGateRunner(results: GatePipelineResult[]) {
    let callIdx = 0;
    return async (_prose: string, _changes: ChangesPayload | null) => {
      const r = results[Math.min(callIdx, results.length - 1)];
      callIdx++;
      return r;
    };
  }

  function makePassedGate(): GatePipelineResult {
    return {
      passed: true, hasBlocking: false, blockingCount: 0, highCount: 0,
      totalIssues: 0, gates: [], allIssues: [],
      decision: { shouldBlock: false, reason: 'ok', canAutoFix: false, nextAction: 'accept' },
      totalDurationMs: 10,
    };
  }

  function makeFailedGate(blockingCount = 1): GatePipelineResult {
    return {
      passed: false, hasBlocking: true, blockingCount, highCount: 0,
      totalIssues: blockingCount, gates: [], allIssues: blockingCount > 0 ? [{
        category: 'consistency', severity: 'critical', location: 'test',
        description: '测试矛盾', autoFixable: false,
      }] : [],
      decision: { shouldBlock: true, reason: 'fail', canAutoFix: false, nextAction: 'rewrite' },
      totalDurationMs: 10,
    };
  }

  it('首次通过 → 1 次尝试', async () => {
    const { drafter } = makeDrafter([`正文\n\n${CHANGES_DELIMITER}\n{"version":"1.0","chapter":1,"changes":[]}`]);
    const router = new ModelRouter('m');
    const loop = new DrafterRetryLoop(drafter, router);
    const result = await loop.run('写一章', makeGateRunner([makePassedGate()]));
    expect(result.success).toBe(true);
    expect(result.attempts.length).toBe(1);
    expect(result.stopReason).toBe('passed');
  });

  it('首次失败二次通过 → 2 次尝试', async () => {
    const { drafter } = makeDrafter([
      `正文1\n\n${CHANGES_DELIMITER}\n{"version":"1.0","chapter":1,"changes":[]}`,
      `正文2\n\n${CHANGES_DELIMITER}\n{"version":"1.0","chapter":1,"changes":[]}`,
    ]);
    const router = new ModelRouter('m');
    const loop = new DrafterRetryLoop(drafter, router);
    const result = await loop.run('写一章', makeGateRunner([makeFailedGate(), makePassedGate()]));
    expect(result.success).toBe(true);
    expect(result.attempts.length).toBe(2);
  });

  it('全部失败 → 返回最佳尝试', async () => {
    const { drafter } = makeDrafter([
      `正文1\n\n${CHANGES_DELIMITER}\n{"version":"1.0","chapter":1,"changes":[]}`,
      `正文2\n\n${CHANGES_DELIMITER}\n{"version":"1.0","chapter":1,"changes":[]}`,
    ]);
    const router = new ModelRouter('m');
    const loop = new DrafterRetryLoop(drafter, router);
    const result = await loop.run('写一章', makeGateRunner([makeFailedGate(2), makeFailedGate(1)]), { maxAttempts: 2 });
    expect(result.success).toBe(false);
    expect(result.stopReason).toBe('max_attempts');
    expect(result.bestAttempt).not.toBeNull();
    expect(result.bestAttempt?.prose).toBe('正文2');
    expect(result.bestAttempt?.gateResult?.passed).toBe(false);
    // 第二次（blockingCount=1）分数应高于第一次（blockingCount=2）
    expect(result.bestAttempt?.attempt).toBe(2);
  });

  it('无门禁 → 直接返回首次', async () => {
    const { drafter } = makeDrafter([`正文\n\n${CHANGES_DELIMITER}\n{"version":"1.0","chapter":1,"changes":[]}`]);
    const router = new ModelRouter('m');
    const loop = new DrafterRetryLoop(drafter, router);
    const result = await loop.run('写一章', null);
    expect(result.success).toBe(true);
    expect(result.attempts.length).toBe(1);
    expect(result.bestAttempt?.prose).toBe('正文');
  });

  it('起草异常 → 终止', async () => {
    const failingDrafter = {
      async draft() { throw new Error('API 超时'); },
    };
    const router = new ModelRouter('m');
    const loop = new DrafterRetryLoop(failingDrafter as any, router);
    const result = await loop.run('写一章', makeGateRunner([makePassedGate()]));
    expect(result.stopReason).toBe('error');
    expect(result.success).toBe(false);
  });

  it('反馈 prompt 包含问题列表', async () => {
    // 用捕获 prompt 的 mock drafter
    const capturedPrompts: string[] = [];
    const drafter = {
      async draft(prompt: string) {
        capturedPrompts.push(prompt);
        return `正文${CHANGES_DELIMITER}\n{"version":"1.0","chapter":1,"changes":[]}`;
      },
    };
    const router = new ModelRouter('m');
    const loop = new DrafterRetryLoop(drafter as any, router);
    await loop.run('基础 prompt', makeGateRunner([makeFailedGate(), makePassedGate()]));
    // 第二次 prompt 应该包含反馈
    expect(capturedPrompts.length).toBe(2);
    expect(capturedPrompts[1]).toContain('审查反馈');
    expect(capturedPrompts[1]).toContain('测试矛盾');
  });
});
