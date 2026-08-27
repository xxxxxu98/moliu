import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrateStoryRuntime } from './migrations';
import { resolveNativeBindingPath } from './sqliteNativeBinding';

const MAX_SAFE_PROJECT_ID_LENGTH = 80;

/**
 * 双 ABI 的 native binding 路径在模块加载时解析一次：App（electron，ABI 145）
 * 与 vitest（系统 Node，ABI 127）各取 prebuilds/ 下自己那份编译产物，
 * 互不复用 node_modules/build/Release 的单份文件——App 开着也能跑测试。
 * 打包产物 / 未跑过双编译脚本的全新环境回退默认路径（undefined）。
 */
const nativeBindingPath = resolveNativeBindingPath();

export function sanitizeProjectId(projectId: string): string {
  const normalized = projectId.trim().normalize('NFKC');
  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error('projectId 不合法');
  }

  const safePrefix = normalized
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_SAFE_PROJECT_ID_LENGTH);
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 12);

  // Windows/macOS 文件系统可能大小写不敏感，文件名始终附带原始 ID 哈希以避免碰撞。
  return `${safePrefix || 'project'}-${hash}`;
}

export class StoryRuntimeDatabaseManager {
  private readonly databases = new Map<string, Database.Database>();
  private readonly runtimeDirectory: string;

  constructor(userDataPath: string) {
    this.runtimeDirectory = path.resolve(userDataPath, 'story-runtime');
  }

  getDatabasePath(projectId: string): string {
    const fileName = `${sanitizeProjectId(projectId)}.db`;
    const databasePath = path.resolve(this.runtimeDirectory, fileName);
    const expectedPrefix = `${this.runtimeDirectory}${path.sep}`;

    if (!databasePath.startsWith(expectedPrefix)) {
      throw new Error('数据库路径越界');
    }
    return databasePath;
  }

  open(projectId: string): Database.Database {
    const databasePath = this.getDatabasePath(projectId);
    const cached = this.databases.get(databasePath);
    if (cached?.open) {
      return cached;
    }

    mkdirSync(this.runtimeDirectory, { recursive: true });
    const database = nativeBindingPath
      ? new Database(databasePath, { nativeBinding: nativeBindingPath })
      : new Database(databasePath);
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.pragma('synchronous = NORMAL');
    migrateStoryRuntime(database);
    database.pragma('foreign_keys = ON');
    this.databases.set(databasePath, database);
    return database;
  }

  close(projectId: string): void {
    const databasePath = this.getDatabasePath(projectId);
    const database = this.databases.get(databasePath);
    if (database?.open) {
      database.close();
    }
    this.databases.delete(databasePath);
  }

  closeAll(): void {
    for (const database of this.databases.values()) {
      if (database.open) {
        database.close();
      }
    }
    this.databases.clear();
  }
}
