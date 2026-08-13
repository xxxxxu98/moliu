import fs from 'node:fs';

import {
  extractRequestedChapterBlocks,
  replaceOutlineSection,
  extractOutlineSectionBody,
} from '../src/renderer/src/services/outline/generators/outline-completer';
import { parseExpandedOutline } from '../src/renderer/src/services/outline/parser/expanded-outline-parser';
import { inspectOutlineCompleteness } from '../src/renderer/src/services/outline/validation/outlineCompleteness';

const ALIASES = ['单章蓝图', '逐章蓝图'];
const TRACE = 'temp/ai-traces/storyflow-outline-1786603143649.jsonl';

const rows = fs
  .readFileSync(TRACE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line) as { purpose: string; response: string; at: string });

const expands = rows.filter(r => r.purpose === 'outline-expand');
const mainExpand = expands[0].response;
const batches = expands.slice(1, 6).map(r => r.response);
const review = rows.find(r => r.purpose === 'outline-review')!.response;

const count = (raw: string): number =>
  parseExpandedOutline(raw)?.chapterBlueprints?.length ?? -1;

console.log('步骤1 主 expand：蓝图数 =', count(mainExpand));

// 步骤2：按 completeIncompleteOutline 的方式把 5 批章节块并入蓝图节
const blocks: string[] = [];
batches.forEach((resp, index) => {
  const want = Array.from({ length: 10 }, (_, i) => index * 10 + i + 1);
  const got = extractRequestedChapterBlocks(resp, want);
  console.log(`  批次 ${want[0]}-${want.at(-1)}：解析出 ${got.size} 章`);
  for (const block of got.values()) blocks.push(block);
});
const merged = replaceOutlineSection(mainExpand, ALIASES, ALIASES[0], blocks.join('\n\n'));
console.log('步骤2 合并 50 章后：蓝图数 =', count(merged));

// 步骤3：模拟 reviewAndFixOutline 的剥离与拼回
const hasSection = new RegExp(`^##\\s*(?:${ALIASES.join('|')})(?:\\s*[（(].*)?\\s*$`, 'mu').test(
  merged
);
const blueprintSection = hasSection ? extractOutlineSectionBody(merged, ALIASES) : '';
console.log('步骤3 剥离出的蓝图节字数 =', blueprintSection.length, '| 找到蓝图标题 =', hasSection);

const restored = blueprintSection
  ? replaceOutlineSection(review, ALIASES, ALIASES[0], blueprintSection)
  : review;
console.log('步骤4 拼回 review 稿后：蓝图数 =', count(restored));

if (count(restored) < 50) {
  const m = /^##\s*(单章蓝图|逐章蓝图).*$/mu.exec(restored);
  console.log('--- 拼回后蓝图节前 300 字 ---');
  console.log(m ? restored.slice(m.index, m.index + 300) : '（没有蓝图节）');
}

// 步骤5：定点修复轮会把蓝图从对象重新序列化回 markdown，验证往返是否无损
const listField = (items: string[] | undefined): string => (items ?? []).join('；');
const serializeBlueprint = (b: any): string =>
  `### 第${b.orderIndex}章
- 标题：${b.title}
- CBN：${b.CBN}
- CPNs：${listField(b.CPNs)}
- CEN：${b.CEN}
- mustCover：${listField(b.mustCover)}
- 禁区：${listField(b.forbiddenZones)}
- 章尾钩子文案：${b.hookText ?? ''}
- 爽点类型：${b.coolPointType ?? b.hookType ?? '反转'}`;

const parsed = parseExpandedOutline(restored)!;
const reserialized = replaceOutlineSection(
  restored,
  ALIASES,
  ALIASES[0],
  (parsed.chapterBlueprints ?? [])
    .slice()
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex)
    .map(serializeBlueprint)
    .join('\n\n')
);
// 步骤6：并入 3 轮定点修复，复算第 1 次尝试的最终门禁
const repairResponses = expands.slice(6, 9).map(r => r.response);
let afterRepair = restored;
for (const resp of repairResponses) {
  const numbers = [...resp.matchAll(/^#{2,4}\s*第?\s*(\d+)\s*章/gmu)].map(m => Number(m[1]));
  const got = extractRequestedChapterBlocks(resp, numbers);
  const current = parseExpandedOutline(afterRepair)!;
  const map = new Map<number, string>();
  for (const b of current.chapterBlueprints ?? []) map.set(b.orderIndex, serializeBlueprint(b));
  for (const [no, block] of got) map.set(no, block);
  afterRepair = replaceOutlineSection(
    afterRepair,
    ALIASES,
    ALIASES[0],
    [...map.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]).join('\n\n')
  );
}

const finalOutline = parseExpandedOutline(afterRepair)!;
const completeness = inspectOutlineCompleteness(finalOutline);

const report = [
  `step6_after_repair=${count(afterRepair)}`,
  `canApply=${completeness.canApply}`,
  `blockers(${completeness.blockers.length}):`,
  ...completeness.blockers.map(b => `  - ${b.message}`),
  `characters=${(finalOutline.keyCharacters ?? []).length} foreshadows=${(finalOutline.foreshadows ?? []).length}`,
  '',
  `step1_main_expand_blueprints=${count(mainExpand)}`,
  `step2_after_merge=${count(merged)}`,
  `step3_blueprint_section_chars=${blueprintSection.length}`,
  `step4_after_review_restore=${count(restored)}`,
  `step5_after_reserialize=${count(reserialized)}`,
  '--- serialized chapter 1 ---',
  serializeBlueprint((parsed.chapterBlueprints ?? [])[0]),
].join('\n');
fs.writeFileSync('temp/replay-report.txt', report, 'utf8');
