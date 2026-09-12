import type { OutlineDirection } from '../types/direction';
import {
  extractFieldValue,
  extractMultiValueField,
  normalizeGeneratedText,
  safeParseScore,
  splitByHeading,
} from './utils';

function parseDirectionBlock(block: string, index: number): OutlineDirection | null {
  // 标题 fallback（`方向方案N`）不应计入「有效字段」：
  // 旧实现把 fallback 标题也算作 1 个，导致只有「一句话卖点」的残缺块凑够 2
  // （fallback 标题 + oneLiner）就通过过滤，产生「只有一句话卖点、其余全空」的混乱卡。
  const extractedTitle = extractFieldValue(block, '标题');
  const title = extractedTitle ?? `方向方案${index + 1}`;
  const oneLiner = extractFieldValue(block, '一句话卖点') ?? '';
  const premise = extractFieldValue(block, 'premise') ?? '';
  const protagonistArc = extractFieldValue(block, '主角成长路径') ?? '';
  const coreConflict = extractFieldValue(block, '核心冲突') ?? '';
  const coolPointStyle = extractMultiValueField(block, '爽点风格');
  const targetEmotions = extractMultiValueField(block, '目标情绪');
  const riskNotes = extractMultiValueField(block, '风险提示');
  const recommendedReason = extractFieldValue(block, '推荐理由') ?? '';
  const longformCapacityNote = extractFieldValue(block, '长篇承载力') ?? '';

  // 推荐分：仅在模型真的给出数字时采用。
  // 旧实现回落到 `80 - index * 5` 伪造分数，会让"未给出评分"的方向被当作高推荐分，
  // 进而影响 QuickStart 的排序与"长篇承载力"提示。这里用 0 + null 语义区分"未给分"。
  const scoreRaw = extractFieldValue(block, '推荐分');
  const hasScore = scoreRaw !== null && /\d/.test(scoreRaw);
  const recommendationScore = hasScore ? safeParseScore(scoreRaw, 0) : 0;

  // 有效字段只计「模型真实给出」的内容；标题 fallback 不计。残缺块（只有一两句零散字段）
  // 会被这里挡掉，避免空壳方向卡混进列表。
  const meaningfulFieldCount = [extractedTitle, oneLiner, premise, coreConflict]
    .filter(Boolean)
    .length;
  if (meaningfulFieldCount < 2) {
    return null;
  }
  // 展开种子最低信息量门槛：premise / 核心冲突至少其一。expandDirection 的整条
  // 大纲管线都从这两个字段落笔（故事引擎/卷纲/启动包全部由它们派生）——
  // 只有「标题+一句话卖点」的薄卡走进展开，等于让模型对着一句话猜一整本书
  // （8题材矩阵实测此类卡展开后占位事件率显著偏高）。缺这两个字段宁可不进列表。
  if (!premise && !coreConflict) {
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

  // heading 归一化（qwen-3.8-2b 实测形态，2026-09-10）：编号容忍中文数字
  // （「# 方案一：xxx」），且标准「## 方向方案1」与变体「# 方案二」须合并切块——
  // 原主备二选一逻辑在两种格式混排时会丢掉变体块（变体整段被并进前一块 body）。
  const blocks = splitByHeading(
    text,
    /^#{1,3}\s*(?:方向方案|方向|方案)\s*[0-9一二三四五六七八九十]+/gm,
  );

  const parsed =
    blocks.length > 0
      ? blocks
          .map((block, index) => parseDirectionBlock(block.body, index))
          .filter((item): item is OutlineDirection => item !== null)
      : parseSingleFallbackBlock(text);

  return deduplicateDirections(parsed);
}

/**
 * 去重并重排方向卡 id。
 *
 * 模型偶发会把同一方向卡重复输出（连同标题/一句话卖点/premise/核心冲突逐字重复），
 * 产生「3 张正常 + 3 张一模一样 + 1 张残缺」这类 7 条结果。解析层按内容签名去重，
 * 保留首次出现者，再重新分配连续 id（避免去重后出现 direction-1/3/5 跳号）。
 *
 * 签名取「标题 + 一句话卖点 + premise + 核心冲突」拼接：这四项是一个方向的语义骨架，
 * 正常情况下不同方向不会四项全等；四项全等即视为同一张卡。
 */
function deduplicateDirections(directions: OutlineDirection[]): OutlineDirection[] {
  const seen = new Set<string>();
  const unique: OutlineDirection[] = [];
  for (const direction of directions) {
    const signature = [
      direction.title,
      direction.oneLiner,
      direction.premise,
      direction.coreConflict,
    ]
      .map(value => value.trim())
      .join('|')
      .toLowerCase();
    // 签名为空说明四项核心字段全空——理应在 parseDirectionBlock 已被过滤，
    // 这里再兜一道，避免任何「全空」卡混入。
    if (!signature || seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    unique.push(direction);
  }

  return unique.map((direction, index) => ({
    ...direction,
    id: `direction-${index + 1}`,
  }));
}
