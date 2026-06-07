import type { OutlineDirection } from '../types/direction';
import {
  extractFieldValue,
  extractMultiValueField,
  normalizeGeneratedText,
  safeParseScore,
  splitByHeading,
} from './utils';

function parseDirectionBlock(block: string, index: number): OutlineDirection | null {
  const title = extractFieldValue(block, '标题') ?? `方向方案${index + 1}`;
  const oneLiner = extractFieldValue(block, '一句话卖点') ?? '';
  const premise = extractFieldValue(block, 'premise') ?? '';
  const protagonistArc = extractFieldValue(block, '主角成长路径') ?? '';
  const coreConflict = extractFieldValue(block, '核心冲突') ?? '';
  const coolPointStyle = extractMultiValueField(block, '爽点风格');
  const targetEmotions = extractMultiValueField(block, '目标情绪');
  const riskNotes = extractMultiValueField(block, '风险提示');
  const recommendedReason = extractFieldValue(block, '推荐理由') ?? '';
  const longformCapacityNote = extractFieldValue(block, '长篇承载力') ?? '';
  const recommendationScore = safeParseScore(extractFieldValue(block, '推荐分'), 80 - index * 5);

  const meaningfulFieldCount = [title, oneLiner, premise, coreConflict].filter(Boolean).length;
  if (meaningfulFieldCount < 2) {
    return null;
  }

  return {
    id: `direction-${index + 1}`,
    title,
    oneLiner,
    premise,
    protagonistArc,
    coreConflict,
    coolPointStyle,
    targetEmotions,
    riskNotes,
    recommendationScore,
    recommendedReason,
    longformCapacityNote,
  };
}

function parseSingleFallbackBlock(raw: string): OutlineDirection[] {
  const parsed = parseDirectionBlock(raw, 0);
  return parsed ? [parsed] : [];
}

export function parseDirections(raw: string): OutlineDirection[] {
  const text = normalizeGeneratedText(raw);

  const primaryBlocks = splitByHeading(text, /^##\s*方向方案\s*\d+/gm);
  if (primaryBlocks.length > 0) {
    return primaryBlocks
      .map((block, index) => parseDirectionBlock(block.body, index))
      .filter((item): item is OutlineDirection => item !== null);
  }

  const fallbackBlocks = splitByHeading(text, /^#{1,3}\s*(?:方向|方案)\s*\d+/gm);
  if (fallbackBlocks.length > 0) {
    return fallbackBlocks
      .map((block, index) => parseDirectionBlock(block.body, index))
      .filter((item): item is OutlineDirection => item !== null);
  }

  return parseSingleFallbackBlock(text);
}
