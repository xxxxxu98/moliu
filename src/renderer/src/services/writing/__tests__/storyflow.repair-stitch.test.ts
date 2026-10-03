import { describe, expect, it, vi } from 'vitest';

import {
  detectRepairStitchOverlap,
  warnIfNextChapterReplaysBeat,
} from './storyflow.repair-empty.test';

describe('补写下章同拍重演检测（2026-09-30 r16 ch114/115 成洞实证）', () => {
  // ch114 补写完成（徐茂德已被旧账残页打脸至惨白），ch115 开头却让其昂下巴
  // 重新进场并被同一叠旧账再次打脸——同拍重演。检测分字面层（确定性）与
  // AI 语义探针（fail-open 警告）两层。

  it('字面逐句复读：sim 与最长公共串都高', () => {
    const tail = '窗外狂风夹着骤雨横扫峡谷，江水撞击在紧闭的人字铁闸上，发出震天动地的沉闷巨响。徐茂德僵立当场。';
    const head = '窗外狂风夹着骤雨横扫峡谷，江水撞击在紧闭的人字铁闸上，发出震天动地的沉闷巨响。沈淮抬手示意。';
    const { similarity, longestCommon } = detectRepairStitchOverlap(tail, head);
    expect(similarity).toBeGreaterThan(0.4);
    expect(longestCommon).toBeGreaterThanOrEqual(15);
  });

  it('正常承接（不同措辞推进新进展）：字面指标低', () => {
    const tail = '徐茂德整个人如遭雷击，僵立当场，面色褪得干干净净。沈淮收起残页，转身吩咐书吏封存证物。';
    const head = '次日上午，督造大营辕门外来了三骑快马，为首者抖开公文高声宣读朝廷复核的结果。';
    const { similarity, longestCommon } = detectRepairStitchOverlap(tail, head);
    expect(similarity).toBeLessThan(0.15);
    expect(longestCommon).toBeLessThan(10);
  });

  it('过短文本零指标（不误报）', () => {
    expect(detectRepairStitchOverlap('太短', '也太短')).toEqual({ similarity: 0, longestCommon: 0 });
  });

  it('语义探针：下章重演补写节拍时输出警告；探针失败静默（fail-open）', async () => {
    const chapters = [
      { orderIndex: 113, content: '……'.padEnd(300, '前文') + '徐茂德整个人如遭雷击，僵立当场，面色褪得干干净净化作煞白。' },
      { orderIndex: 114, content: '这位刚被起复的验工使昂着下巴迈进辕门，昂首挑衅，随即又被同一叠泛黄烂账纸页劈头盖脸砸中胸口。' },
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const replayAi = {
      generate: vi.fn().mockResolvedValue({ replay: true, reason: '徐茂德已被打脸却重新昂下巴进场，同一叠烂账二次首亮' }),
    };
    await warnIfNextChapterReplaysBeat(chapters, 114, replayAi as never);
    expect(replayAi.generate).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.some(args => String(args[0]).includes('重演补写章已完成节拍'))).toBe(true);

    warn.mockClear();
    const failAi = { generate: vi.fn().mockRejectedValue(new Error('网关抖动')) };
    await expect(warnIfNextChapterReplaysBeat(chapters, 114, failAi as never)).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();

    // 正常承接不警告
    warn.mockClear();
    const okAi = { generate: vi.fn().mockResolvedValue({ replay: false, reason: '延续既有结果推进新进展' }) };
    await warnIfNextChapterReplaysBeat(chapters, 114, okAi as never);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    info.mockRestore();
  });

  it('无下章/下章无正文时跳过检测', async () => {
    const chapters = [{ orderIndex: 113, content: 'x'.repeat(400) }];
    const ai = { generate: vi.fn() };
    await expect(warnIfNextChapterReplaysBeat(chapters, 114, ai as never)).resolves.toBeUndefined();
    expect(ai.generate).not.toHaveBeenCalled();
  });
});
