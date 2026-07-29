/**
 * 开题种子的题材 Profile 提示
 * 从已有 GENRE_PROFILES 提取可读约束，注入种子生成（不硬裁决）
 */

import {
  GENRE_PROFILES,
  GENRE_TYPE_MAP,
  getGenreProfile,
  getGenreProfileByName,
} from '@/data/genre-profiles';
import type { CoolPointType, GenreProfile, HookType } from '@/types/evaluation';
import type { GenreSeedHint } from '@/types/topic-discovery';

export type { GenreSeedHint };

const HOOK_LABEL: Record<HookType, string> = {
  cliffhanger: '悬崖悬念',
  question: '疑问钩子',
  revelation: '揭示钩子',
  conflict: '冲突钩子',
  tension: '紧张钩子',
  choice: '选择钩子',
  mystery: '神秘钩子',
  emotional: '情感钩子',
  action: '动作钩子',
};

const COOLPOINT_LABEL: Record<CoolPointType, string> = {
  'face-slapping': '打脸',
  'show-off': '装逼碾压',
  'identity-reveal': '身份掉马',
  growth: '成长兑现',
  rescue: '救援/护短',
  treasure: '获宝机缘',
  breakthrough: '境界突破',
  romance: '感情进展',
  revenge: '复仇清算',
  'mystery-reveal': '真相揭示',
  comedy: '喜剧反差',
  justice: '正义伸张',
};

function toHint(profile: GenreProfile): GenreSeedHint {
  const opening = profile.typicalPatterns[0];
  return {
    profileId: profile.id,
    name: profile.name,
    preferredHooks: profile.hooks.opening.map(h => HOOK_LABEL[h] || h).slice(0, 3),
    preferredCoolPoints: profile.coolpoints.primary
      .map(c => COOLPOINT_LABEL[c] || c)
      .slice(0, 4),
    typicalOpening: opening ? `${opening.name}：${opening.description}` : undefined,
    commonRisks: profile.commonRisks.slice(0, 3).map(r => `${r.type}（${r.prevention}）`),
  };
}

/**
 * 按题材名匹配 Profile hint。
 * 无可靠匹配时返回 null（不强行套用默认都市）。
 */
export function buildGenreSeedHint(genreName: string): GenreSeedHint | null {
  const name = genreName.trim();
  if (!name) return null;

  const byName = getGenreProfileByName(name);
  if (byName) {
    return toHint(byName);
  }

  const mapped = GENRE_TYPE_MAP[name];
  if (mapped && mapped !== 'other') {
    const byId = getGenreProfile(mapped) || GENRE_PROFILES.find(p => p.id === mapped);
    if (byId) {
      return toHint(byId);
    }
  }

  const lower = name.toLowerCase();
  for (const profile of GENRE_PROFILES) {
    if (lower.includes(profile.name.toLowerCase()) || lower.includes(profile.id)) {
      return toHint(profile);
    }
  }

  return null;
}

/** 把 hint 格式化为提示词片段 */
export function formatGenreSeedHint(hint: GenreSeedHint): string[] {
  const lines = [
    `题材专属约束（来自「${hint.name}」Profile，请贴近该题材读者预期）：`,
    `偏好开篇钩子：${hint.preferredHooks.join('、')}`,
    `偏好核心爽点：${hint.preferredCoolPoints.join('、')}`,
  ];
  if (hint.typicalOpening) {
    lines.push(`典型开篇模式参考：${hint.typicalOpening}`);
  }
  if (hint.commonRisks.length > 0) {
    lines.push(`常见雷区（请避开）：${hint.commonRisks.join('；')}`);
  }
  lines.push('hook / coolPoint 应贴合上述偏好，但不要生硬堆砌标签。');
  return lines;
}
