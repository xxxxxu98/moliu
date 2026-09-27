#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const storePath = resolve(
  process.cwd(),
  'temp/storyflow-matrix/provider-1787044972770/storyflow-provider-1787044972770-1790048909070.project-store.json'
);

const chaptersToRepair = [39, 40, 41, 42, 43, 44, 45, 46, 47, 48];

console.log(`[auto-repair] 开始批量定点补写剩余章节：${chaptersToRepair.join(', ')}`);

for (const ch of chaptersToRepair) {
  console.log(`\n==================================================`);
  console.log(`[auto-repair] >>> 正在补写第 ${ch} 章...`);
  console.log(`==================================================`);

  let success = false;
  for (let attempt = 1; attempt <= 3 && !success; attempt++) {
    console.log(`[auto-repair] 第 ${ch} 章 第 ${attempt}/3 次执行...`);
    const res = spawnSync(
      'node',
      ['scripts/storyflow-repair-empty.mjs', storePath, String(ch)],
      {
        stdio: 'inherit',
        env: process.env,
      }
    );

    if (res.status === 0) {
      // 验证 store 中该章确实有字数
      try {
        const root = JSON.parse(readFileSync(storePath, 'utf8'));
        const p = Array.isArray(root.projects)
          ? root.projects[0]
          : Object.values(root.projects)[0];
        const chapter = (p.chapters || []).find(
          c => (c.orderIndex ?? 0) + 1 === ch
        );
        const len = (chapter?.content || '').trim().length;
        if (len > 500) {
          console.log(`[auto-repair] 第 ${ch} 章校验通过！正文字数: ${len}`);
          success = true;
          break;
        } else {
          console.warn(`[auto-repair] 第 ${ch} 章落盘字数过少 (${len})，准备重试`);
        }
      } catch (err) {
        console.warn(`[auto-repair] 校验第 ${ch} 章 store 时异常:`, err.message);
      }
    } else {
      console.warn(`[auto-repair] 第 ${ch} 章执行失败，退出码: ${res.status}`);
    }

    if (!success && attempt < 3) {
      console.log(`[auto-repair] 等待 10 秒后重试第 ${ch} 章...`);
      spawnSync('powershell', ['-Command', 'Start-Sleep -Seconds 10']);
    }
  }

  if (!success) {
    console.error(`[auto-repair] ❌ 第 ${ch} 章在 3 次重试后仍未成功，终止批量修复`);
    process.exit(1);
  }
}

console.log(`\n🎉 [auto-repair] 全部目标章节（39~48）补写完成并成功落盘！`);
