/**
 * 预检服务 (Preflight Service)
 * 
 * 职责：
 * 1. 验证项目环境
 * 2. 检查必要文件
 * 3. 刷新合同树
 * 4. 验证本章合同
 */

import { useProjectStore } from '@/stores/project.store';
import type {
  PreflightResult,
  VolumeContract,
  ChapterContract,
} from '@/types/writing-v2';
import type { Project } from '@/types/project';

export class PreflightService {
  private projectStore = useProjectStore();

  /**
   * 执行预检
   */
  async preflight(chapterNumber?: number): Promise<PreflightResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const project = this.projectStore.currentProject;

    // 1. 验证项目
    if (!project) {
      errors.push('没有加载项目');
      return {
        valid: false,
        errors,
        warnings,
        contracts: { genre: '', volume: null, chapter: null },
        projectInfo: { id: '', name: '', chapterCount: 0 },
      };
    }

    // 2. 检查项目结构
    this.checkProjectStructure(project, errors, warnings);

    // 3. 验证合同
    const volumeContract = await this.loadVolumeContract(project, chapterNumber);
    const chapterContract = await this.loadChapterContract(project, chapterNumber);

    // 4. 检查章节内容
    if (chapterNumber !== undefined) {
      const chapter = this.projectStore.chapters.find(
        (c) => c.orderIndex === chapterNumber - 1
      );
      if (!chapter) {
        errors.push(`章节 ${chapterNumber} 不存在`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      contracts: {
        genre: project.genre?.[0]?.name || 'unknown',
        volume: volumeContract,
        chapter: chapterContract,
      },
      projectInfo: {
        id: project.id,
        name: project.name,
        chapterCount: this.projectStore.chapters.length,
      },
    };
  }

  /**
   * 检查项目结构
   */
  private checkProjectStructure(
    project: Project,
    errors: string[],
    warnings: string[]
  ): void {
    // 检查角色
    if (!project.characters || project.characters.length === 0) {
      warnings.push('项目没有设定角色');
    }

    // 检查世界观
    if (!project.worldSchema || Object.keys(project.worldSchema).length === 0) {
      warnings.push('项目没有设定世界观');
    }

    // 检查大纲
    if (!project.plotOutline || project.plotOutline.length === 0) {
      warnings.push('项目没有设定大纲');
    }

    // 检查章节
    if (!project.chapters || project.chapters.length === 0) {
      warnings.push('项目没有章节');
    }
  }

  /**
   * 加载卷合同
   */
  private async loadVolumeContract(
    project: Project,
    chapterNumber?: number
  ): Promise<VolumeContract | null> {
    // 找到章节所属的卷
    const chapter = chapterNumber
      ? this.projectStore.chapters.find((c) => c.orderIndex === chapterNumber - 1)
      : null;

    if (!chapter) {
      return null;
    }

    const volume = this.projectStore.volumes.find(
      (v) => v.id === chapter.volumeId
    );

    if (!volume) {
      return null;
    }

    // 构建卷合同
    return {
      id: volume.id,
      volumeNumber: volume.orderIndex + 1,
      title: volume.name,
      pacingStrategy: 'normal',
      coolPointTarget: 1,
      readerSignals: [],
      tone: 'neutral',
    };
  }

  /**
   * 加载章节合同
   */
  private async loadChapterContract(
    project: Project,
    chapterNumber?: number
  ): Promise<ChapterContract | null> {
    if (chapterNumber === undefined) {
      return null;
    }

    const chapter = this.projectStore.chapters.find(
      (c) => c.orderIndex === chapterNumber - 1
    );

    if (!chapter) {
      return null;
    }

    // 从 plotOutline 中获取章节大纲
    const plotNode = project.plotOutline?.find(
      (p: any) =>
        p.chapterId === chapter.id ||
        p.orderIndex === chapterNumber - 1
    );

    // 构建章节合同
    const contract: ChapterContract = {
      id: chapter.id,
      chapterNumber,
      title: chapter.title || `第${chapterNumber}章`,
      directive: {
        goal: plotNode?.description || plotNode?.plotSummary || '续写当前情节',
        CBN: plotNode?.CBN,
        CPNs: plotNode?.CPNs || [],
        CEN: plotNode?.CEN,
        mustCoverNodes: plotNode?.mustCover || [],
        forbiddenZones: plotNode?.forbiddenZones || [],
      },
    };

    return contract;
  }

  /**
   * 验证项目是否就绪
   */
  async validateProjectReadiness(): Promise<{
    ready: boolean;
    missingItems: string[];
  }> {
    const missingItems: string[] = [];
    const project = this.projectStore.currentProject;

    if (!project) {
      missingItems.push('项目未加载');
      return { ready: false, missingItems };
    }

    // 检查必要项
    if (!project.name) {
      missingItems.push('项目名称');
    }

    if (!project.characters || project.characters.length === 0) {
      missingItems.push('角色设定');
    }

    if (!project.worldSchema) {
      missingItems.push('世界观设定');
    }

    if (!project.plotOutline || project.plotOutline.length === 0) {
      missingItems.push('故事大纲');
    }

    return {
      ready: missingItems.length === 0,
      missingItems,
    };
  }

  /**
   * 获取当前章节上下文
   */
  async getCurrentChapterContext(): Promise<{
    chapterNumber: number;
    previousChapterEnding: string;
    recentChaptersFullText: string;
    characters: any[];
    foreshadows: any[];
  } | null> {
    const project = this.projectStore.currentProject;
    const currentChapter = this.projectStore.currentChapter;

    if (!project || !currentChapter) {
      return null;
    }

    const currentIndex = currentChapter.orderIndex;
    const prevChapter =
      currentIndex > 0
        ? this.projectStore.sortedChapters[currentIndex - 1]
        : null;

    // 提取前章结尾
    const previousChapterEnding = this.extractChapterEnding(
      prevChapter?.content || ''
    );

    // 提取近期章节原文
    const recentChapterCount = 5;
    const recentChapters = this.projectStore.sortedChapters
      .filter((c, i) => i < currentIndex && i >= Math.max(0, currentIndex - recentChapterCount))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const recentChaptersFullText = recentChapters
      .map((c) => `【第${c.orderIndex + 1}章 · ${c.title}】\n\n${c.content || '（本章暂无内容）'}`)
      .join('\n\n==========\n\n');

    return {
      chapterNumber: currentIndex + 1,
      previousChapterEnding,
      recentChaptersFullText,
      characters: project.characters || [],
      foreshadows: project.foreshadows?.filter((f) => f.status !== 'resolved') || [],
    };
  }

  /**
   * 提取章节结尾
   */
  private extractChapterEnding(content: string): string {
    if (!content) {
      return '';
    }

    // 提取最后 500 字
    const lastPart = content.slice(-500);
    return lastPart.trim();
  }
}

// ============================================================
// Composable 导出
// ============================================================

let preflightServiceInstance: PreflightService | null = null;

export function usePreflightService(): PreflightService {
  if (!preflightServiceInstance) {
    preflightServiceInstance = new PreflightService();
  }
  return preflightServiceInstance;
}

export default PreflightService;
