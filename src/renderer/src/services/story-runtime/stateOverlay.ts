import type {
  JsonValue,
  ProvisionalStateOverlay,
  StateDelta,
  StoryState,
} from '@/types/story-runtime';

function cloneState(state: StoryState): StoryState {
  return structuredClone(state);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function applyDelta(target: Record<string, unknown>, delta: StateDelta): void {
  const segments = delta.path.split('.').filter(Boolean);
  if (segments.length === 0) return;
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = asRecord(cursor[segment]);
    if (existing) {
      cursor = existing;
    } else {
      const next: Record<string, unknown> = {};
      cursor[segment] = next;
      cursor = next;
    }
  }
  const key = segments[segments.length - 1];
  if (delta.operation === 'remove') {
    delete cursor[key];
    return;
  }
  if (delta.operation === 'increment') {
    const current = typeof cursor[key] === 'number' ? cursor[key] : 0;
    const increment = typeof delta.value === 'number' ? delta.value : 1;
    cursor[key] = current + increment;
    return;
  }
  if (delta.operation === 'add' && Array.isArray(cursor[key])) {
    (cursor[key] as unknown[]).push(delta.value);
    return;
  }
  cursor[key] = delta.value as JsonValue;
}

export function applyProvisionalOverlay(
  state: StoryState,
  overlay?: ProvisionalStateOverlay
): StoryState {
  if (!overlay) return cloneState(state);
  if (overlay.baseChapter !== state.chapter) {
    throw new Error(
      `provisional overlay 基线章节 ${overlay.baseChapter} 与当前状态 ${state.chapter} 不一致`
    );
  }
  const result = cloneState(state);
  for (const delta of overlay.deltas) {
    applyDelta(result as unknown as Record<string, unknown>, delta);
  }
  result.events.push(...overlay.events.map(event => ({ ...event, provisional: true })));
  return result;
}
