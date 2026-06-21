/**
 * L1 状态层 - 统一导出
 *
 * 状态驱动架构的地基。所有"事实"都在这里，所有其他层从这里读、向这里写。
 *
 * 使用方式：
 *   import { createStateStore, createChangesApplier, buildChangesProtocolPrompt } from '@/services/state';
 *
 * 完整单章闭环：
 *   const store = createStateStore(projectId);              // 1. 初始化存储
 *   const applier = createChangesApplier(store);            // 2. 创建应用器
 *   const { prose, changes } = extractChanges(aiOutput);    // 3. 解析 AI 输出
 *   const result = applier.apply(changes, {...});           // 4. 事务化写入快照
 *   const snapshot = store.getSnapshot();                   // 5. 读最新快照供下一章
 */

// 类型
export * from './types';

// CHANGES 协议
export {
  extractChanges,
  formatChange,
  formatChangesPayload,
  serializeChanges,
  buildChangesProtocolPrompt,
  createEmptyChanges,
  makeChange,
} from './ChangesProtocol';
export type { ExtractResult, ChangesDiagnostics } from './ChangesProtocol';

// 快照存储
export {
  StateSnapshotStore,
  createStateStore,
  getStateStore,
  destroyStateStore,
} from './StateSnapshotStore';

// CHANGES 应用器
export {
  ChangesApplier,
  createChangesApplier,
} from './ChangesApplier';
export type { ApplyOptions, ApplyResult, ApplyStrictness } from './ChangesApplier';

// 快照构建器
export {
  SnapshotBuilder,
  createSnapshotBuilder,
  initializeStateFromProject,
  setDataExtractorFactory,
} from './SnapshotBuilder';
export type { BuildStats } from './SnapshotBuilder';
