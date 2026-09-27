/**
 * chapterReplay 纯逻辑回归：快照截断口径（章记忆 1 基、伏笔回退）、
 * 探针解析（无引用降级）、样本汇总优先级、用例 schema 校验。
 */
import { describe, expect, it } from 'vitest';

import type { Chapter, ChapterMemory, Foreshadow, Project } from '@/types/project';

import {
  REPLAY_CASE_SCHEMA_VERSION,
  buildReplayProbeRequest,
  buildReplaySnapshot,
  parseReplayCase,
  parseReplayProbeVerdict,
  summarizeReplaySamples,
  type ReplaySampleResult,
} from './chapterReplay';

function makeChapter(orderIndex: number, content: string): Chapter {
  return {
    id: `c${orderIndex}`,
    title: `第${orderIndex + 1}章`,
    content,
    wordCount: content.length,
    orderIndex,
    version: 1,
    status: 'final',
    createdAt: 'T',
    updatedAt: 'T',
    writeStatus: 'success',
    isGenerated: true,
    generatedAt: 'T',
  };
}

function makeMemory(chapterIndex: number): ChapterMemory {
  return {
    chapterId: `c${chapterIndex - 1}`,
    chapterTitle: `第${chapterIndex}章`,
    chapterIndex,
    corePlot: '',
    keyEvents: [],
    locations: [],
    characterStateChanges: [],
    revealedForeshadows: [],
    newForeshadows: [],
    wordCount: 0,
    createdAt: 'T',
  };
}

function makeForeshadow(id: string, patch: Partial<Foreshadow>): Foreshadow {
  return { id, hint: id, type: 'event', status: 'buried', createdChapter: 1, ...patch };
}

function makeProject(): Project {
  return {
    id: 'p',
    name: '书',
    description: '',
    genre: [],
    wordCount: 0,
    status: 'writing',
    volumes: [],
    chapters: [0, 1, 2, 3].map(index => makeChapter(index, `正文${index + 1}`)),
    characters: [],
    worldSchema: {} as Project['worldSchema'],
    foreshadows: [
      makeForeshadow('early-resolved', { status: 'resolved', createdChapter: 1, payoffChapter: 2 }),
      makeForeshadow('late-resolved', { status: 'resolved', createdChapter: 1, payoffChapter: 4 }),
      makeForeshadow('late-planted', { status: 'buried', createdChapter: 3 }),
      makeForeshadow('still-planned', { status: 'planned', createdChapter: 9 }),
    ],
    plotOutline: [],
    chapterMemories: [1, 2, 3, 4].map(makeMemory),
    createdAt: 'T',
    updatedAt: 'T',
  };
}

describe('buildReplaySnapshot', () => {
  it('截断到写第 3 章之前：正文/状态清空，章记忆按 1 基保留 1-2', () => {
    const source = makeProject();
    const { project, warnings } = buildReplaySnapshot(source, 3);
    expect(project.chapters.map(chapter => chapter.content)).toEqual(['正文1', '正文2', '', '']);
    expect(project.chapters[2]).toMatchObject({ status: 'draft', writeStatus: 'pending', isGenerated: false });
    expect(project.chapters[2].generatedAt).toBeUndefined();
    expect(project.chapterMemories.map(memory => memory.chapterIndex)).toEqual([1, 2]);
    expect(project.wordCount).toBe('正文1'.length + '正文2'.length);
    expect(warnings.some(warning => warning.includes('伏笔'))).toBe(true);
    expect(source.chapters[2].content).toBe('正文3');
  });

  it('伏笔回退：起始章后埋设→planned，计划起始章后回收→buried，早回收与 planned 不动', () => {
    const { project } = buildReplaySnapshot(makeProject(), 3);
    const statusOf = (id: string) => project.foreshadows.find(item => item.id === id)?.status;
    expect(statusOf('early-resolved')).toBe('resolved');
    expect(statusOf('late-resolved')).toBe('buried');
    expect(statusOf('late-planted')).toBe('planned');
    expect(statusOf('still-planned')).toBe('planned');
  });

  it('起始章前有空章时给出警告，起始章不存在时抛错', () => {
    const source = makeProject();
    source.chapters[0].content = '';
    expect(buildReplaySnapshot(source, 3).warnings.some(warning => warning.includes('空章 1'))).toBe(true);
    expect(() => buildReplaySnapshot(source, 9)).toThrow('不存在第 9 章');
  });
});

describe('探针', () => {
  it('请求包含前情、问题与各章正文', () => {
    const request = buildReplayProbeRequest(
      { context: '崔显已下狱', question: '崔显是否无交代自由行动？' },
      [{ chapterNumber: 143, title: '朝会', prose: '崔显步入大殿。' }]
    );
    expect(request.prompt).toContain('崔显已下狱');
    expect(request.prompt).toContain('第143章 朝会');
    expect(request.prompt).toContain('崔显步入大殿。');
  });

  it('声称复现但无原文引用时降为 low；缺布尔字段抛错', () => {
    expect(parseReplayProbeVerdict({ defectPresent: true, confidence: 'high', quotes: [] }).confidence).toBe('low');
    expect(parseReplayProbeVerdict({ defectPresent: false, confidence: 'high', quotes: [] }).confidence).toBe('high');
    expect(() => parseReplayProbeVerdict({ confidence: 'high' })).toThrow('defectPresent');
  });
});

describe('summarizeReplaySamples', () => {
  const sample = (patch: Partial<ReplaySampleResult>): ReplaySampleResult => ({
    sample: 1,
    accepted: true,
    chapters: [],
    verdict: { defectPresent: false, confidence: 'high', quotes: [], reason: '' },
    ...patch,
  });

  it('复现优先于成洞，全部干净才 pass', () => {
    const recur = sample({ verdict: { defectPresent: true, confidence: 'high', quotes: ['x'], reason: '' } });
    const hole = sample({ accepted: false, verdict: null });
    expect(summarizeReplaySamples([recur, hole]).status).toBe('recur');
    expect(summarizeReplaySamples([sample({}), hole]).status).toBe('hole');
    expect(summarizeReplaySamples([sample({}), sample({})]).status).toBe('pass');
  });
});

describe('parseReplayCase', () => {
  it('字段缺失时列出全部问题', () => {
    expect(() =>
      parseReplayCase({ schemaVersion: REPLAY_CASE_SCHEMA_VERSION, id: 'x', fromChapter: 0, window: 1, probe: {} })
    ).toThrow(/snapshot.*fromChapter.*probe/u);
  });
});
