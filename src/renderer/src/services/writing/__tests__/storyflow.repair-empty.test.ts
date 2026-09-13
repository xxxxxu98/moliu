/**
 * 空章补写（真实 AI）：对已生成书籍的判死/空洞章做定点修复。
 *
 *   node scripts/storyflow-repair-empty.mjs <project-store.json> <章号[,章号...]>
 *
 * 流程（2026-09-07 待批准项 #2 落地）：
 * 1. 读 store → 项目直通 openContinueWriteSession（不经 toPipelineProject——它会丢
 *    chapterMemories/foreshadows，命运台账与伏笔锁全部失活）；
 * 2. 节点消毒：dropForeshadowConflictingItems 删掉与伏笔时点冲突的 mustCover/CPN
 *    （g38f r2 ch36 形态：节点「当众颁布三级网格考成法」vs 伏笔第 45 章揭示）；
 * 3. 缝合注入：章 outline 追加下章开头原文，强制本章结尾与之对齐（ch184 形态：
 *    滚动槽位空合同 + 前后章已定稿，本章必须双向缝合）；
 * 4. 空章走管线 isEmptyRewrite 路径（stripStateForChapterRewrite 剥离本章后旧状态）；
 * 5. 成功后把正文/标题/记忆写回 store 文件（原文件备份 .bak）。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { isRealAiEnabled, readRealAiEnvConfig, createRealStructuredAI } from './realStructuredAI';
import { openContinueWriteSession } from './continueWriteHarness';
import { dropForeshadowConflictingItems, type ForeshadowTimingHint } from '@/services/outline/rolling/outline-roller';
import {
  applyBlueprintToPlotNode,
  blueprintToChapterUpdate,
  BlueprintRepairLedger,
  isFulfillmentDomainFailure,
  regenerateChapterBlueprint,
} from '@/services/outline/rolling/chapter-blueprint-regenerator';
import { UnifiedOutlineGenerator } from '@/services/outline/generators/unified-generator';
import { useProjectStore } from '@/stores/project.store';
import type { Project } from '@/types/project';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

interface RepairOptions {
  storePath: string;
  chapterNumbers: number[];
  targetWordCount: number;
}

function resolveRepairOptions(): RepairOptions | null {
  const storePath = process.env.MOLIU_REPAIR_STORE?.trim();
  const chaptersRaw = process.env.MOLIU_REPAIR_CHAPTERS?.trim();
  if (!storePath || !chaptersRaw) return null;
  const chapterNumbers = chaptersRaw
    .split(/[,，\s]+/)
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
  if (chapterNumbers.length === 0) return null;
  return {
    storePath,
    chapterNumbers,
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

function foreshadowHintsOf(project: Project): ForeshadowTimingHint[] {
  return (project.foreshadows ?? []).map(f => {
    const raw = f as unknown as {
      hint?: string;
      createdChapter?: number;
      setupChapter?: number;
      payoffChapter?: number;
      suggestedResolutionChapter?: number;
    };
    return {
      hint: raw.hint ?? '',
      createdChapter: raw.createdChapter,
      setupChapter: raw.setupChapter,
      payoffChapter: raw.payoffChapter ?? raw.suggestedResolutionChapter,
    } satisfies ForeshadowTimingHint;
  });
}

export async function runRepairEmptyChapters(options: RepairOptions): Promise<void> {
  const { root, project } = loadProjectFromStore(options.storePath);
  const chapters = [...project.chapters].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const hints = foreshadowHintsOf(project);

  // ---- 1) 节点消毒 + 缝合注入（改动只在内存，成功后统一落盘）----
  for (const n of options.chapterNumbers) {
    const chapter = chapters.find(item => (item.orderIndex ?? 0) + 1 === n);
    if (!chapter) throw new Error(`第 ${n} 章不存在`);
    if ((chapter.content ?? '').trim()) throw new Error(`第 ${n} 章非空章（wordCount>0），拒绝覆盖`);
    const node = (project.plotOutline ?? []).find(
      item => item.type === 'chapter' && (item.orderIndex ?? 0) === n - 1,
    );
    if (node) {
      const before = {
        orderIndex: n,
        title: node.title ?? '',
        summary: node.description ?? '',
        CBN: node.CBN ?? '',
        CPNs: node.CPNs ?? [],
        CEN: node.CEN ?? '',
        mustCover: node.mustCover ?? [],
        forbiddenZones: node.forbiddenZones ?? [],
        hookType: 'reveal',
      };
      const { blueprint, dropped } = dropForeshadowConflictingItems(before, hints);
      if (dropped.length > 0) {
        console.info(`[repair] 第${n}章节点消毒：删除与伏笔时点冲突条目 ${JSON.stringify(dropped)}`);
        node.CPNs = blueprint.CPNs;
        node.mustCover = blueprint.mustCover;
      }
    }
    const next = chapters.find(item => (item.orderIndex ?? 0) + 1 === n + 1);
    const nextHead = (next?.content ?? '').trim().slice(0, 180);
    if (nextHead) {
      chapter.outline = `${chapter.outline ?? ''}\n【缝合·下章开头】下章开头原文：「${nextHead}」——本章剧情必须自然导向该状态：人物生死/羁押/在场身份/时空进度与前后章完全一致，不得矛盾；本章结尾落在导向该状态的悬念或行动上。`.trim();
      console.info(`[repair] 第${n}章注入下章缝合锚（${nextHead.length} 字）`);
    }
  }

  // ---- 2) 逐章补写（升序，空章走 isEmptyRewrite 全链含判官门禁）----
  const writeStoreBack = (memoriesFallback: typeof project.chapterMemories): void => {
    let memories = memoriesFallback ?? [];
    try {
      const store = useProjectStore();
      const current = store.currentProject as Project | null;
      if (current?.chapterMemories?.length) memories = current.chapterMemories;
    } catch {
      /* pinia 读回失败时保留原记忆表 */
    }
    const projectOut = { ...project, chapters, chapterMemories: memories } as unknown as Record<string, unknown>;
    if (Array.isArray(root.projects)) {
      (root.projects as unknown[])[0] = projectOut;
    } else if (root.projects && typeof root.projects === 'object') {
      const key = Object.keys(root.projects)[0];
      (root.projects as Record<string, unknown>)[key] = projectOut;
    }
    if (!existsSync(`${options.storePath}.bak`)) {
      copyFileSync(options.storePath, `${options.storePath}.bak`);
    }
    writeFileSync(options.storePath, JSON.stringify(root, null, 2), 'utf8');
  };

  const ai = createRealStructuredAI(readRealAiEnvConfig());
  const session = openContinueWriteSession({ project: { ...project, chapters } as Project });
  // 蓝图再生调用器（2026-09-13 r4 ch187 齐王命运冲突补齐）：补写路径与主循环
  // 同样会遇到「过期节点要求已羁押角色自由出场」的死锁，纯重试修不好
  const repairCfg = readRealAiEnvConfig();
  const repairBlueprintCaller = (system: string, user: string, temperature?: number) =>
    new UnifiedOutlineGenerator().callStructuredTextForRoll(system, user, {
      temperature,
      trace: { runId: `storyflow-repair-bp-${Date.now()}`, model: repairCfg.model, provider: repairCfg.provider },
    });
  try {
    for (const n of options.chapterNumbers) {
      let done = false;
      let lastError = '';
      const repairLedger = new BlueprintRepairLedger();
      // 伏笔时序死锁熔断（与 continueWriteHarness.runContinueWriteChapters 同构）：
      // 同一伏笔「提前揭示」连续 ≥2 次拒稿即确认蓝图-伏笔矛盾，本章豁免该伏笔
      // 的时点禁令——pipeline 从 futureReveals 移除（2026-09-10 ch20 三连拒实证）。
      const foreshadowRejectCounts = new Map<string, number>();
      const foreshadowExemptions: string[] = [];
      for (let attempt = 1; attempt <= 3 && !done; attempt += 1) {
        try {
          const result = await session.runChapter({
            chapterNumber: n,
            targetWordCount: options.targetWordCount,
            ai,
            runId: `storyflow-repair-ch${n}-${Date.now()}`,
            persistTrace: true,
            mode: 'batch',
            enableMemoryExtract: true,
            foreshadowExemptions: foreshadowExemptions.length > 0 ? [...foreshadowExemptions] : undefined,
          });
          if (result.output.success) {
            const chapter = chapters.find(item => (item.orderIndex ?? 0) + 1 === n)!;
            chapter.content = result.output.prose;
            chapter.wordCount = result.output.prose.replace(/\s+/g, '').length;
            chapter.status = 'final';
            (chapter as { writeStatus?: string }).writeStatus = 'completed';
            if (result.output.title && /^第\s*\d+\s*章/.test(chapter.title ?? '')) {
              chapter.title = result.output.title;
            }
            console.info(
              `[repair] 第${n}章补写成功（attempt ${attempt}，${chapter.wordCount} 字）`,
            );
            done = true;
          } else {
            lastError = result.output.error ?? '未知失败';
            console.warn(`[repair] 第${n}章 attempt ${attempt} 失败：${lastError.slice(0, 200)}`);
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          console.warn(`[repair] 第${n}章 attempt ${attempt} 异常：${lastError.slice(0, 200)}`);
        }
        // 熔断计数：拒稿理由引用了某伏笔 hint 且已 ≥2 次时豁免
        if (!done) {
          const foreshadowCite = lastError.match(/[伏笔规][」』"]?[：:]?\s*[「『"]([^「」『』"]{6,80})[」』"]/u);
          if (foreshadowCite) {
            const prefix = foreshadowCite[1].slice(0, 16);
            const count = (foreshadowRejectCounts.get(prefix) ?? 0) + 1;
            foreshadowRejectCounts.set(prefix, count);
            if (count >= 2 && !foreshadowExemptions.includes(prefix)) {
              foreshadowExemptions.push(prefix);
              console.warn(
                `[repair] 第${n}章伏笔时序熔断：伏笔「${prefix}…」连续 ${count} 次提前揭示拒稿，确认蓝图与伏笔台账矛盾，本章豁免该伏笔时点禁令（源头应修蓝图）`,
              );
            }
          }
          // 履约域/命运冲突记账 → 蓝图再生（2026-09-13 r4 ch187 形态：过期节点
          // 要求已下狱角色自由出场，判官按命运禁区连拒，纯重试修不好）
          const chapterForRepair = chapters.find(item => (item.orderIndex ?? 0) + 1 === n);
          if (chapterForRepair && isFulfillmentDomainFailure(lastError)) {
            const failures = repairLedger.recordFailure(chapterForRepair.id);
            console.warn(`[repair] 第${n}章履约域失败（累计 ${failures} 次）`);
            if (repairLedger.shouldTrigger(chapterForRepair.id)) {
              repairLedger.markRegenerated(chapterForRepair.id);
              try {
                const repair = await regenerateChapterBlueprint({
                  project: { ...project, chapters } as Project,
                  chapterNumber: n,
                  callStructuredText: repairBlueprintCaller,
                });
                if (repair.blueprint) {
                  applyBlueprintToPlotNode(project.plotOutline ?? [], n, repair.blueprint);
                  const update = blueprintToChapterUpdate(repair.blueprint);
                  chapterForRepair.outline = update.outline;
                  chapterForRepair.plotSummary = update.plotSummary;
                  // 再生覆盖了 outline，重新追加阶段 1 的下章缝合锚
                  const nextChapter = chapters.find(item => (item.orderIndex ?? 0) + 1 === n + 1);
                  const nextHead = (nextChapter?.content ?? '').trim().slice(0, 180);
                  if (nextHead) {
                    chapterForRepair.outline =
                      `${chapterForRepair.outline}\n【缝合·下章开头】下章开头原文：「${nextHead}」——本章剧情必须自然导向该状态：人物生死/羁押/在场身份/时空进度与前后章完全一致，不得矛盾；本章结尾落在导向该状态的悬念或行动上。`;
                  }
                  console.warn(
                    `[repair] 第${n}章蓝图已再生（命运锁在再生提示词内生效），下轮按新合同补写`,
                  );
                } else {
                  console.warn(`[repair] 第${n}章蓝图再生未成功：${repair.error}`);
                }
              } catch (repairError) {
                console.warn(`[repair] 第${n}章蓝图再生异常（继续原重试）：`, repairError);
              }
            }
          }
        }
      }
      if (!done) throw new Error(`第 ${n} 章补写 3 次尝试全部失败：${lastError.slice(0, 300)}`);
      // 逐章即时落盘：后续章超时/失败不丢已成功章（首跑实测 ch36 成功后被
      // ch184 的 30min 测试超时连坐丢失）
      writeStoreBack(project.chapterMemories);
      console.info(`[repair] 第${n}章已即时落盘 ${options.storePath}`);
    }
  } finally {
    session.dispose();
  }

  console.info(`[repair] 全部目标章完成，store 终稿 ${options.storePath}（原文件备份 .bak）`);
}

const repairOptions = resolveRepairOptions();

describe('空章补写（真实 AI）', () => {
  it.runIf(isRealAiEnabled() && repairOptions !== null)(
    '定点补写判死章并通过判官门禁 + 缝合落盘',
    async () => {
      await runRepairEmptyChapters(repairOptions!);
      const { project } = loadProjectFromStore(repairOptions!.storePath);
      for (const n of repairOptions!.chapterNumbers) {
        const chapter = project.chapters.find(item => (item.orderIndex ?? 0) + 1 === n);
        expect(chapter, `第 ${n} 章应存在`).toBeDefined();
        expect((chapter?.content ?? '').trim().length, `第 ${n} 章正文非空`).toBeGreaterThan(2000);
      }
    },
    // 预算：每章 3 次尝试 × 慢网关（429 限速日单次起草+评审可达 15min）
    Math.max(45, (repairOptions?.chapterNumbers.length ?? 2) * 45) * 60_000,
  );
});
