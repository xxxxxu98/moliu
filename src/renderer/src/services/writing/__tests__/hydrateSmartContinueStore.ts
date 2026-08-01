/**
 * 为智能续写 SSOT 灌入 Pinia（与 App 打开项目后状态对齐）
 */
import { createPinia, setActivePinia } from 'pinia';

import type { Chapter, PlotNode, Project } from '@/types/project';
import { useProjectStore } from '@/stores/project.store';
import { PreflightService } from '@/services/writing/preflight/PreflightService';
import { EnhancedContextAgent } from '@/services/ai/agents/enhanced-context-agent';

export function ensureActivePinia(): void {
  setActivePinia(createPinia());
}

export function hydrateProjectStoreForSmartContinue(options: {
  project: Project;
  chapter: Chapter;
  plotOutline: PlotNode[];
}): {
  projectStore: ReturnType<typeof useProjectStore>;
  preflightService: PreflightService;
  contextAgent: EnhancedContextAgent;
} {
  ensureActivePinia();
  const projectStore = useProjectStore();
  const projectWithOutline: Project = {
    ...options.project,
    plotOutline: options.plotOutline,
  };
  projectStore.setCurrentProject(projectWithOutline);
  projectStore.setChapters(projectWithOutline.chapters ?? []);
  projectStore.setVolumes(projectWithOutline.volumes ?? []);
  projectStore.setPlotOutline(options.plotOutline);
  projectStore.setCurrentChapter(options.chapter.id);

  return {
    projectStore,
    preflightService: new PreflightService(),
    contextAgent: new EnhancedContextAgent(),
  };
}
