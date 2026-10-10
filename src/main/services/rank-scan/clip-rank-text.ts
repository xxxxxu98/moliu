/**
 * 榜单字段的长度裁剪。
 *
 * 只去掉空白并截断，不根据用词判断题材或热度。
 */

/** 把页面字段收成单行短文本；非字符串视为空 */
export function clipRankText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}
