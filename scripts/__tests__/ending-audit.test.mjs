// ending-audit.mjs 回归测试（node --test）。
// 覆盖：章节空洞/末章截断判定、伏笔口径分类（planned 不计回收率分母、abandoned 豁免）、
// main 级未回收伏笔排序首位、盲测书名脱敏、审查包包含末 K 章正文。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 被测脚本在 release-loop skill 的 scripts/ 下（skill 专属工具不进全局 scripts/，按归属红线归位）
const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.agents/skills/storyflow-release-loop/scripts/ending-audit.mjs'
);

/** 建一个临时书审目录：chapters 按 spec 生成正文文件，返回目录路径。 */
function makeBookDir(t, { chapters, foreshadows = [], name = '测试书名' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ending-audit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manifest = chapters.map(c => ({
    index: c.index,
    title: c.title ?? `第${c.index}章`,
    words: (c.text ?? '').replace(/\s/g, '').length,
    hasContent: (c.text ?? '').trim().length > 0,
  }));
  for (const c of chapters) {
    if ((c.text ?? '').trim()) {
      fs.writeFileSync(path.join(dir, `${String(c.index).padStart(3, '0')}.txt`), `${c.title ?? ''}\n\n${c.text}`, 'utf8');
    }
  }
  fs.writeFileSync(
    path.join(dir, 'book.json'),
    JSON.stringify({ id: 'p1', name, genre: 'test', exportedAt: 'T', chapters: manifest, foreshadows }),
    'utf8'
  );
  return dir;
}

/** 跑脚本并解析落盘的 ending-metrics.json。 */
function runAudit(dir, tailK) {
  execFileSync('node', [SCRIPT, dir, ...(tailK ? [String(tailK)] : [])], { encoding: 'utf8' });
  return JSON.parse(fs.readFileSync(path.join(dir, 'ending-metrics.json'), 'utf8'));
}

describe('ending-audit 章节完整性', () => {
  test('第2章缺失 → holes=[2]，complete=false', t => {
    const dir = makeBookDir(t, {
      chapters: [
        { index: 1, text: '甲'.repeat(500) },
        { index: 2, text: '' },
        { index: 3, text: '丙'.repeat(500) },
      ],
    });
    const m = runAudit(dir);
    assert.deepEqual(m.integrity.holes, [2]);
    assert.equal(m.integrity.complete, false);
    assert.equal(m.integrity.writtenChapters, 2);
  });

  test('末章不足300字 → lastTruncated，complete=false', t => {
    const dir = makeBookDir(t, {
      chapters: [
        { index: 1, text: '甲'.repeat(500) },
        { index: 2, text: '乙'.repeat(120) },
      ],
    });
    const m = runAudit(dir);
    assert.equal(m.integrity.lastTruncated, true);
    assert.equal(m.integrity.complete, false);
  });

  test('连续且末章足字 → complete=true', t => {
    const dir = makeBookDir(t, {
      chapters: [
        { index: 1, text: '甲'.repeat(500) },
        { index: 2, text: '乙'.repeat(500) },
      ],
    });
    const m = runAudit(dir);
    assert.equal(m.integrity.complete, true);
  });

  test('规划100章只写60章 → stoppedEarly=true（半本书不算完本，回归自 0830 基线误报）', t => {
    const chapters = [];
    for (let i = 1; i <= 60; i += 1) chapters.push({ index: i, text: '文'.repeat(500) });
    for (let i = 61; i <= 100; i += 1) chapters.push({ index: i, text: '' });
    const dir = makeBookDir(t, { chapters });
    const m = runAudit(dir);
    assert.equal(m.integrity.writtenChapters, 60);
    assert.equal(m.integrity.stoppedEarly, true);
    assert.equal(m.integrity.complete, false);
  });
});

describe('ending-audit 伏笔台账', () => {
  test('口径分类：planned 不进回收率分母、abandoned 豁免、main 未回收排首位', t => {
    const dir = makeBookDir(t, {
      chapters: [{ index: 1, text: '甲'.repeat(500) }, { index: 2, text: '乙'.repeat(500) }],
      foreshadows: [
        { id: 'f1', hint: '主线腰牌来历', status: 'buried', importance: 'main', setupChapter: 3 },
        { id: 'f2', hint: '支线旧信', status: 'resolved', importance: 'subplot', setupChapter: 1 },
        { id: 'f3', hint: '预埋未落笔', status: 'planned', setupChapter: 9 },
        { id: 'f4', hint: '主动放弃', status: 'abandoned', setupChapter: 2 },
      ],
    });
    const m = runAudit(dir);
    const led = m.foreshadowLedger;
    // 已落笔 = buried(f1) + resolved(f2)；回收率 = 1/2；planned/abandoned 不进分母
    assert.equal(led.resolutionRate, 0.5);
    assert.equal(led.plannedNeverWritten, 1);
    assert.equal(led.abandoned, 1);
    assert.equal(led.unresolvedActive, 1);
    assert.equal(led.unresolvedList[0].importance, 'main');
  });

  test('无伏笔 → rate=null 而非 0（没有数据不制造假指标）', t => {
    const dir = makeBookDir(t, { chapters: [{ index: 1, text: '甲'.repeat(500) }] });
    const m = runAudit(dir);
    assert.equal(m.foreshadowLedger.resolutionRate, null);
    assert.equal(m.foreshadowLedger.total, 0);
  });

  test('假回收：status=resolved 但 payoffChapter 无正文 → 按未回收计并单列（r14 ch39 形态）', t => {
    const dir = makeBookDir(t, {
      chapters: [
        { index: 1, text: '甲'.repeat(500) },
        { index: 2, text: '' }, // 回收章成洞
        { index: 3, text: '丙'.repeat(500) },
      ],
      foreshadows: [
        { id: 'f1', hint: '批红笔势', status: 'resolved', importance: 'subplot', setupChapter: 1, payoffChapter: 2 },
        { id: 'f2', hint: '日期差', status: 'resolved', importance: 'main', setupChapter: 1, payoffChapter: 3 },
      ],
    });
    const m = runAudit(dir);
    const led = m.foreshadowLedger;
    // f1 回收章(ch2)无正文 → 假回收：resolved 减 1、进 unresolvedList、rate 从 1.0 降为 0.5
    assert.equal(led.invalidResolved, 1);
    assert.equal(led.resolved, 1);
    assert.equal(led.unresolvedActive, 1);
    assert.equal(led.resolutionRate, 0.5);
    assert.equal(led.unresolvedList[0].status, 'resolved-but-no-prose');
    assert.equal(led.unresolvedList[0].payoffChapter, 2);
    // review-pack 里带「假回收」标注，供结局书审 AI 对照
    const pack = fs.readFileSync(path.join(dir, 'ending-review-pack.txt'), 'utf8');
    assert.ok(pack.includes('假回收'));
  });

  test('提前回收：规划 payoffChapter 超出已写范围但已 resolved → informational 不扣率（r14 ch22→52 误报修正）', t => {
    const dir = makeBookDir(t, {
      chapters: [
        { index: 1, text: '甲'.repeat(500) },
        { index: 2, text: '乙'.repeat(500) },
        { index: 3, text: '丙'.repeat(500) },
      ],
      foreshadows: [
        { id: 'f1', hint: '先支令', status: 'resolved', importance: 'main', setupChapter: 1, payoffChapter: 52 },
        { id: 'f2', hint: '内库账', status: 'resolved', importance: 'main', setupChapter: 1, payoffChapter: 3, actualPayoffChapter: 3 },
      ],
    });
    const m = runAudit(dir);
    const led = m.foreshadowLedger;
    // f1 规划回收@52 但书只写到 3：可能是提前兑现（正文有场面）——不算假回收不扣率
    assert.equal(led.invalidResolved, 0);
    assert.equal(led.resolvedEarly, 1);
    assert.equal(led.resolved, 2);
    assert.equal(led.resolutionRate, 1);
    assert.equal(led.unresolvedActive, 0);
  });

  test('actualPayoffChapter 优先于规划 payoffChapter：实际回收章是洞才算假回收', t => {
    const dir = makeBookDir(t, {
      chapters: [
        { index: 1, text: '甲'.repeat(500) },
        { index: 2, text: '' }, // 实际回收章成洞
        { index: 3, text: '丙'.repeat(500) },
      ],
      foreshadows: [
        // 规划@52 但判官在 ch2 确认回收、ch2 是洞 → 实际回收章无正文 = 假回收
        { id: 'f1', hint: '先支令', status: 'resolved', importance: 'main', setupChapter: 1, payoffChapter: 52, actualPayoffChapter: 2 },
      ],
    });
    const m = runAudit(dir);
    assert.equal(m.foreshadowLedger.invalidResolved, 1);
    assert.equal(m.foreshadowLedger.resolutionRate, 0);
  });

  test('payoffChapter 无正文但 status 本就未回收 → 不重复计入 invalidResolved', t => {
    const dir = makeBookDir(t, {
      chapters: [{ index: 1, text: '甲'.repeat(500) }, { index: 2, text: '' }],
      foreshadows: [
        { id: 'f1', hint: '腰牌', status: 'buried', importance: 'main', setupChapter: 1, payoffChapter: 2 },
      ],
    });
    const m = runAudit(dir);
    assert.equal(m.foreshadowLedger.invalidResolved, 0);
    assert.equal(m.foreshadowLedger.unresolvedActive, 1);
  });
});

describe('ending-audit 产物内容', () => {
  test('审查包含末K章正文与未回收清单；盲测书名脱敏', t => {
    const dir = makeBookDir(t, {
      chapters: [
        { index: 1, text: ('开头甲'.repeat(100)) + '测试书名' },
        { index: 2, text: '乙'.repeat(500) },
        { index: 3, text: '丙'.repeat(500) },
        { index: 4, text: '丁'.repeat(500) },
      ],
      foreshadows: [{ id: 'f1', hint: '主线腰牌来历', status: 'buried', importance: 'main', setupChapter: 3 }],
      name: '测试书名',
    });
    runAudit(dir, 2);
    const pack = fs.readFileSync(path.join(dir, 'ending-review-pack.txt'), 'utf8');
    // 末 2 章（3、4）在包里，第 1 章不在
    assert.ok(pack.includes('=====第4章') || pack.includes('===== 第4章'));
    assert.ok(pack.includes('===== 第3章'));
    assert.ok(!pack.includes('===== 第1章'));
    assert.ok(pack.includes('主线腰牌来历'));
    assert.ok(pack.includes('主线收束'));
    // 盲测：前三章齐全，书名被替换为《书A》
    const blind1 = fs.readFileSync(path.join(dir, 'blindtest', 'ch1.txt'), 'utf8');
    const blind3 = fs.readFileSync(path.join(dir, 'blindtest', 'ch3.txt'), 'utf8');
    assert.ok(!blind1.includes('测试书名'));
    assert.ok(blind1.includes('《书A》'));
    assert.ok(fs.existsSync(path.join(dir, 'blindtest', 'README.txt')));
  });
});
