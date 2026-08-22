import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, utimesSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * storyflow-prune 的命中/保留判定单测：在临时目录里构造最小 temp 形状，
 * 注入固定时钟验证 cutoff 边界。模块本身操作 process.cwd()/temp，这里
 * 通过 chdir 到临时工作区隔离（vitest worker 内安全，afterAll 恢复）。
 */

const ORIGINAL_CWD = process.cwd();
const NOW = Date.parse('2026-08-22T12:00:00Z');
const OLD = NOW - 10 * 86_400_000; // 10 天前（超过默认 7 天保留线）
const FRESH = NOW - 86_400_000; // 1 天前（保留线内）

let workRoot;

function setMtime(p, ms) {
  utimesSync(p, new Date(ms), new Date(ms));
}

async function loadPrune() {
  return import('../../scripts/storyflow-prune.mjs');
}

beforeAll(async () => {
  workRoot = mkdtempSync(join(tmpdir(), 'prune-test-'));
  const temp = join(workRoot, 'temp');
  // matrix provider 归档：一旧一新
  mkdirSync(join(temp, 'storyflow-matrix', 'provider-old'), { recursive: true });
  mkdirSync(join(temp, 'storyflow-matrix', 'provider-fresh'), { recursive: true });
  writeFileSync(join(temp, 'storyflow-matrix', 'provider-old', 'summary.json'), 'x');
  writeFileSync(join(temp, 'storyflow-matrix', 'provider-fresh', 'summary.json'), 'x');
  setMtime(join(temp, 'storyflow-matrix', 'provider-old'), OLD);
  setMtime(join(temp, 'storyflow-matrix', 'provider-fresh'), FRESH);
  // trace：旧 jsonl + 新 jsonl + 非 jsonl 文件
  mkdirSync(join(temp, 'ai-traces'), { recursive: true });
  writeFileSync(join(temp, 'ai-traces', 'old.jsonl'), 'x');
  writeFileSync(join(temp, 'ai-traces', 'fresh.jsonl'), 'x');
  writeFileSync(join(temp, 'ai-traces', 'index.other'), 'x');
  setMtime(join(temp, 'ai-traces', 'old.jsonl'), OLD);
  setMtime(join(temp, 'ai-traces', 'fresh.jsonl'), FRESH);
  setMtime(join(temp, 'ai-traces', 'index.other'), OLD);
  // 孤儿产物：旧带后缀 summary / 旧 project-store / 新 summary / 固定名旧 outline
  writeFileSync(join(temp, 'storyflow.closed-loop.provider-x.summary.json'), 'x');
  writeFileSync(join(temp, 'storyflow-provider-x-123.project-store.json'), 'x');
  writeFileSync(join(temp, 'storyflow.closed-loop.provider-y.summary.json'), 'x');
  writeFileSync(join(temp, 'storyflow.closed-loop.outline.json'), 'x');
  setMtime(join(temp, 'storyflow.closed-loop.provider-x.summary.json'), OLD);
  setMtime(join(temp, 'storyflow-provider-x-123.project-store.json'), OLD);
  setMtime(join(temp, 'storyflow.closed-loop.provider-y.summary.json'), FRESH);
  setMtime(join(temp, 'storyflow.closed-loop.outline.json'), OLD);
  // 孤儿 prose 目录：旧
  mkdirSync(join(temp, 'storyflow.closed-loop.provider-x.prose'), { recursive: true });
  writeFileSync(join(temp, 'storyflow.closed-loop.provider-x.prose', 'ch1.txt'), 'x');
  setMtime(join(temp, 'storyflow.closed-loop.provider-x.prose'), OLD);
  // 受保护：配置文件（旧也不删）
  writeFileSync(join(temp, 'continue-write.real.config.json'), '{}');
  setMtime(join(temp, 'continue-write.real.config.json'), OLD);

  process.chdir(workRoot);
});

afterAll(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(workRoot, { recursive: true, force: true });
});

describe('storyflow-prune', () => {
  it('过期 matrix 归档目录命中，新目录保留', async () => {
    const { planPrune } = await loadPrune();
    const kinds = planPrune({ nowMs: NOW, keepDays: 7 }).map(t => `${t.kind}:${t.path.split(sep()).pop()}`);
    expect(kinds).toContain('matrix-provider-dir:provider-old');
    expect(kinds).not.toContain('matrix-provider-dir:provider-fresh');
  });

  it('过期 jsonl trace 命中，新 trace 与非 jsonl 保留', async () => {
    const { planPrune } = await loadPrune();
    const names = planPrune({ nowMs: NOW, keepDays: 7 }).map(t => t.path.split(sep()).pop());
    expect(names).toContain('old.jsonl');
    expect(names).not.toContain('fresh.jsonl');
    expect(names).not.toContain('index.other');
  });

  it('崩跑孤儿产物（旧后缀 summary/project-store/prose 目录/固定名）命中，新的保留', async () => {
    const { planPrune } = await loadPrune();
    const names = planPrune({ nowMs: NOW, keepDays: 7 }).map(t => t.path.split(sep()).pop());
    expect(names).toContain('storyflow.closed-loop.provider-x.summary.json');
    expect(names).toContain('storyflow-provider-x-123.project-store.json');
    expect(names).toContain('storyflow.closed-loop.provider-x.prose');
    expect(names).toContain('storyflow.closed-loop.outline.json');
    expect(names).not.toContain('storyflow.closed-loop.provider-y.summary.json');
  });

  it('配置文件即使过期也绝不命中', async () => {
    const { planPrune } = await loadPrune();
    const names = planPrune({ nowMs: NOW, keepDays: 7 }).map(t => t.path.split(sep()).pop());
    expect(names).not.toContain('continue-write.real.config.json');
  });

  it('runPrune dry-run 不删文件，exec 删除命中项', async () => {
    const { runPrune } = await loadPrune();
    const dry = runPrune({ dryRun: true, keepDays: 7 });
    expect(dry.dryRun).toBe(true);
    expect(readdirSync(join(workRoot, 'temp', 'ai-traces'))).toContain('old.jsonl');
    const exec = runPrune({ dryRun: false, keepDays: 7 });
    expect(exec.count).toBe(dry.count);
    expect(readdirSync(join(workRoot, 'temp', 'ai-traces'))).not.toContain('old.jsonl');
    expect(readdirSync(join(workRoot, 'temp', 'ai-traces'))).toContain('fresh.jsonl');
    expect(readdirSync(join(workRoot, 'temp', 'storyflow-matrix'))).toContain('provider-fresh');
    expect(readdirSync(join(workRoot, 'temp'))).toContain('continue-write.real.config.json');
  });
});

function sep() {
  return process.platform === 'win32' ? '\\' : '/';
}
