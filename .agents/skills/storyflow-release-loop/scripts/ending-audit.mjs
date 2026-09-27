// 完本收束审计（north-star 验收门第 6 项「能完本」的最小实现）+ 盲测材料导出（第 5 项）。
// 用法: node ending-audit.mjs <book-review目录> [末尾审查章数,默认3]
// 输入：assemble-matrix-bookreview.mjs 产出的书审目录（001..NNN.txt + book.json，含伏笔台账）。
// 输出（全部落盘 UTF-8，控制台只打 ASCII 摘要，规避 CMD 中文乱码）：
//   ending-metrics.json     确定性完本指标（章节完整性 + 伏笔回收率）
//   ending-review-pack.txt  AI 结局专项书审材料（末K章正文 + 未回收伏笔 + rubric）
//   blindtest/              前三章脱敏盲测材料 + 盲测协议说明
import fs from 'node:fs';
import path from 'node:path';

const [, dirArg, tailKArg] = process.argv.slice(1);
if (!dirArg) {
  console.error('usage: node ending-audit.mjs <book-review-dir> [tail-chapters=3]');
  process.exit(1);
}
const bookDir = dirArg;
const TAIL_K = Math.max(1, Number(tailKArg) || 3);
const book = JSON.parse(fs.readFileSync(path.join(bookDir, 'book.json'), 'utf8'));

/** 章节完整性：正文文件号必须从 1 连续递增；末章字数过低视为疑似截断；
 *  实写章数少于规划章数视为停产（半本书的「已写部分连续」不等于完本）。 */
function collectChapterIntegrity(chapters) {
  const written = chapters.filter(c => c.hasContent).map(c => c.index).sort((a, b) => a - b);
  const holes = [];
  for (let i = 1; i <= written.length; i += 1) {
    if (!written.includes(i)) holes.push(i);
  }
  const last = written[written.length - 1] ?? 0;
  const lastChapter = chapters.find(c => c.index === last);
  // 300 字是单章下限的硬截断信号；低于它基本是生成中断的残稿而不是短章
  const lastTruncated = Boolean(lastChapter && lastChapter.words < 300);
  // 停产判定：超 20% 规划章无正文即 incomplete（60/100 这种中间态必须拦住）
  const missingTail = chapters.length - written.length;
  const stoppedEarly = missingTail > Math.max(2, Math.floor(chapters.length * 0.2));
  return {
    totalChapters: chapters.length,
    writtenChapters: written.length,
    holes,
    stoppedEarly,
    lastChapterIndex: last,
    lastChapterWords: lastChapter?.words ?? 0,
    lastTruncated,
    complete: holes.length === 0 && !lastTruncated && !stoppedEarly,
  };
}

/**
 * 伏笔台账统计（north-star L8「能完本」）。
 * 口径（types/project.ts Foreshadow.status）：
 *   resolved=已回收；buried/hinted/foreshadowed=已落笔未回收（烂尾风险主体）；
 *   planned=大纲预埋但全书结束仍未落笔（未兑现）；abandoned=明确放弃（不计风险）。
 * 排序：main 主线伏笔未回收排最前——主线坑不填是拒签级烂尾信号。
 */
const UNRESOLVED_ACTIVE = ['buried', 'hinted', 'foreshadowed'];
const IMPORTANCE_RANK = { main: 0, subplot: 1, emotion: 2 };
function collectForeshadowLedger(foreshadows) {
  const by = status => foreshadows.filter(f => f.status === status);
  const unresolved = foreshadows
    .filter(f => UNRESOLVED_ACTIVE.includes(f.status))
    .sort((a, b) =>
      ((IMPORTANCE_RANK[a.importance] ?? 3) - (IMPORTANCE_RANK[b.importance] ?? 3)) ||
      String(a.id).localeCompare(String(b.id))
    );
  const plannedNeverWritten = by('planned');
  const planted = foreshadows.filter(f => UNRESOLVED_ACTIVE.includes(f.status) || f.status === 'resolved');
  return {
    total: foreshadows.length,
    resolved: by('resolved').length,
    unresolvedActive: unresolved.length,
    abandoned: by('abandoned').length,
    plannedNeverWritten: plannedNeverWritten.length,
    // 回收率分母不含 abandoned：主动弃坑是决策不是烂尾
    resolutionRate: planted.length ? Number((by('resolved').length / planted.length).toFixed(3)) : null,
    unresolvedList: unresolved.map(f => ({
      hint: String(f.hint ?? '').slice(0, 40),
      status: f.status,
      importance: f.importance ?? 'unknown',
      setupChapter: f.setupChapter ?? f.actualPlantedChapter ?? null,
    })),
    plannedList: plannedNeverWritten.map(f => String(f.hint ?? '').slice(0, 40)),
  };
}

