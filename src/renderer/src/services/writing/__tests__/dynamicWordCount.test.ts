import { describe, it, expect } from 'vitest';
import {
  calculateDynamicWordCount,
  calculateBatchWordCounts,
  type DynamicWordCountInput,
} from '../dynamicWordCount';

describe('dynamicWordCount', () => {
  describe('calculateDynamicWordCount', () => {
    it('黄金三章应返回 2600 字', () => {
      expect(calculateDynamicWordCount({
        chapterNumber: 1,
        totalChapters: 100,
      })).toBe(2600);

      expect(calculateDynamicWordCount({
        chapterNumber: 2,
        totalChapters: 100,
      })).toBe(2600);

      expect(calculateDynamicWordCount({
        chapterNumber: 3,
        totalChapters: 100,
      })).toBe(2600);
    });

    it('黄金三章优先级高于内容密度调整', () => {
      // 即使内容密集，黄金三章也应该是 2600 字
      expect(calculateDynamicWordCount({
        chapterNumber: 1,
        totalChapters: 100,
        plotNode: {
          CBN: '核心冲突',
          CPNs: ['节点1', '节点2', '节点3', '节点4', '节点5'],
          mustCover: ['必履约1', '必履约2'],
        },
      })).toBe(2600);
    });

    it('高潮章节应返回 3800 字', () => {
      // 最后 5 章
      expect(calculateDynamicWordCount({
        chapterNumber: 96,
        totalChapters: 100,
      })).toBe(3800);

      expect(calculateDynamicWordCount({
        chapterNumber: 100,
        totalChapters: 100,
      })).toBe(3800);

      // 每 25 章的倒数第 2 章
      expect(calculateDynamicWordCount({
        chapterNumber: 24,
        totalChapters: 100,
      })).toBe(3800);

      expect(calculateDynamicWordCount({
        chapterNumber: 49,
        totalChapters: 100,
      })).toBe(3800);

      expect(calculateDynamicWordCount({
        chapterNumber: 74,
        totalChapters: 100,
      })).toBe(3800);
    });

    it('无内容节点时应返回基准字数', () => {
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
      })).toBe(3000);

      // 空结构对象
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {},
      })).toBe(2700); // 0 个节点 <= 1, 应用过渡减少
    });

    it('内容密集章节应增加字数', () => {
      // 5 个节点: 3000 + (5 - 3) * 200 = 3400
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {
          CBN: '核心冲突',
          CPNs: ['节点1', '节点2', '节点3'],
          mustCover: ['必履约1'],
        },
      })).toBe(3400);

      // 7 个节点: 3000 + (7 - 3) * 200 = 3800
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {
          CBN: '核心冲突',
          CPNs: ['节点1', '节点2', '节点3', '节点4'],
          mustCover: ['必履约1', '必履约2'],
        },
      })).toBe(3800);
    });

    it('过渡章节应减少字数', () => {
      // 1 个节点: 3000 - 300 = 2700
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {
          CBN: '简单过渡',
        },
      })).toBe(2700);

      // 0 个节点: 3000 - 300 = 2700
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {},
      })).toBe(2700);
    });

    it('应用边界保护: 最小 2400 字', () => {
      // 即使是过渡章节，也不应低于 2400 字
      const result = calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {},
        baseWordCount: 2500, // 2500 - 300 = 2200, 应被提升到 2400
      });
      expect(result).toBe(2400);
    });

    it('应用边界保护: 最大 4500 字', () => {
      // 内容极度密集时也不应超过 4500 字
      const result = calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {
          CBN: '核心冲突',
          CPNs: ['节点1', '节点2', '节点3', '节点4', '节点5', '节点6', '节点7', '节点8'],
          mustCover: ['必履约1', '必履约2', '必履约3'],
        },
        // 12 个节点: 3000 + (12 - 3) * 200 = 4800, 应被限制到 4500
      });
      expect(result).toBe(4500);
    });

    it('应忽略空字符串节点', () => {
      // 只有 CBN 有效，CPNs 和 mustCover 都是空字符串
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {
          CBN: '核心冲突',
          CPNs: ['', '  ', ''],
          mustCover: ['', '  '],
        },
      })).toBe(2700); // 1 个节点，过渡章节
    });

    it('应支持自定义基准字数', () => {
      // 基准 3500 字，无调整
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {
          CBN: '核心冲突',
          CPNs: ['节点1', '节点2'],
        },
        baseWordCount: 3500,
      })).toBe(3500); // 3 个节点，不触发调整

      // 基准 3500 字，内容密集: 3500 + (5 - 3) * 200 = 3900
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {
          CBN: '核心冲突',
          CPNs: ['节点1', '节点2', '节点3'],
          mustCover: ['必履约1'],
        },
        baseWordCount: 3500,
      })).toBe(3900);
    });

    it('CEN 不应计入内容密度', () => {
      // CBN + 2 CPNs + CEN = 3 个有效节点 (CEN 不计)
      expect(calculateDynamicWordCount({
        chapterNumber: 10,
        totalChapters: 100,
        plotNode: {
          CBN: '核心冲突',
          CPNs: ['节点1', '节点2'],
          CEN: '章结束',
        },
      })).toBe(3000); // 3 个节点，不触发调整
    });
  });

  describe('calculateBatchWordCounts', () => {
    it('应批量计算多章字数目标', () => {
      const chapters = [
        { chapterNumber: 1, plotNode: { CBN: '开局' } },
        { chapterNumber: 2, plotNode: { CBN: '冲突', CPNs: ['节点1'] } },
        { chapterNumber: 3, plotNode: { CBN: '升级', CPNs: ['节点1', '节点2'] } },
        { chapterNumber: 10, plotNode: { CBN: '过渡' } },
        { chapterNumber: 24, plotNode: { CBN: '小高潮' } },
        { chapterNumber: 100, plotNode: { CBN: '大结局' } },
      ];

      const result = calculateBatchWordCounts(chapters, 100);

      expect(result).toEqual([
        2600, // 第 1 章: 黄金三章
        2600, // 第 2 章: 黄金三章
        2600, // 第 3 章: 黄金三章
        2700, // 第 10 章: 过渡章节 (1 个节点)
        3800, // 第 24 章: 小高潮
        3800, // 第 100 章: 大结局
      ]);
    });

    it('应处理空数组', () => {
      const result = calculateBatchWordCounts([], 100);
      expect(result).toEqual([]);
    });
  });
});
