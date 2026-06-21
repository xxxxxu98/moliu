/**
 * L3 上下文层 - 优先级策略
 *
 * 决定各类信息在 prompt 里的：
 * 1. 优先级（超预算时谁先被淘汰）
 * 2. 注入位置（开头/中段/结尾，对抗 Lost-in-the-Middle）
 * 3. 预算占比
 */

// ============================================================
// 上下文块类型
// ============================================================

export type ContextBlockType =
  | 'state_snapshot'      // 状态快照（权威事实表）
  | 'current_outline'     // 当前章 + 邻章细纲
  | 'retrieved_fragments' // RAG 检索召回片段
  | 'writing_rules'       // 写作规范（去AI味/对话格式）
  | 'enhanced_design'     // 增强设计（情绪/矛盾/爽点）
  | 'user_instructions'   // 用户自定义指令
  | 'changes_protocol'    // CHANGES 协议说明
  | 'previous_chapter'    // 前章衔接信息
  | 'foreshadows'         // 活跃伏笔清单
  | 'history';            // 对话历史

// ============================================================
// 注入位置
// ============================================================

export type InjectionPosition = 'head' | 'middle' | 'tail';

// ============================================================
// 块优先级配置
// ============================================================

export interface BlockPriorityConfig {
  /** 块类型 */
  type: ContextBlockType;
  /** 显示名称 */
  label: string;
  /** 优先级：数字越小越重要（越不容易被淘汰） */
  priority: number;
  /** 预算占比（占输入预算的比例，0-1） */
  budgetRatio: number;
  /** 注入位置 */
  position: InjectionPosition;
  /** 最小保留 token（即使超预算也至少保留这么多） */
  minTokens?: number;
  /** 最大允许 token（即使预算充足也不超过） */
  maxTokens?: number;
}

// ============================================================
// 默认优先级策略
// ============================================================

export const DEFAULT_PRIORITY_POLICY: BlockPriorityConfig[] = [
  {
    type: 'state_snapshot',
    label: '状态快照（权威事实表）',
    priority: 0,  // 最高优先
    budgetRatio: 0.20,
    position: 'head',
    minTokens: 500,
  },
  {
    type: 'changes_protocol',
    label: 'CHANGES 协议说明',
    priority: 1,
    budgetRatio: 0.05,
    position: 'tail',  // 协议要求放结尾，模型最关注
    minTokens: 300,
  },
  {
    type: 'current_outline',
    label: '当前章 + 邻章细纲',
    priority: 2,
    budgetRatio: 0.15,
    position: 'head',
    minTokens: 400,
  },
  {
    type: 'writing_rules',
    label: '写作规范',
    priority: 3,
    budgetRatio: 0.15,
    position: 'tail',
    minTokens: 300,
  },
  {
    type: 'enhanced_design',
    label: '增强设计（情绪/矛盾/爽点）',
    priority: 4,
    budgetRatio: 0.10,
    position: 'head',
  },
  {
    type: 'retrieved_fragments',
    label: 'RAG 检索召回片段',
    priority: 5,
    budgetRatio: 0.35,
    position: 'middle',  // 容忍 Lost-in-the-Middle 衰减
  },
  {
    type: 'previous_chapter',
    label: '前章衔接',
    priority: 6,
    budgetRatio: 0.05,
    position: 'head',
  },
  {
    type: 'foreshadows',
    label: '活跃伏笔清单',
    priority: 7,
    budgetRatio: 0.05,
    position: 'head',
    minTokens: 200,
  },
  {
    type: 'user_instructions',
    label: '用户自定义指令',
    priority: 8,
    budgetRatio: 0.05,
    position: 'tail',
  },
  {
    type: 'history',
    label: '对话历史',
    priority: 9,  // 最低优先
    budgetRatio: 0.05,
    position: 'middle',
  },
];

// ============================================================
// 优先级策略类
// ============================================================

export class PriorityPolicy {
  private config: BlockPriorityConfig[];

  constructor(config: BlockPriorityConfig[] = DEFAULT_PRIORITY_POLICY) {
    this.config = [...config].sort((a, b) => a.priority - b.priority);
  }

  /** 获取所有块配置（按优先级升序）。 */
  getConfig(): BlockPriorityConfig[] {
    return [...this.config];
  }

  /** 获取指定类型块的配置。 */
  getBlockConfig(type: ContextBlockType): BlockPriorityConfig | undefined {
    return this.config.find(c => c.type === type);
  }

  /**
   * 在给定总预算下，计算每个块的实际 token 分配。
   *
   * 策略：
   * 1. 先按 budgetRatio 分配基础额度
   * 2. 应用 minTokens/maxTokens 约束
   * 3. 如果总和超预算，按 priority 降序淘汰低优先级块的额度
   * 4. 剩余预算回流给高优先级块
   */
  allocateBudget(totalBudget: number): Map<ContextBlockType, number> {
    const allocation = new Map<ContextBlockType, number>();

    // 1. 基础分配
    for (const block of this.config) {
      let amount = Math.floor(totalBudget * block.budgetRatio);
      if (block.minTokens !== undefined) amount = Math.max(amount, block.minTokens);
      if (block.maxTokens !== undefined) amount = Math.min(amount, block.maxTokens);
      allocation.set(block.type, amount);
    }

    // 2. 总和约束：如果超预算，从低优先级开始压缩
    let total = Array.from(allocation.values()).reduce((a, b) => a + b, 0);
    if (total > totalBudget) {
      // 从最低优先级（priority 数字最大）开始压缩
      const sortedDesc = [...this.config].sort((a, b) => b.priority - a.priority);
      for (const block of sortedDesc) {
        if (total <= totalBudget) break;
        const current = allocation.get(block.type)!;
        const minKeep = block.minTokens ?? 0;
        const overflow = total - totalBudget;
        const reducible = Math.max(0, current - minKeep);
        const reduce = Math.min(overflow, reducible);
        allocation.set(block.type, current - reduce);
        total -= reduce;
      }
    }

    // 3. 剩余预算回流给高优先级块（如果有结余）
    if (total < totalBudget) {
      const surplus = totalBudget - total;
      for (const block of this.config) {
        // 按优先级升序分配结余
        const current = allocation.get(block.type)!;
        const maxAllowed = block.maxTokens ?? Infinity;
        const addAmount = Math.min(surplus, maxAllowed - current);
        if (addAmount > 0) {
          allocation.set(block.type, current + addAmount);
        }
      }
    }

    return allocation;
  }

  /**
   * 按注入位置分组（head/middle/tail），用于 ContextAssembler 拼装。
   */
  groupByPosition(): Record<InjectionPosition, BlockPriorityConfig[]> {
    const groups: Record<InjectionPosition, BlockPriorityConfig[]> = {
      head: [],
      middle: [],
      tail: [],
    };
    for (const block of this.config) {
      groups[block.position].push(block);
    }
    // 每组内按优先级升序
    for (const pos of Object.keys(groups) as InjectionPosition[]) {
      groups[pos].sort((a, b) => a.priority - b.priority);
    }
    return groups;
  }
}
