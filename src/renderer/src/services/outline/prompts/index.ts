/**
 * 大纲提示词 barrel：只保留仍有消费方的卷节拍 / 卷时间线提示词（ProOutliner 卷工具）。
 * 方向卡与五步展开提示词请直接从 `./system/*` 引入，不经本 barrel。
 */

export { buildVolumeBeatPrompt, type VolumeBeatPromptOptions } from './volume/volume-beat-prompt';
export { buildTimelinePrompt, type TimelinePromptOptions } from './volume/volume-timeline-prompt';
