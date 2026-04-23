/**
 * AI 服务相关类型定义
 */

/**
 * AI 写作模式
 */
export type AIWriteMode = 'smartContinue' | 'polish';

/**
 * AI 续写模式
 */
export type ContinueMode = 'smartContinue' | 'polish';

/**
 * 建议类型
 */
export type SuggestionType = 
  | 'characterConsistency'  // 人物一致性
  | 'foreshadowReminder'    // 伏笔提醒
  | 'paceSuggestion'        // 节奏建议
  | 'logicGap'              // 逻辑漏洞
  | 'styleConsistency';     // 风格一致性

/**
 * 建议严重程度
 */
export type SuggestionSeverity = 'info' | 'warning' | 'error';

/**
 * 伏笔状态
 */
export type ForeshadowStatus = 'buried' | 'hinted' | 'foreshadowed' | 'resolved';
