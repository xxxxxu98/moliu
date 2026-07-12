import type { WritingTaskBook } from '@/types/writing-task';

/**
 * 把任务书内容拼成大纲文本（用于传给 L3 上下文组装器 + drafter prompt）。
 * 单章智能续写与批量续写共用。
 */
export function buildEnhancedOutline(taskBook: WritingTaskBook): string {
  return `
=== 写作任务书（执行约束）===
【CBN】${taskBook.CBN}
【CPNs】${taskBook.CPNs.join(' / ')}
【CEN】${taskBook.CEN}
【必须覆盖】${taskBook.mustCover.join(' / ')}
【禁区】${taskBook.forbiddenZones.join(' / ')}
【风格指引】${taskBook.styleGuidance.reasoning.join(' / ')}
【结尾感觉】${taskBook.endingSensation || ''}
【开放问题】${taskBook.openQuestion || ''}
=== 任务书结束 ===

`;
}
