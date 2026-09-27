/**
 * state-ledger.mjs 的输入/输出形状（JSDoc 专用，无运行时导出）。
 *
 * @typedef {Object} ChapterMemoryLike
 * @property {number} [chapterIndex] 1 基章号
 * @property {string} [corePlot]
 * @property {string[]} [keyEvents]
 * @property {Array<{characterName?:string, state?:string, detail?:string}>} [characterStateChanges]
 *
 * @typedef {Object} LedgerEntry
 * @property {string} entityId
 * @property {'vital'|'custody'|'custodyPlace'|'office'} attribute
 * @property {string} value
 * @property {number} fromChapter
 * @property {string} transition
 * @property {{chapter:number, quote:string}} evidence
 * @property {'extractor'|'adjudicator'|'migration'} source
 *
 * @typedef {Object} LedgerViolation
 * @property {string} entityId
 * @property {string} attribute
 * @property {string|null} fromValue
 * @property {string} toValue
 * @property {string} transition
 * @property {number} chapter
 * @property {string} note
 *
 * @typedef {Object} LedgerGap
 * @property {number} chapter
 * @property {string} anchor
 * @property {string} preview
 * @property {string} note
 */
export {};
