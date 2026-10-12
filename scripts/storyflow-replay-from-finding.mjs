#!/usr/bin/env node
/**
 * S1 自动沉淀回放用例桥（2026-10-12 ⑧）：findings.json → replay spec →（可选）make。
 *
 * 背景：r21 的回放用例（custody-guheng / slip-drift）是手做的。「生产失败自动变
 * 回归资产」要做成确定性步骤：书审产出的每条终稿 S1（带原文证据、带矩阵目录）
 * 都应一键变成回放 spec，修复后 `replay run all` 分钟级回归。
 *
 * 用法：
 *   node scripts/storyflow-replay-from-finding.mjs <findings.json> [--finding <id>]
 *       [--matrix-dir <dir>] [--out temp/replay-specs] [--make]
 *   --matrix-dir 缺省读 findings 顶层 matrixDir；--make 时逐个调
 *   storyflow-replay-chapter.mjs make（源 store 必须仍在 temp 下可读）。
 *
 * 跳过条件（打印原因，不算失败）：非 S1、status!=final、缺 evidence。
 * 旧轮 temp 已清理找不到 project-store 时：只写 spec（sourceStore 空）不 make。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/** 递归找 matrixDir 下全部 *project-store.json（多厂商矩阵取体积最大=章数最全的那份） */
export function findLargestProjectStore(matrixDir) {
  const stores = [];
  const walk = dir => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('project-store.json')) stores.push(full);
    }
  };
  walk(matrixDir);
  if (stores.length === 0) return null;
  return stores
    .map(path => ({ path, size: statSync(path).size }))
    .sort((a, b) => b.size - a.size)[0].path;
}

const CLASS_QUESTIONS = {
  'state.fate': '重放后，已死亡/已定终态的角色是否又以存活或原状态出现，且正文无平反/揭晓场面？',
  'state.custody': '重放后，在押/羁押角色是否自由活动或被释放，且正文无释放/越狱叙述？',
  'state.title': '重放后，角色官职/头衔/品级是否与既成任免不一致且无新任免叙述？',
  'state.identity': '重放后，角色身份/出身/年龄是否与既成设定矛盾？',
  'state.location': '重放后，角色是否出现在与既成位置矛盾的地方（瞬移/分身/闭环航线）？',
  'number.ledger': '重放后，同一账目/物证的数字是否与既成正典不一致且无勘误场面？',
  'number.arithmetic': '重放后，正文的数量×单位算术是否与总量声明矛盾？',
  'number.setting': '重放后，设定类数字（兵力/船数/人数等）是否与既成口径漂移？',
  'time.era': '重放后，纪年/年号是否与既成年号矛盾或平行纪年？',
  'time.sequence': '重放后，时序/季节/时间跨度是否与既成时间线矛盾？',
  'continuity.boundary': '重放后，本章开场是否跳拍或重演上章结尾？',
  'structure.arc': '重放后，关键线索/主线是否悬空或假死未揭晓？',
  'structure.offscreen': '重放后，关键事件（死亡/处决/登基等）是否零叙述直接跳结果？',
  'structure.repeat': '重放后，同一终态/事件是否跨章重演？',
  'outline.contract': '重放后，大纲/蓝图是否自身矛盾或违背禁区？',
  'prose.leak': '重放后，大纲节点原句是否漏进正文？',
  'prose.anachronism': '重放后，正文是否出现现代词出戏或礼制混用？',
  'prose.slop': '重放后，正文是否出现 AI 腔/套路同构/词频复读？',
  'ending.closure': '重放后，主线伏笔是否未回收/收束不足？',
};

function sanitizeId(value) {
  return String(value).replace(/[^\w.-]+/gu, '-').replace(/^-+|-+$/g, '') || 'finding';
}

/** 由 findings 文档构造回放 spec 列表（导出供测试）。返回 {specs, skipped: [{id, reason}]} */
export function buildReplaySpecs(doc) {
  const specs = [];
  const skipped = [];
  for (const finding of doc.findings ?? []) {
    const label = `${doc.round}-${finding.id}`;
    if (finding.severity !== 'S1') {
      skipped.push({ id: label, reason: `severity=${finding.severity}（只沉淀 S1）` });
      continue;
    }
    if (finding.status !== 'final') {
      skipped.push({ id: label, reason: `status=${finding.status}（非终稿实锤）` });
      continue;
    }
    const evidence = (finding.evidence ?? []).find(item => Number.isInteger(item?.chapter));
    if (!evidence) {
      skipped.push({ id: label, reason: '缺 {chapter, quote} 原文证据' });
      continue;
    }
    specs.push({
      id: sanitizeId(label),
      findingId: String(finding.id),
      sourceStore: null, // 由 CLI 按 matrixDir 解析
      fromChapter: Math.max(1, evidence.chapter - 1),
      window: 2,
      probe: {
        context: `${finding.class}｜${finding.summary}`,
        question:
          CLASS_QUESTIONS[finding.class] ??
          `重放后是否复现该 S1（${String(finding.summary).slice(0, 80)}）？`,
      },
    });
  }
  return { specs, skipped };
}

const [docPath, ...flags] = process.argv.slice(2);
const isDirectRun = process.argv[1] && process.argv[1].endsWith('storyflow-replay-from-finding.mjs');
if (isDirectRun) {
  if (!docPath) {
    console.error('用法: storyflow-replay-from-finding.mjs <findings.json> [--finding id] [--matrix-dir dir] [--out dir] [--make]');
    process.exit(1);
  }
  const doc = JSON.parse(readFileSync(resolve(docPath), 'utf8'));
  const matrixDir = resolve(argValue(flags, '--matrix-dir') ?? doc.matrixDir ?? '');
  const outDir = resolve(argValue(flags, '--out') ?? join(repoRoot, 'temp/replay-specs'));
  const onlyFinding = argValue(flags, '--finding');
  const { specs, skipped } = buildReplaySpecs(doc);
  mkdirSync(outDir, { recursive: true });

  const store = findLargestProjectStore(matrixDir);
  if (!store) {
    console.log(`[replay-from-finding] matrixDir 无 project-store：${matrixDir || '(未提供)'}——只写 spec 不 make`);
  } else {
    console.log(`[replay-from-finding] 源 store：${relative(repoRoot, store)}`);
  }

  let made = 0;
  for (const spec of specs) {
    if (onlyFinding && spec.findingId !== onlyFinding) continue;
    const specPath = join(outDir, `${spec.id}.json`);
    // 无源 store 时 sourceStore 整体缺省（make 侧有必填校验兜底），不写 null
    const { sourceStore: _omit, ...specWithoutStore } = spec;
    writeFileSync(
      specPath,
      JSON.stringify({ ...specWithoutStore, ...(store ? { sourceStore: store } : {}) }, null, 2),
      'utf8'
    );
    console.log(`[replay-from-finding] spec ${spec.id} -> ${relative(repoRoot, specPath)}`);
    if (flags.includes('--make')) {
      if (!store) {
        console.log(`[replay-from-finding] 跳过 make ${spec.id}（无源 store）`);
        continue;
      }
      const result = spawnSync('node', [
        join(repoRoot, 'scripts/storyflow-replay-chapter.mjs'), 'make', '--spec', specPath,
      ], { stdio: 'inherit', cwd: repoRoot });
      if (result.status === 0) made += 1;
    }
  }
  for (const item of skipped) {
    console.log(`[replay-from-finding] 跳过 ${item.id}：${item.reason}`);
  }
  console.log(`[replay-from-finding] specs=${specs.length} skipped=${skipped.length}${flags.includes('--make') ? ` made=${made}` : ''}`);
}
