#!/usr/bin/env node
/** 把 ai-trace jsonl 拆成可读 md，便于人工评估提示词与返回结果。 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const traceDir = join(process.cwd(), 'temp', 'ai-traces');
const filter = process.argv[2] ?? 'storyflow';
const files = readdirSync(traceDir)
  .filter(name => name.includes(filter) && name.endsWith('.jsonl'))
  .sort((a, b) => statSync(join(traceDir, a)).mtimeMs - statSync(join(traceDir, b)).mtimeMs);

for (const file of files) {
  const outDir = join(process.cwd(), 'temp', 'trace-dump', file.replace('.jsonl', ''));
  mkdirSync(outDir, { recursive: true });
  const lines = readFileSync(join(traceDir, file), 'utf8').split('\n').filter(Boolean);
  lines.forEach((line, index) => {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return;
    }
    const name = `${String(index + 1).padStart(2, '0')}-${entry.purpose ?? 'unknown'}.md`;
    const asText = (value) =>
      typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
    const body = [
      `# ${entry.purpose ?? 'unknown'} (seq=${entry.seq ?? index}) ms=${entry.ms ?? '?'} model=${entry.model ?? ''}`,
      '',
      '## SYSTEM',
      '',
      asText(entry.system) || '(空)',
      '',
      '## PROMPT',
      '',
      asText(entry.prompt) || '(空)',
      '',
      '## RAW RESPONSE',
      '',
      asText(entry.rawResponse) || '(空)',
      '',
      '## PARSED RESPONSE',
      '',
      asText(entry.response) || '(空)',
      '',
    ].join('\n');
    writeFileSync(join(outDir, name), body, 'utf8');
  });
  console.log(`${file} -> ${outDir} (${lines.length} entries)`);
}
