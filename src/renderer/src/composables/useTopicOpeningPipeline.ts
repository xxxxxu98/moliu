/**
 * 开题中心的方向卡 → 大纲 → 建书管线。
 * 页面只负责玩法面板；生成、展开和落库都走这里。
 */
import { computed, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { useDirectionSessionStore } from '@/components/home/discovery/directionSession.store';
import { useOutlineGenerator } from '@/composables/useOutlineGenerator';
import { useProjectCreator } from '@/composables/useProjectCreator';
import { mapExecutableOutlineToGeneratedOutline } from '@/services/outline/adapters/executable-outline-adapter';
import { buildTopicDiscoveryProjectSeed } from '@/services/inspiration/topic-discovery.service';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { TopicDiscoveryTab } from '@/types/topic-discovery';

/** 绑定开题中心当前字数区间，返回生成、展开、建书和取消。 */
export function useTopicOpeningPipeline(wordCountRange: Ref<string>) {
  const { t } = useI18n();
  const message = useMessage();
  const sessionStore = useDirectionSessionStore();
  const {
    isGenerating,
    error: generationError,
    progress: generationProgress,
    warnings: outlineWarnings,
    generateDirections,
    expandDirection,
    cancel: cancelGeneration,
    wasCancelled,
  } = useOutlineGenerator();
  const {
    isCreating,
    error: projectCreateError,
    createProject: doCreateProject,
    reset: resetProjectState,
  } = useProjectCreator();

  /** 当前正在跑方向生成、展开或建书的玩法 */
  const pipelineTab = ref<TopicDiscoveryTab | null>(null);

  const isProcessing = computed((): boolean => {
    return Boolean(isGenerating.value) || Boolean(isCreating.value);
  });

  function isPipelineActiveOn(tab: TopicDiscoveryTab): boolean {
    return pipelineTab.value === tab && isProcessing.value;
  }

  function pipelineErrorOn(tab: TopicDiscoveryTab): string | null {
    if (pipelineTab.value !== tab) return null;
    return generationError.value || projectCreateError.value || null;
  }

  function cancel(): void {
    if (!isGenerating.value) return;
    cancelGeneration();
    const tab = pipelineTab.value;
    if (tab) sessionStore.setEnhanceTarget(tab, null);
  }

  async function generateFromPrompt(
    prompt: string,
    tab: TopicDiscoveryTab,
  ): Promise<void> {
    pipelineTab.value = tab;
    sessionStore.setPrompt(tab, prompt);
    sessionStore.setEnhanceTarget(tab, null);
    resetProjectState();

    const directions = await generateDirections(prompt, {
      wordCountRange: wordCountRange.value,
    });

    if (wasCancelled.value) return;
    if (directions.length === 0 && isGenerating.value) return;

    if (directions.length === 0) {
      message.error(generationError.value || t('topicDiscovery.directionFailed'));
      return;
    }

    sessionStore.setDirections(tab, directions);
    sessionStore.setSelectedDirection(tab, directions[0] ?? null);
    sessionStore.setExpandedOutline(tab, null);
    sessionStore.setSelectedOutline(tab, null);
  }

  async function expandSelectedDirection(
    tab: TopicDiscoveryTab,
    options?: { enhancementBrief?: string; directionId?: string },
  ): Promise<void> {
    const session = sessionStore.getSession(tab);
    if (!session.selectedDirection || !session.prompt) return;

    pipelineTab.value = tab;
    const isEnhancing = !!options?.enhancementBrief;
    sessionStore.setEnhanceTarget(
      tab,
      isEnhancing ? (options?.directionId ?? session.selectedDirection.id) : null,
    );

    const outline = await expandDirection(session.prompt, session.selectedDirection, {
      wordCountRange: wordCountRange.value,
      enhancementBrief: options?.enhancementBrief,
    });

    sessionStore.setEnhanceTarget(tab, null);
    if (wasCancelled.value) return;

    if (!outline) {
      if (!isGenerating.value && generationError.value) {
        message.error(generationError.value.slice(0, 200));
      }
      return;
    }

    if (outlineWarnings.value.length > 0) {
      message.warning(
        `大纲已生成，但有 ${outlineWarnings.value.length} 条质量提示：${outlineWarnings.value[0].slice(0, 80)}`,
      );
    }

    sessionStore.setExpandedOutline(tab, outline);
    sessionStore.setSelectedOutline(
      tab,
      mapExecutableOutlineToGeneratedOutline(outline, {
        targetWordCountRange: wordCountRange.value,
      }),
    );
  }

  async function createProjectFromSession(tab: TopicDiscoveryTab): Promise<void> {
    const session = sessionStore.getSession(tab);
    const outlineToCreate =
      session.selectedOutline ??
      (session.expandedOutline
        ? mapExecutableOutlineToGeneratedOutline(session.expandedOutline, {
            targetWordCountRange: wordCountRange.value,
          })
        : null);
    if (!outlineToCreate) return;

    pipelineTab.value = tab;
    const topicDiscoverySeed = session.selectedSeedSnapshot
      ? buildTopicDiscoveryProjectSeed(
          session.selectedSeedSnapshot,
          session.seedSourceTab ?? tab,
        )
      : undefined;

    const projectId = await doCreateProject(outlineToCreate, { topicDiscoverySeed });
    if (!projectId && projectCreateError.value) {
      message.error(projectCreateError.value.slice(0, 200));
    }
  }

  function selectDirection(tab: TopicDiscoveryTab, direction: OutlineDirection): void {
    sessionStore.setSelectedDirection(tab, direction);
    sessionStore.setEnhanceTarget(tab, null);
    sessionStore.setExpandedOutline(tab, null);
    sessionStore.setSelectedOutline(tab, null);
  }

  return {
    pipelineTab,
    isGenerating,
    isCreating,
    isProcessing,
    generationProgress,
    generationError,
    isPipelineActiveOn,
    pipelineErrorOn,
    generateFromPrompt,
    expandSelectedDirection,
    createProjectFromSession,
    selectDirection,
    cancel,
  };
}
