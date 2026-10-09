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
import { genreTags } from '@/data/genre-tags';
import type { CoolPointType, GenreProfile, HookType } from '@/types/evaluation';
import type { GenreSeedHint } from '@/types/topic-discovery';
import { BRAIN_GENRES } from './fallback/genre-pool';

export type { GenreSeedHint };

/** 题材标签名 → 数据里显式声明的 profileId（优先于名称模糊匹配） */
const TAG_PROFILE_IDS: ReadonlyMap<string, string> = new Map(
  [...genreTags, ...BRAIN_GENRES].flatMap(tag =>
    tag.profileId ? [[tag.name, tag.profileId] as const] : [],
  ),
);

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
 * 按已落库的 Profile id 取 hint。id 对不上时返回 null，不猜题材。
 */
export function buildGenreSeedHintById(profileId: string): GenreSeedHint | null {
  const id = profileId.trim();
  if (!id) return null;
  const profile = getGenreProfile(id);
  return profile ? toHint(profile) : null;
}

/**
 * 按题材名匹配 Profile hint。
 * 优先使用题材标签声明的 profileId；无可靠匹配时返回 null（不强行套用默认都市）。
 */
export function buildGenreSeedHint(genreName: string): GenreSeedHint | null {
  const name = genreName.trim();
  if (!name) return null;

  const declaredId = TAG_PROFILE_IDS.get(name);
  const declared = declaredId ? getGenreProfile(declaredId) : undefined;
  if (declared) {
    return toHint(declared);
  }

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
    lines.push(`典型开篇模式参考（仅作读者预期锚点，可遵循也可反其道而行）：${hint.typicalOpening}`);
  }
  if (hint.commonRisks.length > 0) {
    lines.push(`读者预期锚点（可反其道而行制造新鲜感）：${hint.commonRisks.join('；')}`);
  }
  lines.push('hook / coolPoint 应贴合上述偏好，但不要生硬堆砌标签；在读者预期之上做反转更佳。');
  return lines;
}

/**
 * 混搭副题材 hint：逐个解析题材，按 profileId 去重并保持选择顺序，
 * 剔除与主题材相同的 Profile（主题材已由 formatGenreSeedHint 完整注入）。
 */
export function buildMixGenreHints(
  tags: readonly string[],
  primaryProfileId?: string,
): GenreSeedHint[] {
  const seen = new Set<string>(primaryProfileId ? [primaryProfileId] : []);
  const hints: GenreSeedHint[] = [];
  for (const tag of tags) {
    const hint = buildGenreSeedHint(tag);
    if (!hint || seen.has(hint.profileId)) continue;
    seen.add(hint.profileId);
    hints.push(hint);
  }
  return hints;
}

/** 把混搭副题材 hint 格式化为提示词片段（只给钩子 / 爽点偏好，避免喧宾夺主） */
export function formatMixGenreHints(hints: readonly GenreSeedHint[]): string[] {
  if (hints.length === 0) return [];
  return [
    '混搭副题材读者预期（主题材定主线逻辑，副题材只贡献钩子 / 规则 / 爽点，主辅约 7:3）：',
    ...hints.map(
      hint =>
        `- 「${hint.name}」偏好钩子：${hint.preferredHooks.join('、')}；偏好爽点：${hint.preferredCoolPoints.join('、')}`,
    ),
  ];
}
