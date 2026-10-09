/**
 * 偏短初稿的一次整章扩写。
 * 把已有全文放回上下文，在原情节里补对话和动作；不另起支线，也不放宽字数上限。
 */

/** 偏短扩写的结构化输出名，和末尾补字的 SupplementParagraphs 分开 */
export const IN_PLACE_EXPAND_SCHEMA = 'InPlaceChapterExpand';

export function buildInPlaceExpandPrompt(input: {
  paragraphs: string[];
  target: number;
  minWords: number;
  maxWords: number;
  title: string;
  beats: string[];
}): string {
  return JSON.stringify({
    mode: 'in-place-expand',
    chapterTitle: input.title,
    targetWordCount: input.target,
    minWords: input.minWords,
    maxWords: input.maxWords,
    sceneBeats: input.beats,
    existingParagraphs: input.paragraphs,
    instruction:
      '在现有情节内部补对话、动作和感官细节，让全文落进 minWords 到 maxWords。不要新开支线，不要把已写过的场面换措辞再写一遍。返回完整替换稿的 paragraphs。',
  });
}
