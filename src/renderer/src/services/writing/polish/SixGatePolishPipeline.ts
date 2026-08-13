/**
 * 六门禁润色管道 (Six-Gate Polish Pipeline)
 * 
 * 基于 oh-story-claudecode 的去AI味方法论
 * 
 * Gate A: 禁用词替换
 * Gate B: 句式去套路
 * Gate C: 心理描写外化
 * Gate D: 节奏打碎
 * Gate E: 对话去腔调
 * Gate F: 结尾去升华
 */

import type {
  PolishConfig,
  PolishResult,
  PolishFix,
} from '@/types/writing-v2';
import { normalizeWebnovelParagraphs } from '../typesetting';

// 默认配置
const DEFAULT_CONFIG: PolishConfig = {
  enableGateA: true,
  enableGateB: true,
  enableGateC: true,
  enableGateD: true,
  enableGateE: true,
  enableGateF: true,
  autoFixNonBlocking: true,
};

// ============================================================
// 禁用词表
// ============================================================

const BANNED_WORDS = {
  // 一级禁用词
  level1: [
    '眼中闪过一丝', '眼中闪过一抹', '眼中闪过一道', '眼中浮现',
    '瞳孔微微一缩', '瞳孔微缩', '目光如炬',
    '嘴角勾起', '嘴角微扬', '嘴角轻轻上扬',
    '缓缓地', '轻轻地', '静静地', '渐渐地',
    '似乎', '仿佛', '不由得', '不由自主',
    '与此同时', '此时此刻', '就在这时', '就在此时',
    '不禁心想', '她在心里想', '心中暗道', '心道',
    '心中暗想', '心下一沉', '心头一震', '心中一动',
    '深吸一口气', '缓缓开口', '淡淡地说',
    '这就是成长', '这就是人生', '这就是命运',
    '总而言之', '综上所述', '可见一斑',
  ],
  // 二级禁用词
  level2: [
    '不禁', '似乎', '仿佛', '不由得', '不由自主',
    '此时此刻', '一时间', '此刻', '须臾',
    '刹那间', '霎时间', '电光火石',
  ],
};

// 替换映射
const REPLACEMENTS = {
  // 眼神类
  eye: [
    { from: '眼中闪过一丝', to: '眼睛' },
    { from: '眼中闪过一抹', to: '眼睛' },
    { from: '眼中闪过一道', to: '眼睛' },
    { from: '瞳孔微微一缩', to: '' },
    { from: '瞳孔微缩', to: '' },
    { from: '目光如炬', to: '' },
  ],
  // 嘴角类
  mouth: [
    { from: '嘴角勾起', to: '嘴角一挑' },
    { from: '嘴角微扬', to: '嘴角往上抽了抽' },
    { from: '嘴角轻轻上扬', to: '嘴角抽了抽' },
    { from: '嘴角上扬', to: '嘴角动' },
  ],
  // 副词类
  adverb: [
    { from: '缓缓地', to: '慢慢' },
    { from: '轻轻地', to: '轻轻' },
    { from: '静静地', to: '安静' },
    { from: '渐渐地', to: '慢慢' },
    { from: '突然地', to: '突然' },
    { from: '默默地', to: '不出声地' },
    { from: '呆呆地', to: '呆' },
  ],
  // 连接词类
  connector: [
    { from: '似乎', to: '' },
    { from: '仿佛', to: '像' },
    { from: '不由得', to: '忍不住' },
    { from: '与此同时', to: '这时候' },
    { from: '此时此刻', to: '现在' },
    { from: '就在这时', to: '忽然' },
    { from: '一时间', to: '' },
    { from: '瞬间', to: '一下子' },
    { from: '不由自主', to: '没忍住' },
    { from: '情不自禁', to: '忍不住' },
  ],
  // 心理类
  psychology: [
    { from: '不禁心想', to: '' },
    { from: '她在心里想', to: '' },
    { from: '心下一沉', to: '他腿一软' },
    { from: '心头一震', to: '' },
    { from: '心中一动', to: '' },
    { from: '心中暗道', to: '' },
  ],
  // 升华总结词
  summary: [
    { from: '这就是成长', to: '' },
    { from: '这就是人生', to: '' },
    { from: '这就是命运', to: '' },
    { from: '总而言之', to: '' },
    { from: '综上所述', to: '' },
    { from: '可见一斑', to: '' },
    { from: '正因如此', to: '' },
    { from: '不难发现', to: '' },
  ],
  // AI高频词
  ai: [
    { from: '不可名状', to: '说不上来' },
    { from: '恐怖如斯', to: '太吓人了' },
    { from: '震耳欲聋', to: '声音大得吓人' },
    { from: '难以置信', to: '不敢相信' },
    { from: '说时迟那时快', to: '一下子' },
    { from: '电光火石', to: '眨眼间' },
    { from: '刹那间', to: '一下子' },
    { from: '霎时间', to: '一下子' },
    { from: '细思极恐', to: '越想越怕' },
  ],
};

