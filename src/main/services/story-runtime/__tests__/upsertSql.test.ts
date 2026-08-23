import { describe, it, expect } from 'vitest';
import { buildUpsertSql, PRESERVE_ON_CONFLICT_COLUMNS } from '../upsertSql';

describe('buildUpsertSql', () => {
  const entitiesDefinition = {
    columns: ['id', 'type', 'canonical_name', 'payload_json', 'first_chapter', 'last_chapter'],
    conflictColumns: ['id'],
  };

  it('entities 表的 first_chapter 用 COALESCE 保留首现章（不被后续 upsert 覆盖）', () => {
    const { sql } = buildUpsertSql(
      'entities',
      ['id', 'type', 'canonical_name', 'payload_json', 'first_chapter', 'last_chapter'],
      entitiesDefinition
    );
    expect(sql).toContain(
      'first_chapter = COALESCE(entities.first_chapter, excluded.first_chapter)'
    );
    // 其余列仍是常规 excluded 覆盖
    expect(sql).toContain('last_chapter = excluded.last_chapter');
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
  });

  it('无保留列的表维持纯 excluded 覆盖（与旧行为一致）', () => {
    const { sql } = buildUpsertSql(
      'temporal_facts',
      ['id', 'subject_id', 'predicate'],
      { columns: ['id', 'subject_id', 'predicate'], conflictColumns: ['id'] }
    );
    expect(sql).not.toContain('COALESCE');
    expect(sql).toContain('DO UPDATE SET id = excluded.id'.replace('id = excluded.id', 'subject_id = excluded.subject_id'));
  });

  it('行未包含保留列时不生成 COALESCE 子句（列集按写入行动态裁剪）', () => {
    const { sql } = buildUpsertSql(
      'entities',
      ['id', 'type', 'canonical_name', 'last_chapter'],
      entitiesDefinition
    );
    expect(sql).not.toContain('COALESCE');
  });

  it('占位符数量与列数一致', () => {
    const columns = ['id', 'type', 'canonical_name', 'first_chapter', 'last_chapter'];
    const { sql } = buildUpsertSql('entities', columns, entitiesDefinition);
    const placeholders = sql.match(/\((\?(?:, \?)*)\)/);
    expect(placeholders?.[1].split(', ').length).toBe(columns.length);
  });

  it('注册表声明 entities 的保留列为 first_chapter', () => {
    expect(PRESERVE_ON_CONFLICT_COLUMNS.entities).toEqual(['first_chapter']);
  });
});
