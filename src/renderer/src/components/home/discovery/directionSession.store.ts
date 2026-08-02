/**
 * 方向卡会话 Store
 * 每个玩法独立的方向卡会话（prompt/directions/大纲/种子快照），
 * 从 TopicDiscoveryPanel 组件内状态收敛而来。
 */

import { reactive } from 'vue';
import { defineStore } from 'pinia';
import type { StorySeedCard, TopicDiscoveryTab } from '@/types/topic-discovery';
import type { GeneratedOutline } from '@/types/inspiration';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import { createEmptySession, type DirectionSession } from './types';

const ALL_TABS: TopicDiscoveryTab[] = ['seeds', 'radar', 'mix', 'dice', 'twist', 'prompt'];

export const useDirectionSessionStore = defineStore('directionSession', () => {
  /** 每个玩法独立的方向卡会话 */
  const sessions = reactive<Record<TopicDiscoveryTab, DirectionSession>>(
    Object.fromEntries(ALL_TABS.map(tab => [tab, createEmptySession()])) as Record<
      TopicDiscoveryTab,
      DirectionSession
    >,
  );

  /** 当前正在跑方向生成/展开的玩法 */
  let pipelineTab: TopicDiscoveryTab | null = null;

  function getSession(tab: TopicDiscoveryTab): DirectionSession {
    return sessions[tab];
  }

  function resetSession(tab: TopicDiscoveryTab): void {
    sessions[tab] = createEmptySession();
  }

  function resetAll(): void {
    for (const tab of ALL_TABS) {
      sessions[tab] = createEmptySession();
    }
    pipelineTab = null;
  }

  function setPipelineTab(tab: TopicDiscoveryTab | null): void {
    pipelineTab = tab;
  }

  function isPipelineActiveOn(tab: TopicDiscoveryTab): boolean {
    return pipelineTab === tab;
  }

  // ---- 便捷更新器（保持类型安全）----
  function setPrompt(tab: TopicDiscoveryTab, prompt: string): void {
    sessions[tab].prompt = prompt;
  }

  function setDirections(tab: TopicDiscoveryTab, directions: OutlineDirection[]): void {
    sessions[tab].directions = directions;
  }

  function setSelectedDirection(tab: TopicDiscoveryTab, direction: OutlineDirection | null): void {
    sessions[tab].selectedDirection = direction;
  }

  function setExpandedOutline(tab: TopicDiscoveryTab, outline: ExecutableOutline | null): void {
    sessions[tab].expandedOutline = outline;
  }

  function setSelectedOutline(tab: TopicDiscoveryTab, outline: GeneratedOutline | null): void {
    sessions[tab].selectedOutline = outline;
  }

  function setEnhanceTarget(tab: TopicDiscoveryTab, directionId: string | null): void {
    sessions[tab].enhanceTargetDirectionId = directionId;
  }

  function setSelectedSeed(tab: TopicDiscoveryTab, seed: StorySeedCard | null): void {
    sessions[tab].selectedSeedId = seed?.id ?? null;
    sessions[tab].selectedSeedSnapshot = seed;
  }

  function setSeedSourceTab(tab: TopicDiscoveryTab, sourceTab: TopicDiscoveryTab | null): void {
    sessions[tab].seedSourceTab = sourceTab;
  }

  return {
    sessions,
    getSession,
    resetSession,
    resetAll,
    setPipelineTab,
    isPipelineActiveOn,
    setPrompt,
    setDirections,
    setSelectedDirection,
    setExpandedOutline,
    setSelectedOutline,
    setEnhanceTarget,
    setSelectedSeed,
    setSeedSourceTab,
  };
});
