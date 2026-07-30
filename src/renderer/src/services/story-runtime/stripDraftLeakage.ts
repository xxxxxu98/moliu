/**
 * 剥离 SceneDraft 等结构化输出泄漏到正文中的 schema 残留。
 *
 * 原则：只删「整段/段末」的 JSON 骨架杂质，不改写小说叙述正文。
 * 典型泄漏（模型在 paragraphs 字符串里把 JSON 尾巴写进去）：
 *   ……正文。]]
 *   candidateEvents
 *   :
 */

/** 单独成段时视为 schema 泄漏的字段名（大小写敏感，与输出 schema 一致） */
const STRUCTURAL_KEYS = new Set([
  'sceneId',
  'beatId',
  'paragraphs',
  'candidateEvents',
  'allowedCandidateEvents',
  'sceneDraft',
  'requiredOutput',
]);

/** 整段仅含括号/标点骨架 */
const LONE_STRUCTURE_RE = /^[\s\[\]{},:;"'`]+$/u;

function normalizeKeyToken(line: string): string {
  return line
    .trim()
    .replace(/^["'`]+|["'`]+$/gu, '')
    .replace(/[,:]\s*$/u, '')
    .trim();
}

/** 该行/段是否为纯结构化泄漏（非小说正文） */
export function isStructuralLeakFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (STRUCTURAL_KEYS.has(normalizeKeyToken(trimmed))) return true;
  if (LONE_STRUCTURE_RE.test(trimmed)) return true;
  return false;
}

/**
 * 去掉段末粘在汉字/中文标点后的 JSON 收尾括号（如「……了。]]」→「……了。」）。
 * 仅在末尾匹配；中间内容不动。
 */
export function stripTrailingJsonClosers(paragraph: string): string {
  const trimmed = paragraph.trimEnd();
  if (!trimmed) return '';

  const match = trimmed.match(/^(.*?)([\]}]+)\s*$/u);
  if (!match) return trimmed.trim();

  const body = match[1];
  const closers = match[2];
  if (!body || !closers) return trimmed.trim();

  const lastChar = body[body.length - 1];
  // 仅当闭括号紧贴中文/中文标点时剥离，避免误伤英文代码片段
  if (/[\u4e00-\u9fa5。！？…!?）」』”’）】》]/u.test(lastChar)) {
    return body.trimEnd();
  }
  return trimmed.trim();
}

/**
 * 清洗场景草稿段落：删除纯 schema 段，剥离段末 JSON 括号残留。
 * 合法叙述段落原样保留。
 */
export function sanitizeSceneDraftParagraphs(paragraphs: string[]): string[] {
  const result: string[] = [];

  for (const raw of paragraphs) {
    if (!raw?.trim()) continue;

    // 段内若含空行，按行过滤泄漏行后再拼回
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const keptLines: string[] = [];
    for (const line of lines) {
      if (isStructuralLeakFragment(line)) continue;
      keptLines.push(line);
    }

    let paragraph = keptLines.join('\n').trim();
    if (!paragraph) continue;
    if (isStructuralLeakFragment(paragraph)) continue;

    paragraph = stripTrailingJsonClosers(paragraph);
    if (!paragraph || isStructuralLeakFragment(paragraph)) continue;

    result.push(paragraph);
  }

  return result;
}

/** 对已拼接的正文做同样清洗（管道出口兜底） */
export function sanitizeStructuredProseLeakage(prose: string): string {
  if (!prose?.trim()) return prose ?? '';
  const paragraphs = prose
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);
  return sanitizeSceneDraftParagraphs(paragraphs).join('\n\n');
}
