/**
 * 伏笔追踪器
 * 基于 webnovel-writer-master 的伏笔管理系统
 * 
 * 伏笔追踪器负责：
 * - 管理伏笔的生命周期
 * - 追踪伏笔的提及和揭示
 * - 生成伏笔提示
 * - 检测伏笔遗漏
 */

import { ref, computed, shallowRef } from 'vue';
import type { ForeshadowContract, ForeshadowStatus } from '@/types/contract';

// ============================================================
// 类型定义
// ============================================================

export interface Foreshadow {
  id: string;
  hint: string;
  type: ForeshadowType;
  buriedChapter: number;
  plannedRevealChapter: number;
  actualRevealChapter?: number;
  status: ForeshadowStatus;
  mentions: number;
  lastMentionChapter: number;
  urgency: 'low' | 'medium' | 'high';
  importance: 'minor' | 'major' | 'critical';
  relatedForeshadows?: string[];
}

export type ForeshadowType = 'item' | 'dialogue' | 'event' | 'mystery' | 'character' | 'ability';

export interface ForeshadowReminder {
  foreshadowId: string;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
  suggestedChapter?: number;
}

export interface ForeshadowReport {
  totalForeshadows: number;
  byStatus: Record<ForeshadowStatus, number>;
  byType: Record<ForeshadowType, number>;
  overdueCount: number;
  forgottenCount: number;
  recommendations: string[];
}

export interface ForeshadowConfig {
  // 最大允许的未揭示伏笔数
  maxPendingForeshadows: number;
  // 提醒阈值（超过此章节数未提及则提醒）
  mentionThreshold: number;
  // 紧急揭示阈值
  urgentRevealThreshold: number;
  // 是否启用自动追踪
  autoTrack: boolean;
}

// ============================================================
// Composable 定义
// ============================================================

