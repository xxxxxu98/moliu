/**
 * 润色 Agent
 * 基于 oh-story 三遍法
 * 
 * 三遍法：
 * 1. 去泛化 - 去除 AI 惯用的泛化表达
 * 2. 去书面化 - 去除过于专业的书面用语
 * 3. 回人味 - 恢复人类的表达习惯和细节
 */

import type { PolishResult, AntiAIResult, PolishChange } from './types';
import type { TaskBook } from '../orchestrator/types';
import { MAX_PARAGRAPH_CHARS, isLongParagraph } from '../typesetting';

export class PolishAgent {
  /**
   * 润色正文
   */
  async polish(
    content: string,
    taskBook: TaskBook
  ): Promise<PolishResult> {
    let result = content;
    const changes: PolishChange[] = [];
    
    // 第一遍：去泛化
    const pass1Result = this.pass1StripGeneric(result);
    if (pass1Result.changed) {
      changes.push(...pass1Result.changes);
      result = pass1Result.content;
    }
    
    // 第二遍：去书面化
    const pass2Result = this.pass2CutProfessionalDiction(result);
    if (pass2Result.changed) {
      changes.push(...pass2Result.changes);
      result = pass2Result.content;
    }
    
    // 第三遍：回人味
    const pass3Result = this.pass3RestoreHumanPresence(result);
    if (pass3Result.changed) {
      changes.push(...pass3Result.changes);
      result = pass3Result.content;
    }
    
    // 最终 Anti-AI 检测
    const antiAIResult = this.checkAntiAI(result);
    
    return {
      originalContent: content,
      polishedContent: result,
      passes: {
        stripGeneric: pass1Result.changed,
        cutProfessionalDiction: pass2Result.changed,
        restoreHumanPresence: pass3Result.changed,
        styleAdapt: true,
      },
      antiAIResult,
      changes,
    };
  }
  
  // ============================================================
  // 第一遍：去泛化
  // ============================================================
  
