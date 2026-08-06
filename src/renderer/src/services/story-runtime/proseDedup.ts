/**
 * 正文确定性去重：落库前的最后一道质量兜底。
 *
 * 原则（与 stripDraftLeakage 一致）：只删「确定性重复」，不改写叙述正文。
 * 不做语义近似删除，避免误伤排比、反复、回环等合法修辞手法。
 *
 * 处理三类模型高频重复（实测 case）：
 * 1. 相邻段落完全相同（模型把同一段写两遍）
 * 2. 段内连续相同句（同一句话挨着重复）
 * 3. 章末段含与上文完全相同的整句（章末回扣开篇钩子句，如「你签也得签」）
 */
import { normalizeWebnovelParagraphs } from '@/services/writing/typesetting';

/** 中文句末标点：用于切句 */
const SENTENCE_END_RE = /([。！？!?…]+)/u;

/**
 * 把一段文本按句切分，保留分隔符（句末标点跟随其前一句）。
 * 「他笑了。她哭了。」→ ['他笑了。', '她哭了。']
 */
function splitSentences(paragraph: string): string[] {
  if (!paragraph) return [];
  const sentences: string[] = [];
  let buffer = '';
  for (const char of paragraph) {
    buffer += char;
    if (SENTENCE_END_RE.test(char)) {
      sentences.push(buffer);
      buffer = '';
    }
  }
  if (buffer.trim()) sentences.push(buffer);
  return sentences;
}

/** 归一化比对键：去除首尾空白与引号差异，用于判定「同一句」 */
function sentenceKey(sentence: string): string {
  return sentence
    .trim()
    .replace(/["“”'‘’`]+/gu, '')
    .replace(/\s+/gu, '')
    .trim();
}

/**
 * 判断 b 是否为 a 的「纯尾部台词重复」：
 * a 以 b 结尾，且 b 是有意义的台词片段（长度 ≥ 4，去掉 a 尾部 b 后 a 仍有实质内容）。
 * 用于折叠「…师爷冷笑：你签也得签，不签也得签！你签也得签，不签也得签！」类章末回扣。
 */
function isTailEcho(a: string, b: string): boolean {
  const ka = sentenceKey(a);
  const kb = sentenceKey(b);
  if (!kb || kb.length < 4) return false;
  // 完全相同已由上层处理
  if (ka === kb) return false;
  // a 必须以 b 结尾，且去掉 b 后仍剩实质内容（避免把整句当 echo）
  if (!ka.endsWith(kb)) return false;
  const remaining = ka.slice(0, ka.length - kb.length);
  return remaining.replace(/[：:，,。！？!?…\s]/gu, '').length >= 4;
}

/**
 * 段内连续重复句折叠：
 * 1. 同一段内相邻的相同句子只保留一句。「他走了。他走了。」→「他走了。」
 * 2. 相邻两句中后句是前句的尾部台词重复（isTailEcho）→ 折叠后句。
 * 仅处理「完全相同 / 尾部包含」且相邻的，排比/间隔重复不动。
 */
function collapseConsecutiveDuplicateSentences(paragraph: string): string {
  const sentences = splitSentences(paragraph);
  if (sentences.length <= 1) return paragraph;

  const kept: string[] = [];
  let lastKey = '';
  let lastRaw = '';
  for (const sentence of sentences) {
    const key = sentenceKey(sentence);
    // 连续完全相同且该句非空（避免空句误折叠）
    if (key && key === lastKey && sentence.trim()) {
      continue;
    }
    // 尾部台词重复：后句是前句结尾的台词片段重复 → 折叠后句
    if (lastRaw && sentence.trim() && isTailEcho(lastRaw, sentence)) {
      continue;
    }
    kept.push(sentence);
    lastKey = key;
    lastRaw = sentence;
  }
  return kept.join('');
}

/**
 * 章末段去重：最后一段里若整段等于前面某一段（首尾呼应除外），删除该重复段。
 * 治「正文已写过某段，章末又原样重复一遍整段」。
 *
 * 设计取舍（保守，避免误伤）：
 * - 只处理「整段完全相同」（归一化后），不处理「段内某句与上文某句相同」——
 *   后者会误伤大量合法写法（如人物反复念叨同一句台词、回环结构）。
 * - 首尾呼应保护：若章末段 == 首段，视为修辞呼应，保留不删。
 * - 实测的「签也得签」重复是「段内连续句重复」，由 collapseConsecutiveDuplicateSentences 处理；
 *   章末与上文「整段」完全相同的情况才在此处理。
 */
function dedupEndingParagraphAgainstEarlier(
  paragraphs: string[]
): string[] {
  if (paragraphs.length <= 2) return paragraphs;

  const endingKey = sentenceKey(paragraphs[paragraphs.length - 1]);
  if (!endingKey) return paragraphs;

  // 首尾呼应保护：章末段 == 首段，保留
  if (sentenceKey(paragraphs[0]) === endingKey) return paragraphs;

  // 章末段与中间任意段完全相同 → 删除章末段
  for (let i = 1; i < paragraphs.length - 1; i += 1) {
    if (sentenceKey(paragraphs[i]) === endingKey) {
      return paragraphs.slice(0, -1);
    }
  }
  return paragraphs;
}

/**
 * 正文去重主入口。输入是已拼接的整篇正文（段落以空行分隔）。
 * 顺序：归一化分段 → 相邻段去重 → 段内连续句折叠 → 章末段对前文去重。
 */
export function dedupProse(prose: string): string {
  if (!prose || !prose.trim()) return '';

  // 先归一化分段，保证段落切分稳定（与落库前 normalizeWebnovelParagraphs 一致口径）
  const normalized = normalizeWebnovelParagraphs(prose);
  if (!normalized || !normalized.trim()) return '';

  const rawParagraphs = normalized
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/u)
    .map(p => p.trim())
    .filter(Boolean);

  if (rawParagraphs.length === 0) return '';

  // ① 相邻段落完全相同 → 删除
  const dedupedAdjacent: string[] = [];
  let prevKey = '';
  for (const para of rawParagraphs) {
    const key = sentenceKey(para);
    if (key && key === prevKey) continue;
    dedupedAdjacent.push(para);
    prevKey = key;
  }

  // ② 段内连续重复句折叠
  const collapsed = dedupedAdjacent.map(collapseConsecutiveDuplicateSentences);

  // ③ 章末段对前文去重
  const finalParagraphs = dedupEndingParagraphAgainstEarlier(collapsed);

  return finalParagraphs.join('\n\n');
}
