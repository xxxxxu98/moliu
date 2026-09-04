import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, utimesSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * cleanup-repo-temp 的 KEEP / --all 按天裁剪 traces / --keep / --dir 回归。
 * 注入独立 tempRoot + 固定时钟,不碰仓库真实 temp/。
 */

const NOW = Date.parse('2026-09-04T12:00:00Z');
const OLD = NOW - 10 * 86_400_000; // 10 天前,超过 3 天裁剪线
const STALE = NOW - 5 * 86_400_000; // 5 天前,默认 3 天应删、--older-than 7 应留
const FRESH = NOW - 86_400_000; // 1 天前,保留

let workRoot: string;
let tempRoot: string;

function setMtime(p: string, ms: number): void {
  utimesSync(p, new Date(ms), new Date(ms));
}

async function loadClean() {
  return import('../../scripts/cleanup-repo-temp.mjs');
}

beforeEach(() => {
  workRoot = mkdtempSync(join(tmpdir(), 'cleanup-repo-temp-'));
  tempRoot = join(workRoot, 'temp');
  mkdirSync(join(tempRoot, 'ai-traces'), { recursive: true });
  mkdirSync(join(tempRoot, 'book-review', 'sample'), { recursive: true });
  mkdirSync(join(tempRoot, 'storyflow-matrix-agif200r2a'), { recursive: true });
  mkdirSync(join(tempRoot, 'junk-run'), { recursive: true });
  writeFileSync(join(tempRoot, 'ai-traces', 'old.jsonl'), 'old-trace');
  writeFileSync(join(tempRoot, 'ai-traces', 'stale.jsonl'), 'stale-trace');
  writeFileSync(join(tempRoot, 'ai-traces', 'fresh.jsonl'), 'fresh-trace');
  writeFileSync(join(tempRoot, 'ai-traces', 'index.other'), 'index');
  writeFileSync(join(tempRoot, 'book-review', 'sample', '001.txt'), 'chapter');
  writeFileSync(join(tempRoot, 'storyflow-matrix-agif200r2a', 'store.json'), 'matrix');
  writeFileSync(join(tempRoot, 'junk-run', 'out.txt'), 'junk');
  writeFileSync(join(tempRoot, 'continue-write.real.config.json'), '{}');
  setMtime(join(tempRoot, 'ai-traces', 'old.jsonl'), OLD);
  setMtime(join(tempRoot, 'ai-traces', 'stale.jsonl'), STALE);
  setMtime(join(tempRoot, 'ai-traces', 'fresh.jsonl'), FRESH);
  setMtime(join(tempRoot, 'ai-traces', 'index.other'), OLD);
});

afterEach(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

describe('cleanup-repo-temp KEEP 与 --all', () => {
  it('KEEP 不含单轮矩阵目录,也不整目录永保 ai-traces', async () => {
    const { KEEP_DEFAULT } = await loadClean();
    expect(KEEP_DEFAULT.has('storyflow-matrix-agif200r2a')).toBe(false);
    expect(KEEP_DEFAULT.has('storyflow-matrix-agif200r2b')).toBe(false);
    expect(KEEP_DEFAULT.has('ai-traces')).toBe(false);
    expect(KEEP_DEFAULT.has('continue-write.real.config.json')).toBe(true);
    expect(KEEP_DEFAULT.has('book-review')).toBe(true);
  });

  it('--all 删除单轮矩阵与 junk,保留配置和书审目录', async () => {
    const { runClean } = await loadClean();
    const result = runClean({ tempRoot, cleanAll: true, nowMs: NOW });
    expect(result.removed).toContain('storyflow-matrix-agif200r2a');
    expect(result.removed).toContain('junk-run');
    expect(existsSync(join(tempRoot, 'continue-write.real.config.json'))).toBe(true);
    expect(existsSync(join(tempRoot, 'book-review', 'sample', '001.txt'))).toBe(true);
    expect(result.skippedProtected).toContain('book-review');
    expect(result.skippedProtected).toContain('continue-write.real.config.json');
  });

  it('--all 默认 3 天裁剪 traces:过期 jsonl 删除,新 jsonl 与非 jsonl 保留', async () => {
    const { runClean } = await loadClean();
    const result = runClean({ tempRoot, cleanAll: true, nowMs: NOW });
    const traces = readdirSync(join(tempRoot, 'ai-traces'));
    expect(result.prunedTraceFiles).toContain('old.jsonl');
    expect(result.prunedTraceFiles).toContain('stale.jsonl');
    expect(traces).not.toContain('old.jsonl');
    expect(traces).not.toContain('stale.jsonl');
    expect(traces).toContain('fresh.jsonl');
    expect(traces).toContain('index.other');
    expect(existsSync(join(tempRoot, 'ai-traces'))).toBe(true);
  });

  it('--all --older-than 7 保留 5 天前 jsonl,仍删 10 天前', async () => {
    const { runClean } = await loadClean();
    runClean({ tempRoot, cleanAll: true, olderThanDays: 7, nowMs: NOW });
    const traces = readdirSync(join(tempRoot, 'ai-traces'));
    expect(traces).not.toContain('old.jsonl');
    expect(traces).toContain('stale.jsonl');
    expect(traces).toContain('fresh.jsonl');
  });

  it('--keep ai-traces --all 不裁剪 traces', async () => {
    const { runClean } = await loadClean();
    runClean({
      tempRoot,
      cleanAll: true,
      extraKeep: ['ai-traces'],
      nowMs: NOW,
    });
    const traces = readdirSync(join(tempRoot, 'ai-traces'));
    expect(traces).toContain('old.jsonl');
    expect(traces).toContain('stale.jsonl');
    expect(traces).toContain('fresh.jsonl');
  });

  it('--keep 额外目录在 --all 时保留(修复 keepList 未生效)', async () => {
    const { runClean } = await loadClean();
    runClean({
      tempRoot,
      cleanAll: true,
      extraKeep: ['junk-run'],
      nowMs: NOW,
    });
    expect(existsSync(join(tempRoot, 'junk-run', 'out.txt'))).toBe(true);
    expect(existsSync(join(tempRoot, 'storyflow-matrix-agif200r2a'))).toBe(false);
  });

  it('--dir ai-traces 整目录删除,含新 jsonl', async () => {
    const { runClean } = await loadClean();
    const result = runClean({
      tempRoot,
      explicitDirs: ['ai-traces'],
      nowMs: NOW,
    });
    expect(result.removed).toContain('ai-traces');
    expect(existsSync(join(tempRoot, 'ai-traces'))).toBe(false);
    expect(existsSync(join(tempRoot, 'book-review'))).toBe(true);
  });
});
