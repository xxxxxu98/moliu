/**
 * 玩法配置表（唯一真相源）
 *
 * 每个玩法 = 一个配置项：刷新风格、是否产种子、约束合并策略。
 * 新增玩法只需在此追加配置 + 挂载对应 UI 组件。
 * 约束合并策略：
 *  - inheritLocks：继承雷达锁定的题材/受众/平台/篇幅
 *  - ownConstraints：以自身约束为准（混搭/骰子不套用锁定题材，避免覆盖用户组合）
 */

import type { SeedPlayStyle, TopicDiscoveryTab } from '@/types/topic-discovery';

export interface PlayModeConfig {
  id: TopicDiscoveryTab;
  /** 种子刷新风格（仅 producesSeeds 玩法有效） */
  style?: SeedPlayStyle;
  /** 是否产生灵感种子（radar/prompt 不产生，直接走方向管线） */
  producesSeeds: boolean;
  /** 约束合并策略 */
  mergeRules: 'inheritLocks' | 'ownConstraints';
}

export const PLAY_MODES: PlayModeConfig[] = [
  { id: 'seeds', style: 'standard', producesSeeds: true, mergeRules: 'inheritLocks' },
  { id: 'radar', producesSeeds: false, mergeRules: 'ownConstraints' },
  { id: 'mix', style: 'mix', producesSeeds: true, mergeRules: 'ownConstraints' },
  { id: 'dice', style: 'dice', producesSeeds: true, mergeRules: 'ownConstraints' },
  { id: 'twist', style: 'twist', producesSeeds: true, mergeRules: 'inheritLocks' },
  { id: 'prompt', producesSeeds: false, mergeRules: 'ownConstraints' },
];

const MODE_MAP = new Map(PLAY_MODES.map(mode => [mode.id, mode]));

export function getPlayMode(tab: TopicDiscoveryTab): PlayModeConfig {
  return MODE_MAP.get(tab) ?? PLAY_MODES[0];
}

/** 会产生种子的玩法列表（由配置派生，替代硬编码数组） */
export function getSeedPlayTabs(): TopicDiscoveryTab[] {
  return PLAY_MODES.filter(mode => mode.producesSeeds).map(mode => mode.id);
}

export function isSeedPlayTab(tab: TopicDiscoveryTab): boolean {
  return getPlayMode(tab).producesSeeds;
}

/** 玩法 → 种子刷新风格（替代旧 TAB_TO_STYLE 映射） */
export function getPlayStyle(tab: TopicDiscoveryTab): SeedPlayStyle | undefined {
  return getPlayMode(tab).style;
}