// ============================================================
// 六门禁管道
// ============================================================

export class SixGatePolishPipeline {
  private readonly config: Required<PolishConfig>;
  private readonly fixes: PolishFix[] = [];
  private gatesPassed: string[] = [];

  constructor(config?: Partial<PolishConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 执行润色
   */
  execute(content: string): PolishResult {
    let result = content;
    this.fixes.length = 0;
    this.gatesPassed.length = 0;

    // Gate A: 禁用词替换
    if (this.config.enableGateA) {
      result = this.gateA_BannedWords(result);
      this.gatesPassed.push('A');
    }

    // Gate B: 句式去套路
    if (this.config.enableGateB) {
      result = this.gateB_Patterns(result);
      this.gatesPassed.push('B');
    }

    // Gate C: 心理描写外化
    if (this.config.enableGateC) {
      result = this.gateC_Psychology(result);
      this.gatesPassed.push('C');
    }

    // Gate D: 节奏打碎
    if (this.config.enableGateD) {
      result = this.gateD_Rhythm(result);
      this.gatesPassed.push('D');
    }

    // Gate E: 对话去腔调
    if (this.config.enableGateE) {
      result = this.gateE_Dialogue(result);
      this.gatesPassed.push('E');
    }

    // Gate F: 结尾去升华
    if (this.config.enableGateF) {
      result = this.gateF_Summary(result);
      this.gatesPassed.push('F');
    }

    // 清理多余空白
    result = this.cleanupWhitespace(result);

    // 计算 AI 味分数
    const antiAIScore = this.calculateAntiAIScore(content, result);

    return {
      content: result,
      fixes: [...this.fixes],
      gatesPassed: [...this.gatesPassed],
      antiAIScore,
    };
  }

  // ============================================================
  // Gate A: 禁用词替换
  // ============================================================

  private gateA_BannedWords(content: string): string {
    let result = content;

    // 应用所有替换映射
    const allReplacements = [
      ...REPLACEMENTS.eye,
      ...REPLACEMENTS.mouth,
      ...REPLACEMENTS.adverb,
      ...REPLACEMENTS.connector,
      ...REPLACEMENTS.psychology,
      ...REPLACEMENTS.summary,
      ...REPLACEMENTS.ai,
    ];

    for (const { from, to } of allReplacements) {
      const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      if (regex.test(result)) {
        const count = (result.match(regex) || []).length;
        result = result.replace(regex, to);
        this.fixes.push({
          type: 'gate_a',
          original: from,
          replacement: to,
          reason: '禁用词替换',
        });
      }
    }

    // 替换一级禁用词
    for (const word of BANNED_WORDS.level1) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      if (regex.test(result)) {
        result = result.replace(regex, '');
        this.fixes.push({
          type: 'gate_a',
          original: word,
          replacement: '',
          reason: '一级禁用词',
        });
      }
    }

    return result;
  }

  // ============================================================
  // Gate B: 句式去套路
  // ============================================================

  private gateB_Patterns(content: string): string {
    let result = content;

    // 处理 "...，带着..." 句式
    result = result.replace(/，带着([^，]+)，/g, '。');
    result = result.replace(/，带着([^，]+)$/gm, '。');

    // 处理 "像XX一样" 比喻
    result = result.replace(/像([^，]+)一样/g, (match, p1) => {
      if (p1.length < 5) return match; // 保留有意义的比喻
      this.fixes.push({
        type: 'gate_b',
        original: match,
        replacement: p1,
        reason: '简化比喻',
      });
      return p1;
    });

    // 处理 AI 惯用连接词
    result = result.replace(/此刻，/g, '');
    result = result.replace(/此时此刻，/g, '');
    result = result.replace(/然而却/g, '偏偏');
    result = result.replace(/然而并没有/g, '偏偏没');

    // 处理 "不禁" 类词
    result = result.replace(/不禁/g, '');
    result = result.replace(/不由自主地/g, '');
    result = result.replace(/不由自主/g, '没忍住');

    return result;
  }

  // ============================================================
  // Gate C: 心理描写外化
  // ============================================================