  private pass1StripGeneric(content: string): {
    content: string;
    changed: boolean;
    changes: PolishChange[];
  } {
    let result = content;
    const changes: PolishChange[] = [];
    
    // 1. 去除泛化情绪词
    const emotionPatterns: [RegExp, string][] = [
      // 他感到X → 具体动作
      [/他感到([^，。]+)[，。]/g, (match) => {
        const emotion = match[1];
        const action = this.emotionToAction(emotion);
        return action ? `他${action}，` : match[0];
      }],
      [/她感到([^，。]+)[，。]/g, (match) => {
        const emotion = match[1];
        const action = this.emotionToAction(emotion);
        return action ? `她${action}，` : match[0];
      }],
      // 他觉得X → 行为表现
      [/他觉得([^，。]+)很([^，。]+)[，。]/g, '他'],
      [/她觉得([^，。]+)很([^，。]+)[，。]/g, '她'],
      // 内心独白式总结
      [/这让他（她）明白?了?([^，。]+)[，。]/g, ''],
      [/这让她（他）明白?了?([^，。]+)[，。]/g, ''],
    ];
    
    // 简化处理：直接替换
    const genericEmotions = [
      ['紧张', '手心冒汗'],
      ['害怕', '忍不住后退一步'],
      ['高兴', '嘴角上扬'],
      ['愤怒', '握紧拳头'],
      ['惊讶', '愣在原地'],
      ['感动', '眼眶微红'],
      ['伤心', '低下头'],
      ['得意', '眉梢上扬'],
      ['无奈', '叹了口气'],
      ['焦急', '来回踱步'],
    ];
    
    for (const [emotion, action] of genericEmotions) {
      // 替换"他感到紧张"为"他手心冒汗"
      const pattern = new RegExp(`他感到?了?${emotion}`, 'g');
      if (pattern.test(result)) {
        changes.push({
          type: 'replacement',
          location: '全文',
          original: `他感到${emotion}`,
          changed: `他${action}`,
          reason: '泛化情绪词改为具体动作',
        });
        result = result.replace(pattern, `他${action}`);
      }
      
      const pattern2 = new RegExp(`她感到?了?${emotion}`, 'g');
      if (pattern2.test(result)) {
        changes.push({
          type: 'replacement',
          location: '全文',
          original: `她感到${emotion}`,
          changed: `她${action}`,
          reason: '泛化情绪词改为具体动作',
        });
        result = result.replace(pattern2, `她${action}`);
      }
    }
    
    // 2. 去除"此时此刻"类泛化
    const genericPhrases = [
      ['此时此刻', ''],
      ['就在这一刻', ''],
      ['就在此时', ''],
      ['就在这时', '突然'],
      ['令人惊讶的是', ''],
      ['众所周知', ''],
      ['实际上', ''],
      ['事实上', ''],
      ['总的来说', ''],
    ];
    
    for (const [phrase, replacement] of genericPhrases) {
      if (result.includes(phrase)) {
        changes.push({
          type: 'replacement',
          location: '全文',
          original: phrase,
          changed: replacement,
          reason: '去除AI惯用泛化词',
        });
        result = result.replace(new RegExp(phrase, 'g'), replacement);
      }
    }
    
    // 3. 去除总结句
    const summaryPatterns = [
      /这就是成长[，。]/g,
      /这就是人生[，。]/g,
      /这就是爱[，。]/g,
      /故事还在继续[，。]/g,
      /未完待续[，。]/g,
      /本章完[，。]/g,
    ];
    
    for (const pattern of summaryPatterns) {
      if (pattern.test(result)) {
        changes.push({
          type: 'deletion',
          location: '结尾',
          original: '总结句',
          changed: '',
          reason: '删除安全着陆总结句',
        });
        result = result.replace(pattern, '');
      }
    }
    
    return {
      content: result.trim(),
      changed: changes.length > 0,
      changes,
    };
  }
  
  // ============================================================
  // 第二遍：去书面化
  // ============================================================
  
  private pass2CutProfessionalDiction(content: string): {
    content: string;
    changed: boolean;
    changes: PolishChange[];
  } {
    let result = content;
    const changes: PolishChange[] = [];
    
    // 1. 专业术语口语化
    const professionalTerms: [string, string][] = [
      ['眼眸', '眼睛'],
      ['唇角', '嘴角'],
      ['嘴角上扬', '咧嘴一笑'],
      ['微微', '有点'],
      ['缓缓', '慢慢'],
      ['轻轻', '稍微'],
      ['淡淡', '有点'],
      ['不禁', '忍不住'],
      ['旋即', '马上'],
      ['蓦然', '突然'],
      ['凝视', '盯着看'],
      ['颔首', '点点头'],
      ['撩人', '勾人'],
      ['周身', '身上'],
      ['周遭', '周围'],
      ['此时此刻', '现在'],
      ['方才', '刚才'],
    ];
    
    for (const [term, replacement] of professionalTerms) {
      if (result.includes(term)) {
        changes.push({
          type: 'replacement',
          location: '全文',
          original: term,
          changed: replacement,
          reason: '书面化用语改为口语',
        });
        result = result.replace(new RegExp(term, 'g'), replacement);
      }
    }
    
    // 2. 去除过多的形容词
    const adjectivePatterns = [
      [/非常/g, ''],
      [/十分/g, ''],
      [/特别/g, '很'],
      [/极其/g, '特别'],
      [/相当/g, '挺'],
      [/极为/g, '特别'],
    ];
    
    for (const [pattern, replacement] of adjectivePatterns) {
      if (pattern.test(result)) {
        changes.push({
          type: 'replacement',
          location: '全文',
          original: pattern.toString(),
          changed: replacement,
          reason: '去除过多副词',
        });
        result = result.replace(pattern, replacement);
      }
    }
    
    // 3. 简化复杂句式
    // 连续逗号分割的长句改为短句
    const longSentences = result.match(/[^。！？]{50,}[，][^。！？]{30,}[，][^。！？]{30,}[。！？]/g);
    if (longSentences) {
      for (const sentence of longSentences) {
        // 简单处理：在第一个逗号后断开
        const parts = sentence.split(/[，]/);
        if (parts.length >= 3) {
          const shortVersion = parts.slice(0, 2).join('，') + '。';
          if (shortVersion.length < sentence.length) {
            changes.push({
              type: 'replacement',
              location: '全文',
              original: sentence.slice(0, 50) + '...',
              changed: shortVersion.slice(0, 30) + '...',
              reason: '简化复杂长句',
            });
            result = result.replace(sentence, shortVersion);
          }
        }
      }
    }
    
    return {
      content: result.trim(),
      changed: changes.length > 0,
      changes,
    };
  }
  
