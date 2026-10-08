/**
 * 写作服务共享工具函数
 */

/**
 * 统一字数口径：与编辑器一致，按字符串长度统计
 *（含标点、空白、换行、【】系统提示等全部字符）。
 *
 * 用于：
 * - 章节保存时的 wordCount 字段
 * - 侧栏 / 项目总字数等 UI 展示
 * - 补写阈值判断（MIN_WORD_THRESHOLD / MAX_WORD_THRESHOLD）
 * - 写作进度 / 达标判断
 *
 * 全链路必须共用此函数，避免「编辑器已达标、补写仍判定不足」的口径分裂。
 */
export function countWords(text: string): number {
  return text.length;
}

/**
 * @deprecated 请使用 countWords；保留别名兼容既有 import。
 */
export function countDisplayChars(text: string): number {
  return countWords(text);
}

/**
 * 正文指纹（2026-10-05 作者正典配套）：FNV-1a 32bit 十六进制。
 * 生成时提取记忆即落指纹；续写前比对上一章正文指纹——不一致说明作者手改过，
 * 触发该章记忆/台账重提取（治「手改正文后按旧账续写」的失真）。
 */
export function contentFingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
