/**
 * 续写收束卷（真实 AI）：对已有书籍扩展 plannedChapterCount 并续写终卷。
 *
 *   node scripts/storyflow-closeout.mjs <project-store.json> <fromChapter> <toChapter>
 *
 * 流程（2026-09-10 待批准项 #3 方案 a 落地）：
 * 1. 读 store → 注入 settingsStore（滚纲走 UnifiedOutlineGenerator 真实 AI）；
 * 2. ensureStoryflowWritingCapacity 滚出 from..to 章蓝图——触顶 plannedChapterCount
 *    时终卷收束硬约束生效（主线收束/反派清算/主角弧闭环/伏笔出清/末章收束句）；
 * 3. 落盘扩展后的 plotOutline/chapters/plannedChapterCount（原文件备份 .bak-closeout）；
 * 4. 复用 runRepairEmptyChapters 逐章补写（判官门禁+缝合+状态截断+伏笔熔断全链生效）。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';

import { isRealAiEnabled } from './realStructuredAI';
import {
  ensureStoryflowWritingCapacity,
} from './storyflowClosedLoopHarness';
import { runRepairEmptyChapters } from './storyflow.repair-empty.test';
import { resolveContinueWriteRealConfig } from './continueWriteRealConfig';
import { UnifiedOutlineGenerator } from '@/services/outline/generators/unified-generator';
import { useSettingsStore } from '@/stores/settings.store';
import type { Project } from '@/types/project';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

interface CloseoutOptions {
  storePath: string;
  fromChapter: number;
  toChapter: number;
  targetWordCount: number;
}

function resolveCloseoutOptions(): CloseoutOptions | null {
  const storePath = process.env.MOLIU_CLOSEOUT_STORE?.trim();
  const from = Number(process.env.MOLIU_CLOSEOUT_FROM);
  const to = Number(process.env.MOLIU_CLOSEOUT_TO);
  if (!storePath || !Number.isInteger(from) || !Number.isInteger(to) || to < from) return null;
  return {
    storePath,
    fromChapter: from,
    toChapter: to,
    targetWordCount: Number(process.env.MOLIU_REPAIR_TARGET_WORDS) > 0
      ? Number(process.env.MOLIU_REPAIR_TARGET_WORDS)
      : 3000,
  };
}

/** store 文件根可能是 {projects:[...]} / {projects:{id:...}} / 直接项目对象 */
function loadProjectFromStore(storePath: string): { root: Record<string, unknown>; project: Project } {
  const root = JSON.parse(readFileSync(storePath, 'utf8')) as Record<string, unknown>;
  const rawProjects = root.projects as unknown;
  const project = Array.isArray(rawProjects)
    ? (rawProjects[0] as Project)
    : rawProjects && typeof rawProjects === 'object'
      ? (Object.values(rawProjects)[0] as Project)
      : (root as unknown as Project);
  if (!project || !Array.isArray(project.chapters)) {
    throw new Error('store 中找不到带 chapters 的项目');
  }
  return { root, project };
}

function writeProjectBack(storePath: string, root: Record<string, unknown>, project: Project): void {
  const projectOut = project as unknown as Record<string, unknown>;
  if (Array.isArray(root.projects)) {
    (root.projects as unknown[])[0] = projectOut;
  } else if (root.projects && typeof root.projects === 'object') {
    const key = Object.keys(root.projects)[0];
    (root.projects as Record<string, unknown>)[key] = projectOut;
  } else {
    Object.assign(root, projectOut);
  }
  if (!existsSync(`${storePath}.bak-closeout`)) {
    copyFileSync(storePath, `${storePath}.bak-closeout`);
  }
  writeFileSync(storePath, JSON.stringify(root, null, 2), 'utf8');
}

export async function runCloseoutVolume(options: CloseoutOptions): Promise<void> {
  const { root, project } = loadProjectFromStore(options.storePath);

  // ---- 1) settingsStore 注入（滚纲 UnifiedOutlineGenerator 的配置源）----
  const cfg = resolveContinueWriteRealConfig();
  if (!getActivePinia()) setActivePinia(createPinia());
  const settings = useSettingsStore();
  settings.aiProviders = [
    {
      id: cfg.providerId ?? 'storyflow-provider',
      name: 'storyflow-real-ai',
      provider: cfg.provider as never,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      modelName: cfg.model ?? '',
      enabled: true,
    },
  ];
  settings.defaultModel = { providerId: cfg.providerId ?? 'storyflow-provider', modelName: cfg.model ?? '' };

  // ---- 2) 滚终卷蓝图（触顶 plannedChapterCount → 收束硬约束生效）----
  const rollGenerator = new UnifiedOutlineGenerator();
  const rollTraceRunId = `storyflow-closeout-roll-${Date.now()}`;
  const rolled = await ensureStoryflowWritingCapacity(
    { ...project, metadata: { ...project.metadata, plannedChapterCount: options.toChapter } },
    options.toChapter,
    {
      callStructuredText: (system, user, temperature) =>
        rollGenerator.callStructuredTextForRoll(system, user, {
          temperature,
          trace: { runId: rollTraceRunId, model: cfg.model, provider: cfg.provider },
        }),
      onProgress: message => console.log(`[closeout:roll] ${message}`),
    },
  );
  const rollReport = (rolled as { outlineRoll?: { rolledCount: number; warnings: string[] } }).outlineRoll;
  console.log(
    `[closeout:roll] 终卷蓝图完成：真滚 ${rollReport?.rolledCount ?? 0} 章，` +
      `警告 ${rollReport?.warnings.length ?? 0} 条` +
      (rollReport && rollReport.warnings.length > 0 ? `：${rollReport.warnings.slice(0, 5).join('；')}` : ''),
  );

  // ---- 3) 落盘扩展后的项目（plotOutline/chapters/plannedChapterCount）----
  writeProjectBack(options.storePath, root, rolled as Project);
  console.log(`[closeout] store 已扩展落盘 ${options.storePath}（备份 .bak-closeout）`);

  // ---- 4) 逐章补写终卷（空章走 repair-empty 全链：门禁/缝合/截断/熔断）----
  const chapterNumbers: number[] = [];
  for (let n = options.fromChapter; n <= options.toChapter; n += 1) chapterNumbers.push(n);
  await runRepairEmptyChapters({
    storePath: options.storePath,
    chapterNumbers,
    targetWordCount: options.targetWordCount,
  });
}

const closeoutOptions = resolveCloseoutOptions();

describe('续写收束卷（真实 AI）', () => {
  it.runIf(isRealAiEnabled() && closeoutOptions !== null)(
    '扩展终卷蓝图并补写全部收束章',
    async () => {
      await runCloseoutVolume(closeoutOptions!);
      const { project } = loadProjectFromStore(closeoutOptions!.storePath);
      for (let n = closeoutOptions!.fromChapter; n <= closeoutOptions!.toChapter; n += 1) {
        const chapter = project.chapters.find(item => (item.orderIndex ?? 0) + 1 === n);
        expect(chapter, `第 ${n} 章应存在`).toBeDefined();
        expect((chapter?.content ?? '').trim().length, `第 ${n} 章正文非空`).toBeGreaterThan(2000);
      }
    },
    // 预算：滚终卷 1 批 + 14 章 × 3 次尝试 × 慢网关
    60 * 60 * 1000 * 8,
  );
});
