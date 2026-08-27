// 定位 harness 失败根因:直接跑 runContinueWriteHarness 并打印 output.error / gateResult
const fs = require('fs');
const testFile = 'D:/project/2026/moliu/src/renderer/src/services/writing/__tests__/harness-debug.test.ts';
fs.writeFileSync(testFile, `import { describe, it } from 'vitest';
import { runContinueWriteHarness } from './continueWriteHarness';

describe('debug harness', () => {
  it('打印失败原因', async () => {
    const { output } = await runContinueWriteHarness({ runId: 'debug', persistTrace: false });
    console.log('success:', output.success);
    console.log('error:', output.error);
    console.log('errorKind:', output.errorKind);
    if (output.gateResult) {
      console.log('gates:', JSON.stringify(output.gateResult.gates?.map((g: any) => ({ id: g.gateId, passed: g.passed, issues: g.issues?.slice(0, 3) })), null, 1));
    }
    if (output.longFormResult) {
      console.log('commit:', JSON.stringify(output.longFormResult.commit));
      console.log('report issues:', JSON.stringify(output.longFormResult.report.issues.slice(0, 5), null, 1));
    }
  }, 30_000);
});
`, 'utf8');
console.log('written');
