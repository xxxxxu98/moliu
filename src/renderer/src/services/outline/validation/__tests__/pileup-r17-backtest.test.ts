/**
 * r17 真实蓝图回测(一次性,产物在 temp 7 天窗口内有效):
 * 悬念堆积检测在 200 章真实大纲上的信号质量。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  findSuspenseDanglingIssues,
  type PacingScannableBlueprint,
} from '../pacingLedger';

const STORE_PATH = join(process.cwd(), 'temp', 'book-review', 'r17', 'storyflow-1790870780475.project-store.json');

describe('悬念堆积检测·r17 真实蓝图回测', () => {
  it.runIf(existsSync(STORE_PATH))('200 章蓝图:输出堆积信号清单供人工定性', () => {
    const store = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as {
      projects: Array<{ plotOutline?: PacingScannableBlueprint[] }>;
    };
    // plotOutline 节点 orderIndex 为 0-based 全书章号,统一转 1-based
    const blueprints = (store.projects[0].plotOutline ?? []).map((node, index) => ({
      ...node,
      orderIndex: index + 1,
    }));
    expect(blueprints.length).toBeGreaterThanOrEqual(190);

    const issues = findSuspenseDanglingIssues(blueprints);
    const dangling = issues.filter(i => i.kind === 'suspense-dangling');
    const pileups = issues.filter(i => i.kind === 'suspense-pileup');
    console.log(`悬空单章: ${dangling.length} 处;堆积区间: ${pileups.length} 处`);
    for (const p of pileups) console.log('  堆积:', p.detail.slice(0, 80));
    // 回测口径:r17 实测悬空 171/200(85.5%)而读者 87 分零弃读——词面悬空在
    // 换措辞承接为主的书上系统性假阳性,堆积是「供书审交叉判读的观察面」
    // 不是行动清单;断言只做烟囱(不崩溃、量级合理不爆炸)
    expect(pileups.length).toBeGreaterThan(0);
    expect(pileups.length).toBeLessThanOrEqual(30);
  });
});
