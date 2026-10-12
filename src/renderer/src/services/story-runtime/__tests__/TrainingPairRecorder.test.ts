// 偏好对（training pair）导出通道回归：构造口径（拒→过 / 仅拒 / 首过不成对）
// + JSONL 落盘 + fromEnv 开关。引擎侧只快照，构造逻辑在本模块单测。
import { readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  TrainingPairRecorder,
  buildTrainingPairRecord,
  type BuildTrainingPairInput,
} from '../TrainingPairRecorder';
import type { ContinuityIssue, ContinuityReport } from '@/types/story-runtime';

function issue(id: string, severity: ContinuityIssue['severity'], message: string): ContinuityIssue {
  return { id, domain: 'semantic', severity, message, evidence: [] };
}

function report(accepted: boolean, issues: ContinuityIssue[]): ContinuityReport {
  return { accepted, issues, checkedDomains: ['semantic'] };
}

function baseInput(overrides: Partial<BuildTrainingPairInput> = {}): BuildTrainingPairInput {
  return {
    projectId: 'proj-1',
    chapterNumber: 7,
    rewriteRounds: 1,
    enteredRewrite: true,
    initialReport: report(false, [issue('j-1', 'blocking', '数字蒸发：既成100，写成120')]),
    initialProse: '初稿正文',
    finalReport: report(true, [issue('w-1', 'warning', '节奏偏均匀')]),
    finalProse: '终稿正文',
    finalStatus: 'accepted',
    at: '2026-10-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildTrainingPairRecord', () => {
  it('改稿后过审 → rejected-then-accepted：rejected 侧用初审快照，accepted 侧带残留', () => {
    const record = buildTrainingPairRecord(baseInput());
    expect(record).not.toBeNull();
    expect(record!.pairKind).toBe('rejected-then-accepted');
    expect(record!.rejected.stage).toBe('initial-review');
    expect(record!.rejected.prose).toBe('初稿正文');
    expect(record!.rejected.issues).toHaveLength(1);
    expect(record!.rejected.issues[0]).toMatchObject({
      id: 'j-1',
      severity: 'blocking',
      message: '数字蒸发：既成100，写成120',
    });
    expect(record!.accepted?.prose).toBe('终稿正文');
    expect(record!.accepted?.residualIssues[0]?.id).toBe('w-1');
    expect(record!.schemaVersion).toBe('training-pair/v1');
  });

  it('改稿预算耗尽仍拒 → rejected-only：rejected 侧用终审（含全部 blocking）', () => {
    const record = buildTrainingPairRecord(
      baseInput({
        finalStatus: 'rejected',
        finalReport: report(false, [issue('j-2', 'blocking', '连续性未通过')]),
      })
    );
    expect(record!.pairKind).toBe('rejected-only');
    expect(record!.rejected.stage).toBe('final-review');
    expect(record!.rejected.prose).toBe('终稿正文');
    expect(record!.accepted).toBeUndefined();
  });

  it('无改稿分支的拒稿（假 AI 单测/预算 0 直接提交）→ rejected-only，rewindRounds=0', () => {
    const record = buildTrainingPairRecord(
      baseInput({
        enteredRewrite: false,
        rewriteRounds: 0,
        initialReport: undefined,
        initialProse: undefined,
        finalStatus: 'rejected',
        finalReport: report(false, [issue('j-3', 'blocking', '连续性未通过')]),
      })
    );
    expect(record!.pairKind).toBe('rejected-only');
    expect(record!.rejected.stage).toBe('final-review');
    expect(record!.rewriteRounds).toBe(0);
  });

  it('初稿即过且未改稿 → 不成对，返回 null', () => {
    const record = buildTrainingPairRecord(
      baseInput({ enteredRewrite: false, rewriteRounds: 0, initialReport: undefined, initialProse: undefined })
    );
    expect(record).toBeNull();
  });
});

describe('TrainingPairRecorder', () => {
  it('record + flush 追加 JSONL，record 抛错不冒泡', async () => {
    const dir = join(tmpdir(), `moliu-training-pairs-${Date.now()}`);
    const recorder = new TrainingPairRecorder({ dir, runTag: 'unit' });
    const record = buildTrainingPairRecord(baseInput());
    recorder.record(record!);
    recorder.record(record!);
    await recorder.flush();
    const out = join(dir, 'unit.jsonl');
    expect(existsSync(out)).toBe(true);
    const lines = readFileSync(out, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).pairKind).toBe('rejected-then-accepted');
    rmSync(dir, { recursive: true, force: true });
  });

  it('fromEnv：未设置返回 null；MOLIU_TRAINING_PAIRS=1 默认目录', () => {
    const before = { ...process.env };
    try {
      delete process.env.MOLIU_TRAINING_PAIRS_DIR;
      delete process.env.MOLIU_TRAINING_PAIRS;
      expect(TrainingPairRecorder.fromEnv('t')).toBeNull();
      process.env.MOLIU_TRAINING_PAIRS = '1';
      const on = TrainingPairRecorder.fromEnv('mytag');
      expect(on).not.toBeNull();
      expect(on!.getOutputFilePath()).toContain('mytag');
      process.env.MOLIU_TRAINING_PAIRS_DIR = 'temp/custom-pairs';
      const custom = TrainingPairRecorder.fromEnv();
      expect(custom!.getOutputFilePath()).toContain('temp/custom-pairs');
    } finally {
      process.env = before;
    }
  });

  it('persist=false 不落盘只入内存', async () => {
    const recorder = new TrainingPairRecorder({ dir: join(tmpdir(), `no-${Date.now()}`), persist: false });
    recorder.record(buildTrainingPairRecord(baseInput())!);
    await recorder.flush();
    expect(recorder.getRecords()).toHaveLength(1);
  });

  it('record 落盘失败只告警不抛错', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 父路径是文件而非目录 → mkdir 必然 ENOTDIR，跨平台确定失败
    const blocker = join(tmpdir(), `moliu-blocker-${Date.now()}.txt`);
    writeFileSync(blocker, 'x', 'utf8');
    try {
      const recorder = new TrainingPairRecorder({ dir: join(blocker, 'sub'), runTag: 'x' });
      recorder.record(buildTrainingPairRecord(baseInput())!);
      await recorder.flush();
      expect(warn).toHaveBeenCalled();
    } finally {
      rmSync(blocker, { force: true });
      warn.mockRestore();
    }
  });
});
