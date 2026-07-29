/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateDirectionsMock = vi.fn();
const expandDirectionMock = vi.fn();

vi.mock('@/services/outline/generators/unified-generator', () => ({
  UnifiedOutlineGenerator: class {
    generateDirections = generateDirectionsMock;
    expandDirection = expandDirectionMock;
    generate = vi.fn();
  },
}));

vi.mock('@/composables/useActiveAIProvider', () => ({
  useActiveAIProvider: () => ({
    requireAIService: vi.fn(),
    currentModel: { value: 'test-model' },
  }),
}));

describe('useOutlineGenerator.cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancel aborts in-flight direction generation without writing error', async () => {
    const { useOutlineGenerator } = await import('../useOutlineGenerator');

    let rejectWithAbort: ((err: Error) => void) | null = null;
    generateDirectionsMock.mockImplementation(
      (_prompt: string, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          rejectWithAbort = reject;
          options.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const generator = useOutlineGenerator();
    const pending = generator.generateDirections('一个都市逆袭故事');

    expect(generator.isGenerating.value).toBe(true);

    generator.cancel();

    expect(generator.isGenerating.value).toBe(false);
    expect(generator.wasCancelled.value).toBe(true);
    expect(generator.error.value).toBeNull();
    expect(generator.progress.value).toBe('');

    const result = await pending;
    expect(result).toEqual([]);
    expect(generator.error.value).toBeNull();
    expect(rejectWithAbort).not.toBeNull();
  });
});
