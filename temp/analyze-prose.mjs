#!/usr/bin/env node
/** 正文质量粗测：字数、段落、对话密度、跨章重复句式。 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'temp', 'storyflow.recovered.prose');
const files = readdirSync(dir).filter(name => /^ch\d+\.txt$/.test(name)).sort();

const chapters = files.map(file => {
  const raw = readFileSync(join(dir, file), 'utf8');
  const [title, ...rest] = raw.split('\n\n');
  const prose = rest.join('\n\n').trim();
  const paragraphs = prose.split(/\n\n+/).filter(Boolean);
  const lengths = paragraphs.map(p => p.length);
  const quotePairs = (prose.match(/\u201C[^\u201D]*\u201D/g) ?? []).length;
  const sentences = prose.split(/[。！？]/).map(s => s.trim()).filter(s => s.length >= 6);
  return { file, title, prose, paragraphs, lengths, quotePairs, sentences };
});

// 跨章重复：4-gram 片段（8 字）出现在多章
const gramOwners = new Map();
chapters.forEach((ch, index) => {
  const flat = ch.prose.replace(/\s+/g, '');
  for (let i = 0; i + 8 <= flat.length; i += 1) {
    const gram = flat.slice(i, i + 8);
    if (!/^[\u4e00-\u9fa5]{8}$/.test(gram)) continue;
    if (!gramOwners.has(gram)) gramOwners.set(gram, new Set());
    gramOwners.get(gram).add(index + 1);
  }
});
const crossChapterRepeats = [...gramOwners.entries()]
  .filter(([, owners]) => owners.size >= 2)
  .map(([gram, owners]) => ({ gram, chapters: [...owners] }));

const summary = chapters.map(ch => ({
  file: ch.file,
  title: ch.title,
  words: ch.prose.length,
  paragraphs: ch.paragraphs.length,
  maxParagraph: Math.max(...ch.lengths),
  avgParagraph: Math.round(ch.lengths.reduce((a, b) => a + b, 0) / ch.lengths.length),
  quotePairs: ch.quotePairs,
  ellipsis: (ch.prose.match(/…|\.\.\./g) ?? []).length,
  dash: (ch.prose.match(/——/g) ?? []).length,
}));

const out = { summary, crossChapterRepeats: crossChapterRepeats.slice(0, 60) };
writeFileSync(join(process.cwd(), 'temp', 'prose-analysis.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
console.log('跨章重复 8 字片段数:', crossChapterRepeats.length);
console.log(crossChapterRepeats.slice(0, 30).map(r => `${r.gram} (ch ${r.chapters.join('/')})`).join('\n'));
