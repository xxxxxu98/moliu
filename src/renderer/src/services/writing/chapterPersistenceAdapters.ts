/**
 * 章节持久化 / 记忆提取适配器（智能续写与批量续写共用）
 *
 * 从 WritingOrchestratorV2 抽出，避免批量管道默认 persistence=null 导致正文不落库。
 */

import { useProjectStore } from '@/stores/project.store';
import type { ChapterPersistenceClient, MemoryClient } from '@/types/chapter-pipeline';
import type { Chapter } from '@/types/project';
import { DeAIService } from './de-ai-service';
import { countWords } from './utils';
import { mergeCharacterStateChanges, safeExtractChapterMemory } from './extract-plot-memory';
import { initializeMemoryManager, getMemoryManager } from './memory-manager';

const CHAPTER_STATUSES: readonly Chapter['status'][] = ['draft', 'editing', 'final'];

function isChapterStatus(value: unknown): value is Chapter['status'] {
  return typeof value === 'string' && (CHAPTER_STATUSES as readonly string[]).includes(value);
}

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
      // 曾硬编码 'published'：既不是 Chapter.status 的合法值（draft|editing|final），
      // 也把刚生成、还没人读过的初稿标成了终态。AI 落稿就是初稿，
      // 已有状态（作者手动改成 editing/final）不覆盖。
      ...(isChapterStatus(ch?.status) ? {} : { status: 'draft' satisfies Chapter['status'] }),
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
    async extractAndSave(chapterId, chapterNumber, prose, aiStateChanges) {
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
        // 由下方统一执行并校验保存结果，避免提取层 best-effort 吞掉写盘失败。
        enableFileBackup: false,
        fallbackToPrevious: true,
        characterRoster: (project.characters ?? []).map(c => c.name),
      });

      if (memory) {
        // AI 命运账优先合并（契约 7-10 出账，含 sanitize 防误报）；规则层只补
        // 移动/出场类碎片。merge 按 name|state 去重保首条，AI 条目在前。
        if (aiStateChanges?.length) {
          memory.characterStateChanges = mergeCharacterStateChanges([
            ...aiStateChanges,
            ...(memory.characterStateChanges ?? []),
          ]);
        }
        projectStore.addChapterMemory(memory);
        // chapterMemories 是项目关键读模型，必须同步到主项目快照。
        await projectStore.saveCurrentProject();
        const manager = getMemoryManager();
        const saved = await manager.saveMemory(memory);
        if (!saved) {
          throw new Error(`第 ${chapterNumber} 章记忆文件保存失败`);
        }
      }
      return memory;
    },
  };
}
