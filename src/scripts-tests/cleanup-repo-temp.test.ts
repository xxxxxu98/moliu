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
  // book-review 三类子条目:退役轮次(10 天前)/近期轮次(1 天前)/基线白名单(10 天前但永留)
  mkdirSync(join(tempRoot, 'book-review', 'sample-old-0825'), { recursive: true });
  mkdirSync(join(tempRoot, 'book-review', 'sample-fresh-0903'), { recursive: true });
  mkdirSync(join(tempRoot, 'book-review', 'baseline100ch-r9'), { recursive: true });
  mkdirSync(join(tempRoot, 'storyflow-checkpoints'), { recursive: true });
  mkdirSync(join(tempRoot, 'storyflow-matrix-agif200r2a'), { recursive: true });
  // 2026-09-13 r4 灭失回归:矩阵归档按全树最新 mtime 判 14 天窗口——
  // 窗口内的复盘数据源保留,退役轮整目录删除
  mkdirSync(join(tempRoot, 'storyflow-matrix-retired-0820'), { recursive: true });
  mkdirSync(join(tempRoot, 'junk-run'), { recursive: true });
  writeFileSync(join(tempRoot, 'ai-traces', 'old.jsonl'), 'old-trace');
  writeFileSync(join(tempRoot, 'ai-traces', 'stale.jsonl'), 'stale-trace');
  writeFileSync(join(tempRoot, 'ai-traces', 'fresh.jsonl'), 'fresh-trace');
  writeFileSync(join(tempRoot, 'ai-traces', 'index.other'), 'index');
  writeFileSync(join(tempRoot, 'ai-traces', 'longform-agent-1789000000000.jsonl'), 'agent-2d');
  writeFileSync(join(tempRoot, 'ai-traces', 'longform-agent-1789999999999.jsonl'), 'agent-1d');
  writeFileSync(join(tempRoot, 'book-review', 'sample-old-0825', '001.txt'), 'old-chapter');
  writeFileSync(join(tempRoot, 'book-review', 'sample-fresh-0903', '001.txt'), 'fresh-chapter');
  writeFileSync(join(tempRoot, 'book-review', 'baseline100ch-r9', '001.txt'), 'baseline');
  writeFileSync(join(tempRoot, 'storyflow-checkpoints', 'stale.outline.json'), 'stale');
  writeFileSync(join(tempRoot, 'storyflow-checkpoints', 'fresh.outline.json'), 'fresh');
  writeFileSync(join(tempRoot, 'storyflow-matrix-agif200r2a', 'store.json'), 'matrix');
  writeFileSync(join(tempRoot, 'storyflow-matrix-retired-0820', 'store.json'), 'retired');
  writeFileSync(join(tempRoot, 'junk-run', 'out.txt'), 'junk');
  writeFileSync(join(tempRoot, 'continue-write.real.config.json'), '{}');
  setMtime(join(tempRoot, 'ai-traces', 'old.jsonl'), OLD);
  setMtime(join(tempRoot, 'ai-traces', 'stale.jsonl'), STALE);
  setMtime(join(tempRoot, 'ai-traces', 'fresh.jsonl'), FRESH);
  setMtime(join(tempRoot, 'ai-traces', 'index.other'), OLD);
  setMtime(join(tempRoot, 'ai-traces', 'longform-agent-1789000000000.jsonl'), NOW - 2 * 86_400_000);
  setMtime(join(tempRoot, 'ai-traces', 'longform-agent-1789999999999.jsonl'), FRESH);
  setMtime(join(tempRoot, 'book-review', 'sample-old-0825'), OLD);
  setMtime(join(tempRoot, 'book-review', 'sample-fresh-0903'), FRESH);
  setMtime(join(tempRoot, 'book-review', 'baseline100ch-r9'), OLD);
  setMtime(join(tempRoot, 'storyflow-checkpoints', 'stale.outline.json'), OLD);
  setMtime(join(tempRoot, 'storyflow-checkpoints', 'fresh.outline.json'), FRESH);
  // 退役矩阵:目录与内文件都设到 15 天前(超 14 天窗口)
  setMtime(join(tempRoot, 'storyflow-matrix-retired-0820', 'store.json'), NOW - 15 * 86_400_000);
  setMtime(join(tempRoot, 'storyflow-matrix-retired-0820'), NOW - 15 * 86_400_000);
});

