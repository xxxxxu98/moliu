import { readFileSync, writeFileSync } from 'node:fs';

const store = JSON.parse(readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'));
const proj = store.projects?.[0];
const out = [];

// 1) store 章节序号与组装文本对齐检查
const chs = (proj?.chapters ?? []).map((ch, i) => ({
  i,
  orderIndex: ch.orderIndex,
  n: (ch.orderIndex ?? 0) + 1,
  title: ch.title ?? '',
  len: (ch.content || '').trim().length,
}));
out.push('chapters total: ' + chs.length);
const emptyOnes = chs.filter((c) => c.len === 0);
out.push('empty chapters: ' + JSON.stringify(emptyOnes.map((c) => ({ n: c.n, title: c.title.slice(0, 20) }))));
const c186 = chs.find((c) => c.n === 186);
out.push('store n=186: idx=' + c186?.i + ' orderIndex=' + c186?.orderIndex + ' title=' + c186?.title + ' len=' + c186?.len);

// 2) 完全复刻 scanProseDeadResurrection 的谓词,在 store 内容上找三人的命中点
const DEATH_PRED = '(?:气绝|毙命|身亡|丧命|殒命|惨死|暴毙|命丧|吐血而亡|服毒自尽|自刎|坠亡|被杀|被鸩杀|被毒杀|被人所杀|死于非命)';
const DEATH_REVERSE = '(?:杀了|斩杀|鸩杀|毒杀|格杀|击杀|处死|勒死|刺死)';
const JAISON_REVERSE = '(?:押(?:解|送|入)进?(?:天牢|大牢|死牢|宗人府|诏狱))';
const CONDEMN_PRED = '(?:被处斩|被判斩|被问斩|被定罪|被定谳|被论罪|被革职抄没|被满门抄斩)';
const ADVERB = '(?:当场|随即|立刻|当即|最终|当晚|当日|翌日|不久|很快)?';
const CONDITIONAL_RE =
  /不过是|无非是|大不了|照样[要会]|便[是要]|就得|就能|便能|要是|若是|如果|倘若|万一|与其|只当|想想|盘算|权衡|岂能|焉能|唯有|方有|一线生/;
const dismissed = [];

const chapters = [];
for (const ch of proj?.chapters ?? []) {
  if (ch?.content && ch.content.trim()) chapters.push({ n: (ch.orderIndex ?? 0) + 1, text: ch.content });
}
chapters.sort((a, b) => a.n - b.n);

for (const name of ['林铁锋', '赵元澈', '幼帝', '顾成化']) {
  for (const ch of chapters) {
    let from = 0;
    for (;;) {
      const at = ch.text.indexOf(name, from);
      if (at < 0) break;
      from = at + name.length;
      const tail = ch.text.slice(at + name.length, at + name.length + 24);
      const lead = ch.text.slice(Math.max(0, at - 12), at);
      const deathSubj = new RegExp(`^${ADVERB}${DEATH_PRED}`).test(tail);
      const deathRev = new RegExp(`${DEATH_REVERSE}[^。！？，,、地得]{0,6}$`).test(lead) &&
        !/者[，,]?.{0,6}(?:赏|封|连升|免死|免罪|记功)|就能|便能|何以|若真|当真|不如|不妨|以谢|以正|以平|以儆|以绝|谢天下|慰天下|祭旗|明志|偿命|抵命/.test(tail) &&
        !/(?:求|恳请|请|奏请|祈求)(?:陛下|皇上|圣上|太后|殿下|天子)?[^。！？，]{0,14}$/.test(lead);
      const throneSubj = new RegExp(`^${ADVERB}(?:驾崩|晏驾|崩逝|薨逝|龙驭上宾|宾天)`).test(tail);
      const condemnSubj = new RegExp(`^${ADVERB}${CONDEMN_PRED}`).test(tail);
      if (deathSubj || deathRev || throneSubj || condemnSubj) {
        dismissed.push(`${name} @ch${ch.n} [${deathSubj ? 'deathSubj' : deathRev ? 'deathRev' : throneSubj ? 'throne' : 'condemn'}] lead=…${lead}‖ tail=${tail}…`);
      }
    }
  }
}

out.push('\n===== 死亡谓词命中点(复刻扫描,未含台词/条件守卫) =====');
out.push(dismissed.join('\n') || '(无命中!)');

writeFileSync('temp/r2a-scan-repro.txt', out.join('\n'), 'utf8');
console.log('written');
