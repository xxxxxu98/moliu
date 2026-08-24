// 定向核查:滚动边界衔接/未履约节点/人物生死一致性
import fs from 'node:fs';

const dir = process.env.TRACE_DIR || 'temp/ai-traces';
const PROV = 'provider-1787039781123';

function finalDraft(n) {
  const f = fs.readdirSync(dir).filter((x) => x.includes(PROV) && x.includes(`-ch${n}-`)).sort().at(-1);
  if (!f) return null;
  let d = null, judges = [];
  for (const l of fs.readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n')) {
    const j = JSON.parse(l);
    if (j.purpose === 'scene-draft' && j.response?.paragraphs) d = j.response;
    if (j.purpose === 'chapter-judge') judges.push(j.response);
  }
  return { n, title: d?.chapterTitle, text: d ? d.paragraphs.join('\n') : '', judges };
}

const mode = process.argv[2];

if (mode === 'boundary') {
  const a = finalDraft(50), b = finalDraft(51);
  console.log('== ch50 末2段 ==\n' + a.text.split('\n').slice(-2).join('\n\n'));
  console.log('\n== ch51 首3段 ==\n' + b.text.split('\n').slice(0, 3).join('\n\n'));
}

if (mode === 'node') {
  // ch54: 刑部底层书吏对沈淮产生敬畏; ch56: 当众打脸周崇礼与陈恪
  for (const n of [54, 56]) {
    const c = finalDraft(n);
    const last = c.judges.at(-1);
    console.log(`== ch${n} ${c.title} ==`);
    const unful = (last?.fulfillment || []).filter((f) => !f.fulfilled);
    console.log('终判未履约:', unful.length ? unful.map((f) => f.node).join(' | ') : '无');
    const short = c.text.split('\n').slice(0, 2).join(' ');
    console.log('开头:', short.slice(0, 120));
  }
}

if (mode === 'chars') {
  // 人物出现与死亡一致性:全书扫描关键人物的出现章区间
  const names = ['沈淮', '顾廷芳', '王崇', '周崇礼', '赵恒', '陈恪', '孙老泉', '钱禄', '陆成渊', '张成'];
  const present = new Map(names.map((x) => [x, []]));
  const dead = new Map(names.map((x) => [x, null]));
  const chMax = Number(process.argv[3] || 67);
  for (let n = 1; n <= chMax; n++) {
    const c = finalDraft(n);
    if (!c) continue;
    for (const nm of names) {
      if (c.text.includes(nm)) present.get(nm).push(n);
      // 死亡描述:名字与 死|毙|尸 同段
      for (const para of c.text.split('\n')) {
        if (para.includes(nm) && /(毙|惨死|断气|咽气|伏诛|处斩|尸体|尸身|已死)/.test(para)) {
          if (!dead.get(nm)) dead.set(nm, { ch: n, ctx: para.slice(0, 80) });
        }
      }
    }
  }
  for (const nm of names) {
    const ps = present.get(nm);
    if (!ps.length) { console.log(`  ${nm}: 未出现`); continue; }
    const gap = [];
    for (let i = 1; i < ps.length; i++) if (ps[i] - ps[i - 1] > 20) gap.push(`ch${ps[i - 1]}→ch${ps[i]}`);
    console.log(`  ${nm}: ch${ps[0]}-${ps.at(-1)} 共${ps.length}章 ${gap.length ? '长缺席:' + gap.join(',') : ''}${dead.get(nm) ? ` | 疑似死亡@ch${dead.get(nm).ch}: ${dead.get(nm).ctx}` : ''}`);
  }
  // 死后复活检测:死亡章之后仍大量出现(作为尸体/回忆除外——粗查直接报数量)
  console.log('\n  [死后活动粗查]');
  for (const nm of names) {
    const d = dead.get(nm);
    if (!d) continue;
    const after = present.get(nm).filter((x) => x > d.ch);
    if (after.length > 2) console.log(`  ⚠ ${nm} ch${d.ch} 疑似死亡后仍在 ${after.length} 章出现: ch${after.join(',ch')}`);
    else console.log(`  ✓ ${nm} 死亡@ch${d.ch} 后仅 ${after.length} 章提及(回忆/尸体属正常)`);
  }
}
