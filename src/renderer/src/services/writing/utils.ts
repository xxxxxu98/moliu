/**
 * 写作服务共享工具函数
 */

/**
 * 统一字数统计口径：中文字符数 + 英文单词数。
 *
 * 用于：
 * - 章节保存时的 wordCount 字段
 * - 补写阈值判断（MIN_WORD_THRESHOLD / MAX_WORD_THRESHOLD）
 * - UI 字数展示
 *
 * 注意：剥离 markdown 标题、章节标题（"第X章 ..."）和【】标记，
 * 避免这些非正文内容被计入字数，导致阈值判断和 UI 显示错位。
 */
export function countWords(text: string): number {
  if (!text) return 0;

  // 去除 markdown 标题、章节标题和标记
  let cleaned = text.replace(/^#.*$/gm, '');
  // 去除「第X章 标题」格式的章节标题（避免被计入正文字数，影响补写阈值判断）
  cleaned = cleaned.replace(/^第[0-9零一二三四五六七八九十百千万]+章.*$/gm, '');
  cleaned = cleaned.replace(/【.*?】/g, '');
  cleaned = cleaned.replace(/\n/g, '');

  const chineseChars = (cleaned.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (cleaned.match(/[a-zA-Z]+/g) || []).length;
  return chineseChars + englishWords;
}
