import { readFileSync, writeFileSync } from 'node:fs';

// ---- 1) Pipeline:映射 AI 命运 delta 并传给记忆投影 ----
{
  const p = 'src/renderer/src/services/writing/ChapterWritingPipeline.ts';
  let t = readFileSync(p, 'utf8');
  const oldCall = [
    '      // 记忆属于 accepted commit 的持久化投影，必须等待完成后再确认 outbox。',
    '      // 它不改变 canonical commit 的成功状态；失败会留在 outbox，供健康检查和后续重试发现。',
    '      try {',
    '        await this.memoryClient?.extractAndSave(input.chapter.id, chapterNumber, prose);',
  ].join('\r\n');
  const newCall = [
    '      // 记忆属于 accepted commit 的持久化投影，必须等待完成后再确认 outbox。',
    '      // 它不改变 canonical commit 的成功状态；失败会留在 outbox，供健康检查和后续重试发现。',
    '      // AI 提取的状态 delta（命运宣告必出账，契约 7-10）随投影穿透进章记忆——',
    '      // 章记忆是状态摘要/禁入名单/台账驱动 triage 的唯一读模型，规则提取不产命运账（2026-09-02）。',
    '      const aiStateChanges = mapStatusDeltasToStateChanges(result.facts, state);',
    '      try {',
    '        await this.memoryClient?.extractAndSave(input.chapter.id, chapterNumber, prose, aiStateChanges);',
  ].join('\r\n');
  if (!t.includes(oldCall)) throw new Error('pipeline call not found');
  t = t.replace(oldCall, newCall);

  // 加映射函数（文件内 helper 区：放 class 外部文件尾）
  const helper = [
    '',
    '/**',
    ' * AI 事实提取的 attributes.status delta → 章记忆状态变化条目。',
    ' * 命运账的唯一来源（规则词表塔已退役）；evidence 即台账证据句。',
    ' */',
    'function mapStatusDeltasToStateChanges(',
    '  facts: LongFormWriteResult[\'facts\'],',
    '  state: StoryState,',
  '): CharacterStateChange[] {',
    '  const out: CharacterStateChange[] = [];',
    '  for (const delta of facts?.deltas ?? []) {',
    '    const path = String(delta?.path || \'\');',
    '    if (!path.endsWith(\'.attributes.status\')) continue;',
    '    const entityId = path.split(\'.\')[1] ?? \'\';',
    '    const entity = state?.entities?.[entityId];',
    '    const name = String(entity?.name || entityId).trim();',
    '    if (!name) continue;',
    '    const value = String((delta as { value?: unknown }).value ?? \'\').trim();',
    '    if (!value) continue;',
    '    out.push({',
    '      characterName: name,',
    '      stateType: \'status\',',
    '      state: value,',
    '      detail: String(',
    '        Array.isArray((delta as { evidence?: unknown }).evidence)',
    '          ? ((delta as { evidence?: string[] }).evidence ?? []).join(\' \')',
    '          : (delta as { evidence?: string }).evidence ?? \'\',',
    '      ).slice(0, 160),',
    '    });',
    '  }',
    '  return out;',
    '}',
  ].join('\r\n');
  t = t.trimEnd() + '\r\n' + helper + '\r\n';
  console.log('pipeline patched (types imported via Edit tool)');
  writeFileSync(p, t, 'utf8');
}
