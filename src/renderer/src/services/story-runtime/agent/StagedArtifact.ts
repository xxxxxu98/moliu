/**
 * 暂存产物（docs/agent-architecture-refactor.md §2.1「写工具全部是暂存写」）。
 *
 * agent 的写类工具只写这里（内存），不落库；落库由确定性 commit 链在循环结束后完成。
 * 同时承载「写完必检」的账本：每次写入递增 revision，校验工具调用 `markVerified()`
 * 记录被校验的 revision，runner 的 finish 前置条件用 `isVerified()` 判断当前稿是否已过检。
 */

export interface StagedRevisionLog {
  revision: number;
  tool: string;
  note?: string;
}

export interface StagedVerification {
  /** 被校验时的 revision */
  revision: number;
  /** 阻断级问题数；0 才算通过 */
  blocking: number;
  /** 人可读摘要（进 transcript / 上报） */
  summary?: string;
}

export class StagedArtifact<T> {
  private value: T | null = null;
  private currentRevision = 0;
  private readonly logs: StagedRevisionLog[] = [];
  private verification: StagedVerification | null = null;

  has(): boolean {
    return this.value !== null;
  }

  get(): T | null {
    return this.value;
  }

  revision(): number {
    return this.currentRevision;
  }

  /** 整体替换产物（submit 类工具） */
  set(next: T, meta: { tool: string; note?: string }): number {
    this.value = next;
    this.currentRevision += 1;
    this.logs.push({ revision: this.currentRevision, tool: meta.tool, note: meta.note });
    return this.currentRevision;
  }

  /** 基于当前值局部更新（revise 类工具）；无产物时返回 null 由调用方报错 */
  update(mutate: (current: T) => T, meta: { tool: string; note?: string }): number | null {
    if (this.value === null) return null;
    return this.set(mutate(this.value), meta);
  }

  /** 记录一次校验结果；只有针对当前 revision 且 blocking=0 的记录才使 isVerified() 为真 */
  markVerified(result: Omit<StagedVerification, 'revision'>): void {
    this.verification = { revision: this.currentRevision, ...result };
  }

  /** 当前稿是否已通过校验（写入后再改稿会自动失效） */
  isVerified(): boolean {
    return (
      this.verification !== null &&
      this.verification.revision === this.currentRevision &&
      this.verification.blocking === 0
    );
  }

  lastVerification(): StagedVerification | null {
    return this.verification;
  }

  history(): readonly StagedRevisionLog[] {
    return this.logs;
  }
}
