/**
 * Remark AST Parser for Outline Extraction
 * Uses unified + remark ecosystem to parse Markdown into structured data
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit, type SKIP } from 'unist-util-visit';
import type { Node, Parent, Heading, List, ListItem, Paragraph, Text, Table, TableRow } from 'mdast';
import type { Root } from 'mdast';
import type {
  Outline,
  Chapter,
  Character,
  Structure,
  WorldSetting,
  Foreshadow,
} from '../schemas/outline.schema';

/**
 * Markdown AST 节点类型
 */
type MDElement = Node;

/**
 * 解析结果
 */
export interface ParseResult {
  title: string;
  synopsis: string;
  genres: string[];
  chapters: ChapterEnhanced[];
  characters: Character[];
  structure: Structure;
  foreshadows: ForeshadowEnhanced[];
  worldSetting?: WorldSetting;
  estimatedWordCount?: number;
  coreSellingPoints?: string[];
}

/**
 * 增强的章节类型
 */
interface ChapterEnhanced {
  id?: string;
  number: number;
  title: string;
  summary: string;
  objectives: string[];
  coolPoints: string[];
  foreshadows: string[];
  strand: 'quest' | 'fire' | 'constellation';
  timeAnchor?: string;
  status: 'outline' | 'draft' | 'complete';
  keyEvents: string[];
  involvedCharacters: string[];
  coreEvent?: string;
  hook?: string;
}

/**
 * 增强的伏笔类型
 */
interface ForeshadowEnhanced {
  id?: string;
  hint: string;
  type: 'item' | 'dialogue' | 'event' | 'mystery';
  suggestedChapter?: number;
  status: 'active' | 'fulfilled' | 'abandoned';
  phase?: 'early' | 'mid' | 'late';
}

/**
 * Remark AST 解析器
 * 使用 unified + remark 生态解析 Markdown
 */
export class RemarkParser {
  private processor = unified().use(remarkParse).use(remarkGfm);

  /**
   * 解析 Markdown 文本
   */
  parse(markdown: string): ParseResult {
    // 1. 解析为 AST
    const ast = this.processor.parse(markdown);

    // 2. 初始化结果
    const result: ParseResult = {
      title: '',
      synopsis: '',
      genres: [],
      chapters: [],
      characters: [],
      structure: { act1: '', act2a: '', act2b: '', act3: '' },
      foreshadows: [],
    };

    // 3. 遍历 AST 提取内容
    this.extractContent(ast as Root, result);

    // 4. 清理并返回
    return this.cleanResult(result);
  }

