import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrateStoryRuntime } from './migrations';

const MAX_SAFE_PROJECT_ID_LENGTH = 80;

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
    const database = new Database(databasePath);
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
