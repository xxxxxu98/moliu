/**
 * 去AI味服务
 * 基于 story-deslop 技能库的完整实现
 */

import type { FiveDimensionEvaluation } from '@/types/inspiration';

/**
 * AI味检测结果
 */
export interface AI味检测报告 {
  level: '轻度' | '中度' | '重度';
  totalScore: number;  // 0-100, 越高AI味越重
  issues: AI味问题[];
  suggestions: string[];
}

/**
 * AI味问题详情
 */
export interface AI味问题 {
  type: '禁用词' | '句式' | '心理描写' | '节奏' | '对话' | '结尾';
  original: string;
  suggestion: string;
  reason: string;
}

/**
 * 润色结果
 */
export interface 润色结果 {
  original: string;
  polished: string;
  changes: {
    type: string;
    original: string;
    replacement: string;
  }[];
}

/**
 * 禁用词表（AI高频词）
 */
const 禁用词表: { pattern: RegExp; replacement: string; reason: string }[] = [
  // 典型AI高频词
  { pattern: /眼中闪过一丝(.*?的)/g, replacement: '', reason: '删除"眼中闪过一丝..."这类典型AI表达' },
  { pattern: /深吸一口气/g, replacement: '胸口起伏了一下', reason: '用更具体的动作替代抽象描写' },
  { pattern: /嘴角勾起一抹(冷笑|笑容|弧度)/g, replacement: '他/她笑了一下', reason: '避免"嘴角勾起一抹..."的套路表达' },
  { pattern: /缓缓开口/g, replacement: '说', reason: '"缓缓开口"过于书面化' },
  { pattern: /不禁(觉得|感到|认为)/g, replacement: '', reason: '"不禁..."是AI高频句式' },
  { pattern: /仿佛(像|是)/g, replacement: '像', reason: '"仿佛"过于文言腔' },
  { pattern: /他\/她感到(.*?)的情绪/g, replacement: '他/她$1', reason: '心理描写应该通过动作展示，而非直接陈述' },
  { pattern: /令人/g, replacement: '让人', reason: '"令人"过于书面化' },
  { pattern: /此时此刻/g, replacement: '这时', reason: '"此时此刻"是AI高频词' },
  { pattern: /总而言之/g, replacement: '', reason: '"总而言之"过于总结化' },
  { pattern: /显而易见/g, replacement: '很明显', reason: '"显而易见"过于书面化' },
  { pattern: /不容置疑/g, replacement: '毫无疑问', reason: '"不容置疑"过于绝对化' },
  { pattern: /不由自主/g, replacement: '', reason: '"不由自主"是AI高频词' },
  { pattern: /此时此刻/g, replacement: '现在', reason: '"此时此刻"是AI高频词' },
  { pattern: /如此/g, replacement: '这么', reason: '"如此"过于书面化' },
  { pattern: /此时此刻/g, replacement: '这时', reason: '"此时此刻"是AI高频词' },
];

/**
 * AI惯用句式模式
 */
const AI句式模式: { pattern: RegExp; replacement: string; reason: string }[] = [
  // "带着..."万能状语
  { pattern: /，(带着|带着)(.*?)，/g, replacement: '。', reason: '打断"带着..."万能状语' },
  
  // 连续排比句
  { pattern: /(.*?)(.*?)(.*?)都是(.*?)/g, replacement: '$1都是$4', reason: 'AI常写连续排比' },
  
  // 过度解释性语句
  { pattern: /这说明(.*?)，表明(.*?)/g, replacement: '$1', reason: 'AI喜欢过度解释' },
  
  // "他知道"类直接告诉
  { pattern: /他知道(.*?)，于是/g, replacement: '$1，于是', reason: '用行为展示认知，而非直接告诉' },
  { pattern: /她感到(.*?)，因为/g, replacement: '$1，因为', reason: '删除直接的情绪陈述' },
];

/**
 * 心理描写外化规则
 */
const 心理外化规则: { pattern: RegExp; replacement: string; reason: string }[] = [
  { pattern: /他很紧张/g, replacement: '他的手在抖', reason: '用动作展示紧张' },
  { pattern: /她很愤怒/g, replacement: '她一把掀翻了桌子', reason: '用动作展示愤怒' },
  { pattern: /他很害怕/g, replacement: '他的腿在发抖，几乎站不稳', reason: '用动作展示害怕' },
  { pattern: /她很伤心/g, replacement: '她转过身去，肩膀微微颤动', reason: '用动作展示伤心' },
  { pattern: /他感到一丝失落/g, replacement: '他愣了一下，把手机放回口袋', reason: '用行为展示失落' },
  { pattern: /她感到绝望/g, replacement: '她垂下手，盯着地面', reason: '用动作展示绝望' },
  { pattern: /他感到欣慰/g, replacement: '他嘴角微微上扬', reason: '用动作展示欣慰' },
  { pattern: /她感到惊讶/g, replacement: '她后退了一步', reason: '用动作展示惊讶' },
];

