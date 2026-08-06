export interface HeadingBlock {
  heading: string;
  body: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeGeneratedText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitByHeading(raw: string, headingPattern: RegExp): HeadingBlock[] {
  const matches = Array.from(raw.matchAll(headingPattern));

  if (matches.length === 0) {
    return [];
  }

  return matches.map((match, index) => {
    const heading = match[0].trim();
    const start = match.index ?? 0;
    const bodyStart = start + match[0].length;
    const nextStart = index + 1 < matches.length ? (matches[index + 1].index ?? raw.length) : raw.length;
    const body = raw.slice(bodyStart, nextStart).trim();

    return {
      heading,
      body,
    };
  });
}

export function splitNamedSections(raw: string, headings: string[]): Record<string, string> {
  const escapedHeadings = headings.map(escapeRegExp).join('|');
  // 兼容 H2 及更深层级：expand-direction-prompt 模板里子小节用 H3（### 核心地点 / ### 爽点安排），
  // 此前固定按 `^## ` 匹配会把这些 H3 子小节整体漏掉（worldBuilding / coolPoint 静默丢失）。
  // 传入的 headings 都是具体中文短语，跨层级撞名概率极低，放宽到 `#{2,}` 安全。
  const pattern = new RegExp(`^#{2,}\\s*(${escapedHeadings})\\s*$`, 'gm');
  const blocks = splitByHeading(raw, pattern);

  return headings.reduce<Record<string, string>>((acc, heading) => {
    const matched = blocks.find((block) => new RegExp(`^#{2,}\\s*${escapeRegExp(heading)}\\s*$`).test(block.heading));
    acc[heading] = matched?.body ?? '';
    return acc;
  }, {});
}

export function extractFieldValue(block: string, fieldName: string): string | null {
  const pattern = new RegExp(`^(?:-\\s*)?${escapeRegExp(fieldName)}\\s*[：:]\\s*(.+)$`, 'm');
  const match = block.match(pattern);

  if (!match) {
    return null;
  }

  // 模型常把"主角成长路径""推荐理由""长线推进说明"等长字段写成多行。
  // 旧实现只取匹配行 match[1] 的内容，续行被静默丢弃。这里从匹配行之后开始，
  // 合并后续无字段前缀的行（即不包含“字段：”结构的行），直到遇到下一个字段或空行。
  const matchIndex = match.index ?? 0;
  const afterFirstLine = block.slice(matchIndex + match[0].length);
  const continuationLines: string[] = [];
  const fieldStartPattern = /^(?:-\s*)?[^\s：:][^：:]{0,20}\s*[：:]/;
  for (const rawLine of afterFirstLine.split('\n')) {
    const line = rawLine.trim();
    if (line === '') break;
    if (fieldStartPattern.test(line)) break;
    // 列表续行（- 子项）也算同一字段的延伸
    continuationLines.push(line.replace(/^-\s*/, ''));
  }

  return compactLines([match[1], ...continuationLines].join('\n'));
}

/**
 * 从 block 中提取某字段下的「数字. 内容」编号列表项，保留多行结构。
 *
 * AI 常把 CPNs/mustCover 写成 `1. xxx\n2. yyy` 的编号列表。extractFieldValue 会经
 * compactLines 把它们拍平成一行 `1. xxx 2. yyy`，导致后续按标点切分时编号 `2.`
 * 串到前一项尾部（如 `["1. xxx", "正在验尸现场 2. 知府王德骂他..."]`）。
 *
 * 这里直接从原始 block 按行扫描，识别编号项并正确归并续行，避免拍平破坏边界。
 * 仅当解析到 ≥2 个编号项时返回，否则返回空数组（交给 fallback）。
 */
function extractNumberedItems(block: string, fieldName: string): string[] {
  const escaped = escapeRegExp(fieldName);
  const fieldLineRe = new RegExp(`^(?:-\\s*)?${escaped}\\s*[：:]`, 'u');
  const fieldStart = /^(?:-\s*)?[^\s：:][^：:]{0,20}\s*[：:]/;
  const itemStart = /^\s*(\d+)[.、)]\s*(.+)$/;

  const lines = block.split('\n');
  const startIdx = lines.findIndex(line => fieldLineRe.test(line.trim()));
  if (startIdx === -1) return [];

  const items: string[] = [];
  let currentItem: string | null = null;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('---')) break;
    if (fieldStart.test(line)) break; // 遇到下一个字段，结束
    const m = line.match(itemStart);
    if (m) {
      if (currentItem !== null) items.push(currentItem.trim());
      currentItem = m[2];
    } else if (currentItem !== null) {
      // 编号项的续行（无编号前缀的行），归并到当前项
      currentItem += ' ' + line;
    }
  }
  if (currentItem !== null) items.push(currentItem.trim());
  return items.filter(Boolean);
}

export function extractMultiValueField(block: string, fieldName: string): string[] {
  // 优先：编号列表（AI 常用 1./2./3. 格式，compactLines 会破坏其边界）。
  // 编号项已是独立单元，内部的自然语句逗号不再二次切分（如「知府骂他"废物"，连个案子都查清」
  // 是一个完整的 CPN，不该按逗号拆开）。
  const numbered = extractNumberedItems(block, fieldName);
  if (numbered.length > 1) {
    return numbered
      .map(item => item.trim())
      .filter(Boolean)
      .filter((item, index, array) => array.indexOf(item) === index);
  }

  const value = extractFieldValue(block, fieldName);

  if (!value) {
    return [];
  }

  return value
    .split(/[；;、，,/]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

export function safeParseScore(value: string | null, fallback = 70): number {
  if (!value) {
    return fallback;
  }

  const match = value.match(/\d+/);
  const parsed = match ? Number.parseInt(match[0], 10) : Number.NaN;

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, parsed));
}

export function compactLines(block: string): string {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * 剥离 outline 末尾的「--- 结构化节点 ---」块（CBN/CPNs/CEN/mustCover/forbiddenZones）。
 *
 * useChapterOutlineGenerator.createChapters 建章时把结构化节点拼进了 chapter.outline
 * 字段（便于 UI 展示完整信息）；但 ChapterWritingPipeline.executeLongFormRuntime
 * 把 outline 当作 goal/description/query，导致 scene-draft prompt 的
 * locked-contracts.chapter.goal 变成一大段结构化节点，污染写作合同语义。
 *
 * 结构化节点已通过 outlineNode 的 CBN/CPNs/CEN 等独立字段传递，outline 里那份是冗余。
 * 此函数剥掉该块，只保留散文大纲。无标记则原样返回。
 */
export function stripStructuredNodeBlock(outline: string): string {
  if (!outline) return '';
  return outline.replace(/\n*---\s*结构化节点\s*---[\s\S]*$/u, '').trim();
}
