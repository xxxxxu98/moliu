import type { ContinuityIssue, ContinuityReport } from '@/types/story-runtime';

/**
 * 偏好对（training pair）导出通道：把「判官拒稿 + 结构化拒因 + 改后过审稿」
 * 天然形成的对比样本落盘为 JSONL，供离线 SFT/DPO 攒料（数据飞轮第一期）。
 *
 * 采样口径（与引擎 write() 的改稿分支对齐）：
 * - rejected-then-accepted：初稿被拒（blocking/warning 或弱信号）→ agent 改稿 → 过审。
 *   rejected 侧 = 初稿全文 + 初审 issues；accepted 侧 = 终稿全文 + 残留（非阻断）issues。
 * - rejected-only：改稿预算用尽仍未过审（或无 agent 直接拒）。rejected 侧 = 终稿 + 终审 issues。
 * - 初稿即过且无改稿：不成对（无对比信号），不记录。
 *
 * 评价器可靠性是自训练的前提：拒因来自判官/确定性门禁（同 release-loop 口径），
 * 记录本身不做质量判断——garbage-in 由判官侧防线把关，这里只做忠实采样。
 */

export const TRAINING_PAIR_SCHEMA_VERSION = 'training-pair/v1';

export interface TrainingPairIssueSample {
  id: string;
  severity: string;
  message: string;
}

export interface TrainingPairRecord {
  schemaVersion: typeof TRAINING_PAIR_SCHEMA_VERSION;
  at: string;
  projectId: string;
  chapterNumber: number;
  pairKind: 'rejected-then-accepted' | 'rejected-only';
  /** 改稿回合消耗的 run_checks 预算（rejected-only 无 agent 时为 0） */
  rewriteRounds: number;
  rejected: {
    stage: 'initial-review' | 'final-review';
    prose: string;
    issues: TrainingPairIssueSample[];
  };
  accepted?: {
    prose: string;
    /** 过审稿残留的非阻断 issues（warning 级黄签，正样本的已知瑕疵） */
    residualIssues: TrainingPairIssueSample[];
  };
}

function toIssueSamples(issues: readonly ContinuityIssue[]): TrainingPairIssueSample[] {
  return issues.map(issue => ({
    id: issue.id,
    severity: String(issue.severity),
    message: issue.message,
  }));
}

export interface BuildTrainingPairInput {
  projectId: string;
  chapterNumber: number;
  rewriteRounds: number;
  /** 是否进入了改稿分支（shouldRewrite 或弱信号命中） */
  enteredRewrite: boolean;
  /** 初审报告（进入改稿分支时的 report 快照） */
  initialReport?: ContinuityReport;
  initialProse?: string;
  finalReport: ContinuityReport;
  finalProse: string;
  finalStatus: 'accepted' | 'rejected';
  at?: string;
}

/**
 * 由引擎一轮 write 的首末状态构造偏好对记录；不成对（初稿即过）返回 null。
 * 纯函数：引擎侧只负责快照输入，构造逻辑在这里单测。
 */
export function buildTrainingPairRecord(input: BuildTrainingPairInput): TrainingPairRecord | null {
  const accepted = input.finalStatus === 'accepted';
  if (!input.enteredRewrite && accepted) return null;

  const pairKind = input.enteredRewrite && accepted ? 'rejected-then-accepted' : 'rejected-only';
  const useInitial = input.enteredRewrite && accepted && input.initialReport;
  const rejected = useInitial
    ? {
        stage: 'initial-review' as const,
        prose: input.initialProse ?? '',
        issues: toIssueSamples(input.initialReport!.issues),
      }
    : {
        stage: 'final-review' as const,
        prose: input.finalProse,
        issues: toIssueSamples(input.finalReport.issues),
      };
  const record: TrainingPairRecord = {
    schemaVersion: TRAINING_PAIR_SCHEMA_VERSION,
    at: input.at ?? new Date().toISOString(),
    projectId: input.projectId,
    chapterNumber: input.chapterNumber,
    pairKind,
    rewriteRounds: input.rewriteRounds,
    rejected,
  };
  if (accepted) {
    record.accepted = {
      prose: input.finalProse,
      residualIssues: toIssueSamples(input.finalReport.issues),
    };
  }
  return record;
}

function canUseNodeFs(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.versions === 'object' &&
    typeof process.versions.node === 'string'
  );
}

export interface TrainingPairRecorderOptions {
  /** JSONL 输出目录（默认 temp/training-pairs） */
  dir?: string;
  /** 输出文件名（不含扩展名，默认 run-<时间戳>） */
  runTag?: string;
  persist?: boolean;
}

/**
 * JSONL 追加式记录器（同 RecordingStructuredAI 的落盘哲学：node fs 可用才落盘，
 * 否则仅内存；队列串行写避免交错）。记录失败绝不冒泡——训练采样不能影响写作主链。
 */
export class TrainingPairRecorder {
  private readonly records: TrainingPairRecord[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options?: TrainingPairRecorderOptions) {}

  getRecords(): readonly TrainingPairRecord[] {
    return this.records;
  }

  getOutputFilePath(): string {
    const dir = this.options?.dir ?? 'temp/training-pairs';
    const tag = this.options?.runTag ?? `run-${Date.now()}`;
    return `${dir}/${tag}.jsonl`;
  }

  record(record: TrainingPairRecord): void {
    this.records.push(record);
    if (this.options?.persist === false || !canUseNodeFs()) return;
    const filePath = this.getOutputFilePath();
    this.writeQueue = this.writeQueue
      .then(async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const resolved = path.resolve(filePath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.appendFile(resolved, `${JSON.stringify(record)}\n`, 'utf8');
      })
      .catch(error => {
        console.warn('[TrainingPairRecorder] 落盘失败（不影响写作主链）：', error);
      });
  }

  /** 测试/收尾用：等待落盘队列清空 */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  /**
   * 从环境变量构造：MOLIU_TRAINING_PAIRS_DIR 指定目录，或 MOLIU_TRAINING_PAIRS=1
   * 开启默认目录；headless 矩阵跑由 runner 注入前者。未设置时返回 null（完全关闭）。
   */
  static fromEnv(runTag?: string): TrainingPairRecorder | null {
    const dir = process.env.MOLIU_TRAINING_PAIRS_DIR?.trim();
    const enabled = process.env.MOLIU_TRAINING_PAIRS === '1';
    if (!dir && !enabled) return null;
    return new TrainingPairRecorder({ dir: dir || undefined, runTag });
  }
}
