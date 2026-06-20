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
  const pattern = new RegExp(`^##\\s*(${escapedHeadings})\\s*$`, 'gm');
  const blocks = splitByHeading(raw, pattern);

  return headings.reduce<Record<string, string>>((acc, heading) => {
    const matched = blocks.find((block) => new RegExp(`^##\\s*${escapeRegExp(heading)}\\s*$`).test(block.heading));
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

export function extractMultiValueField(block: string, fieldName: string): string[] {
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
