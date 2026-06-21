/**
 * L4 生成层 - 模型路由器
 *
 * 职责：按"角色"分配不同模型 + 参数。
 *   - planner: 规划任务书（稳定优先，temperature 低）
 *   - drafter: 散文写作（创意优先，temperature 中）
 *   - gate: 门禁审查（确定性优先，temperature 极低 + 便宜模型）
 *   - embedding: 向量嵌入（专用模型）
 *   - reviewer: 综合审查（平衡）
 *
 * 实际生产可在配置中按角色选模型（如 drafter=gpt-4o, gate=gpt-4o-mini），
 * 节省成本同时保证质量。
 */

export type ModelRole = 'planner' | 'drafter' | 'gate' | 'embedding' | 'reviewer';

export interface ModelParameters {
  temperature: number;
  maxTokens: number;
}

export interface ModelRoutingConfig {
  /** 角色 → 模型名映射（未配置的角色用默认） */
  models: Partial<Record<ModelRole, string>>;
  /** 角色 → 生成参数 */
  params: Partial<Record<ModelRole, ModelParameters>>;
}

export const DEFAULT_ROUTING_CONFIG: ModelRoutingConfig = {
  models: {
    planner: undefined,    // 用默认模型
    drafter: undefined,
    gate: undefined,       // G7 审查用便宜模型
    embedding: undefined,
    reviewer: undefined,
  },
  params: {
    planner: { temperature: 0.3, maxTokens: 2000 },   // 规划要稳定
    drafter: { temperature: 0.7, maxTokens: 8000 },   // 写作要有创意
    gate: { temperature: 0.1, maxTokens: 2000 },      // 审查要确定
    reviewer: { temperature: 0.2, maxTokens: 3000 },
    embedding: { temperature: 0, maxTokens: 0 },
  },
};

export const DEFAULT_MODEL_PARAMS: ModelParameters = { temperature: 0.5, maxTokens: 4000 };

export class ModelRouter {
  private config: ModelRoutingConfig;
  private defaultModel: string;

  constructor(defaultModel: string, config: Partial<ModelRoutingConfig> = {}) {
    this.defaultModel = defaultModel;
    this.config = { ...DEFAULT_ROUTING_CONFIG, ...config };
  }

  /** 获取角色对应的模型名。 */
  getModel(role: ModelRole): string {
    return this.config.models[role] ?? this.defaultModel;
  }

  /** 获取角色对应的生成参数。 */
  getParams(role: ModelRole): ModelParameters {
    return this.config.params[role] ?? DEFAULT_MODEL_PARAMS;
  }

  /** 更新配置（合并式）。 */
  updateConfig(config: Partial<ModelRoutingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