  private gateC_Psychology(content: string): string {
    let result = content;

    // 紧张相关
    result = result.replace(/他很紧张/g, '他的手在抖');
    result = result.replace(/她很紧张/g, '她的手在抖');
    result = result.replace(/他感到紧张/g, '他的手心全是汗');
    result = result.replace(/她感到紧张/g, '她攥紧了拳头');

    // 愤怒相关
    result = result.replace(/他很愤怒/g, '他把筷子往桌上一拍');
    result = result.replace(/她很愤怒/g, '她把杯子摔在地上');
    result = result.replace(/他感到愤怒/g, '他攥紧了拳头');
    result = result.replace(/她感到愤怒/g, '她的脸涨得通红');

    // 悲伤相关
    result = result.replace(/他很悲伤/g, '他低着头不说话');
    result = result.replace(/她很悲伤/g, '她转过身去');
    result = result.replace(/他感到悲伤/g, '他的眼眶红了');
    result = result.replace(/她感到悲伤/g, '她的肩膀在抖');

    // 惊讶相关
    result = result.replace(/他很惊讶/g, '他愣在原地');
    result = result.replace(/她很惊讶/g, '她张大了嘴');
    result = result.replace(/他感到惊讶/g, '他往后退了一步');
    result = result.replace(/她感到惊讶/g, '她的眼睛瞪圆了');

    // 害怕相关
    result = result.replace(/他很害怕/g, '他的腿在发软');
    result = result.replace(/她很害怕/g, '她往后缩了缩');
    result = result.replace(/他感到害怕/g, '他后背发凉');
    result = result.replace(/她感到害怕/g, '她抱紧了自己');

    // 高兴相关
    result = result.replace(/他很高兴/g, '他嘴角翘了起来');
    result = result.replace(/她很高兴/g, '她眼睛弯成了月牙');
    result = result.replace(/他感到高兴/g, '他哼起了歌');
    result = result.replace(/她感到高兴/g, '她忍不住笑了');

    return result;
  }

  // ============================================================
  // Gate D: 节奏打碎
  // ============================================================

  private gateD_Rhythm(content: string): string {
    let result = content;

    // 1. 打断连续排比（保留最强一条）
    const parallelismRegex = /(，([^，]+)，)+([^，]+)，?$/g;
    let match;
    while ((match = parallelismRegex.exec(result)) !== null) {
      const parts = match[0].split('，').filter(Boolean);
      if (parts.length > 2) {
        const last = parts[parts.length - 1];
        result = result.replace(match[0], `，${last}，`);
        this.fixes.push({
          type: 'gate_d',
          original: match[0],
          replacement: `，${last}，`,
          reason: '打断排比',
        });
      }
    }

    // 2. 拆分长复合句
    const compoundPatterns = [
      /([^，]+)，发现([^，]+)/g,
      /([^，]+)，然后([^，]+)/g,
      /([^，]+)，接着([^，]+)/g,
      /([^，]+)，于是([^，]+)/g,
    ];

    for (const pattern of compoundPatterns) {
      result = result.replace(pattern, (match, p1, p2) => {
        if (p1.length > 10) {
          this.fixes.push({
            type: 'gate_d',
            original: match,
            replacement: `${p1}。${p2}`,
            reason: '复合句拆分',
          });
          return `${p1}。${p2}`;
        }
        return match;
      });
    }

    // 3. 简化连续四字词
    const fourCharPattern = /([^，。！？；：""''\n]{4}[，。！？；：""''\n]?){3,}/g;
    let fMatch;
    while ((fMatch = fourCharPattern.exec(result)) !== null) {
      const matched = fMatch[0];
      const parts = matched.match(/[^，。！？；：""''\n]{4}/g) || [];
      if (parts.length >= 3) {
        const simplified = parts.slice(0, 2).join('');
        if (simplified !== matched) {
          result = result.replace(matched, simplified);
          this.fixes.push({
            type: 'gate_d',
            original: matched,
            replacement: simplified,
            reason: '简化四字词',
          });
        }
      }
    }

    // 4. 删除句首连接词
    result = result.replace(/^首先，/gm, '');
    result = result.replace(/^其次，/gm, '');
    result = result.replace(/^第一，/gm, '');
    result = result.replace(/^第二，/gm, '');
    result = result.replace(/^第三，/gm, '');
    result = result.replace(/^最后，/gm, '然后，');

    return result;
  }

  // ============================================================
  // Gate E: 对话去腔调
  // ============================================================

