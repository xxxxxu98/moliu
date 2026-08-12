/**
 * electron-store 项目更新必须保留 metadata 中未参与本次更新的字段。
 * 顶层仍保持 PATCH 语义；仅 metadata 做一层合并，避免启动包、卷计划、
 * 大纲定位等关键数据被后续局部更新整块覆盖。
 */
export function mergeProjectUpdate<
  T extends { updatedAt: string; metadata?: object },
>(current: T, updates: Partial<T>, updatedAt: string): T {
  const includesMetadata = Object.prototype.hasOwnProperty.call(updates, 'metadata');
  return {
    ...current,
    ...updates,
    ...(includesMetadata
      ? {
          metadata: {
            ...(current.metadata ?? {}),
            ...(updates.metadata ?? {}),
          },
        }
      : {}),
    updatedAt,
  } as T;
}
