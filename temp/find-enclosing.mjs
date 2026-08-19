import { readFileSync } from 'node:fs';
const s = readFileSync('src/renderer/src/services/story-runtime/ContinuityValidator.ts', 'utf8');
const j = s.indexOf('let resolvedForeshadowIds');
let depth = 0;
let methodStart = -1;
for (let i = j; i >= 0; i--) {
  const c = s[i];
  if (c === '}') depth++;
  else if (c === '{') {
    if (depth > 0) depth--;
    else { methodStart = i; break; }
  }
}
console.log('resolvedForeshadowIds at', j, '| enclosing block at', methodStart);
console.log(s.slice(Math.max(0, methodStart - 250), methodStart + 60));
