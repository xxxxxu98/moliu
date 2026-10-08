/**
 * 老书事实台账 bootstrap（真 AI，一次性迁移）：
 * 对指定书籍的全部已写章节逐章跑 FactExtractor（契约 15/17），
 * 把结构化 numeric-fact / time-promise 事件回填进 moliu-projects.json 的
 * numericLedger / timePromises，并把 time-passage 摘要补进章记忆 keyEvents
 * （供 collectTimelineMarks 读到）。
 *
 * 背景（2026-10-05 都市校园文书审）：旧数字锚正则单位表只认古代计量，
 * 存量书的债务/吨位/期限事实从未入账——不 bootstrap 则新防线对老书空转。
 *
 * 运行：npm run bootstrap:fact-ledger -- -- MOLIU_BOOTSTRAP_PROJECT=<书名或项目ID>
 * （AI 配置复用 temp/continue-write.real.config.json / MOLIU_AI_* 环境变量）
 * 产物：temp/bootstrap-ledger.summary.json + moliu-projects.json.bak-ledger-<ts>
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { AIFactExtractor } from '@/services/story-runtime';
import type { SceneDraft, StoryState, StructuredAI } from '@/types/story-runtime';
import type { NumericLedgerEntry, TimePromiseEntry } from '@/types/project';
import { createRealStructuredAI } from './realStructuredAI';
import { resolveContinueWriteRealConfig } from './continueWriteRealConfig';
import { loadLocalMoliuProject } from './loadLocalMoliuProject';
import { readProjectStoreFile, writeProjectBack } from './projectStoreFile';
import {
  mergeNumericLedger,
  mergeTimePromises,
  projectNumericLedgerEntries,
  projectTimeLedger,
} from '../numericLedger';

const APP_DATA = path.join(os.homedir(), 'AppData', 'Roaming', 'moliu', 'moliu-projects.json');

function isBootstrapEnabled(): boolean {
  return (process.env.MOLIU_BOOTSTRAP_LEDGER || '').trim() === '1';
}

const EMPTY_STATE: StoryState = {
  chapter: 0,
  entities: {},
  events: [],
  inventory: {},
  knowledge: {},
  timeline: [],
  openForeshadows: [],
  fulfilledNodes: [],
};

describe.skipIf(!isBootstrapEnabled())('bootstrap：老书事实台账回填（真 AI）', () => {
  // 超时可调（分钟，MOLIU_BOOTSTRAP_TIMEOUT_MIN）：73 章 × ~1.5min 实测约
  // 110min，默认 60min 会在 ch66 处超时杀跑（2026-10-07 首跑 66 章提取丢失实证）
  it(
    '逐章提取 numeric-fact / time-promise 并回写项目台账',
    { timeout: Number(process.env.MOLIU_BOOTSTRAP_TIMEOUT_MIN || 60) * 60_000 },
    async () => {
    // 两种数据源：MOLIU_BOOTSTRAP_STORE=harness store 文件（大循环/r19 relay 形态）；
    // 缺省走 App 注册表（MOLIU_BOOTSTRAP_PROJECT=书名或项目ID）。
    // MOLIU_BOOTSTRAP_FROM/TO 限定章号范围（大书分段回填省时）。
    const storePath = (process.env.MOLIU_BOOTSTRAP_STORE || '').trim();
    const target = (process.env.MOLIU_BOOTSTRAP_PROJECT || '').trim();
    const cfg = resolveContinueWriteRealConfig();
    const fromChapter = Number(process.env.MOLIU_BOOTSTRAP_FROM || 0) || 1;
    const toChapter = Number(process.env.MOLIU_BOOTSTRAP_TO || 0) || 10_000;

    let project;
    let storeRoot: Record<string, unknown> | null = null;
    if (storePath) {
      const parsed = readProjectStoreFile(storePath);
      storeRoot = parsed.root;
      project = parsed.project;
    } else {
      const needle = target || cfg.projectId || cfg.projectName;
      expect(needle).toBeTruthy();
      project = loadLocalMoliuProject({
        projectId: needle ? undefined : undefined,
        projectName: undefined,
        ...(/^(proj-)/.test(needle) ? { projectId: needle } : { projectName: needle }),
      } as Parameters<typeof loadLocalMoliuProject>[0]);
    }

    const chapters = [...(project.chapters ?? [])]
      .filter(ch => (ch.content || '').trim())
      .filter(ch => {
        const n = (ch.orderIndex ?? 0) + 1;
        return n >= fromChapter && n <= toChapter;
      })
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    expect(chapters.length).toBeGreaterThan(0);

    const ai: StructuredAI = createRealStructuredAI({
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
    });
    const extractor = new AIFactExtractor(ai);

    let numeric: NumericLedgerEntry[] = [];
    let timePromises: TimePromiseEntry[] = [];
    const perChapter: Array<{ chapterNumber: number; numericCount: number; timeOpen: number; timeResolve: number; passage: number }> = [];

    // ---- 回写目标解析（先备份一次）：store 文件或 App 注册表 ----
    let record: Record<string, unknown>;
    let writeTargetPath: string;
    let registryRoot: Record<string, unknown> | null = null;
    if (storeRoot) {
      record = project as Record<string, unknown>;
      writeTargetPath = storePath;
    } else {
      const store = JSON.parse(fs.readFileSync(APP_DATA, 'utf8'));
      const found = (store.projects || []).find((p: { id?: string; name?: string }) =>
        p.id === project.id || p.name === project.name
      );
      expect(found).toBeTruthy();
      record = found;
      registryRoot = store;
      writeTargetPath = APP_DATA;
      storeRoot = store;
    }
    const backupPath = `${writeTargetPath}.bak-ledger-${Date.now()}`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(writeTargetPath, backupPath);
    }

    /**
     * 逐章增量落盘（2026-10-07 实证改造：首版全部完成后一次性写回，ch66 处
     * 进程被 ABI 文件锁 EPERM 杀死，66 章 AI 提取结果全部丢失）。每章一次
     * JSON 写盘成本可忽略；崩溃后从 MOLIU_BOOTSTRAP_FROM=断点章 重跑即可续填。
     */
    const persistProgress = (): void => {
      record.numericLedger = mergeNumericLedger((record.numericLedger as NumericLedgerEntry[]) ?? [], numeric);
      const existingPromiseKeys = new Set(
        ((record.timePromises as TimePromiseEntry[]) ?? []).map(p => `${p.createdChapterIndex}|${p.promise}`)
      );
      record.timePromises = [
        ...((record.timePromises as TimePromiseEntry[]) ?? []),
        ...timePromises.filter(p => !existingPromiseKeys.has(`${p.createdChapterIndex}|${p.promise}`)),
      ].slice(-40);
      // 记忆同步（时间流逝标记已随循环写入 project.chapterMemories）：store 分支
      // record===project 天然生效；注册表分支需显式回拷
      if (record !== (project as Record<string, unknown>)) {
        if (((record.chapterMemories as unknown[]) ?? []).length === 0 && (project.chapterMemories ?? []).length > 0) {
          record.chapterMemories = project.chapterMemories;
        } else if (record.chapterMemories) {
          for (const memory of project.chapterMemories ?? []) {
            const existing = (record.chapterMemories as Array<{ chapterId?: string; keyEvents?: string[] }>)
              .find(m => m.chapterId === memory.chapterId);
            if (existing && (existing.keyEvents ?? []).length < (memory.keyEvents ?? []).length) {
              existing.keyEvents = memory.keyEvents;
            }
          }
        }
      }
      if (storePath) {
        writeProjectBack(storeRoot as Record<string, unknown>, record);
        fs.writeFileSync(storePath, JSON.stringify(storeRoot, null, 2), 'utf8');
      } else {
        fs.writeFileSync(APP_DATA, JSON.stringify(registryRoot, null, 1), 'utf8');
      }
      const finalNumeric = record.numericLedger as NumericLedgerEntry[];
      const finalPromises = record.timePromises as TimePromiseEntry[];
      fs.writeFileSync(
        path.join(process.cwd(), 'temp', 'bootstrap-ledger.summary.json'),
        JSON.stringify({
          project: { id: project.id, name: project.name },
          chaptersScanned: perChapter.length,
          numericLedger: finalNumeric,
          timePromises: finalPromises,
          perChapter,
          backupPath,
          exportedAt: new Date().toISOString(),
        }, null, 1),
        'utf8'
      );
    };

    for (const chapter of chapters) {
      const chapterNumber = (chapter.orderIndex ?? 0) + 1;
      const sceneDrafts: SceneDraft[] = [
        {
          sceneId: `ch${chapterNumber}:bootstrap:scene`,
          beatId: 'bootstrap-beat',
          paragraphs: (chapter.content || '').split(/\n{2,}/).filter(Boolean),
          candidateEvents: [],
        },
      ];
      const facts = await extractor.extract({
        projectId: project.id,
        chapterNumber,
        sceneDrafts,
        state: EMPTY_STATE,
      });

      const numericEntries = projectNumericLedgerEntries(facts);
      const timeProjection = projectTimeLedger(facts);
      const passages = facts.events.filter(event => event.type === 'time-passage');

      numeric = mergeNumericLedger(numeric, numericEntries);
      timePromises = mergeTimePromises(timePromises, timeProjection, chapterNumber);
      perChapter.push({
        chapterNumber,
        numericCount: numericEntries.length,
        timeOpen: timeProjection.opens.length,
        timeResolve: timeProjection.resolves.length,
        passage: passages.length,
      });

      // time-passage 摘要补进章记忆 keyEvents（幂等）：供 collectTimelineMarks 读到
      const memory = (project.chapterMemories ?? []).find(
        m => (m.chapterIndex ?? 0) + 1 === chapterNumber
      );
      if (memory && passages.length > 0) {
        const marks = passages
          .map(event => String(event.summary ?? '').trim())
          .filter(summary => summary.startsWith('时间流逝：'))
          .filter(summary => !(memory.keyEvents ?? []).includes(summary));
        if (marks.length > 0 && (memory.keyEvents ?? []).length < 10) {
          memory.keyEvents = [...(memory.keyEvents ?? []), ...marks.slice(0, 1)];
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `[bootstrap] 第${chapterNumber}章：数字${numericEntries.length}条 / 期限开${timeProjection.opens.length}·结${timeProjection.resolves.length} / 时间流逝${passages.length}`
      );
      persistProgress();
    }

    const finalNumeric = record.numericLedger as NumericLedgerEntry[];
    const finalPromises = record.timePromises as TimePromiseEntry[];
    const summaryPath = path.join(process.cwd(), 'temp', 'bootstrap-ledger.summary.json');

    // eslint-disable-next-line no-console
    console.log(`[bootstrap] 完成：数字台账 ${finalNumeric.length} 条，时间承诺 ${finalPromises.length} 条`);
    // eslint-disable-next-line no-console
    console.log(`[bootstrap] 明细已写入 ${summaryPath}；备份 ${backupPath}`);
    expect(finalNumeric.length).toBeGreaterThan(0);
  });
});
