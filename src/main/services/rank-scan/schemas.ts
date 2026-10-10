/**
 * rank:scan 的入参校验。
 *
 * 渲染进程只能传平台、受众、篇幅，不能传任意 URL。
 */

import { z } from 'zod';

/** rank:scan 入参。拒绝任意 URL，只留平台筛选 */
export const rankScanRequestSchema = z.object({
  platform: z.enum(['general', 'qidian', 'fanqie', 'jinjiang', 'qimao', 'zhihu']).optional(),
  audience: z.enum(['general', 'male', 'female']).optional(),
  length: z.enum(['long', 'short']).optional(),
});