/**
 * 对话去腔调规则
 */
const 对话规则: { pattern: RegExp; replacement: string; reason: string }[] = [
  // 添加口语化
  { pattern: /(.*?)问道(.*?)"/g, replacement: '说："', reason: '简化对话标签' },
  { pattern: /(.*?)说道(.*?)"/g, replacement: '说："', reason: '简化对话标签' },
  { pattern: /(.*?)答道(.*?)"/g, replacement: '："', reason: '删除机械对话标签' },
  { pattern: /(.*?)应道(.*?)"/g, replacement: '："', reason: '删除机械对话标签' },
];

/**
 * 结尾去升华规则
 */
const 结尾规则: { pattern: RegExp; replacement: string; reason: string }[] = [
  // 删除总结性语句
  { pattern: /这一刻，他\/她终于明白(.*?)。$/gm, replacement: '', reason: '删除"终于明白"类总结' },
  { pattern: /他\/她知道，(.*?)才是最重要的。$/gm, replacement: '', reason: '删除感慨式结尾' },
  { pattern: /从这一刻起，(.*?)开始(.*?)。$/gm, replacement: '', reason: '删除升华式结尾' },
  { pattern: /这，就是(.*?)。$/gm, replacement: '', reason: '删除"这就是..."式点题' },
];

/**
 * 检测文本的AI味
 */
export function 检测AI味(text: string): AI味检测报告 {
  const issues: AI味问题[] = [];
  let score = 0;
  
  // 检测禁用词
  for (const rule of 禁用词表) {
    const matches = text.match(rule.pattern);
    if (matches) {
      matches.forEach(match => {
        issues.push({
          type: '禁用词',
          original: match,
          suggestion: rule.replacement || '（建议删除）',
          reason: rule.reason,
        });
        score += 15;
      });
    }
  }
  
  // 检测AI句式
  for (const rule of AI句式模式) {
    const matches = text.match(rule.pattern);
    if (matches) {
      matches.forEach(match => {
        issues.push({
          type: '句式',
          original: match,
          suggestion: rule.replacement,
          reason: rule.reason,
        });
        score += 10;
      });
    }
  }
  
  // 检测心理描写
  for (const rule of 心理外化规则) {
    if (rule.pattern.test(text)) {
      issues.push({
        type: '心理描写',
        original: rule.pattern.source,
        suggestion: rule.replacement,
        reason: rule.reason,
      });
      score += 12;
    }
  }
  
  // 检测对话腔调
  for (const rule of 对话规则) {
    const matches = text.match(rule.pattern);
    if (matches) {
      matches.forEach(match => {
        issues.push({
          type: '对话',
          original: match,
          suggestion: rule.replacement,
          reason: rule.reason,
        });
        score += 8;
      });
    }
  }
  
  // 检测结尾升华
  for (const rule of 结尾规则) {
    const matches = text.match(rule.pattern);
    if (matches) {
      matches.forEach(match => {
        issues.push({
          type: '结尾',
          original: match,
          suggestion: rule.replacement,
          reason: rule.reason,
        });
        score += 10;
      });
    }
  }
  
  // 计算节奏问题（段落太长、太均匀）
  const paragraphs = text.split(/\n\n+/);
  const longParagraphs = paragraphs.filter(p => p.length > 300);
  if (longParagraphs.length > paragraphs.length * 0.5) {
    issues.push({
      type: '节奏',
      original: '段落过于均匀冗长',
      suggestion: '拆分长段落，增加变化',
      reason: 'AI写的段落通常过于均匀',
    });
    score += 15;
  }
  
  // 限制分数在0-100
  score = Math.min(100, score);
  
  // 判断AI味等级
  let level: '轻度' | '中度' | '重度' = '轻度';
  if (score >= 60) level = '重度';
  else if (score >= 30) level = '中度';
  
  // 生成建议
  const suggestions: string[] = [];
  if (score < 30) {
    suggestions.push('文本整体自然，可以继续使用');
  } else if (score < 60) {
    suggestions.push('存在一些AI味，建议适度调整');
    if (issues.some(i => i.type === '禁用词')) {
      suggestions.push('重点替换禁用词和AI高频表达');
    }
    if (issues.some(i => i.type === '句式')) {
      suggestions.push('尝试打破AI惯用的句式结构');
    }
  } else {
    suggestions.push('AI味较重，建议进行全面润色');
    suggestions.push('可以先用「去AI味」功能处理');
    suggestions.push('或者手动按照检测报告逐项修改');
  }
  
  return {
    level,
    totalScore: score,
    issues: issues.slice(0, 20), // 最多显示20个问题
    suggestions,
  };
}

/**
 * 自动润色文本（去AI味）
 */
export function 去AI味润色(text: string): 润色结果 {
  const changes: { type: string; original: string; replacement: string }[] = [];
  let polished = text;
  
  // 1. 禁用词替换
  for (const rule of 禁用词表) {
    const original = polished;
    polished = polished.replace(rule.pattern, (match, ...args) => {
      if (rule.replacement !== '') {
        changes.push({
          type: '禁用词',
          original: match,
          replacement: rule.replacement,
        });
        return rule.replacement;
      }
      // 删除整个匹配
      changes.push({
        type: '禁用词',
        original: match,
        replacement: '',
      });
      return '';
    });
  }
  
  // 2. 句式去套路
  for (const rule of AI句式模式) {
    const original = polished;
    polished = polished.replace(rule.pattern, (match, ...args) => {
      changes.push({
        type: '句式',
        original: match,
        replacement: rule.replacement,
      });
      return rule.replacement;
    });
  }
  
  // 3. 心理描写外化
  for (const rule of 心理外化规则) {
    const original = polished;
    polished = polished.replace(rule.pattern, (match) => {
      changes.push({
        type: '心理外化',
        original: match,
        replacement: rule.replacement,
      });
      return rule.replacement;
    });
  }
  
  // 4. 对话去腔调
  for (const rule of 对话规则) {
    const original = polished;
    polished = polished.replace(rule.pattern, (match, ...args) => {
      changes.push({
        type: '对话',
        original: match,
        replacement: rule.replacement,
      });
      return rule.replacement;
    });
  }
  
  // 5. 结尾去升华
  for (const rule of 结尾规则) {
    const original = polished;
    polished = polished.replace(rule.pattern, (match) => {
      changes.push({
        type: '结尾',
        original: match,
        replacement: rule.replacement,
      });
      return rule.replacement;
    });
  }
  
  // 6. 节奏调整：拆分过长段落
  const paragraphs = polished.split(/\n\n+/);
  const adjustedParagraphs = paragraphs.map(p => {
    if (p.length > 400) {
      // 找到句号位置拆分
      const sentences = p.split(/(?<=[。！？])/);
      const result: string[] = [];
      let current = '';
      
      for (const sentence of sentences) {
        current += sentence;
        if (current.length > 250 && sentence.length > 20) {
          result.push(current.trim());
          current = '';
        }
      }
      if (current.trim()) {
        result.push(current.trim());
      }
      
      if (result.length > 1) {
        changes.push({
          type: '节奏',
          original: `长段落（${p.length}字）`,
          replacement: `${result.length}个段落`,
        });
        return result.join('\n\n');
      }
    }
    return p;
  });
  polished = adjustedParagraphs.join('\n\n');
  
  // 7. 添加口语化表达（可选，根据需求启用）
  // polished = 添加口语化表达(polished);
  
  return {
    original: text,
    polished,
    changes,
  };
}

/**
 * 批量润色（适用于大段文本）
 */
export async function 批量去AI味润色(
  text: string,
  onProgress?: (progress: number) => void
): Promise<润色结果> {
  // 分段处理，避免一次性处理太长文本
  const maxChunkSize = 5000;
  const chunks: string[] = [];
  
  // 按段落分割
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  
  for (const para of paragraphs) {
    if ((currentChunk + para).length <= maxChunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // 如果单个段落超长，进一步拆分
      if (para.length > maxChunkSize) {
        for (let i = 0; i < para.length; i += maxChunkSize) {
          chunks.push(para.substring(i, i + maxChunkSize));
        }
      } else {
        currentChunk = para;
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  // 处理每个chunk
  const polishedChunks: string[] = [];
  const allChanges: { type: string; original: string; replacement: string }[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const result = 去AI味润色(chunks[i]);
    polishedChunks.push(result.polished);
    allChanges.push(...result.changes);
    if (onProgress) {
      onProgress(Math.round(((i + 1) / chunks.length) * 100));
    }
  }
  
  return {
    original: text,
    polished: polishedChunks.join('\n\n'),
    changes: allChanges,
  };
}