/**
 * 组装 AI 结局专项书审材料：倒数 K 章全文 + 未回收伏笔清单 + 审查 rubric。
 * 结局质量是语义判断（主线收束/人物交代/烂尾观感），按规范 §9.4 交 AI 终审，
 * 确定性层只负责把证据组装齐。
 */
function buildReviewPack(chapters, ledger, tailK) {
  const written = chapters.filter(c => c.hasContent).sort((a, b) => a.index - b.index);
  const tail = written.slice(-tailK);
  const parts = [];
  parts.push('== 结局专项书审材料（完本收束审计） ==');
  parts.push(`全书：${written.length} 章有正文（规划 ${chapters.length} 章）`);
  parts.push('');
  parts.push('== 未回收伏笔清单（结局时点） ==');
  if (ledger.unresolvedList.length === 0 && ledger.plannedList.length === 0) {
    parts.push('（无未回收伏笔）');
  } else {
    for (const f of ledger.unresolvedList) {
      parts.push(`- [${f.importance}/${f.status}] ${f.hint}（埋设章：${f.setupChapter ?? '?'}）`);
    }
    for (const hint of ledger.plannedList) {
      parts.push(`- [planned 从未落笔] ${hint}`);
    }
  }
  parts.push('');
  for (const c of tail) {
    const file = path.join(bookDir, `${String(c.index).padStart(3, '0')}.txt`);
    parts.push(`===== 第${c.index}章 ${c.title} =====`);
    parts.push(fs.readFileSync(file, 'utf8'));
    parts.push('');
  }
  parts.push('== 审查 rubric（逐项给结论 + S1-S4 分级 Findings） ==');
  parts.push('1. 主线收束：核心冲突（开篇立的主要矛盾）在末章是否有明确结局？悬空= S1');
  parts.push('2. 伏笔处置：未回收清单里 main 级伏笔是否可在结局合理放弃？不可放弃且无交代 = S1；支线伏笔无交代 = S2');
  parts.push('3. 人物结局：末几章出场的主要角色命运是否有交代（不要求全员善终，要求无「凭空消失」）？主角无交代 = S1');
  parts.push('4. 结尾观感：读完最后一章，是「故事讲完了」还是「写到一半被切断」？后者 = S1');
  parts.push('5. 烂尾迹象：末 K 章是否出现加速赶稿（冲突草草和解、时间线跳跃收尾）？有 = S2');
  parts.push('6. 新钩子收尾（2026-09-13 增补完本收束标准）：末章结尾是否以新危机/新悬念/新报信收束');
  parts.push('   （如反派突发异动、急报冲殿、未见过的新事件戛然而止）而无终局画面交代？');
  parts.push('   末章应落在「尘埃落定/新秩序/主角归处」类收束画面上；以新钩子收尾 = S2，');
  parts.push('   若该钩子属主线矛盾本身的未决延续则升 S1。');
  return parts.join('\n');
}

/**
 * 盲测材料导出（north-star 验收门第 5 项）：前三章正文 + 脱敏。
 * 脱敏只处理书名/项目 id 这类元信息——章内人名是故事本体不能改，
 * 盲测协议本身要求评审只看「文笔/钩子/代入感」，不查重不查题材库。
 */
