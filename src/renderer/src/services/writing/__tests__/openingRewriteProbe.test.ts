/**
 * 开篇重拆自测：只在 MOLIU_OPENING_REWRITE=1 时跑。
 * 用当前蓝图提示重写《我在评定局追捕我自己》前三章合同，再走正式续写链路重写正文。
 * 不改用户的 continue-write 配置；正文先落 temp/opening-rewrite，三章都成功才回写项目库。
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { UnifiedOutlineGenerator } from '@/services/outline/generators/unified-generator';
import {
  applyBlueprintToPlotNode,
  blueprintToChapterUpdate,
} from '@/services/outline/rolling/chapter-blueprint-regenerator';
import {
  buildRollBlueprintPrompt,
  buildRollContextBase,
  inspectRolledBlueprintQuality,
  isUsableRolledBlueprint,
  parseBlueprintBlocks,
} from '@/services/outline/rolling/outline-roller';
import type { ChapterBlueprint } from '@/services/outline/types/executable-outline';
import { formatStoredChapterTitle } from '@/services/writing/chapterTitle';
import type { Project } from '@/types/project';

import { runContinueWriteChapters, toPipelineProject } from './continueWriteHarness';
import { resolveContinueWriteRealConfig } from './continueWriteRealConfig';
import { loadLocalMoliuProject } from './loadLocalMoliuProject';
import { createRealStructuredAI, isRealAiEnabled, readRealAiEnvConfig } from './realStructuredAI';
import { injectSettingsStore } from './storyflowClosedLoopHarness';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const PROJECT_ID = 'proj-1791515885594';
const PROJECT_NAME = '我在评定局追捕我自己';
const CHAPTERS = [1, 2, 3];
const OUT_DIR = path.resolve('temp/opening-rewrite');
const ENABLED = process.env.MOLIU_OPENING_REWRITE === '1' && isRealAiEnabled();

function projectsStorePath(): string {
  return path.join(process.env.APPDATA || '', 'moliu', 'moliu-projects.json');
}

function shapeIssues(blueprint: ChapterBlueprint): string[] {
  return inspectRolledBlueprintQuality(blueprint)
    .filter(issue =>
      issue.kind === 'summary-echoes-cbn' ||
      issue.kind === 'thin-scene-beats' ||
      issue.kind === 'beat-echoes-cbn',
    )
    .map(issue => issue.detail);
}

describe.skipIf(!ENABLED)('开篇重拆自测', () => {
  it(
    '重拆前三章蓝图并重写正文',
    async () => {
      const cfg = resolveContinueWriteRealConfig();
      injectSettingsStore(cfg);
      const local = loadLocalMoliuProject({ projectId: PROJECT_ID, projectName: PROJECT_NAME });
      const project = toPipelineProject(local);
      const oldNodes = (project.plotOutline ?? [])
        .filter(node => node.type === 'chapter')
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const oldBrief = CHAPTERS.map(chapterNumber => {
        const node = oldNodes[chapterNumber - 1];
        return `第${chapterNumber}章旧合同必须整章换掉：旧 CBN「${node?.CBN ?? ''}」是结果式开场，旧 CEN「${node?.CEN ?? ''}」。新 CBN 必须是已经开始、还没见分晓的动作，并写出 4-6 步节拍；击杀、揭穿、结案放在后段；章末悬念不得被同章另一条节点当场取消。`;
      });

      for (const chapter of project.chapters) chapter.content = '';
      const caller = (system: string, user: string, temperature?: number) =>
        new UnifiedOutlineGenerator().callStructuredTextForRoll(system, user, {
          temperature,
          trace: {
            runId: `opening-rewrite-bp-${Date.now()}`,
            model: cfg.model,
            provider: cfg.provider,
          },
        });

      const blueprints = new Map<number, ChapterBlueprint>();
      let issues = [...oldBrief];
      for (let round = 0; round < 2 && blueprints.size < CHAPTERS.length; round += 1) {
        const prompt = buildRollBlueprintPrompt({
          base: buildRollContextBase(project, 1),
          chapterNumbers: CHAPTERS,
          recentBlueprintEndings: [],
          issues,
        });
        const raw = await caller(prompt.system, prompt.user, round === 0 ? 0.4 : 0.2);
        const parsed = parseBlueprintBlocks(raw, CHAPTERS);
        issues = [];
        for (const chapterNumber of CHAPTERS) {
          const blueprint = parsed.get(chapterNumber);
          if (!blueprint || !isUsableRolledBlueprint(blueprint)) {
            issues.push(`第${chapterNumber}章没有解析出可用蓝图，必须按字段重写`);
            continue;
          }
          const defects = shapeIssues(blueprint);
          if (defects.length > 0) {
            issues.push(...defects);
            continue;
          }
          if (!blueprint.sceneBeats || blueprint.sceneBeats.length < 4) {
            issues.push(`第${chapterNumber}章缺少 4-6 步节拍`);
            continue;
          }
          blueprints.set(chapterNumber, blueprint);
        }
        if (issues.length === 0) break;
      }

      expect(blueprints.size, issues.join('\n')).toBe(3);

      for (const chapterNumber of CHAPTERS) {
        const blueprint = blueprints.get(chapterNumber);
        if (!blueprint) continue;
        const update = blueprintToChapterUpdate(blueprint);
        const chapter = project.chapters.find(item => item.orderIndex === chapterNumber - 1);
        if (!chapter) throw new Error(`缺少第 ${chapterNumber} 章`);
        chapter.title = formatStoredChapterTitle(chapterNumber, blueprint.title);
        chapter.outline = update.outline;
        chapter.plotSummary = update.plotSummary;
        chapter.content = '';
        const node = applyBlueprintToPlotNode(project.plotOutline ?? [], chapterNumber, blueprint);
        if (node) {
          node.title = chapter.title;
          node.forbiddenZones = blueprint.forbiddenZones;
        }
      }

      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        path.join(OUT_DIR, 'blueprints.json'),
        JSON.stringify(
          CHAPTERS.map(chapterNumber => blueprints.get(chapterNumber)),
          null,
          2,
        ),
        'utf8',
      );

      const run = await runContinueWriteChapters({
        project,
        fromChapter: 1,
        chapterCount: 3,
        targetWordCount: cfg.targetWordCount || 3000,
        ai: createRealStructuredAI(readRealAiEnvConfig()),
        runIdPrefix: `opening-rewrite-${Date.now()}`,
        persistTrace: true,
        mode: 'batch',
        maxRetries: 2,
        repairBlueprint: caller,
        onChapterHydrated: () => injectSettingsStore(cfg),
        onChapterSettled: ({ result }) => {
          const chapter = project.chapters.find(item => item.orderIndex === result.chapterNumber - 1);
          if (chapter && result.output.success) chapter.content = result.output.prose;
          const file = path.join(OUT_DIR, `ch${String(result.chapterNumber).padStart(2, '0')}.txt`);
          writeFileSync(
            file,
            result.output.success ? result.output.prose : `FAILED\n${result.output.error ?? ''}`,
            'utf8',
          );
        },
      });

      const succeeded = run.chapters.filter(item => item.output.success);
      writeFileSync(
        path.join(OUT_DIR, 'summary.json'),
        JSON.stringify(
          run.chapters.map(item => ({
            chapterNumber: item.chapterNumber,
            success: item.output.success,
            words: item.output.prose.replace(/\s+/gu, '').length,
            error: item.output.error ?? '',
            title: project.chapters.find(chapter => chapter.orderIndex === item.chapterNumber - 1)?.title,
          })),
          null,
          2,
        ),
        'utf8',
      );
      expect(succeeded.length, run.chapters.map(item => item.output.error).join('\n')).toBe(3);
      writeBackChapters(project);
    },
    100 * 60_000,
  );
});

function writeBackChapters(project: Project): void {
  const storePath = projectsStorePath();
  copyFileSync(storePath, path.join(OUT_DIR, 'moliu-projects.backup.json'));
  const raw = JSON.parse(readFileSync(storePath, 'utf8')) as {
    projects?: Array<{ id: string; chapters?: Array<Record<string, unknown>>; plotOutline?: Array<Record<string, unknown>> }>;
  };
  const stored = (raw.projects ?? []).find(item => item.id === PROJECT_ID);
  if (!stored) throw new Error('回写时找不到项目');
  for (const chapterNumber of CHAPTERS) {
    const next = project.chapters.find(item => item.orderIndex === chapterNumber - 1);
    const current = (stored.chapters ?? []).find(item => item.orderIndex === chapterNumber - 1);
    if (!next || !current) continue;
    current.title = next.title;
    current.outline = next.outline;
    current.plotSummary = next.plotSummary;
    current.content = next.content;
    current.wordCount = next.content.replace(/\s+/gu, '').length;
  }
  const nextNodes = (project.plotOutline ?? []).filter(node => node.type === 'chapter');
  for (const node of stored.plotOutline ?? []) {
    if (node.type !== 'chapter') continue;
    const orderIndex = Number(node.orderIndex ?? -1);
    if (orderIndex < 0 || orderIndex > 2) continue;
    const next = nextNodes.find(item => item.orderIndex === orderIndex);
    if (!next) continue;
    node.title = next.title;
    node.description = next.description;
    node.CBN = next.CBN;
    node.CPNs = next.CPNs;
    node.CEN = next.CEN;
    node.mustCover = next.mustCover;
    node.forbiddenZones = next.forbiddenZones;
    node.sceneBeats = next.sceneBeats;
  }
  writeFileSync(storePath, JSON.stringify(raw), 'utf8');
}
