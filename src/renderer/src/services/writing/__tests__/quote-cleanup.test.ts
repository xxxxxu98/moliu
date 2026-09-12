/**
 * 历史章引号清洗：对 project-store 里已生成章节回溯跑排版归一
 * （直引号→中文弯引号 + 未闭合对话引号修补——与管线出口 normalizeWebnovelParagraphs
 * 同一份实现，供管线修复落地前已写入的历史章补救）。
 *
 *   MOLIU_QUOTE_CLEAN_STORE=<store.json> npx vitest run <本文件>
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { normalizeWebnovelParagraphs } from '../typesetting';
import type { Project } from '@/types/project';

function loadProject(storePath: string): { root: Record<string, unknown>; project: Project } {
  const root = JSON.parse(readFileSync(storePath, 'utf8')) as Record<string, unknown>;
  const rawProjects = root.projects as unknown;
  const project = Array.isArray(rawProjects)
    ? (rawProjects[0] as Project)
    : rawProjects && typeof rawProjects === 'object'
      ? (Object.values(rawProjects)[0] as Project)
      : (root as unknown as Project);
  return { root, project };
}

describe('历史章引号清洗（一次性工具）', () => {
  it.runIf(!!process.env.MOLIU_QUOTE_CLEAN_STORE)('回溯清洗直引号并落盘', () => {
    const storePath = process.env.MOLIU_QUOTE_CLEAN_STORE!;
    const { root, project } = loadProject(storePath);
    let cleaned = 0;
    let straightBefore = 0;
    let straightAfter = 0;
    for (const chapter of project.chapters ?? []) {
      const raw = chapter.content ?? '';
      if (!raw.trim()) continue;
      straightBefore += (raw.match(/"/gu) ?? []).length;
      const normalized = normalizeWebnovelParagraphs(raw);
      if (normalized !== raw) {
        chapter.content = normalized;
        chapter.wordCount = normalized.replace(/\s+/gu, '').length;
        cleaned += 1;
      }
      straightAfter += ((chapter.content ?? '').match(/"/gu) ?? []).length;
    }
    if (!existsSync(`${storePath}.bak-quote`)) {
      copyFileSync(storePath, `${storePath}.bak-quote`);
    }
    const projectOut = project as unknown as Record<string, unknown>;
    if (Array.isArray(root.projects)) {
      (root.projects as unknown[])[0] = projectOut;
    } else if (root.projects && typeof root.projects === 'object') {
      const key = Object.keys(root.projects)[0];
      (root.projects as Record<string, unknown>)[key] = projectOut;
    }
    writeFileSync(storePath, JSON.stringify(root, null, 2), 'utf8');
    console.info(
      `[quote-clean] 清洗 ${cleaned} 章，直引号 ${straightBefore} → ${straightAfter}，store 落盘 ${storePath}（备份 .bak-quote）`,
    );
    expect(straightAfter).toBe(0);
  });
});
