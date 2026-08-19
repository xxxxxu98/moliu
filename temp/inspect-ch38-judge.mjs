import { readFileSync } from 'node:fs';
const f = 'temp/storyflow-matrix/provider-1787044972770/storyflow-provider-1787044972770-ch38-1787109228572.jsonl';
const lines = readFileSync(f, 'utf8').trim().split(/\r?\n/).filter(Boolean);
const e = JSON.parse(lines[0]);
const r = String(e.rawResponse ?? e.response ?? '');
console.log('rawResponse type:', typeof e.rawResponse, '| response type:', typeof e.response);
const j = JSON.parse(r);
console.log('top keys:', Object.keys(j).join(','));
if (Array.isArray(j.fulfillment)) {
  j.fulfillment.forEach((it, i) => {
    console.log(i, '| node:', String(it.node ?? '').slice(0, 20), '| fulfilled:', it.fulfilled,
      '| reason:', it.reason === undefined ? 'UNDEFINED' : 'ok:' + String(it.reason).slice(0, 15),
      '| evidence:', Array.isArray(it.evidence) ? it.evidence.length : typeof it.evidence);
  });
}
