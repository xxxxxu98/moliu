/**
 * base.service 单元测试
 *
 * 重点验证 PromptBuilder.buildContinuePrompt 的几个历史 bug 修复：
 * - 双重注入修复（#2）：本章大纲内容在 prompt 中只应出现一次。
 *   旧实现既把 currentChapterOutline 内嵌进 modeInstruction，
 *   又追加到 userPrompt 的「本章大纲」段落，CBN/CPNs/CEN 会出现两次。
 */

import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../base.service';
import type { Project, Character, Foreshadow } from '@/types/project';

function makeProject(): Project {
  return {
    id: 'p1',
    name: '测试作品',
    description: '测试简介',
    genre: [{ id: 'g1', name: '玄幻', color: '#000' }],
    characters: [] as Character[],
    foreshadows: [] as Foreshadow[],
    plotOutline: [],
    chapters: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Project;
}

describe('PromptBuilder.buildContinuePrompt - 双重注入修复 (#2)', () => {
  it('本章大纲内容在 prompt 中只出现一次', () => {
    const uniqueMarker = '【唯一测试大纲节点 CBN-X9】只有一次才正确';
    const project = makeProject();
    const { userPrompt } = PromptBuilder.buildContinuePrompt(
      {
        project,
        currentChapterId: 'c1',
        currentChapterIndex: 5,
        currentChapterTitle: '第6章 测试',
        currentChapterContent: '',
        currentChapterOutline: uniqueMarker,
      },
      'smartContinue',
      3000,
    );

    const occurrences = userPrompt.split(uniqueMarker).length - 1;
    expect(occurrences).toBe(1);
  });

  it('CBN/CPNs/CEN 标记内容不被同时塞进 modeInstruction 和 userPrompt', () => {
    const project = makeProject();
    const outlineText = [
      '【章节起点 CBN】测试起点',
      '【推进节点 CPNs】',
      '  1. 测试推进',
      '【章节终点 CEN】测试终点',
    ].join('\n');

    const { userPrompt } = PromptBuilder.buildContinuePrompt(
      {
        project,
        currentChapterId: 'c1',
        currentChapterIndex: 5,
        currentChapterTitle: '第6章 测试',
        currentChapterContent: '',
        currentChapterOutline: outlineText,
      },
      'smartContinue',
      3000,
    );

    // 「本章大纲」段落应当存在（userPrompt 末尾）
    expect(userPrompt).toContain('## 本章大纲');
    // modeInstruction 不再内嵌大纲正文，因此"根据本章大纲完成任务"措辞改成引用上方
    expect(userPrompt).toContain('上方「本章大纲」');
    // CBN 只应出现一次
    const cbnCount = (userPrompt.match(/【章节起点 CBN】测试起点/g) || []).length;
    expect(cbnCount).toBe(1);
    const cenCount = (userPrompt.match(/【章节终点 CEN】测试终点/g) || []).length;
    expect(cenCount).toBe(1);
  });
});