  /**
   * 提取内容
   */
  private extractContent(node: Root, result: ParseResult): void {
    // 当前状态追踪
    let currentSection = '';
    let currentChapter: ChapterEnhanced | null = null;
    let currentCharacter: Partial<Character> | null = null;
    let inWorldSection = false;
    let worldSectionType: 'locations' | 'factions' | 'rules' | null = null;
    let inStructureSection = false;
    let structureField: keyof Structure | null = null;
    // 标题待定状态：# 标题 后面紧跟的内容才是真正的小说名
    let titlePending = false;

    // 章节详情状态
    let inChapterDetail = false;
    let currentChapterDetail: 'coreEvent' | 'coolPoint' | 'hook' | null = null;

    // 伏笔分期状态
    let inForeshadowSection = false;
    let foreshadowPhase: 'early' | 'mid' | 'late' | null = null;

    visit(node, (node: MDElement, index) => {
      // 标题处理
      if (node.type === 'heading') {
        const heading = node as Heading;
        const level = heading.depth;
        const text = this.extractHeadingText(heading);
        const normalizedText = text.toLowerCase();

        // 重置章节详情状态
        inChapterDetail = false;
        currentChapterDetail = null;

        // H1: 主标题
        if (level === 1) {
          // 重置标题待定状态
          titlePending = false;

          // 检查是否是 "# 标题" 这种模板格式
          if (normalizedText === '标题') {
            // 进入标题待定状态，等待下一行的实际标题
            titlePending = true;
            currentSection = 'titlePending';
          } else {
            // H1 直接作为小说名称
            result.title = text.trim();
            currentSection = 'title';
          }
          inWorldSection = false;
          inStructureSection = false;
          inForeshadowSection = false;
          foreshadowPhase = null;
        }

        // H2: 主要区块
        if (level === 2) {
          // 重置标题待定状态
          titlePending = false;

          // 识别区块类型
          if (normalizedText.includes('简介') || normalizedText.includes('概述')) {
            currentSection = 'synopsis';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('题材') || normalizedText.includes('标签')) {
            currentSection = 'genres';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('世界观') || normalizedText.includes('设定')) {
            currentSection = 'worldSetting';
            inWorldSection = true;
            inForeshadowSection = false;
          } else if (normalizedText.includes('四幕') || normalizedText.includes('结构')) {
            currentSection = 'structure';
            inStructureSection = true;
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('章节') || normalizedText.includes('大纲')) {
            currentSection = 'chapters';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('角色') || normalizedText.includes('人物')) {
            currentSection = 'characters';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('伏笔')) {
            currentSection = 'foreshadows';
            inWorldSection = false;
            inForeshadowSection = true;
            foreshadowPhase = null;
          } else if (normalizedText.includes('字数') || normalizedText.includes('预估')) {
            currentSection = 'wordCount';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('核心卖点') || normalizedText.includes('爽点设计')) {
            currentSection = 'coreSellingPoints';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('早期伏笔')) {
            currentSection = 'foreshadows';
            inForeshadowSection = true;
            foreshadowPhase = 'early';
            inWorldSection = false;
          } else if (normalizedText.includes('中期伏笔')) {
            currentSection = 'foreshadows';
            inForeshadowSection = true;
            foreshadowPhase = 'mid';
            inWorldSection = false;
          } else if (normalizedText.includes('长期伏笔') || normalizedText.includes('全篇伏笔')) {
            currentSection = 'foreshadows';
            inForeshadowSection = true;
            foreshadowPhase = 'late';
            inWorldSection = false;
          } else {
            currentSection = 'other';
          }

          // 识别章节
          if (currentSection === 'chapters') {
            const chapterMatch = text.match(/第\s*(\d+)\s*章[：:]\s*(.+)/);
            if (chapterMatch) {
              // 保存上一章
              if (currentChapter) {
                result.chapters.push(currentChapter);
              }
              // 开始新章节
              currentChapter = {
                number: parseInt(chapterMatch[1]),
                title: `第${chapterMatch[1]}章：${chapterMatch[2].trim()}`,
                summary: '',
                objectives: [],
                coolPoints: [],
                foreshadows: [],
                strand: 'quest',
                status: 'outline',
                keyEvents: [],
                involvedCharacters: [],
              };
              inChapterDetail = false;
            }
          }

          // 识别四幕结构子区块
          if (inStructureSection) {
            if (normalizedText.includes('第一幕') || normalizedText.includes('建置')) {
              structureField = 'act1';
            } else if (normalizedText.includes('第二幕a') || normalizedText.includes('对抗（上）')) {
              structureField = 'act2a';
            } else if (normalizedText.includes('第二幕b') || normalizedText.includes('对抗（下）')) {
              structureField = 'act2b';
            } else if (normalizedText.includes('第三幕') || normalizedText.includes('结局')) {
              structureField = 'act3';
            } else {
              structureField = null;
            }
          }

          // 识别世界观子区块
          if (inWorldSection) {
            if (normalizedText.includes('地点')) {
              worldSectionType = 'locations';
            } else if (normalizedText.includes('势力')) {
              worldSectionType = 'factions';
            } else if (normalizedText.includes('规则') || normalizedText.includes('力量')) {
              worldSectionType = 'rules';
            } else {
              worldSectionType = null;
            }
          }

          return;
        }

        // H3: 子区块
        if (level === 3) {
          // 章节详情
          if (currentSection === 'chapters' && currentChapter) {
            if (normalizedText.includes('核心事件') || normalizedText.includes('核心冲突')) {
              inChapterDetail = true;
              currentChapterDetail = 'coreEvent';
            } else if (normalizedText.includes('爽点') || normalizedText.includes('爽点安排')) {
              inChapterDetail = true;
              currentChapterDetail = 'coolPoint';
            } else if (normalizedText.includes('钩子') || normalizedText.includes('章尾钩子') || normalizedText.includes('悬念')) {
              inChapterDetail = true;
              currentChapterDetail = 'hook';
            } else {
              inChapterDetail = false;
              currentChapterDetail = null;
            }
          }

          // 角色详情
          if (currentSection === 'characters') {
            currentCharacter = {
              name: text.replace(/^#+\s*/, '').trim(),
              role: '角色',
              description: '',
              personality: [],
              abilities: [],
              relationships: [],
            };
          }
        }
      }

      // 段落处理
      if (node.type === 'paragraph') {
        const parent = node.parent;
        // 跳过列表项内的段落
        if (parent?.type === 'listItem') {
          return;
        }

        const para = node as Paragraph;
        const text = this.extractText(para);

        // 特殊处理：标题待定状态下的段落
        // "# 标题" 后面紧跟的段落，才是真正的小说名称
        if (titlePending && text.trim()) {
          result.title = text.trim();
          titlePending = false; // 重置状态
          return; // 跳过后续 switch
        }

        switch (currentSection) {
          case 'synopsis':
            if (!result.synopsis) {
              result.synopsis = text;
            }
            break;
          case 'wordCount': {
            const wordMatch = text.match(/(\d+)\s*[-~至]\s*(\d+)\s*万?字/);
            if (wordMatch) {
              const avg = (parseInt(wordMatch[1]) + parseInt(wordMatch[2])) / 2;
              result.estimatedWordCount = avg * 10000;
            }
            break;
          }
          case 'structure':
            if (structureField && text.trim()) {
              result.structure[structureField] = text.trim().substring(0, 100);
            }
            break;
          case 'foreshadows':
            if (text.trim()) {
              result.foreshadows.push({
                hint: text.trim(),
                type: 'mystery',
                status: 'active',
                phase: foreshadowPhase || undefined,
              });
            }
            break;
          case 'coreSellingPoints':
            if (!result.coreSellingPoints) {
              result.coreSellingPoints = [];
            }
            if (text.trim()) {
              result.coreSellingPoints.push(text.trim());
            }
            break;
          case 'chapters':
            // 章节详情
            if (currentChapter) {
              if (inChapterDetail && currentChapterDetail === 'coreEvent') {
                currentChapter.coreEvent = (currentChapter.coreEvent || '') + ' ' + text;
              } else if (inChapterDetail && currentChapterDetail === 'hook') {
                currentChapter.hook = (currentChapter.hook || '') + ' ' + text;
              } else if (!currentChapter.summary) {
                currentChapter.summary = text.substring(0, 100);
              }
            }
            break;
        }

        // 当前章节的摘要（兜底）
        if (currentChapter && !currentChapter.summary) {
          currentChapter.summary = text.substring(0, 100);
        }

        // 当前角色的描述
        if (currentCharacter && !currentCharacter.description) {
          currentCharacter.description = text;
        }
      }

      // 列表处理
      if (node.type === 'list') {
        const list = node as List;

        // 处理标题待定状态下的第一个列表项
        // 例如：# 标题 后面直接跟列表
        if (titlePending && !result.title) {
          const pendingItems = this.extractListItems(list);
          if (pendingItems.length > 0) {
            result.title = pendingItems[0];
            titlePending = false;
          }
        }

        const items = this.extractListItems(list);

        switch (currentSection) {
          case 'genres':
            result.genres.push(...items.filter(Boolean));
            break;
          case 'foreshadows':
            for (const item of items) {
              if (item.trim()) {
                result.foreshadows.push({
                  hint: item.trim(),
                  type: 'mystery',
                  status: 'active',
                  phase: foreshadowPhase || undefined,
                });
              }
            }
            break;
          case 'coreSellingPoints':
            if (!result.coreSellingPoints) {
              result.coreSellingPoints = [];
            }
            result.coreSellingPoints.push(...items.filter(Boolean));
            break;
        }

        // 世界观列表
        if (inWorldSection && worldSectionType) {
          if (!result.worldSetting) {
            result.worldSetting = { locations: [], factions: [], rules: [] };
          }
          for (const item of items) {
            if (!item.trim()) continue;
            const [name, ...descParts] = item.split(/[：:]/);
            const description = descParts.join('：').trim();

            if (worldSectionType === 'locations') {
              result.worldSetting.locations.push({
                name: name.trim(),
                description: description || '',
              });
            } else if (worldSectionType === 'factions') {
              result.worldSetting.factions.push({
                name: name.trim(),
                description: description || '',
              });
            } else if (worldSectionType === 'rules') {
              result.worldSetting.rules.push({
                name: name.trim(),
                description: description || '',
              });
            }
          }
        }

        // 章节内容处理
        if (currentChapter) {
          if (inChapterDetail && currentChapterDetail === 'coolPoint') {
            // 爽点列表
            currentChapter.coolPoints.push(...items.filter(Boolean));
          } else if (inChapterDetail && currentChapterDetail === 'hook') {
            // 钩子 - 只取第一个
            if (!currentChapter.hook && items.length > 0) {
              currentChapter.hook = items[0];
            }
          } else if (!currentChapter.keyEvents?.length) {
            // keyEvents 兜底
            currentChapter.keyEvents = items.filter(Boolean);
          }
        }
      }

      // 表格处理
      if (node.type === 'table') {
        this.extractTableContent(node as Table, result, currentSection);
      }
    });

    // 保存最后的章节
    if (currentChapter) {
      result.chapters.push(currentChapter);
    }

    // 保存最后的角色
    if (currentCharacter?.name) {
      result.characters.push(currentCharacter as Character);
    }
  }

  /**
   * 提取标题文本
   */
  private extractHeadingText(heading: Heading): string {
    return heading.children
      .map((child) => {
        if (child.type === 'text') {
          return (child as Text).value;
        }
        if (child.type === 'inlineCode') {
          return (child as Text).value;
        }
        return '';
      })
      .join('');
  }

  /**
   * 提取段落文本
   */
  private extractText(node: Paragraph): string {
    return node.children
      .map((child) => {
        if (child.type === 'text') {
          return (child as Text).value;
        }
        if (child.type === 'inlineCode') {
          return (child as Text).value;
        }
        return '';
      })
      .join('');
  }

  /**
   * 提取列表项
   */
  private extractListItems(list: List): string[] {
    const items: string[] = [];

    for (const item of list.children) {
      if (item.type === 'listItem') {
        const listItem = item as ListItem;
        // 获取段落文本
        for (const child of listItem.children) {
          if (child.type === 'paragraph') {
            const text = this.extractText(child as Paragraph);
            if (text.trim()) {
              items.push(text.trim());
            }
          }
        }
        // 如果列表项有子列表，递归提取
        for (const child of listItem.children) {
          if (child.type === 'list') {
            items.push(...this.extractListItems(child as List));
          }
        }
      }
    }

    return items;
  }

  /**
   * 提取表格内容
   */
  private extractTableContent(
    table: Table,
    result: ParseResult,
    section: string
  ): void {
    const rows = table.children as TableRow[];
    if (rows.length < 2) return;

    // 提取表头
    const headerRow = rows[0];
    const headers = headerRow.children.map((cell) => {
      if (cell.type === 'tableCell') {
        return this.extractText(cell as Paragraph).trim();
      }
      return '';
    });

    // 提取数据行
    for (let i = 1; i < rows.length; i++) {
      const dataRow = rows[i];
      const values = dataRow.children.map((cell) => {
        if (cell.type === 'tableCell') {
          return this.extractText(cell as Paragraph).trim();
        }
        return '';
      });

      const rowData: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowData[header] = values[index] || '';
      });

      // 根据区块类型处理
      if (section === 'characters' && result.characters.length > 0) {
        const lastChar = result.characters[result.characters.length - 1];
        if (lastChar && !lastChar.description) {
          lastChar.description = Object.values(rowData).join('；');
        }
      }
    }
  }

  /**
   * 清理结果
   */
  private cleanResult(result: ParseResult): ParseResult {
    return {
      title: result.title || '未命名大纲',
      synopsis: result.synopsis || '',
      genres: result.genres.filter((g) => g.trim()),
      chapters: result.chapters.filter((ch) => ch.title),
      characters: result.characters.filter((c) => c.name || c.role),
      structure: result.structure,
      foreshadows: result.foreshadows,
      worldSetting: result.worldSetting,
      estimatedWordCount: result.estimatedWordCount,
    };
  }
}

// 导出单例
export const remarkParser = new RemarkParser();
