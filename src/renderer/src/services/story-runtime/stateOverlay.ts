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

/**
 * knowledge.<knower>[.<fact>] 的契约防线：knowledge 是 Record<entityId, string[]>。
 * 模型常把 value 写成 true/对象（真实案例：knowledge.char-x.火焰纹一致 → value:true），
 * 或对未初始化的 knower 用 add（applyDelta 的 add 只对已存在数组生效，否则退化为标量赋值）。
 * 这里统一折叠为「knower 知道了哪些事实」的字符串数组写回，标量/对象一律不许进入。
 */
function applyKnowledgeDelta(
  knowledge: Record<string, string[]>,
  delta: StateDelta,
): void {
  const segments = delta.path.split('.').filter(Boolean);
  const knower = segments[1];
  if (!knower) return;

  if (delta.operation === 'remove' && segments.length === 2) {
    delete knowledge[knower];
    return;
  }

  const existing = Array.isArray(knowledge[knower]) ? knowledge[knower] : [];
  // set（两段）= 整体替换该 knower 的事实表；其余（add / 三段路径）= 在现有基础上追加
  const facts = new Set<string>(
    segments.length === 2 && delta.operation === 'set' ? [] : existing,
  );

  const addFact = (fact: unknown): void => {
    if (typeof fact === 'string' && fact.trim()) {
      facts.add(fact.trim());
    }
  };
  const removeFact = (fact: unknown): void => {
    if (typeof fact === 'string' && fact.trim()) {
      facts.delete(fact.trim());
    }
  };

  if (segments.length >= 3) {
    // knowledge.<knower>.<fact>：事实在 path 里，value 无意义
    const fact = segments.slice(2).join('.');
    if (delta.operation === 'remove') {
      removeFact(fact);
    } else {
      addFact(fact);
    }
  } else if (delta.operation === 'remove') {
    removeFact(delta.value);
  } else if (typeof delta.value === 'string') {
    addFact(delta.value);
  } else if (Array.isArray(delta.value)) {
    for (const item of delta.value) addFact(item);
  } else if (delta.value && typeof delta.value === 'object') {
    // {事实A: true, 事实B: "某章得知"} → key 即事实
    for (const factKey of Object.keys(delta.value as Record<string, unknown>)) {
      addFact(factKey);
    }
  }

  if (facts.size > 0) {
    knowledge[knower] = [...facts];
  } else {
    delete knowledge[knower];
  }
}

function applyDelta(target: Record<string, unknown>, delta: StateDelta): void {
  const segments = delta.path.split('.').filter(Boolean);
  if (segments.length === 0) return;
  // knowledge.* 走契约专道，禁止通用赋值把标量/对象写进 string[] 字段
  if (segments[0] === 'knowledge') {
    const knowledge = asRecord(target.knowledge) ?? {};
    target.knowledge = knowledge;
    applyKnowledgeDelta(knowledge as Record<string, string[]>, delta);
    return;
  }
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
