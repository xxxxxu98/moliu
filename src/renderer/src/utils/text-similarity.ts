/**
 * 文本相似度工具
 *
 * 用于跨轮次比对 issue / 提示等短文本是否"实质相同"：
 * - 章界开场重演（`contractHealth.detectOpeningRepetitionIssue`）比对本章开头与上章结尾。
 *
 * 设计取舍：issue.message 常含动态数字（字数、章号）和易变片段（位置描述、证据引用），
 * 直接逐字比对会被这些噪音干扰。因此先做归一化（去标点 / 数字 / 空白），再算归一化编辑距离。
 * 归一化后的相似度 ≥ 阈值（如 0.7）即视为"同一问题的不同措辞"。
 */

/** 去除标点、数字、空白，只保留有效字符用于相似度比对 */
function normalizeForSimilarity(text: string): string {
  // 保留中文、字母；去数字（字数/章号每轮变化）、去标点、去空白
  return text
    .replace(/[\d\s\p{P}\p{S}]/gu, '')
    .toLowerCase();
}

/** 编辑距离（Levenshtein），经典 DP 实现 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i += 1) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * 归一化相似度（0-1）：1 表示实质相同，0 表示完全无关。
 *
 * 先对两段文本做归一化（去数字/标点/空白），再按归一化编辑距离计算相似度。
 * 长度差异悬殊时退化为包含比（短串长度 / 长串长度），避免编辑距离在小串上过度惩罚。
 *
 * @example
 * normalizedSimilarity('字数严重不足：当前约 1183 字', '字数严重不足：当前约 2423 字') // ≈ 0.8+
 * normalizedSimilarity('语义问题[fact_conflict] 张三复活', '语义问题[logic_gap] 李四失踪') // 较低
 */
export function normalizedSimilarity(a: string, b: string): number {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;

  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;

  // 长度差异大时（shorter 不到 longer 的一半），直接用包含比，编辑距离意义不大
  if (shorter.length * 2 <= longer.length) {
    return longer.includes(shorter) ? shorter.length / longer.length : 0;
  }

  const distance = editDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * 归一化相似度的「保留数字」变体（0-1）。
 *
 * 跨章蓝图开场比对（outlineCompleteness / outline-roller findBlueprintRepetition）
 * 必须保留数字：「核对第3笔账目」和「核对第4笔账目」是两个不同事件，
 * 去掉数字后会误判成复述；而连环重写熔断用的 {@link normalizedSimilarity} 恰恰要去数字
 * （字数每轮变化），两者语义相反，不能混用。标点/空白仍去除、统一小写。
 */
export function normalizedSimilarityKeepingNumbers(a: string, b: string): number {
  const normalize = (text: string): string =>
    (text ?? '')
      .replace(/[\s\p{P}\p{S}]/gu, '')
      .toLowerCase();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;

  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  if (shorter.length * 2 <= longer.length) {
    return longer.includes(shorter) ? shorter.length / longer.length : 0;
  }
  const distance = editDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}
