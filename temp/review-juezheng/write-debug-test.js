// 再跑一次调试:Gate D 修复后,是谁还在吃"你的答案？"
const fs = require('fs');
const testFile = 'D:/project/2026/moliu/src/renderer/src/services/writing/__tests__/sixgate-debug.test.ts';
fs.writeFileSync(testFile, `import { describe, it } from 'vitest';
import { SixGatePolishPipeline } from '../polish/SixGatePolishPipeline';

describe('debug', () => {
  it('打印 fixes', () => {
    const pipeline = new SixGatePolishPipeline();
    const curly = '他沉声道：\u201C这就是你的答案？\u201D';
    const result = pipeline.execute(curly);
    console.log('OUTPUT:', JSON.stringify(result.content));
    for (const fix of result.fixes) {
      console.log(fix.type, '|', JSON.stringify(fix.original), '->', JSON.stringify(fix.replacement ?? fix.reason), '|', fix.reason);
    }
  });
});
`, 'utf8');
console.log('written');
