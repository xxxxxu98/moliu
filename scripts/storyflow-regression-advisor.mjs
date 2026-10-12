#!/usr/bin/env node
/**
 * 回归分级路由 advisor：按修复改动的影响面给出确定性回归建议（2026-10-12 ⑧）。
 *
 * 背景：三级回归（回放用例/reg20/100章终验）并列存在，但 100 章要 ~2160 分钟——
 * 不是每个修复都配得上它。本脚本读 git diff 文件清单，按路由表输出建议等级与命令，
 * 把「跑哪级回归」从事后拍脑袋变成查表。
 *
 * 用法：
 *   node scripts/storyflow-regression-advisor.mjs [--base HEAD~1] [--staged] [--files f1,f2]
 * 无 --files 时读 git diff --name-only（--staged 读暂存区，默认 --base HEAD）。
 *
 * 等级（就高不就低）：
 *   L1  确定性回归：vitest + node --test 四套件（零 AI 成本）
 *   L2  L1 + 回放用例全套（temp/replay-cases 现存用例重放）
 *   L3  L2 + reg20 快速回归（真实 AI 20 章）
 *   L3+ L3 + 100 章终验（只建议给编排/状态层结构性改动；普通修复不配）
 *
 * 路由表是真源：新模块落位时须同步更新 ROUTES。
 */
import { execFileSync } from 'node:child_process';

const LEVELS = {
  L1: { name: '确定性回归', cmd: 'npx vitest run && npm run test:storyflow-triage && npm run test:findings-ledger && npm run test:state-ledger && npm run test:ending-audit' },
  L2: { name: '回放用例重放', cmd: 'node scripts/storyflow-replay-chapter.mjs run all' },
  L3: { name: 'reg20 快速回归', cmd: 'set MOLIU_CHAPTER_COUNT=20&& set MOLIU_STORYFLOW_MATRIX_DIR=temp\\storyflow-matrix-<tag>reg&& node scripts/agent-storyflow-real-multi.mjs <providerId>' },
  'L3+': { name: '100 章终验', cmd: 'set MOLIU_CHAPTER_COUNT=100&& set MOLIU_STORYFLOW_MATRIX_DIR=temp\\storyflow-matrix-<tag>final&& node scripts/agent-storyflow-real-multi.mjs <providerId>' },
};

/**
 * 路由表（顺序即优先级，首中即止）。
 * tier: L1/L2/L3/L3+ —— 该模式命中时按 tier 归入等级。
 * tag: 路由原因（写进报告，让「为什么跑这级」可追溯）。
 */