function exportBlindtest(chapters, bookName) {
  const outDir = path.join(bookDir, 'blindtest');
  fs.mkdirSync(outDir, { recursive: true });
  const opening = chapters.filter(c => c.hasContent).sort((a, b) => a.index - b.index).slice(0, 3);
  for (const c of opening) {
    const src = path.join(bookDir, `${String(c.index).padStart(3, '0')}.txt`);
    const text = fs.readFileSync(src, 'utf8');
    const masked = text.split(bookName).join('《书A》');
    fs.writeFileSync(path.join(outDir, `ch${c.index}.txt`), masked, 'utf8');
  }
  const protocol = [
    '== 前三章盲测协议（north-star 验收门第 5 项） ==',
    '',
    '材料：blindtest/ch1..ch3.txt（书名已脱敏为《书A》）。',
    '评审：至少 1 名有网文签约审稿经验者（老书编口径）。',
    '流程：只给三章正文，不告知 AI 生成背景、不告知书名题材定位，',
    '      请评审按日常审稿习惯读完并回答：',
    '  1. 你会继续追读吗？（会/不会/犹豫）',
    '  2. 三章内有没有让你想往下翻的一个「点」？（复述它）',
    '  3. 如果这是投稿，给不给出线机会？理由一句话。',
    '  4. 有没有哪一段让你出戏？（原文摘录）',
    '判定：问题 1 答「会」且问题 3 给出线 → 盲测通过；',
    '      任意评审在第 4 题摘录出「明显 AI 模板腔」原文 → 盲测不通过。',
    '',
    `导出来源：${bookName}，导出时间 ${new Date().toISOString()}`,
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'README.txt'), protocol, 'utf8');
  return outDir;
}

const integrity = collectChapterIntegrity(book.chapters ?? []);
const ledger = collectForeshadowLedger(book.foreshadows ?? []);

// 完本收束信号扫描（2026-09-13 增补，格式级）：末章正文的收束声明词命中数 +
// 末段预览。命中为零 = 结尾缺终局画面（供 AI 结局书审 rubric 第 6 项对照，
// 不单独定罪——ch200「崔相饮鸩」钩子收尾类问题的语义终审归 review-pack AI）
function collectClosureSignal(chapters) {
  const written = chapters.filter(c => c.hasContent).sort((a, b) => a.index - b.index);
  const last = written[written.length - 1];
  if (!last) return { closureSignals: 0, lastParagraphPreview: '' };
  const src = path.join(bookDir, `${String(last.index).padStart(3, '0')}.txt`);
  const text = fs.readFileSync(src, 'utf8');
  const CLOSURE_RE = /尘埃落定|大结局|终章|终局|落幕|归处|归隐|新秩序|天下大定|全书完|结案|定局|善终|圆满|新朝|新篇|算平|功圆|勒石|铭功|立碑告成|沉淀的基石/gu;
  const signals = [...text.matchAll(CLOSURE_RE)].length;
  const paragraphs = text.split(/\n+/u).map(p => p.trim()).filter(Boolean);
  const lastParagraphPreview = (paragraphs[paragraphs.length - 1] ?? '').slice(0, 120);
  return { closureSignals: signals, lastParagraphPreview };
}
const closure = collectClosureSignal(book.chapters ?? []);

fs.writeFileSync(
  path.join(bookDir, 'ending-metrics.json'),
  JSON.stringify({ book: book.name, exportedAt: new Date().toISOString(), integrity, closure, foreshadowLedger: ledger }, null, 1),
  'utf8'
);
fs.writeFileSync(path.join(bookDir, 'ending-review-pack.txt'), buildReviewPack(book.chapters ?? [], ledger, TAIL_K), 'utf8');
const blindtestDir = exportBlindtest(book.chapters ?? [], String(book.name ?? ''));

// 控制台 ASCII 摘要；结论解读看 ending-metrics.json 与 ending-review-pack.txt 的 AI 审读
console.log(`ending-audit: ${bookDir}`);
console.log(`integrity: complete=${integrity.complete} holes=${integrity.holes.length} lastCh=${integrity.lastChapterIndex} lastWords=${integrity.lastChapterWords}`);
console.log(`closure: signals=${closure.closureSignals}${closure.closureSignals === 0 ? ' [watch] 末章无收束声明词，AI 书审 rubric 第 6 项重点核查' : ''}`);
console.log(`foreshadow: total=${ledger.total} resolved=${ledger.resolved} unresolved=${ledger.unresolvedActive} planned=${ledger.plannedNeverWritten} rate=${ledger.resolutionRate}`);
console.log(`outputs: ending-metrics.json / ending-review-pack.txt / ${path.basename(blindtestDir)}/`);
