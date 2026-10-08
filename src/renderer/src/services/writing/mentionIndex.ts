/**
 * 提及索引（2026-10-05，借鉴 Novelcrafter Codex 的全书提及地图）：
 * 从已提交场景块为指定角色建「实体 → 最近出现章节 + 原文片段」索引，
 * 给判官做跨章仲裁的逐字证据——判官上下文只有上章结尾 800 字，台账
 * 漏账时判官瞎眼（本会话确认的架构薄弱点），此为兜底层。
 *
 * 确定性构建（切块数据已在内存，零 AI 成本）；角色相关性由调用方（管线）
 * 从本章蓝图/出场名单给出，语义判定仍归判官。
 */

import type { SceneChunk } from '@/types/story-runtime';

/** 每角色取最近 N 个出现块 */
const CHUNKS_PER_ENTITY = 1;
/** 片段半径（字符） */
const EXCERPT_RADIUS = 60;
/** 最多注入多少个角色 */
const MAX_ENTITIES = 6;

function findNameIndex(text: string, name: string, aliases: string[] = []): number {
  for (const needle of [name, ...aliases]) {
    if (!needle) continue;
    const idx = text.indexOf(needle);
    if (idx >= 0) return idx;
  }
  return -1;
}

export interface MentionEvidenceOptions {
  chapterNumber: number;
  /** 候选角色名（含别名表） */
  names: Array<{ name: string; aliases?: string[] }>;
  /**
   * 只取比该章更早的出现（默认 chapterNumber-2 及以前：上章已有结尾 800 字，
   * 提及索引补 -2..-N 的盲区，不重复付费）
   */
  maxChapterIndexInclusive?: number;
}

/**
 * 为候选角色产出「角色｜第N章：「…片段…」」行；无出现的角色不出行。
 * 场景块按章倒序扫，保证取到的是最近一次出现。
 */
export function buildMentionEvidence(
  sceneChunks: SceneChunk[],
  options: MentionEvidenceOptions
): string[] {
  const ceiling =
    options.maxChapterIndexInclusive ?? Math.max(0, options.chapterNumber - 2);
  const sorted = [...sceneChunks].sort((a, b) => b.chapterIndex - a.chapterIndex);
  const lines: string[] = [];
  for (const { name, aliases } of options.names) {
    if (!name || lines.length >= MAX_ENTITIES) break;
    let taken = 0;
    for (const chunk of sorted) {
      if (chunk.chapterIndex > ceiling || chunk.chapterIndex >= options.chapterNumber) continue;
      const idx = findNameIndex(chunk.text, name, aliases);
      if (idx < 0) continue;
      const start = Math.max(0, idx - EXCERPT_RADIUS);
      const excerpt = chunk.text.slice(start, idx + name.length + EXCERPT_RADIUS).replace(/\s+/g, ' ');
      lines.push(`${name}｜第${chunk.chapterIndex + 1}章：「…${excerpt}…」`);
      taken += 1;
      if (taken >= CHUNKS_PER_ENTITY) break;
    }
  }
  return lines;
}