  private gateE_Dialogue(content: string): string {
    let result = content;

    // 1. 替换机械对话标签
    const dialogueTagReplacements: [RegExp, string][] = [
      [/说道：/g, '说：'],
      [/回答说：/g, '回：'],
      [/问道：/g, '问：'],
      [/叹道：/g, '叹：'],
      [/解释道：/g, '说：'],
      [/补充道：/g, '补了一句：'],
      [/解释道：/g, '说：'],
      [/补充说：/g, '补了一句：'],
    ];

    for (const [pattern, replacement] of dialogueTagReplacements) {
      if (pattern.test(result)) {
        result = result.replace(pattern, replacement);
        this.fixes.push({
          type: 'gate_e',
          original: pattern.source,
          replacement,
          reason: '对话标签口语化',
        });
      }
    }

    // 2. 删除机械的 "沉声道"、"淡淡地说" 等
    result = result.replace(/沉声道：/g, '说：');
    result = result.replace(/淡淡地说：/g, '说：');
    result = result.replace(/淡淡道：/g, '说：');
    result = result.replace(/轻笑道：/g, '笑：');
    result = result.replace(/低声说：/g, '小声说：');
    result = result.replace(/高声说：/g, '喊：');

    // 3. 添加口语化语气词（可选）
    // 注意：这个可能会改变语义，只在必要时使用

    return result;
  }

  // ============================================================
  // Gate F: 结尾去升华
  // ============================================================

  private gateF_Summary(content: string): string {
    let result = content;

    // 1. 删除章末升华总结句
    const summaryPatterns = [
      /\n\n.*?(总而言之|总之|由此可见|可见|因此可以说|因此可以看出|不难发现|显而易见).*?。/g,
      /.*?(总而言之|总之|由此可见|可见|因此可以说|因此可以看出|不难发现|显而易见).*?。\n*/g,
      /.*?(这就是成长|这就是人生|这就是命运|这就是全部).*?。?$/gm,
    ];

    for (const pattern of summaryPatterns) {
      if (pattern.test(result)) {
        result = result.replace(pattern, '');
        this.fixes.push({
          type: 'gate_f',
          original: '[升华句]',
          replacement: '',
          reason: '删除升华总结',
        });
      }
    }

    // 2. 删除 AI 式说教句
    const teachingPatterns = [
      /.*?(有时候.*?也是.*?|真正的.*?不是.*?而是.*?|命运.*?就是这样.*?|人生.*?就是如此.*?).*?。\n*/g,
      /.*?(有时候.*?也是.*?|真正的.*?不是.*?而是.*?|命运.*?就是这样.*?|人生.*?就是如此.*?).*?。$/gm,
    ];

    for (const pattern of teachingPatterns) {
      if (pattern.test(result)) {
        result = result.replace(pattern, '');
        this.fixes.push({
          type: 'gate_f',
          original: '[说教句]',
          replacement: '',
          reason: '删除说教句',
        });
      }
    }

    // 3. 删除感慨式结尾
    // 只锚定成语开头再吃到句末：Gate D 会在本门禁之前改写句中用词，
    // 若按整句字面匹配会失配并留下「岁月如流水般悄然.」这类残句，比不处理更糟。
    const emotionOpeners = ['岁月如流水', '时光荏苒', '光阴似箭', '人生若只如初见'];
    const emotionPatterns = emotionOpeners.map(
      opener => new RegExp(`${opener}[^。！？\\n]*[。！？.…]*\\n*`, 'g')
    );

    for (const pattern of emotionPatterns) {
      if (pattern.test(result)) {
        result = result.replace(pattern, '');
        this.fixes.push({
          type: 'gate_f',
          original: '[感慨结尾]',
          replacement: '',
          reason: '删除感慨结尾',
        });
      }
    }

    return result;
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 清理多余空白
   */
  private cleanupWhitespace(content: string): string {
    let result = normalizeWebnovelParagraphs(content);

    // 删除连续空行
    result = result.replace(/\n{3,}/g, '\n\n');

    // 删除行尾空格
    result = result.replace(/[ \t]+$/gm, '');

    // 删除连续空格
    result = result.replace(/[ ]+/g, ' ');

    // 清理引号周围的空格
    result = result.replace(/\s*[""]\s*/g, '"');

    return result.trim();
  }

  /**
   * 计算 AI 味分数
   */
  private calculateAntiAIScore(original: string, processed: string): number {
    let score = 100;

    // 基于修改数量扣分
    const fixCount = this.fixes.length;
    if (fixCount > 50) {
      score -= 30;
    } else if (fixCount > 20) {
      score -= 20;
    } else if (fixCount > 10) {
      score -= 10;
    } else if (fixCount > 5) {
      score -= 5;
    }

    // 基于字数变化
    const originalLength = original.length;
    const processedLength = processed.length;
    const ratio = processedLength / originalLength;

    if (ratio < 0.8) {
      score -= 15; // 删除过多
    } else if (ratio < 0.9) {
      score -= 5;
    }

    return Math.max(0, Math.min(100, score));
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useSixGatePolishPipeline(
  config?: Partial<PolishConfig>
): SixGatePolishPipeline {
  return new SixGatePolishPipeline(config);
}

export default SixGatePolishPipeline;
