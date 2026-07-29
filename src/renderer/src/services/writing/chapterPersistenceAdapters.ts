/**
 * 章节持久化 / 记忆提取适配器（智能续写与批量续写共用）
 *
 * 从 WritingOrchestratorV2 抽出，避免批量管道默认 persistence=null 导致正文不落库。
 */

import { useProjectStore } from '@/stores/project.store';
import type {
  ChapterPersistenceClient,
  MemoryClient,
} from '@/services/orchestrator';
import { DeAIService } from './de-ai-service';
import { countWords } from './utils';
import { safeExtractChapterMemory } from './extract-plot-memory';
import { initializeMemoryManager, getMemoryManager } from './memory-manager';

/**
 * 创建章节正文持久化适配器（追加语义）。
 */
export function createChapterPersistenceClient(): ChapterPersistenceClient {
  const projectStore = useProjectStore();

  async function persist(
    chapterId: string,
    content: string,
    mode: 'append' | 'replace'
  ): Promise<{ oldContent: string }> {
    const chapters = projectStore.sortedChapters;
    const ch = chapters.find(c => c.id === chapterId) ?? projectStore.currentChapter;
    const oldContent = ch?.content ?? '';

    const { title: extractedTitle, content: cleanedContent } =
      DeAIService.extractAndValidateTitle(content);
    const separator = oldContent && !oldContent.endsWith('\n') ? '\n\n' : '';
    const newContent = mode === 'replace' ? cleanedContent : oldContent + separator + cleanedContent;
    const updateData: Record<string, unknown> = {
      content: newContent,
      wordCount: countWords(newContent),
      isGenerated: true,
      generatedAt: new Date().toISOString(),
      status: 'published',
    };
    if (extractedTitle) updateData.title = extractedTitle;
    await projectStore.updateChapter(chapterId, updateData);
    return { oldContent };
  }

  return {
    save: (chapterId, content) => persist(chapterId, content, 'append'),
    replace: (chapterId, content) => persist(chapterId, content, 'replace'),
  };
}

/**
 * 创建章节记忆提取适配器（best-effort，失败不影响提交）。
 */
export function createChapterMemoryClient(): MemoryClient {
  const projectStore = useProjectStore();

  return {
    async extractAndSave(chapterId, chapterNumber, prose) {
      const project = projectStore.currentProject;
      if (!project) return null;

      initializeMemoryManager(project.id, project.name, true);

      const ch = projectStore.sortedChapters.find(c => c.id === chapterId);
      const chapterForMemory = ch
        ? { ...ch, content: ch.content || prose }
        : {
            id: chapterId,
            title: `第${chapterNumber}章`,
            content: prose,
            orderIndex: chapterNumber - 1,
          };

      const memory = await safeExtractChapterMemory(chapterForMemory as any, chapterNumber, {
        enableAIEnhancement: true,
        enableFileBackup: true,
        fallbackToPrevious: true,
      });

      if (memory) {
        projectStore.addChapterMemory(memory);
        try {
          const manager = getMemoryManager();
          await manager.saveMemory(memory);
        } catch (err) {
          console.warn('[PersistenceAdapters] memoryManager.saveMemory 失败（不影响提交）:', err);
        }
      }
      return memory;
    },
  };
}
