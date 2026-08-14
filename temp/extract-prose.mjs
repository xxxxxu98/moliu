#!/usr/bin/env node
/** 从 ai-traces 还原每章最终正文（取每个 chN trace 里最后一次 scene-draft 的 paragraphs）。 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const traceDir = join(process.cwd(), 'temp', 'ai-traces');
const outDir = join(process.cwd(), 'temp', 'storyflow.recovered.prose');
mkdirSync(outDir, { recursive: true });

const files = readdirSync(traceDir)
  .filter(name => /^storyflow-ch\d+-\d+\.jsonl$/.test(name))
  .sort((a, b) => statSync(join(traceDir, a)).mtimeMs - statSync(join(traceDir, b)).mtimeMs);

const byChapter = new Map();
for (const file of files) {
  const chapter = Number(file.match(/^storyflow-ch(\d+)-/)[1]);
  const entries = readFileSync(join(traceDir, file), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const purposes = entries.map(e => e.purpose);
  const drafts = entries.filter(e => e.purpose === 'scene-draft');
  const last = drafts[drafts.length - 1];
  if (!last) continue;
  const paragraphs = last.response?.paragraphs ?? [];
  const prose = paragraphs.join('\n\n');
  const prev = byChapter.get(chapter);
  byChapter.set(chapter, {
    chapter,
    file,
    title: last.response?.chapterTitle ?? '',
    words: prose.length,
    prose,
    drafts: (prev?.drafts ?? 0) + drafts.length,
    purposes: [...(prev?.purposes ?? []), ...purposes],
  });
}

const report = [];
for (const [chapter, data] of [...byChapter.entries()].sort((a, b) => a[0] - b[0])) {
  writeFileSync(
    join(outDir, `ch${String(chapter).padStart(2, '0')}.txt`),
    `${data.title}\n\n${data.prose}`,
    'utf8',
  );
  report.push({
    chapter,
    title: data.title,
    words: data.words,
    paragraphs: data.prose.split('\n\n').length,
    aiCalls: data.purposes.length,
    purposes: data.purposes.join(','),
  });
}
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
