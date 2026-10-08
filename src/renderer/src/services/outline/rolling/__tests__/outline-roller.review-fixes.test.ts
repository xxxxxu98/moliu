/**
 * 滚动续纲代码审查修复的回归测试：
 * - 修复稿守卫：原稿无缺陷时，修复稿不得新增缺陷（此前 beforeCount=0 时守卫失效）
 * - 状态基底章序：项目 chapters 乱序存放时，章号仍须与章序一致
 */

import { describe, expect, it } from 'vitest';

import { buildRollContextBase, rollOutlineForward } from '../outline-roller';
import type { Chapter, PlotNode, Project } from '@/types/project';

function makeChapter(index: number, title: string, content: string): Chapter {
  return {
    id: `chapter-${index}`,
    title,
    content,
    wordCount: content.length,
    orderIndex: index,
    version: 1,
    status: 'draft',
    createdAt: '2026-10-09T00:00:00.000Z',
    updatedAt: '2026-10-09T00:00:00.000Z',
  } as Chapter;
}

function makePlotNode(index: number): PlotNode {
  return {
    id: `plot-${index}`,
    title: `节点${index + 1}`,
    type: 'chapter',
    orderIndex: index,
    CBN: `第${index + 1}章开场钩子`,
    CPNs: ['推进主线'],
    CEN: `第${index + 1}章收束状态`,
    mustCover: ['事件A'],
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-review-fixes',
    name: '修复回归书',
    description: '一句话卖点',
    genre: [],
    volumes: [],
    chapters: [],
    characters: [],
    foreshadows: [],
    worldSchema: { locations: [], rules: [], factions: [] },
    plotOutline: [],
    createdAt: '2026-10-09T00:00:00.000Z',
    updatedAt: '2026-10-09T00:00:00.000Z',
    wordCount: 0,
    ...overrides,
  } as Project;
}

/** 构造一条单章蓝图文本（字段口径与 buildRollBlueprintPrompt 输出一致） */
function blueprintBlock(
  n: number,
  overrides: { CBN?: string; CPNs?: string; CEN?: string } = {},
): string {
  return `### 第${n}章
- 标题：第${n}章夜审惊变
- 概要：概要内容填写足够长以通过基本校验要求第${n}章概要补充说明文字。
- CBN：${overrides.CBN ?? `三更灯下账页缺角第${n}章`}
- CPNs：${overrides.CPNs ?? '比对旧账发现缺口；主簿带人围库房；以印信压住场面'}
- CEN：${overrides.CEN ?? `主簿伏法，尘埃落定第${n}章`}
- mustCover：查清军资缺口；逼退巡夜主簿
- 禁区：不得揭示玉印来历
- 章尾钩子文案：账还没查完，刀已经架到脖子上了
- 爽点类型：解谜`;
}

describe('滚动续纲修复稿守卫（原稿无缺陷时不得被劣化稿替换）', () => {
  it('原稿干净、修复稿引入缺陷 → 保留原稿并记录退化告警', async () => {
    // 第 51 章是本批唯一章（maxChapters=51 即终章），原稿提及已下狱的「赵烈」但未标【解除】
    // → 进入定点修复轮；修复稿把 CBN 写成「开场承接：…」（模板话术缺陷）
    const project = makeProject({
      chapters: Array.from({ length: 50 }, (_, i) =>
        makeChapter(i, `第${i + 1}章`, `第${i + 1}章正文内容。`.repeat(20))),
      plotOutline: Array.from({ length: 50 }, (_, i) => makePlotNode(i)),
      metadata: { plannedChapterCount: 120 },
      chapterMemories: [
        {
          chapterId: 'ch27',
          chapterTitle: 'Chapter 27',
          chapterIndex: 27,
          corePlot: '赵烈被革职下狱',
          keyEvents: ['赵烈被当堂革职下狱'],
          locations: [],
          characterStateChanges: [
            { characterName: '赵烈', stateType: 'status', state: '下狱', detail: '枷入天牢' },
          ],
          revealedForeshadows: [],
          newForeshadows: [],
          wordCount: 100,
          createdAt: new Date().toISOString(),
        },
      ] as Project['chapterMemories'],
    });

    const originalCpns = '赵烈在牢中递出密信；比对旧账发现缺口；以印信压住场面';
    let call = 0;
    const persisted: PlotNode[][] = [];
    const result = await rollOutlineForward({
      project,
      maxChapters: 51,
      callStructuredText: async () => {
        call += 1;
        if (call === 1) return blueprintBlock(51, { CPNs: originalCpns });
        // 修复轮：引入模板 CBN 缺陷
        return blueprintBlock(51, {
          CBN: '开场承接：三更灯下账页缺角第51章',
          CPNs: originalCpns,
        });
      },
      persist: async nodes => {
        persisted.push([...nodes]);
      },
    });

    expect(call).toBe(2); // 确实触发了定点修复轮
    expect(persisted).toHaveLength(1);
    // 保留原稿：CBN 不得是修复稿的模板话术
    expect(persisted[0][0].CBN).toBe('三更灯下账页缺角第51章');
    expect(persisted[0][0].CBN).not.toContain('开场承接');
    expect(result.warnings.join('\n')).toContain('质检退化');
  });
});

describe('滚动续纲状态基底章序', () => {
  it('项目 chapters 乱序存放时，已写收束的章号仍与章序一致', () => {
    const project = makeProject({
      chapters: [
        makeChapter(1, '第二章标题', '第二章正文内容。'.repeat(5)),
        makeChapter(0, '第一章标题', '第一章正文内容。'.repeat(5)),
      ],
      plotOutline: [makePlotNode(0), makePlotNode(1), makePlotNode(2)],
    });

    const base = buildRollContextBase(project, 3);

    expect(base.writtenState).toContain('第1章《第一章标题》收束：第1章收束状态');
    expect(base.writtenState).toContain('第2章《第二章标题》收束：第2章收束状态');
    // 章序在前：第 1 章必须排在第 2 章之前
    expect(base.writtenState.indexOf('第1章《')).toBeLessThan(base.writtenState.indexOf('第2章《'));
  });
});
