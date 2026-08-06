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

/**
 * 段内/段末残留的推理/安全审查标签碎片（jsonrepair 已把 <ds_safety> 吸收成
 * 字符串值后的残留；层1 剥离漏网或未来新型标签的兜底）。匹配从标签开始到段尾。
 */
const REASONING_FRAGMENT_RE =
  /<\s*(?:think|ds_safety|reflection|reasoning|analysis)\b[^>]*>[\s\S]*$/i;

/**
 * 段末 JSON 残片 + AI 自检噪声：中文标点后紧跟 JSON 闭合符，截掉该中文标点之后
 * 到段尾的全部内容。
 * 典型泄漏（jsonrepair 把截断的 JSON 残片 / AI 自检思考拼进了段尾）：
 *   「议论声如沸鼎。」}]}。{           → 截到「议论声如沸鼎。」
 *   「……得小心藏好。」"}]} 字数为约…    → 截到「……得小心藏好。」（引号+闭合符）
 *
 * 匹配的「闭合符」形态（紧跟中文标点，中间仅可有非换行空白）：
 *   } 或 ]           —— JSON 闭合符，正文里几乎不紧跟中文标点出现
 *   "] 或 "} 或 ]"   —— 引号 + 闭合符（jsonrepair 把字符串收尾拼了进来）
 * 不单独匹配引号：「系统提示：」后接引号开头对话是合法且常见的网文写法。
 */
const TAIL_NOISE_AFTER_CJK_RE =
  /([\u4e00-\u9fa5。！？…!?）」』”’）】》])[ \t]*(?:[\]}]|["'][\]}])[^\n]*$/u;

/**
 * 单行是否为 JSON 残片 / AI 自检噪声（非小说正文）。
 * jsonrepair 吸收的残片常单独成行，如 `}]}。{`、`}。ăn`、`} 字数为约 256 字`。
 * 判定：以 JSON 结构符/引号开头，或整行主要是结构符+标点+少量杂质，无连续中文叙述。
 */
/**
 * 单行是否为 JSON 残片噪声（非小说正文），用于逐行过滤 jsonrepair 吸收的残片行。
 * 注意：AI 自检词（符合要求/直接输出 等）不在此判定——它们常与正文同段，
 * 由段末截断统一处理，避免误删整段。
 */
function isJsonDebrisLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  // 以 JSON 结构符或引号开头（如 `}]}。{`、`}。ăn`、`"段落2"`）
  if (/^["\]}){]/.test(trimmed) && !/[\u4e00-\u9fa5]{4,}/u.test(trimmed)) return true;
  // 整行几乎全是结构符/标点（允许极少杂质），如 `}。{`。
  // 注意：中文标点（。！？」』等）不计为结构字符，避免把「正文。]]」误判为噪声行。
  const cjkAndPunct = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef。！？…！？]/gu;
  const structureChars = trimmed.replace(cjkAndPunct, '').length;
  if (structureChars >= trimmed.length * 0.6 && /[\]}){"]/.test(trimmed)) return true;
  // 无任何中文的短杂质行（jsonrepair 残片剥离后的孤立拉丁/标点，如 `ăn`、`}。ăn`）
  if (!/[\u4e00-\u9fa5]/u.test(trimmed) && trimmed.length <= 20) return true;
  return false;
}

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
      if (isJsonDebrisLine(line)) continue;
      keptLines.push(line);
    }

    let paragraph = keptLines.join('\n').trim();
    if (!paragraph) continue;
    if (isStructuralLeakFragment(paragraph)) continue;

    paragraph = stripTrailingJsonClosers(paragraph);
    if (!paragraph || isStructuralLeakFragment(paragraph)) continue;

    // 纵深防御：剥段内残留的推理/安全审查标签碎片（层1 json-parser 剥离漏网时兜底）。
    // 如 jsonrepair 把 <ds_safety>...</ds_safety> 吸收成段落字符串值后的残留。
    if (REASONING_FRAGMENT_RE.test(paragraph)) {
      paragraph = paragraph.replace(REASONING_FRAGMENT_RE, '').trim();
      if (!paragraph || isStructuralLeakFragment(paragraph)) continue;
    }
    // 剥推理碎片后可能残留 JSON 残片行（如 `}]}。{`、孤立杂质），重新按行过滤。
    if (paragraph.includes('\n')) {
      const refiltered = paragraph
        .split('\n')
        .filter(line => !isStructuralLeakFragment(line) && !isJsonDebrisLine(line))
        .join('\n')
        .trim();
      if (!refiltered) continue;
      paragraph = refiltered;
      if (isStructuralLeakFragment(paragraph)) continue;
    }
    // 段末 JSON 残片 + AI 自检噪声：中文标点后紧跟 " / ] / }（JSON 结构符），
    // 则该中文标点之后全部截掉（如「议论声如沸鼎。」}]}。{ →「议论声如沸鼎。」）。
    if (TAIL_NOISE_AFTER_CJK_RE.test(paragraph)) {
      paragraph = paragraph.replace(TAIL_NOISE_AFTER_CJK_RE, '$1').trim();
      if (!paragraph || isStructuralLeakFragment(paragraph)) continue;
    }

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
