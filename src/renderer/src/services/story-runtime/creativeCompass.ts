/**
 * 创作罗盘与章内节拍的写作侧渲染。
 * 罗盘只从已有卖点、情绪、卷目标和开篇钩子拼一页，不另开一轮生成；
 * 旧书这些字段为空时返回空串，起草提示保持原样。
 */

export interface CreativeCompassSource {
  volumeObjective?: string;
  emotionPrimary?: string;
  sellingPoints?: Array<{ name?: string; description?: string }>;
  coolPoints?: string[];
  /** 只在前三章传入，避免后章被开篇钩子拖回去 */
  openingAnchor?: string;
  avoid?: string[];
}

/** 把已有书级信息收成写手开头的一页。四项都空则不注入。 */
export function renderCreativeCompass(source: CreativeCompassSource): string {
  const keep = [
    ...(source.sellingPoints ?? []).map(item =>
      [item.name?.trim(), item.description?.trim()].filter(Boolean).join('：'),
    ),
    ...(source.coolPoints ?? []),
  ]
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const goal = [source.volumeObjective, source.emotionPrimary]
    .map(item => (item ?? '').trim())
    .filter(Boolean)
    .join('；');
  const anchor = (source.openingAnchor ?? '').trim();
  const avoid = (source.avoid ?? []).map(item => item.trim()).filter(Boolean).slice(0, 4);
  if (!goal && keep.length === 0 && !anchor && avoid.length === 0) {
    return '';
  }
  const lines = ['【创作罗盘】这一页比本章节点更靠前：写法可以换，这本书在追的东西不能换。'];
  if (goal) lines.push(`阶段目标：${goal}`);
  if (keep.length > 0) lines.push(`必须保留：${keep.join('；')}`);
  if (avoid.length > 0) lines.push(`必须避免：${avoid.join('；')}`);
  if (anchor) lines.push(`开篇锚点：${anchor}`);
  return lines.join('\n');
}

/** 章内节拍写进起草/改稿提示。空数组不注入，旧书退回 CBN/CPN/CEN。 */
export function renderSceneBeatLines(sceneBeats: string[] | undefined): string[] {
  const beats = (sceneBeats ?? []).map(item => item.trim()).filter(Boolean).slice(0, 6);
  if (beats.length === 0) return [];
  return [
    '【章内节拍】按顺序演。前一步的结果是后一步的原因。开场写还没见分晓的动作，击杀、揭穿、爆炸、结案放在后段。',
    ...beats.map((beat, index) => `${index + 1}. ${beat}`),
  ];
}

/**
 * 从章节大纲的结构化块里抽出节拍。
 * 只认【节拍】字段的分隔，不做情节语义判断。
 */
export function extractSceneBeatsFromOutline(outline: string): string[] {
  const match = /【节拍】\s*([\s\S]*?)(?=\n【|\n---|$)/u.exec(outline);
  if (!match) return [];
  return match[1]
    .split(/[；;\n]/u)
    .map(item => item.replace(/^\s*\d+\s*[.、]\s*/u, '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

const FORBIDDEN_LEAD_RE = /^(?:不得|不许|禁止|不能|不可|勿)/u;

/**
 * 禁区与本章必须写下的节拍/章尾逐字撞车时，先退回蓝图。
 * 只做包含关系，不判断「这条禁区会不会把钩子拆掉」。
 */
export function findRequiredBeatForbiddenClash(
  required: string[],
  forbidden: string[],
): string | undefined {
  const beats = required.map(item => item.trim()).filter(item => item.length >= 6);
  for (const zone of forbidden) {
    const raw = zone.trim();
    if (!raw || raw.startsWith('【让路】')) continue;
    const core = raw.replace(FORBIDDEN_LEAD_RE, '').trim();
    if (core.length < 6) continue;
    for (const beat of beats) {
      if (beat.includes(core) || core.includes(beat)) {
        return `本章禁区「${raw}」和必须写下的节拍「${beat}」对撞，先改蓝图再写正文。`;
      }
    }
  }
  return undefined;
}
