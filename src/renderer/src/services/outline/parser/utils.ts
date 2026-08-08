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
  //
  // 标题尾容忍括号说明：AI 常给 section 标题加后缀（如「## 单章蓝图（强制 30 章）」），
  // 旧实现的 `\s*$`（行尾只允许空白）会让这些变体整段 body 取空，进而 chapterBlueprints
  // 解析为空、降级到算法派生。这里允许标题后跟括号说明（中/英文/全角括号）。
  //
  // 注意：不做「heading 包含目标短语」的宽匹配——headings 列表里有子串关系
  // （如「关键角色」是「关键角色规划」的子串），宽匹配会让 `#### 情感关键角色` 这种子标题
  // 也被当成 section 边界，把角色 section 的 body 截断。这里要求目标短语就是标题主体
  // （井号后即为目标短语，后面最多跟括号说明）。
  const pattern = new RegExp(`^#{2,}\\s*(${escapedHeadings})(?:\\s*[（(【].*)?\\s*$`, 'gm');
  const blocks = splitByHeading(raw, pattern);

  return headings.reduce<Record<string, string>>((acc, heading) => {
    const matched = blocks.find((block) =>
      new RegExp(`^#{2,}\\s*${escapeRegExp(heading)}(?:\\s*[（(【].*)?\\s*$`).test(block.heading),
    );
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

/**
 * 从单行（已 compactLines 拍平）文本中按内联编号边界切分。
 *
 * AI 常把 CPNs/mustCover 写成同一行的内联编号：
 *   `1. 陈默穿越，发现自己是大梁七品小吏 2. 陈默用现代法医思维 3. 陈默破案`
 * extractNumberedItems 按行扫描，对此格式无能为力；标点切分会把序号粘到前半句尾部。
 *
 * 保守匹配策略：编号锚点 = 标点/空白/行首 + 1~2位数字 + `.、)` 之一 + 空白。
 * 要求数字前有标点/空白边界，避免误伤「第5章」「500两银子」「2026年」等数值
 * （这些场景数字紧贴汉字、不满足「标点/空白 + 数字 + 编号标点 + 空白」模式）。
 *
 * 命中 ≥2 项时返回去序号的结果；否则返回空数组（交回标点切分兜底）。
 */
function splitInlineNumberedItems(value: string): string[] {
  // 编号锚点：行首或标点/空白后，1~2 位数字，紧跟 . 或 、 或 )，再跟空白。
  // 用 split 保留分隔符（括号捕获），避免把编号前缀文字切丢。
  const parts = value.split(/(?:^|[，,；;、\s])(\d{1,2})[.、)]\s/);
  // split 带捕获组时，奇数下标是捕获的编号数字，偶数下标是编号后的正文。
  // 第 0 个元素是首个编号锚点之前的前导文本（通常是空串或首项正文的一部分）。
  const items: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const text = (parts[i + 1] ?? '').trim();
    if (text) items.push(text);
  }
  return items
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
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

  // 次选：同一行内联编号（如「1. 陈默穿越，发现自己是大梁七品小吏 2. 陈默用现代法医思维 3. 陈默破案」）。
  // compactLines 已把多行拍平成单行，extractNumberedItems（按行扫描）对此无能为力；
  // 若直接走标点切分，逗号会把序号「2.」「3.」粘到前半句尾部，产出碎片
  // （「正在验尸 2. 陈默用现代法医思维」）。这里先尝试按内联编号边界切分，命中则直接返回
  // （编号项是完整语义单元，不再二次按标点切），未命中再退回标点切分。
  const inlineNumbered = splitInlineNumberedItems(value);
  if (inlineNumbered.length > 1) {
    return inlineNumbered;
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
