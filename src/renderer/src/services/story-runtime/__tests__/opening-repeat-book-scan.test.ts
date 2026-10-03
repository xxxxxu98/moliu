/**
 * r17 全书 200 章实证扫描(产物在 temp 7 天窗口内有效):
 * 句/子句首逐字复读检测的大样本精确率验证。
 *
 * 2026-10-03 人工定性:9 处命中全部为「章首逐字搬用上章文字」——
 * 整句/子句逐字复读(013/039/115/120/126/141)+ 边界衔接句复用(004/007/020,
 * 12 字相同后半新写)。旧 bigram 章界重演预检(0.15 watch 线)只标出 2 处,
 * 漏报 7/9——句/子句首口径是准确防线。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { detectOpeningRepetitionIssue } from '../contractHealth';

const BOOK_DIR = join(process.cwd(), 'temp', 'book-review', 'r17-book');

/** r17 实证坐实的 9 处章界复读对(2026-10-03 已定向修复开头段,本扫描守护修复成果防回退) */
const REPAIRED_REPEAT_PAIRS = new Set([
  '004.txt→005.txt',
  '007.txt→008.txt',
  '013.txt→014.txt',
  '020.txt→021.txt',
  '039.txt→040.txt',
  '115.txt→116.txt',
  '120.txt→121.txt',
  '126.txt→127.txt',
  '141.txt→142.txt',
]);

describe('句/子句首逐字复读检测·r17 全书实证扫描', () => {
  it.runIf(existsSync(BOOK_DIR))('200 对章界:9 处存量复读已修复归零,防线零误杀', () => {
    const files = readdirSync(BOOK_DIR)
      .filter(name => /^\d{3}\.txt$/.test(name))
      .sort();
    expect(files.length).toBe(200);

    const proseByFile = new Map<string, string>();
    for (const file of files) {
      const raw = readFileSync(join(BOOK_DIR, file), 'utf8');
      const lines = raw.split('\n');
      lines.shift(); // 标题行
      proseByFile.set(file, lines.join('\n').trim());
    }

    const hits: string[] = [];
    for (let i = 1; i < files.length; i += 1) {
      const prevProse = proseByFile.get(files[i - 1]) ?? '';
      const currProse = proseByFile.get(files[i]) ?? '';
      const issue = detectOpeningRepetitionIssue(currProse, prevProse.slice(-160));
      if (issue) hits.push(`${files[i - 1]}→${files[i]}`);
    }
    // 9 处存量复读已定向修复:任何回退(含修复稿重新引入复读)都会在此暴露
    expect(hits).toHaveLength(0);
    expect(REPAIRED_REPEAT_PAIRS.size).toBe(9); // 清单自身防篡改
  });
});