export function useForeshadowTracker() {
  // 配置
  const config = ref<ForeshadowConfig>({
    maxPendingForeshadows: 7,
    mentionThreshold: 5,
    urgentRevealThreshold: 15,
    autoTrack: true,
  });

  // 状态
  const foreshadows = shallowRef<Foreshadow[]>([]);
  const currentChapter = ref(1);
  const isTracking = ref(false);

  // 计算属性
  const activeForeshadows = computed(() => 
    foreshadows.value.filter(f => f.status !== 'revealed' && f.status !== 'forgotten')
  );

  const buriedForeshadows = computed(() => 
    foreshadows.value.filter(f => f.status === 'buried')
  );

  const developedForeshadows = computed(() => 
    foreshadows.value.filter(f => f.status === 'developed')
  );

  const overdueForeshadows = computed(() => {
    return foreshadows.value.filter(f => {
      if (f.status === 'revealed' || f.status === 'forgotten') return false;
      const chaptersSinceBurial = currentChapter.value - f.buriedChapter;
      return chaptersSinceBurial > config.value.urgentRevealThreshold;
    });
  });

  const forgottenForeshadows = computed(() => {
    return foreshadows.value.filter(f => {
      if (f.status !== 'buried' && f.status !== 'developed') return false;
      const chaptersSinceMention = currentChapter.value - f.lastMentionChapter;
      return chaptersSinceMention > config.value.mentionThreshold;
    });
  });

  // ============================================================
  // 伏笔管理
  // ============================================================

  /**
   * 添加伏笔
   */
  function addForeshadow(params: {
    hint: string;
    type: ForeshadowType;
    buriedChapter?: number;
    plannedRevealChapter?: number;
    urgency?: 'low' | 'medium' | 'high';
    importance?: 'minor' | 'major' | 'critical';
    relatedForeshadows?: string[];
  }): Foreshadow {
    const foreshadow: Foreshadow = {
      id: `fs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      hint: params.hint,
      type: params.type,
      buriedChapter: params.buriedChapter || currentChapter.value,
      plannedRevealChapter: params.plannedRevealChapter || 
        (currentChapter.value + config.value.urgentRevealThreshold),
      status: 'buried',
      mentions: 0,
      lastMentionChapter: params.buriedChapter || currentChapter.value,
      urgency: params.urgency || 'medium',
      importance: params.importance || 'major',
      relatedForeshadows: params.relatedForeshadows,
    };

    foreshadows.value = [...foreshadows.value, foreshadow];
    return foreshadow;
  }

  /**
   * 批量添加伏笔
   */
  function addForeshadows(items: Parameters<typeof addForeshadow>[0][]): Foreshadow[] {
    return items.map(item => addForeshadow(item));
  }

  /**
   * 更新伏笔状态
   */
  function updateStatus(
    foreshadowId: string,
    status: ForeshadowStatus,
    actualRevealChapter?: number
  ): void {
    foreshadows.value = foreshadows.value.map(f => {
      if (f.id === foreshadowId) {
        return {
          ...f,
          status,
          actualRevealChapter: status === 'revealed' 
            ? (actualRevealChapter || currentChapter.value)
            : f.actualRevealChapter,
        };
      }
      return f;
    });
  }

  /**
   * 埋葬伏笔
   */
  function bury(foreshadowId: string): void {
    updateStatus(foreshadowId, 'buried');
  }

  /**
   * 发展伏笔
   */
  function develop(foreshadowId: string): void {
    updateStatus(foreshadowId, 'developed');
  }

  /**
   * 揭示伏笔
   */
  function reveal(foreshadowId: string, chapter?: number): void {
    updateStatus(foreshadowId, 'revealed', chapter);
  }

  /**
   * 遗忘伏笔
   */
  function forget(foreshadowId: string): void {
    updateStatus(foreshadowId, 'forgotten');
  }

  /**
   * 提及伏笔
   */
  function mention(foreshadowId: string, chapter?: number): void {
    const ch = chapter || currentChapter.value;
    
    foreshadows.value = foreshadows.value.map(f => {
      if (f.id === foreshadowId) {
        // 如果之前是 buried，改为 developed
        const newStatus = f.status === 'buried' ? 'developed' : f.status;
        return {
          ...f,
          status: newStatus,
          mentions: f.mentions + 1,
          lastMentionChapter: ch,
        };
      }
      return f;
    });
  }

  /**
   * 删除伏笔
   */
  function removeForeshadow(foreshadowId: string): void {
    foreshadows.value = foreshadows.value.filter(f => f.id !== foreshadowId);
  }

  // ============================================================
  // 查询
  // ============================================================

  /**
   * 获取伏笔
   */
  function getForeshadow(foreshadowId: string): Foreshadow | undefined {
    return foreshadows.value.find(f => f.id === foreshadowId);
  }

  /**
   * 获取指定章节的伏笔
   */
  function getForeshadowsByChapter(chapter: number): Foreshadow[] {
    return foreshadows.value.filter(
      f => f.buriedChapter === chapter || 
           f.plannedRevealChapter === chapter ||
           f.actualRevealChapter === chapter
    );
  }

  /**
   * 获取即将揭示的伏笔
   */
  function getUpcomingReveals(chapter: number, range: number = 5): Foreshadow[] {
    return foreshadows.value.filter(f => {
      if (f.status === 'revealed' || f.status === 'forgotten') return false;
      const diff = f.plannedRevealChapter - chapter;
      return diff >= 0 && diff <= range;
    });
  }

  /**
   * 获取相关伏笔
   */
  function getRelatedForeshadows(foreshadowId: string): Foreshadow[] {
    const foreshadow = getForeshadow(foreshadowId);
    if (!foreshadow || !foreshadow.relatedForeshadows) return [];
    
    return foreshadow.relatedForeshadows
      .map(id => getForeshadow(id))
      .filter((f): f is Foreshadow => f !== undefined);
  }

  // ============================================================
  // 追踪
  // ============================================================

  /**
   * 分析内容中的伏笔
   */
  function analyzeContent(content: string, chapter: number): string[] {
    const foundIds: string[] = [];
    
    for (const foreshadow of foreshadows.value) {
      if (foreshadow.status === 'revealed' || foreshadow.status === 'forgotten') continue;
      
      // 简单的关键词匹配
      const keywords = extractKeywords(foreshadow.hint);
      const hasMatch = keywords.some(keyword => content.includes(keyword));
      
      if (hasMatch) {
        foundIds.push(foreshadow.id);
        mention(foreshadow.id, chapter);
      }
    }

    return foundIds;
  }

  /**
   * 提取关键词
   */
  function extractKeywords(text: string): string[] {
    // 简单分词
    const words = text.split(/[,，、。！？；]/).filter(w => w.length >= 2);
    return words;
  }

  /**
   * 检测遗忘的伏笔
   */
  function detectForgottenForeshadows(): ForeshadowReminder[] {
    const reminders: ForeshadowReminder[] = [];

    for (const f of foreshadows.value) {
      if (f.status === 'revealed' || f.status === 'forgotten') continue;
      
      const chaptersSinceMention = currentChapter.value - f.lastMentionChapter;
      const chaptersSinceBurial = currentChapter.value - f.buriedChapter;
      
      if (chaptersSinceMention > config.value.mentionThreshold) {
        reminders.push({
          foreshadowId: f.id,
          reason: `已经${chaptersSinceMention}章未提及`,
          urgency: chaptersSinceMention > config.value.urgentRevealThreshold ? 'high' : 'medium',
          suggestedChapter: f.plannedRevealChapter,
        });
      }
    }

    return reminders.sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  }

  /**
   * 生成伏笔报告
   */
  function generateReport(): ForeshadowReport {
    const byStatus: Record<ForeshadowStatus, number> = {
      buried: 0,
      developed: 0,
      revealed: 0,
      forgotten: 0,
    };

    const byType: Record<ForeshadowType, number> = {
      item: 0,
      dialogue: 0,
      event: 0,
      mystery: 0,
      character: 0,
      ability: 0,
    };

    for (const f of foreshadows.value) {
      byStatus[f.status]++;
      byType[f.type]++;
    }

    const recommendations: string[] = [];

    if (overdueForeshadows.value.length > 0) {
      recommendations.push(`有${overdueForeshadows.value.length}个伏笔已超过揭示时限`);
    }

    if (forgottenForeshadows.value.length > 0) {
      recommendations.push(`有${forgottenForeshadows.value.length}个伏笔长期未提及`);
    }

    if (activeForeshadows.value.length > config.value.maxPendingForeshadows) {
      recommendations.push(`活跃伏笔数量（${activeForeshadows.value.length}）超过建议上限`);
    }

    return {
      totalForeshadows: foreshadows.value.length,
      byStatus,
      byType,
      overdueCount: overdueForeshadows.value.length,
      forgottenCount: forgottenForeshadows.value.length,
      recommendations,
    };
  }

  // ============================================================
  // 导出/导入
  // ============================================================

  /**
   * 导出伏笔数据
   */
  function exportData(): Foreshadow[] {
    return foreshadows.value;
  }

  /**
   * 导入伏笔数据
   */
  function importData(data: Foreshadow[]): void {
    foreshadows.value = data;
  }

  /**
   * 从合同导入伏笔
   */
  function importFromContracts(contracts: ForeshadowContract[]): void {
    const newForeshadows: Foreshadow[] = contracts.map(c => ({
      id: c.id,
      hint: c.hint,
      type: c.type,
      buriedChapter: c.buriedChapter,
      plannedRevealChapter: c.revealChapter,
      actualRevealChapter: c.status === 'revealed' ? c.revealChapter : undefined,
      status: c.status,
      mentions: 0,
      lastMentionChapter: c.buriedChapter,
      urgency: 'medium',
      importance: 'major',
    }));

    foreshadows.value = newForeshadows;
  }

  /**
   * 导出为合同格式
   */
  function exportToContracts(): ForeshadowContract[] {
    return foreshadows.value.map(f => ({
      id: f.id,
      hint: f.hint,
      type: f.type,
      buriedChapter: f.buriedChapter,
      revealChapter: f.actualRevealChapter || f.plannedRevealChapter,
      status: f.status,
    }));
  }

  // ============================================================
  // 配置
  // ============================================================

  /**
   * 更新配置
   */
  function updateConfig(updates: Partial<ForeshadowConfig>): void {
    config.value = { ...config.value, ...updates };
  }

  /**
   * 更新当前章节
   */
  function setCurrentChapter(chapter: number): void {
    currentChapter.value = chapter;
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 配置
    config,
    updateConfig,
    setCurrentChapter,

    // 状态
    foreshadows,
    currentChapter,
    isTracking,

    // 计算属性
    activeForeshadows,
    buriedForeshadows,
    developedForeshadows,
    overdueForeshadows,
    forgottenForeshadows,

    // 伏笔管理
    addForeshadow,
    addForeshadows,
    updateStatus,
    bury,
    develop,
    reveal,
    forget,
    mention,
    removeForeshadow,

    // 查询
    getForeshadow,
    getForeshadowsByChapter,
    getUpcomingReveals,
    getRelatedForeshadows,

    // 追踪
    analyzeContent,
    detectForgottenForeshadows,
    generateReport,

    // 导出/导入
    exportData,
    importData,
    importFromContracts,
    exportToContracts,
  };
}
