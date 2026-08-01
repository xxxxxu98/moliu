/**
 * 续写场景下的章节标题工具（智能续写 / 批量续写共用）
 */

const CHAPTER_PREFIX_RE = /^第[一二三四五六七八九十百千零\d]+章\s*/u;
const PLACEHOLDER_TITLE_RE =
  /^第[一二三四五六七八九十百千零\d]+章(?:\s*[（(]?未命名[)）]?)?$/u;

/** 标题汉字下限（过短无信息量） */
export const CHAPTER_TITLE_MIN_CHARS = 2;
/** 标题汉字上限：允许稍长的口语钩子句，超出则截断 */
export const CHAPTER_TITLE_MAX_CHARS = 22;
/** 提示词建议的舒适区间（鼓励写够信息量，别挤成四字电报） */
export const CHAPTER_TITLE_SWEET_MIN = 6;
export const CHAPTER_TITLE_SWEET_MAX = 16;

/**
 * SceneDraft 同轮生成标题时的提示词片段（SSOT）。
 * 风格对齐 unified.service.generateChapterTitle / prompt-builder：口语、钩子、别太正。
 */
export const CHAPTER_TITLE_PROMPT_RULES: readonly string[] = [
  `- chapterTitle 必填：${CHAPTER_TITLE_MIN_CHARS}–${CHAPTER_TITLE_MAX_CHARS} 个汉字；优先写够 ${CHAPTER_TITLE_SWEET_MIN}–${CHAPTER_TITLE_SWEET_MAX} 字，别挤成四字电报`,
  '- 目标：读者扫目录会停一下、想点进去的网文标题——口语、带钩子、有画面或情绪',
  '- 口吻：大白话，像朋友转述「这章发生了啥」；可带悬念/反转/吐槽，但别端着，别像案情通报或新闻标题',
  '- 优先抓本章最刺激的一点：打脸、翻车、反转、第一次、秘密、麻烦、意外收获、公开对线、期限压迫',
  '- 可用句式（任选，勿套模板）：',
  '  · 悬念半截话：「这尸体不对劲」「银针藏不住」「这局有诈」',
  '  · 动作事件：「当场翻脸」「公堂上摊牌」「三天期限」',
  '  · 情绪吐槽：「被骗了」「摊上大事了」「今晚睡不着了」',
  '  · 人物+事件：「县令公子翻了车」「通判连夜找上门」',
  '  · 反差钩子：「刚穿越就被诬下狱」「验尸验出杀机」',
  '  · 轻微疑问感：「谁动了尸检报告」「他凭什么咬死我」',
  '- 正面例子（可长短搭配）：拜师学艺、打败小BOSS、第一次赚钱、遇到麻烦、被骗了、捡到宝贝、朋友反目、真相大白、师父的秘密、身世之谜、意外收获、大战一场、这局有诈、银针藏不住、当场翻脸、三天期限、今晚睡不着了、摊上大事了、刚穿越就被诬下狱、这尸体怎么验都不对劲、县令公子当场翻车、通判连夜找上门',
  '- 反面例子（禁止）：龙啸九天、风云际会、暗箭难防、山雨欲来、一叶知秋；公文/案情味四字堆砌如「验尸遭诬」「公堂指凶」「反诬入狱」「尸检翻案」「沉冤得雪」',
  '- 多样性：连续几章不要全是「XX遭诬」「XX指凶」同款硬四字；也不要全用感叹号/问号堆情绪',
  '- 不要加「第X章」前缀，不要书名号/引号/冒号；正文 paragraphs 里也不要再写标题行',
];

/**
 * 是否为占位标题（空 / 「第N章」/ 「第N章未命名」），可被续写生成的标题覆盖。
 * 细纲里已有具体标题时不覆盖。
 */
export function isPlaceholderChapterTitle(title: string | null | undefined): boolean {
  if (!title || !title.trim()) return true;
  return PLACEHOLDER_TITLE_RE.test(title.trim());
}

/**
 * 清洗模型返回的短标题：去「第X章」前缀、引号与过长截断。
 * 返回 null 表示无效。
 */
export function normalizeGeneratedChapterTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let title = raw.trim().replace(CHAPTER_PREFIX_RE, '').trim();

  // 反复剥外层引号/书名号（前缀去掉后可能仍包一层）
  for (let i = 0; i < 3; i += 1) {
    const next = title
      .replace(/^["'「」『』【】《》]+/u, '')
      .replace(/["'「」『』【】《》]+$/u, '')
      .replace(/^[:：\-\s]+/u, '')
      .trim();
    if (next === title) break;
    title = next;
  }

  if (!title) return null;

  const chineseLen = title.replace(/[^\u4e00-\u9fa5]/gu, '').length;
  if (chineseLen < CHAPTER_TITLE_MIN_CHARS) return null;
  if (chineseLen > CHAPTER_TITLE_MAX_CHARS) {
    let kept = 0;
    let cut = '';
    for (const ch of title) {
      cut += ch;
      if (/[\u4e00-\u9fa5]/u.test(ch)) kept += 1;
      if (kept >= CHAPTER_TITLE_MAX_CHARS) break;
    }
    title = cut.trim();
  }

  return title || null;
}

/**
 * 组装落库用标题：`第N章 短标题`（与 DeAIService.extractAndCleanTitle 口径一致）
 */
export function formatStoredChapterTitle(chapterNumber: number, shortTitle: string): string {
  const cleaned = normalizeGeneratedChapterTitle(shortTitle) ?? shortTitle.trim();
  return `第${chapterNumber}章 ${cleaned}`;
}

/**
 * 把短标题拼到正文头部，供 persistence 适配器经 extractAndValidateTitle 落库。
 * 正文本身不含标题行。
 */
export function prependTitleLineForPersist(
  chapterNumber: number,
  shortTitle: string,
  prose: string
): string {
  const line = formatStoredChapterTitle(chapterNumber, shortTitle);
  const body = prose.trim();
  return body ? `${line}\n\n${body}` : line;
}
