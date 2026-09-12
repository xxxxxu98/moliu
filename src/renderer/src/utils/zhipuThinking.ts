import { readPositiveIntEnv } from './env';

/**
 * 智谱 glm 系深度思考默认全开：实测（2026-09-09 coding 端点探测）思考开时
 * 300 字小场景也要先烧 1000+ reasoning tokens 才出正文，管线 scene-draft 单次
 * 10 分钟、整章 25-35 分钟，200 章长跑物理上跑不完；关思考后同请求 13.8s
 * 出全文且质量正常（usage.reasoning_tokens=0）。所有指向智谱端点的请求统一
 * 注入 thinking:{type:'disabled'}。
 * 逃生口：MOLIU_ZHIPU_KEEP_THINKING=1 恢复思考。
 */
export function shouldDisableZhipuThinking(baseUrl: string | undefined): boolean {
  if (readPositiveIntEnv('MOLIU_ZHIPU_KEEP_THINKING') === 1) return false;
  return /open\.bigmodel\.cn/iu.test(baseUrl ?? '');
}
