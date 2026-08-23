/**
 * SQLite upsert 语句构造（纯函数，无 better-sqlite3 依赖，可单测）。
 *
 * 从 StoryRuntimeRepository.upsertRows 抽出：SQL 形态（尤其 COALESCE 保留列）
 * 是数据正确性关键，值得独立测试；native 模块在测试环境的 ABI 不可用时
 * 也能验证。
 */

export interface UpsertTableDefinition {
  columns: readonly string[];
  conflictColumns: readonly string[];
}

/** 冲突更新时保留原值的字段：首现信息只在首次插入有效，后续 upsert 不回退覆盖 */
export const PRESERVE_ON_CONFLICT_COLUMNS: Record<string, readonly string[]> = {
  entities: ['first_chapter'],
};

/**
 * 构造 INSERT ... ON CONFLICT 语句。
 *
 * 保留列语义：`first_chapter = COALESCE(表.列, excluded.列)`——
 * 库中已有值（非 NULL）则保留；仅在库中为 NULL 且新值有效时写入。
 * 注意：exclude 的列名来自表定义白名单（TABLE_DEFINITIONS），非用户输入。
 */
export function buildUpsertSql(
  table: string,
  insertColumns: readonly string[],
  definition: UpsertTableDefinition,
  preserveColumns: readonly string[] = PRESERVE_ON_CONFLICT_COLUMNS[table] ?? []
): { sql: string } {
  const applicablePreserve = preserveColumns.filter(column =>
    insertColumns.includes(column)
  );
  const updateColumns = insertColumns.filter(
    column =>
      !definition.conflictColumns.includes(column) && !applicablePreserve.includes(column)
  );

  const preserveSet = applicablePreserve.map(
    column => `${column} = COALESCE(${table}.${column}, excluded.${column})`
  );

  const setClauses = [
    ...updateColumns.map(column => `${column} = excluded.${column}`),
    ...preserveSet,
  ];

  const conflictSql =
    setClauses.length > 0 ? `DO UPDATE SET ${setClauses.join(', ')}` : 'DO NOTHING';

  const sql = `INSERT INTO ${table} (${insertColumns.join(', ')})
         VALUES (${insertColumns.map(() => '?').join(', ')})
         ON CONFLICT (${definition.conflictColumns.join(', ')}) ${conflictSql}`;

  return { sql };
}