  // ============================================================
  // 第三遍：回人味
  // ============================================================
  
  private pass3RestoreHumanPresence(content: string): {
    content: string;
    changed: boolean;
    changes: PolishChange[];
  } {
    let result = content;
    const changes: PolishChange[] = [];
    
    // 1. 添加口语化表达
    // 在适当位置添加语气词
    const addSpokenFlavor = (text: string): string => {
      // 替换一些书面表达为口语
      const replacements: [RegExp, string][] = [
        // 疑问句加语气
        [/\?([^？]*)\?/g, '？$1？'],  // 确保中文问号
        // 添加"吧"、"嘛"等语气词
        [/说道："([^"]+)"/g, (m) => {
          const dialogue = m[1];
          if (dialogue.length > 10 && !['吧', '嘛', '啊', '呀', '哦', '呢'].some(s => dialogue.endsWith(s))) {
            return `说道："${dialogue}"`
          }
          return m[0];
        }],
      ];
      
      return text;
    };
    
    // 2. 添加对话潜台词
    // 简化处理：确保对话有说话者标识
    const dialogues = result.match(/[""][^""]+[""]/g) || [];
    for (const dialogue of dialogues) {
      // 检查是否有说话者
      const beforeQuote = result.split(dialogue)[0];
      const lastSentence = beforeQuote.split(/[。！？\n]/).pop() || '';
      
      // 如果对话前没有"说"、"问"、"答"等动词，添加一个
      const speechVerbs = ['说', '问', '答', '喊', '叫', '道', '嘟囔', '吼道', '低声'];
      const hasVerb = speechVerbs.some(v => lastSentence.includes(v));
      
      if (!hasVerb && lastSentence.length > 0 && lastSentence.length < 20) {
        changes.push({
          type: 'addition',
          location: '对话部分',
          original: dialogue,
          changed: `${lastSentence}，${dialogue}`,
          reason: '补充说话者动作/语气',
        });
        result = result.replace(dialogue, `${lastSentence}，${dialogue}`);
      }
    }
    
    // 3. 添加具体感官细节
    // 在描述场景时添加五感细节
    const sensoryAdditions: [string, string][] = [
      // 声音
      [/(安静|寂静)(得|[，])/g, '$1$2能听见'],
      // 触感
      [/(觉得|感到)(很)(冷|热|疼|痒)/g, '$1$2$3，$3得'],
      // 视觉
      [/(看到|看见)([^，]+)[，]/g, '$1$2，$2看起来'],
    ];
    
    for (const [pattern, replacement] of sensoryAdditions) {
      if (pattern.test(result)) {
        changes.push({
          type: 'replacement',
          location: '全文',
          original: '感官细节补充',
          changed: '已补充',
          reason: '添加具体感官细节',
        });
        result = result.replace(pattern, replacement);
      }
    }
    
    // 4. 恢复对话节奏
    // 添加一些无意义填充词
    const fillerPatterns = [
      [/嗯/g, '嗯'],
      [/啊/g, '啊'],
      [/哦/g, '哦'],
    ];
    
    return {
      content: result.trim(),
      changed: changes.length > 0,
      changes,
    };
  }
  
  // ============================================================
  // Anti-AI 检测
  // ============================================================
  
  /**
   * 检查 Anti-AI 指标
   */
  checkAntiAI(content: string): AntiAIResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;
    
    // 1. 检查 AI 惯用词
    const aiWords = [
      '此时此刻',
      '就在这一刻',
      '令人惊讶的是',
      '众所周知',
      '总的来说',
      '这说明',
      '这表明',
      '这意味着',
    ];
    
    for (const word of aiWords) {
      if (content.includes(word)) {
        issues.push(`发现AI惯用词：${word}`);
        suggestions.push(`将"${word}"替换为更口语的表达`);
        score -= 5;
      }
    }
    
    // 2. 检查情绪描写方式
    const emotionPatterns = [
      { pattern: /(他感到|她感到)/g, name: '感到+情绪词' },
      { pattern: /他的(心|内心)([很十分非常]+)/g, name: '内心描写过于抽象' },
      { pattern: /(此时此刻|就在此刻)/g, name: '时间泛化' },
    ];
    
    for (const { pattern, name } of emotionPatterns) {
      if (pattern.test(content)) {
        issues.push(`发现AI情绪描写模式：${name}`);
        suggestions.push('改为具体的身体反应或行为');
        score -= 8;
      }
    }
    
    // 3. 检查句子结构
    const sentences = content.split(/[。！？]/).filter(s => s.trim());
    const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    
    if (avgLength > 50) {
      issues.push(`平均句长过长：${avgLength.toFixed(0)}字`);
      suggestions.push('建议增加短句，紧张场景用短句');
      score -= 10;
    }
    
    // 4. 检查对话比例
    const quoteContent = content.match(/[""][^""]+[""]/g) || [];
    const dialogueRatio = quoteContent.join('').length / content.length;
    
    if (dialogueRatio < 0.2) {
      issues.push(`对话比例偏低：${(dialogueRatio * 100).toFixed(0)}%`);
      suggestions.push('建议对话占比30%-50%');
      score -= 10;
    }
    
    // 5. 检查段落长度（与 typesetting 舒适段长对齐）
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    const longParagraphs = paragraphs.filter(p => isLongParagraph(p));
    
    if (longParagraphs.length > paragraphs.length * 0.3) {
      issues.push(`长段落过多：${longParagraphs.length}/${paragraphs.length}`);
      suggestions.push(`建议拆分超过约 ${MAX_PARAGRAPH_CHARS} 字的段，保持 3～5 句一段`);
      score -= 8;
    }
    
    return {
      pass: score >= 70,
      score: Math.max(0, score),
      issues,
      suggestions,
    };
  }
  
  // ============================================================
  // 辅助方法
  // ============================================================
  
  /**
   * 情绪词转动作
   */
  private emotionToAction(emotion: string): string | null {
    const map: Record<string, string> = {
      '紧张': '手心冒汗',
      '害怕': '忍不住后退一步',
      '高兴': '嘴角上扬',
      '愤怒': '握紧拳头',
      '惊讶': '愣在原地',
      '感动': '眼眶微红',
      '伤心': '低下头',
      '得意': '眉梢上扬',
      '无奈': '叹了口气',
      '焦急': '来回踱步',
      '兴奋': '眼睛发亮',
      '尴尬': '挠了挠头',
      '不安': '坐立不安',
      '痛苦': '眉头紧皱',
      '欣慰': '露出笑容',
    };
    
    return map[emotion] || null;
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function usePolishAgent() {
  const agent = new PolishAgent();
  
  return {
    agent,
    polish: (content: string, taskBook: TaskBook) => 
      agent.polish(content, taskBook),
    checkAntiAI: (content: string) => agent.checkAntiAI(content),
  };
}
