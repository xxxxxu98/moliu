import type { StoryEntity } from '@/types/story-runtime';

/**
 * 中文「姓氏 + 称谓」实体消歧。
 *
 * 背景：同一角色在正文里常以本名与称号两种形式出现（宋怀远/宋教授、
 * 周荣成/周老板、杜长青/杜院士）。事实抽取按字面称呼找实体，别名表为空时
 * 「宋教授」miss → 新建 char:intro 卡 → 人物表出现同一人的两张卡，
 * ContinuityValidator 的未知实体 warning 与检索都随之失真。
 *
 * 规则（保守，宁可不合并也不误合并）：
 * 1. 姓氏 + 纯称谓后缀（宋教授/周老板/杜院士）→ 唯一同姓候选才合并；
 * 2. 老/小/阿 + 姓（老林/小顾）→ 同上；
 * 3. 多个同姓候选 → 歧义，返回 undefined（走原 intro 路径）。
 */

/** 纯称谓后缀词表：命中即认为 ref 是「姓 + 称谓」而非独立人名 */
const TITLE_SUFFIXES = new Set([
  '教授', '院士', '老师', '先生', '女士', '老板', '老板娘', '老汉', '老师傅',
  '所长', '队长', '局长', '厅长', '处长', '科长', '科长', '主任', '书记', '政委',
  '部长', '省长', '市长', '县长', '局长', '警司', '督察', '巡检', '法医', '医生',
  '大夫', '护士', '师傅', '大师', '大叔', '大爷', '大妈', '大娘', '大哥', '大姐',
  '大哥', '老爷子', '老太太', '小姐', '姑娘', '少爷', '掌柜', '管家', '行长',
  '团长', '营长', '连长', '排长', '班长', '参谋', '干事', '专员', '专家', '特派员',
  '总', '工', '帅', '将', '侯', '公', '卿', '大人', '殿下', '陛下', '阁下',
]);

/** 单字姓氏前缀（老/小/阿 + 姓） */
const SURNAME_PREFIXES = new Set(['老', '小', '阿']);

function isCJK(value: string): boolean {
  return /^[\u4e00-\u9fff]+$/u.test(value);
}

function splitSurnameAndTitle(ref: string): { surname: string; prefix?: string } | null {
  if (!isCJK(ref) || ref.length < 2) return null;

  // 形态 2：老林 / 小顾 / 阿伟
  if (SURNAME_PREFIXES.has(ref[0]) && ref.length === 2) {
    return { surname: ref[1], prefix: ref[0] };
  }
  // 形态 1：宋教授 / 周老板 / 张老汉——首字为姓，其余必须全命中称谓词表
  const surname = ref[0];
  let rest = ref.slice(1);
  while (rest.length > 0) {
    const matched = [...TITLE_SUFFIXES].find(suffix => rest.startsWith(suffix));
    if (!matched) return null;
    rest = rest.slice(matched.length);
  }
  return rest.length === 0 ? { surname } : null;
}

/**
 * 在既有实体中找 ref 的同源角色（姓 + 称谓形态）。
 * @returns 唯一候选的实体 id；无候选或多候选（歧义）返回 undefined。
 */
export function matchBySurnameAndTitle(
  ref: string,
  entities: Iterable<StoryEntity>
): string | undefined {
  const parsed = splitSurnameAndTitle(ref.trim());
  if (!parsed) return undefined;

  const candidates: string[] = [];
  for (const entity of entities) {
    if (entity.kind !== 'character') continue;
    const name = entity.name?.trim();
    // 中文本名：首字为姓。姓与被解析姓氏一致才入候选。
    if (!name || !isCJK(name) || name.length < 2) continue;
    if (name[0] !== parsed.surname) continue;
    // 称谓形态本身（如实体名就叫「周老板」）不算候选，跳过同构
    if (splitSurnameAndTitle(name)) continue;
    candidates.push(entity.id);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
