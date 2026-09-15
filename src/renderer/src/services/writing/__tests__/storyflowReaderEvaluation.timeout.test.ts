/**
 * 读者评审超时熔断回归（2026-09-14 g38f200r4 实证根因）：
 * 网关流式挂起形态（连接活着、数据停滞、永不返回）下，裸 await 会把闭环测试拖到
 * vitest 24h 超时墙——该轮 200 章写作完成后，读者评审挂死 8 小时被人为止损。
 * 守卫语义：withDeadline 在阈值后 reject（错误进既有 catch → errors），不无限等待。
 * 注：不做挂起服务器的全链路集成测——resolveReaderJudgeConfig 会读
 * temp/continue-write.real.config.json 的真实网关配置，fixture 的 baseUrl 被覆盖，
 * 请求会打到真网关不可控；语义由本单测 + 真实冒烟回归覆盖。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withDeadline } from './storyflowReaderEvaluation';

describe('读者评审超时熔断 withDeadline', () => {
  const prevTimeout = process.env.MOLIU_READER_EVAL_REQUEST_TIMEOUT_MS;

  beforeEach(() => {
    process.env.MOLIU_READER_EVAL_REQUEST_TIMEOUT_MS = '150';
  });

  afterEach(() => {
    if (prevTimeout === undefined) delete process.env.MOLIU_READER_EVAL_REQUEST_TIMEOUT_MS;
    else process.env.MOLIU_READER_EVAL_REQUEST_TIMEOUT_MS = prevTimeout;
  });

  it('挂起 promise（永不 resolve）在阈值后被 reject，错误信息带超时字样与标签', async () => {
    const never = new Promise<string>((resolve) => {
      void resolve; // 永不 resolve：流式挂起形态
    });
    const startedAt = Date.now();
    await expect(withDeadline(never, '第1章读者评审')).rejects.toThrow(
      /评审请求超时（150ms）：第1章读者评审/
    );
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it('正常 promise 不受影响，原值返回且不被计时器拖住', async () => {
    await expect(withDeadline(Promise.resolve('ok'), '正常请求')).resolves.toBe('ok');
  });
});
