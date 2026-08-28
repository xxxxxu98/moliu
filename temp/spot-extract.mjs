// r2 书审定点抽读：ch23 姓名漂移 / ch50 方向 / ch53 人称滑丝 / ch73 器物数字 + 尾部文风抽样
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/book-review/大明算账人：社畜的户部升迁记-0828';
const out = [];
const rd = n => readFileSync(join(dir, `${String(n).padStart(3, '0')}.txt`), 'utf8');
const pushMatching = (label, n, kws) => {
  out.push(`===== ${label} =====`);
  const text = rd(n);
  let hit = 0;
  for (const p of text.split(/\n+/)) {
    if (kws.some(k => p.includes(k))) {
      out.push(p.slice(0, 220));
      hit++;
    }
  }
  if (!hit) out.push('(无命中)');
};

pushMatching('ch23 含 赵玄龄', 23, ['赵玄龄']);
out.push('===== ch23 末尾 320 字 =====');
out.push(rd(23).slice(-320));
pushMatching('ch50 含 北上/南下/扬州', 50, ['北上', '南下', '扬州']);
pushMatching('ch53 含 老夫', 53, ['老夫']);
pushMatching('ch73 含 斤', 73, ['斤']);

out.push('===== ch100 开头 500 字 =====');
out.push(rd(100).slice(0, 500));
out.push('===== ch100 结尾 500 字 =====');
out.push(rd(100).slice(-500));
out.push('===== ch074 抽样开头 400 字（CV=0.08）=====');
out.push(rd(74).slice(0, 400));

writeFileSync(join(dir, 'spot1.txt'), out.join('\n'), 'utf8');
console.log('ok lines=' + out.length);
