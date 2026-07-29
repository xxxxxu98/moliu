import type { ValidationMetricSample, ValidationMetrics } from './types';

const ZERO_METRICS: ValidationMetrics = {
  chapterCount: 0,
  characterCount: 0,
  consistencyErrorCount: 0,
  cedPerTenThousandCharacters: 0,
  entityMentionCount: 0,
  unknownEntityCount: 0,
  unknownEntityRate: 0,
  stateCheckCount: 0,
  stateDriftCount: 0,
  stateDriftRate: 0,
  mustCoverCount: 0,
  mustCoverMissCount: 0,
  mustCoverMissRate: 0,
  incorrectFactCount: 0,
  incorrectFactStoredCount: 0,
  incorrectFactStorageRate: 0,
  retrievalSampleCount: 0,
  retrievalLatencyP50Ms: 0,
  retrievalLatencyP95Ms: 0,
  totalContextTokens: 0,
  averageContextTokens: 0,
  contextTokensP95: 0,
};

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index];
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} 必须是非负安全整数`);
  }
}

function validateSample(sample: ValidationMetricSample): void {
  const integerFields: Array<[number, string]> = [
    [sample.chapterNumber, 'chapterNumber'],
    [sample.characterCount, 'characterCount'],
    [sample.consistencyErrorCount, 'consistencyErrorCount'],
    [sample.entityMentionCount, 'entityMentionCount'],
    [sample.unknownEntityCount, 'unknownEntityCount'],
    [sample.stateCheckCount, 'stateCheckCount'],
    [sample.stateDriftCount, 'stateDriftCount'],
    [sample.mustCoverCount, 'mustCoverCount'],
    [sample.mustCoverMissCount, 'mustCoverMissCount'],
    [sample.incorrectFactCount, 'incorrectFactCount'],
    [sample.incorrectFactStoredCount, 'incorrectFactStoredCount'],
    [sample.contextTokens, 'contextTokens'],
  ];
  for (const [value, field] of integerFields) {
    assertNonNegativeInteger(value, field);
  }

  if (sample.chapterNumber === 0) {
    throw new RangeError('chapterNumber 必须从 1 开始');
  }
  if (sample.unknownEntityCount > sample.entityMentionCount) {
    throw new RangeError('unknownEntityCount 不能超过 entityMentionCount');
  }
  if (sample.stateDriftCount > sample.stateCheckCount) {
    throw new RangeError('stateDriftCount 不能超过 stateCheckCount');
  }
  if (sample.mustCoverMissCount > sample.mustCoverCount) {
    throw new RangeError('mustCoverMissCount 不能超过 mustCoverCount');
  }
  if (sample.incorrectFactStoredCount > sample.incorrectFactCount) {
    throw new RangeError('incorrectFactStoredCount 不能超过 incorrectFactCount');
  }
  for (const latency of sample.retrievalLatencyMs) {
    if (!Number.isFinite(latency) || latency < 0) {
      throw new RangeError('retrievalLatencyMs 必须是非负有限数');
    }
  }
}

/**
 * 流式聚合指标。除计算分位数所需的延迟与 token 样本外，不保留章节正文或运行时结果。
 */
export class ValidationMetricsCollector {
  private chapterCount = 0;
  private characterCount = 0;
  private consistencyErrorCount = 0;
  private entityMentionCount = 0;
  private unknownEntityCount = 0;
  private stateCheckCount = 0;
  private stateDriftCount = 0;
  private mustCoverCount = 0;
  private mustCoverMissCount = 0;
  private incorrectFactCount = 0;
  private incorrectFactStoredCount = 0;
  private totalContextTokens = 0;
  private readonly retrievalLatencies: number[] = [];
  private readonly contextTokenSamples: number[] = [];

  add(sample: ValidationMetricSample): void {
    validateSample(sample);
    this.chapterCount += 1;
    this.characterCount += sample.characterCount;
    this.consistencyErrorCount += sample.consistencyErrorCount;
    this.entityMentionCount += sample.entityMentionCount;
    this.unknownEntityCount += sample.unknownEntityCount;
    this.stateCheckCount += sample.stateCheckCount;
    this.stateDriftCount += sample.stateDriftCount;
    this.mustCoverCount += sample.mustCoverCount;
    this.mustCoverMissCount += sample.mustCoverMissCount;
    this.incorrectFactCount += sample.incorrectFactCount;
    this.incorrectFactStoredCount += sample.incorrectFactStoredCount;
    this.totalContextTokens += sample.contextTokens;
    this.retrievalLatencies.push(...sample.retrievalLatencyMs);
    this.contextTokenSamples.push(sample.contextTokens);
  }

  getMetrics(): ValidationMetrics {
    if (this.chapterCount === 0) {
      return { ...ZERO_METRICS };
    }

    return {
      chapterCount: this.chapterCount,
      characterCount: this.characterCount,
      consistencyErrorCount: this.consistencyErrorCount,
      cedPerTenThousandCharacters: divide(
        this.consistencyErrorCount * 10_000,
        this.characterCount
      ),
      entityMentionCount: this.entityMentionCount,
      unknownEntityCount: this.unknownEntityCount,
      unknownEntityRate: divide(this.unknownEntityCount, this.entityMentionCount),
      stateCheckCount: this.stateCheckCount,
      stateDriftCount: this.stateDriftCount,
      stateDriftRate: divide(this.stateDriftCount, this.stateCheckCount),
      mustCoverCount: this.mustCoverCount,
      mustCoverMissCount: this.mustCoverMissCount,
      mustCoverMissRate: divide(this.mustCoverMissCount, this.mustCoverCount),
      incorrectFactCount: this.incorrectFactCount,
      incorrectFactStoredCount: this.incorrectFactStoredCount,
      incorrectFactStorageRate: divide(
        this.incorrectFactStoredCount,
        this.incorrectFactCount
      ),
      retrievalSampleCount: this.retrievalLatencies.length,
      retrievalLatencyP50Ms: percentile(this.retrievalLatencies, 0.5),
      retrievalLatencyP95Ms: percentile(this.retrievalLatencies, 0.95),
      totalContextTokens: this.totalContextTokens,
      averageContextTokens: divide(this.totalContextTokens, this.chapterCount),
      contextTokensP95: percentile(this.contextTokenSamples, 0.95),
    };
  }
}

export function aggregateValidationMetrics(
  samples: Iterable<ValidationMetricSample>
): ValidationMetrics {
  const collector = new ValidationMetricsCollector();
  for (const sample of samples) {
    collector.add(sample);
  }
  return collector.getMetrics();
}
