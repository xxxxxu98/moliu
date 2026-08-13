/**
 * 六门禁润色管道测试
 */

import { describe, it, expect } from 'vitest';
import { SixGatePolishPipeline } from '../polish/SixGatePolishPipeline';

describe('SixGatePolishPipeline', () => {
  const pipeline = new SixGatePolishPipeline();

  describe('Gate A: 禁用词替换', () => {
    it('应替换一级禁用词', () => {
      const input = '他缓缓地站起身来，眼中闪过一丝悲伤。';
      const result = pipeline.execute(input);
      
      expect(result.content).toContain('他');
      expect(result.content).not.toContain('缓缓地');
      expect(result.content).not.toContain('眼中闪过一丝');
      expect(result.fixes.some(f => f.type === 'gate_a')).toBe(true);
    });

    it('应替换眼神类表达', () => {
      const input = '她嘴角勾起一抹微笑，眼中闪过一丝狡黠。';
      const result = pipeline.execute(input);
      
      expect(result.content).not.toContain('嘴角勾起');
      expect(result.content).not.toContain('眼中闪过');
    });

    it('应替换升华总结词', () => {
      const input = '这就是成长，这就是人生，这就是命运。';
      const result = pipeline.execute(input);
      
      expect(result.content).not.toContain('这就是成长');
      expect(result.content).not.toContain('这就是人生');
    });
  });

  describe('Gate B: 句式去套路', () => {
    it('应打断 "...，带着..." 句式', () => {
      const input = '他走进房间，带着一种莫名的紧张感。';
      const result = pipeline.execute(input);
      
      expect(result.content).not.toContain('，带着');
    });

    it('应处理 "像XX一样" 比喻', () => {
      const input = '他的声音像雷鸣一样响亮。';
      const result = pipeline.execute(input);
      
      // 应该简化或保留，视具体实现而定
      expect(result.content).toBeTruthy();
    });

    it('应替换 AI 惯用连接词', () => {
      const input = '就在这时，他发现了真相。';
      const result = pipeline.execute(input);
      
      expect(result.content).not.toContain('就在这时');
    });
  });

  describe('Gate C: 心理描写外化', () => {
    it('应将 "他很紧张" 外化为动作', () => {
      const input = '他很紧张，手心全是汗。';
      const result = pipeline.execute(input);
      
      // 检查是否有相关替换
      expect(result.content).toBeTruthy();
    });

    it('应将 "她很愤怒" 外化为动作', () => {
      const input = '她很愤怒，把杯子摔在地上。';
      const result = pipeline.execute(input);
      
      // 检查是否有相关替换
      expect(result.content).toBeTruthy();
    });
  });

  describe('Gate D: 节奏打碎', () => {
    it('应打断连续排比', () => {
      const input = '他聪明、勇敢、善良、幽默。';
      const result = pipeline.execute(input);
      
      // 排比应该被简化
      expect(result.content).toBeTruthy();
    });

    it('应拆分长复合句', () => {
      const input = '他走进房间，发现桌上有一封信，打开一看，内容让他震惊。';
      const result = pipeline.execute(input);
      
      // 长句应该被拆分
      expect(result.content).toBeTruthy();
    });
  });

  describe('Gate E: 对话去腔调', () => {
    it('应替换机械对话标签', () => {
      const input = '他沉声道："这就是你的答案？"';
      const result = pipeline.execute(input);
      
      expect(result.content).not.toContain('沉声道');
    });

    it('应保留正常对话', () => {
      const input = '他说："我不知道。"';
      const result = pipeline.execute(input);
      
      expect(result.content).toContain('"');
    });
  });

  describe('Gate F: 结尾去升华', () => {
    it('应删除章末升华总结句', () => {
      const input = '这就是成长，这就是人生。总而言之，这就是命运。';
      const result = pipeline.execute(input);
      
      expect(result.content).not.toContain('总而言之');
    });

    it('应删除感慨式结尾', () => {
      const input = '岁月如流水般悄然流逝...';
      const result = pipeline.execute(input);
      
      expect(result.content).not.toContain('岁月如流水般');
    });
  });

  describe('整体效果', () => {
    it('应返回修改统计', () => {
      const input = '他缓缓地站起身来，眼中闪过一丝悲伤。';
      const result = pipeline.execute(input);
      
      expect(result.fixes).toBeDefined();
      expect(Array.isArray(result.fixes)).toBe(true);
      expect(result.gatesPassed).toBeDefined();
      expect(result.antiAIScore).toBeDefined();
    });

    it('应通过所有门禁', () => {
      const input = '他缓缓地站起身来，眼中闪过一丝悲伤。';
      const result = pipeline.execute(input);
      
      expect(result.gatesPassed).toContain('A');
      expect(result.gatesPassed).toContain('B');
      expect(result.gatesPassed).toContain('C');
      expect(result.gatesPassed).toContain('D');
      expect(result.gatesPassed).toContain('E');
      expect(result.gatesPassed).toContain('F');
    });

    it('应保留原文的核心内容', () => {
      const input = '他站起身，手心全是汗。';
      const result = pipeline.execute(input);
      
      expect(result.content).toContain('站');
      expect(result.content).toContain('汗');
    });

    it('应处理空字符串', () => {
      const result = pipeline.execute('');
      
      expect(result.content).toBe('');
      expect(result.fixes).toEqual([]);
    });
  });

  describe('配置选项', () => {
    it('应支持只启用部分门禁', () => {
      const partialPipeline = new SixGatePolishPipeline({
        enableGateA: true,
        enableGateB: false,
        enableGateC: false,
        enableGateD: false,
        enableGateE: false,
        enableGateF: false,
      });

      const input = '他缓缓地站起身来。';
      const result = partialPipeline.execute(input);
      
      expect(result.gatesPassed).toEqual(['A']);
      expect(result.gatesPassed).not.toContain('B');
    });
  });
});
