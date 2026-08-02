/**
 * 开题中心 UI 会话类型（从 TopicDiscoveryPanel 抽出）
 */

import type { Component } from 'vue';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import type { GeneratedOutline } from '@/types/inspiration';
import type { StorySeedCard, TopicDiscoveryTab } from '@/types/topic-discovery';

/** 每个玩法独立的方向卡会话 */
export interface DirectionSession {
  prompt: string;
  directions: OutlineDirection[];
  selectedDirection: OutlineDirection | null;
  expandedOutline: ExecutableOutline | null;
  selectedOutline: GeneratedOutline | null;
  enhanceTargetDirectionId: string | null;
  selectedSeedId: string | null;
  selectedSeedSnapshot: StorySeedCard | null;
  seedSourceTab: TopicDiscoveryTab | null;
}

export function createEmptySession(): DirectionSession {
  return {
    prompt: '',
    directions: [],
    selectedDirection: null,
    expandedOutline: null,
    selectedOutline: null,
    enhanceTargetDirectionId: null,
    selectedSeedId: null,
    selectedSeedSnapshot: null,
    seedSourceTab: null,
  };
}

export interface PlayModeOption {
  id: TopicDiscoveryTab;
  icon: Component;
  accent: string;
}