const ROUTES = [
  { pattern: /^\.agents\/skills\/.*\.md$|^docs\//, tier: 'L1', tag: '文档/SKILL 改动，无代码行为' },
  { pattern: /^scripts\/__tests__\//, tier: 'L1', tag: '测试自身改动' },
  { pattern: /^scripts\/.*\.mjs$/, tier: 'L1', tag: '脚本层改动（vitest/node 套件覆盖）；若改的是 runner 本体再手动跑一次 smoke' },
  { pattern: /^src\/.*\.(vue|css)$|^src\/.*\/components\//, tier: 'L1', tag: 'UI 层改动，不触生成链' },
  { pattern: /^src\/.*__tests__\//, tier: 'L1', tag: '测试自身改动' },
  // —— 大纲生成层：影响全链（大纲分是当前唯一未收敛层）——
  { pattern: /^src\/.*services\/outline\//, tier: 'L3', tag: '大纲层改动：reg20 验大纲完整性与正文四门禁' },
  // —— 编排/状态层：结构性风险最高 ——
  { pattern: /^src\/.*services\/writing\/ChapterWritingPipeline\.ts$/, tier: 'L3+', tag: '单章编排层结构改动：回放+reg20+100 章终验（补写/续跑/台账回写都在这条链上）' },
  { pattern: /^src\/.*services\/writing\/(numericLedger|eraLedger|stateLedger|rejectionLessons)\.ts$/, tier: 'L3', tag: '台账/账本层改动：reg20 验跨章一致性注入' },
  { pattern: /^src\/.*services\/writing\/(supplement|typesetting|chapterTitle|utils)\.ts$/, tier: 'L2', tag: '字数/排版辅助层：回放用例覆盖正文形态' },
  // —— 判官/守卫层 ——
  { pattern: /^src\/.*story-runtime\/(AIChapterJudge|ContinuityValidator|readerQualityJudge)\.ts$/, tier: 'L3', tag: '判官/校验层改动：reg20 验首过率与误拦率双向' },
  { pattern: /^src\/.*story-runtime\/(proseRules|SceneDraftEngine|promptInvariants|contractHealth)\.ts$/, tier: 'L2', tag: '起草 prompt/合同层改动：回放用例抽验正文形态（必要时升级 reg20）' },
  { pattern: /^src\/.*story-runtime\/(LongFormWritingEngine|TrainingPairRecorder|ChapterCommitService)\.ts$/, tier: 'L3', tag: '引擎主链改动：reg20 验完整起草→审查→改稿→提交链' },
  { pattern: /^src\/.*story-runtime\/agent\//, tier: 'L3', tag: 'agent 循环/工具改动：reg20 验改稿回合' },
  { pattern: /^src\/.*story-runtime\//, tier: 'L2', tag: 'story-runtime 其他模块：回放用例覆盖' },
  { pattern: /^src\/.*services\/writing\//, tier: 'L2', tag: 'writing 服务层：回放用例覆盖' },
  { pattern: /.*/, tier: 'L1', tag: '未登记路径，按最低级处理；新模块落位请同步 ROUTES' },
];

const TIER_ORDER = ['L1', 'L2', 'L3', 'L3+'];

/** 对一份文件清单做路由（导出供测试）。返回 {level, matched: [{file, tier, tag}]} */
export function routeRegression(files) {
  const matched = files.map(file => {
    const route = ROUTES.find(item => item.pattern.test(file));
    return { file, tier: route.tier, tag: route.tag };
  });
  const level = matched.reduce(
    (highest, item) =>
      TIER_ORDER.indexOf(item.tier) > TIER_ORDER.indexOf(highest) ? item.tier : highest,
    'L1'
  );
  return { level, matched };
}

export function renderAdvice(result) {
  const lines = [`[regression-advisor] 建议等级：${result.level}`];
  for (const item of result.matched) {
    lines.push(`  ${item.tier.padEnd(3)} ${item.file} —— ${item.tag}`);
  }
  lines.push('');
  const cumulative = TIER_ORDER.slice(0, TIER_ORDER.indexOf(result.level) + 1);
  for (const tier of cumulative) {
    lines.push(`[regression-advisor] ${tier} ${LEVELS[tier].name}：`);
    lines.push(`  ${LEVELS[tier].cmd}`);
  }
  if (result.level === 'L3+') {
    lines.push('');
    lines.push('[regression-advisor] L3+ 触发条件是编排/状态层结构改动；若本次只是文案/小修，可降 L3 并在台账注明降级理由');
  }
  return lines.join('\n');
}

function resolveChangedFiles(args) {
  const filesFlagIndex = args.indexOf('--files');
  if (filesFlagIndex >= 0) {
    return String(args[filesFlagIndex + 1] ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  const baseIndex = args.indexOf('--base');
  const base = baseIndex >= 0 ? args[baseIndex + 1] : 'HEAD';
  const diffArgs = args.includes('--staged')
    ? ['diff', '--cached', '--name-only']
    : ['diff', base, '--name-only'];
  try {
    return execFileSync('git', diffArgs, { encoding: 'utf8' })
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean);
  } catch (error) {
    console.error(`[regression-advisor] git diff 失败：${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('storyflow-regression-advisor.mjs');
if (isDirectRun) {
  const files = resolveChangedFiles(process.argv.slice(2));
  if (files.length === 0) {
    console.log('[regression-advisor] 无改动文件，无需回归');
    process.exit(0);
  }
  console.log(renderAdvice(routeRegression(files)));
}
