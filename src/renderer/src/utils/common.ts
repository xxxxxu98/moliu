export const wordCountOptions = [
  { label: '续写 1000 字', value: 1000 },
  { label: '续写 2000 字', value: 2000 },
  { label: '续写 3000 字', value: 3000 },
  { label: '续写 4000 字', value: 4000 },
  { label: '续写 7500 字', value: 7500 },
  { label: '续写 10000 字', value: 10000 },
] as const;

export const writingStyleOptions = [
  { label: '简洁流畅', value: 'concise' },
  { label: '华丽典雅', value: 'elegant' },
  { label: '幽默风趣', value: 'humorous' },
  { label: '古风古韵', value: 'ancient' },
] as const;

export const DEFAULT_WORD_COUNT = 2000;
