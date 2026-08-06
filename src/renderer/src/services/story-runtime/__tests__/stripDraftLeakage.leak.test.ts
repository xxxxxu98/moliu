/**
 * @vitest-environment happy-dom
 *
 * P0 缺陷4回归（纵深防御层）：sanitizeSceneDraftParagraphs / sanitizeStructuredProseLeakage
 * 剥离段内残留的推理/安全审查标签碎片 + 段末 JSON 残片。
 *
 * 这是 json-parser 层1剥离漏网时的下游兜底——当 jsonrepair 已经把 <ds_safety> 块
 * 吸收成 paragraphs 字符串值后，这一层负责把残留从段落内截净。
 *
 * 真实样本来自 smoke:storyflow:real 两轮跑：
 * - ch4 末尾：「……得小心藏好。」}]} 字数为约 256 字。符合要求。直接输出 JSON…
 * - ch5 末尾：「议论声如沸鼎。」}]}。{ }。ăn <ds_safety>用户输入是网文续写任务…
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeSceneDraftParagraphs,
  sanitizeStructuredProseLeakage,
} from '../stripDraftLeakage';

describe('sanitizeSceneDraftParagraphs 推理标签 + JSON 残片清洗', () => {
  it('剥段末残留的 <ds_safety> 标签碎片（jsonrepair 吸收后的残留）', () => {
    const paragraphs = [
      '陈默回到司天监，继续完善水利方案。',
      '议论声如沸鼎。"}]}。{\n}。ăn  <ds_safety>用户输入是网文续写任务，内容完全围绕虚构的古代朝堂故事展开',
    ];
    const cleaned = sanitizeSceneDraftParagraphs(paragraphs);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0]).toBe('陈默回到司天监，继续完善水利方案。');
    // 第二段应截到中文标点处，剥掉 JSON 残片 + ds_safety 碎片
    expect(cleaned[1]).toBe('议论声如沸鼎。');
    expect(cleaned[1]).not.toContain('ds_safety');
    expect(cleaned[1]).not.toContain('用户输入');
    expect(cleaned[1]).not.toContain('ăn');
    expect(cleaned[1]).not.toContain('}]}');
  });

  it('剥段末 AI 自检思考链（"符合要求/直接输出 JSON" 类泄露）', () => {
    const paragraphs = [
      '真正的较量才刚刚开始，二皇子这枚棋子，得小心藏好。"}]} 字数为约 256 字。符合要求。没有 Markdown 代码块。直接输出 JSON。',
    ];
    const cleaned = sanitizeSceneDraftParagraphs(paragraphs);
    expect(cleaned).toEqual([
      '真正的较量才刚刚开始，二皇子这枚棋子，得小心藏好。',
    ]);
  });

  it('干净正文（无泄露）原样保留，不误伤', () => {
    const paragraphs = [
      '李默睁开眼，一股浓烈的腐臭味直冲鼻腔。',
      '他下意识想吐，但胃里空空，只翻出一阵酸水。',
      '系统提示："检测到关键物品：银票。"',
    ];
    const cleaned = sanitizeSceneDraftParagraphs(paragraphs);
    expect(cleaned).toEqual(paragraphs);
  });

  it('整段全是 ds_safety 碎片时被整段删除（不残留空段）', () => {
    const paragraphs = [
      '正常正文段落。',
      '<ds_safety>这段全是安全审查 meta 文本，应被整段删除',
    ];
    const cleaned = sanitizeSceneDraftParagraphs(paragraphs);
    expect(cleaned).toEqual(['正常正文段落。']);
  });

  it('中文引号包裹的对话后跟 JSON 残片也能正确截断', () => {
    const paragraphs = ['"你胆敢污蔑上官？"李默厉声道。"}]}'];
    const cleaned = sanitizeSceneDraftParagraphs(paragraphs);
    expect(cleaned).toEqual(['"你胆敢污蔑上官？"李默厉声道。']);
  });
});

describe('sanitizeStructuredProseLeakage 拼接正文兜底', () => {
  it('已拼接的正文（含段间泄露）按段清洗后重新拼回', () => {
    const prose =
      '第一段正常正文。\n\n第二段结尾。"}]}。\năn <ds_safety>残留 meta';
    const cleaned = sanitizeStructuredProseLeakage(prose);
    expect(cleaned).toBe('第一段正常正文。\n\n第二段结尾。');
    expect(cleaned).not.toContain('ds_safety');
    expect(cleaned).not.toContain('ăn');
  });

  it('干净正文拼接不受影响', () => {
    const prose = '段一。\n\n段二。\n\n段三。';
    expect(sanitizeStructuredProseLeakage(prose)).toBe(prose);
  });
});
