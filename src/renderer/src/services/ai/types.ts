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
  | 'foreshadowReminder'  // 伏笔提醒
  | 'foreshadowManagement' // 伏笔管理
  | 'paceSuggestion'       // 节奏建议
  | 'logicGap'             // 逻辑漏洞
  | 'logicConsistency'     // 逻辑自洽
  | 'styleConsistency'     // 风格一致性
  | 'dialogueQuality'      // 对话质量
  | 'descriptionDensity'   // 描写密度
  | 'emotionCurve';        // 情感曲线

/**
 * 建议严重程度
 */
export type SuggestionSeverity = 'info' | 'warning' | 'error';

/**
 * 伏笔状态
 */
export type ForeshadowStatus = 'buried' | 'hinted' | 'foreshadowed' | 'resolved';

/**
 * 场景描写类型
 */
export type SceneDescriptionType = 'appearance' | 'action' | 'psychology' | 'dialogue';
