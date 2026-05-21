/**
 * Prompts System - Techniques Export
 * 技巧库导出
 */

// Chapter writing techniques
export {
  OPENING_TECHNIQUES,
  ENDING_TECHNIQUES,
  EMOTION_ARC_CONFIGS,
  generateChapterTechniquesPrompt,
  getRecommendedOpeningTechniques,
  getRecommendedEndingTechniques,
  getEmotionArcByGoal,
} from './chapter-techniques';
export type {
  OpeningTechnique,
  EndingTechnique,
  EmotionArcConfig,
  ChapterType,
  ChapterWritingConfig,
} from './chapter-techniques';

// Emotion design
export {
  EMOTION_CURVE_CONFIGS,
  EMOTION_TYPE_CONFIGS,
  calculateEmotionAnchors,
  generateHighPointsFromBeats,
  createEmotionDesign,
  getSuggestedEmotionCurves,
  validateEmotionDesign,
  generateEmotionDesignPrompt,
} from './emotion-design';
export type {
  EmotionType,
  EmotionArcType,
  EmotionAnchor,
  EmotionCurveConfig,
  EmotionHighPoint,
  EmotionDesignConfig,
} from './emotion-design';