afterEach(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

describe('cleanup-repo-temp KEEP 与 --all', () => {
  it('KEEP 不含单轮矩阵目录,也不整目录永保 ai-traces', async () => {
    const { KEEP_DEFAULT, SUBDIR_AGE_PRUNE } = await loadClean();
    expect(KEEP_DEFAULT.has('storyflow-matrix-agif200r2a')).toBe(false);
    expect(KEEP_DEFAULT.has('storyflow-matrix-agif200r2b')).toBe(false);
    expect(KEEP_DEFAULT.has('ai-traces')).toBe(false);
    expect(KEEP_DEFAULT.has('continue-write.real.config.json')).toBe(true);
    // 08-26/27 退役书审正文移出 KEEP(结论已入 memory;juezheng 基线在 book-review 白名单有副本)
    expect(KEEP_DEFAULT.has('review-xcjz')).toBe(false);
    expect(KEEP_DEFAULT.has('review-500ch')).toBe(false);
    expect(KEEP_DEFAULT.has('review-juezheng')).toBe(false);
    // book-review/checkpoints 不再整目录永保(34 轮退役书审曾堆积 38MB),
    // 改为子条目按天裁剪:近期轮次留、退役轮次清、基线白名单永留
    expect(KEEP_DEFAULT.has('book-review')).toBe(false);
    expect(KEEP_DEFAULT.has('storyflow-checkpoints')).toBe(false);
    expect(SUBDIR_AGE_PRUNE.has('book-review')).toBe(true);
    expect(SUBDIR_AGE_PRUNE.has('storyflow-checkpoints')).toBe(true);
  });

  it('--all 删除退役矩阵与 junk;窗口内矩阵归档保留;book-review 子条目裁剪:退役轮删、近期与基线留', async () => {
    const { runClean } = await loadClean();
    const result = runClean({ tempRoot, cleanAll: true, nowMs: NOW });
    // 2026-09-13 r4 灭失回归:窗口内(<14 天)矩阵归档是复盘/裁决/补写数据源,--all 不再无年龄整删
    expect(result.removed).not.toContain('storyflow-matrix-agif200r2a');
    expect(existsSync(join(tempRoot, 'storyflow-matrix-agif200r2a', 'store.json'))).toBe(true);
    expect(result.skippedProtected.some(item => item.startsWith('storyflow-matrix-agif200r2a('))).toBe(true);
    // 退役轮(15 天前)整目录删除
    expect(result.removed).toContain('storyflow-matrix-retired-0820');
    expect(result.removed).toContain('junk-run');
    expect(existsSync(join(tempRoot, 'continue-write.real.config.json'))).toBe(true);
    expect(result.skippedProtected).toContain('continue-write.real.config.json');
    // book-review:10 天前的退役轮次被裁,1 天前的近期轮次与基线白名单保留
    expect(existsSync(join(tempRoot, 'book-review', 'sample-old-0825'))).toBe(false);
    expect(existsSync(join(tempRoot, 'book-review', 'sample-fresh-0903', '001.txt'))).toBe(true);
    expect(existsSync(join(tempRoot, 'book-review', 'baseline100ch-r9', '001.txt'))).toBe(true);
    expect(result.prunedSubdirEntries).toContain('book-review/sample-old-0825');
    expect(result.prunedSubdirEntries).not.toContain('book-review/baseline100ch-r9');
    // checkpoints:14 天裁剪线,10 天前的仍保留(在窗口内),断点文件不动目录
    expect(existsSync(join(tempRoot, 'storyflow-checkpoints', 'stale.outline.json'))).toBe(true);
    expect(existsSync(join(tempRoot, 'storyflow-checkpoints', 'fresh.outline.json'))).toBe(true);
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

  it('--all 对 longform-agent trace 用 1 天独立窗口(2 天前的删,1 天前的留)', async () => {
    const { runClean } = await loadClean();
    runClean({ tempRoot, cleanAll: true, nowMs: NOW });
    const traces = readdirSync(join(tempRoot, 'ai-traces'));
    expect(traces).not.toContain('longform-agent-1789000000000.jsonl'); // 2 天前:agent 窗口外
    expect(traces).toContain('longform-agent-1789999999999.jsonl'); // 1 天前:窗口内
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
    // 窗口内矩阵归档按 14 天规则保留(不再是 --all 无年龄整删对象)
    expect(existsSync(join(tempRoot, 'storyflow-matrix-agif200r2a'))).toBe(true);
    expect(existsSync(join(tempRoot, 'storyflow-matrix-retired-0820'))).toBe(false);
  });

  it('--purge 忽略保留窗口:窗口内矩阵与 ai-traces 整目录删除,基线与 KEEP 配置仍留', async () => {
    const { runClean } = await loadClean();
    const result = runClean({ tempRoot, cleanAll: true, purge: true, nowMs: NOW });
    expect(result.removed).toContain('storyflow-matrix-agif200r2a');
    expect(result.removed).toContain('storyflow-matrix-retired-0820');
    expect(result.removed).toContain('ai-traces');
    expect(result.removed).toContain('junk-run');
    expect(existsSync(join(tempRoot, 'storyflow-matrix-agif200r2a'))).toBe(false);
    expect(existsSync(join(tempRoot, 'ai-traces'))).toBe(false);
    expect(existsSync(join(tempRoot, 'continue-write.real.config.json'))).toBe(true);
    expect(result.skippedProtected).toContain('continue-write.real.config.json');
    expect(existsSync(join(tempRoot, 'book-review', 'sample-fresh-0903'))).toBe(false);
    expect(existsSync(join(tempRoot, 'book-review', 'sample-old-0825'))).toBe(false);
    expect(existsSync(join(tempRoot, 'book-review', 'baseline100ch-r9', '001.txt'))).toBe(true);
    expect(existsSync(join(tempRoot, 'storyflow-checkpoints', 'fresh.outline.json'))).toBe(false);
    expect(existsSync(join(tempRoot, 'storyflow-checkpoints', 'stale.outline.json'))).toBe(false);
  });

  it('单独 --purge 也删除窗口内矩阵,且 --keep 优先于 --purge', async () => {
    const { runClean } = await loadClean();
    const result = runClean({
      tempRoot,
      purge: true,
      extraKeep: ['ai-traces'],
      nowMs: NOW,
    });
    expect(result.removed).toContain('storyflow-matrix-agif200r2a');
    expect(existsSync(join(tempRoot, 'ai-traces', 'fresh.jsonl'))).toBe(true);
    expect(existsSync(join(tempRoot, 'continue-write.real.config.json'))).toBe(true);
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
