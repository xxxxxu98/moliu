import { readFileSync } from 'node:fs';
const s = readFileSync('src/renderer/src/services/story-runtime/ContinuityValidator.ts', 'utf8');
const j = s.indexOf('let resolvedForeshadowIds');
// method-level brace: skip the immediate if-block by starting depth at 1
let depth = 1;
let methodStart = -1;
for (let i = j; i >= 0; i--) {
  const c = s[i];
  if (c === '}') depth++;
  else if (c === '{') {
    depth--;
    if (depth === 0) { methodStart = i; break; }
  }
}
console.log('method-level block at', methodStart);
console.log(s.slice(Math.max(0, methodStart - 300), methodStart + 60));
