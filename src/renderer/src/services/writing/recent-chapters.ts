import type { ContextManager } from '@/services/writing/context-manager';

/**
 * 取当前章之前的 recentCount 章，压缩为「摘要 + 结尾」文本。
 * 避免整章原文灌入 prompt 浪费 token（首尾已足够承载文风）。
 * 单章智能续写与批量续写共用。
 */
export function buildRecentChaptersFullText(
  chapters: Array<{ orderIndex: number; title: string; content?: string }>,
  currentIndex: number,
  recentCount: number,
  contextManager: ContextManager,
): string {
  const recent = chapters
    .filter((_, i) => i < currentIndex && i >= Math.max(0, currentIndex - recentCount))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (recent.length === 0) return '';

  return recent
    .map(c => {
      const content = c.content || '';
      if (!content) return `【第${c.orderIndex + 1}章 · ${c.title}】\n\n（本章暂无内容）`;
      const summary = contextManager.extractPreviousChapterSummary(content, 300);
      const ending = content.length > 500 ? content.slice(-500) : content;
      return `【第${c.orderIndex + 1}章 · ${c.title}】\n[摘要] ${summary}\n……\n[结尾] ${ending}`;
    })
    .join('\n\n==========\n\n');
}
