/**
 * Regex-based Markdown Extractor
 * Fallback parser when remark AST parsing fails
 */

import type { Outline, Chapter, Character, Structure, WorldSetting } from '../schemas/outline.schema';

/**
 * 提取结果
 */
export interface ExtractedContent {
  title: string;
  synopsis: string;
  genres: string[];
  chapters: ChapterExtracted[];
  characters: CharacterExtracted[];
  structure: Structure;
  foreshadows: ForeshadowExtracted[];
  worldSetting?: WorldSetting;
  estimatedWordCount?: number;
  coreSellingPoints?: string[];
}

/**
 * 章节提取结果（增强版）
 */
interface ChapterExtracted {
  title: string;
  summary: string;
  coreEvent?: string;
  coolPoints?: string[];
  hook?: string;
  keyEvents: string[];
  involvedCharacters: string[];
}

/**
 * 角色提取结果
 */
interface CharacterExtracted {
  name: string;
  role: string;
  description: string;
  personality: string[];
}

/**
 * 伏笔提取结果（增强版）
 */
interface ForeshadowExtracted {
  hint: string;
  type: string;
  phase?: 'early' | 'mid' | 'late';
}

/**
 * 正则表达式 Markdown 提取器
 * 作为 remark 解析失败的兜底方案
 */
export class MarkdownExtractor {
  /**
   * 提取 Markdown 中的结构化内容
   */
  extract(markdown: string): ExtractedContent {
    const lines = markdown.split('\n');

    const result: ExtractedContent = {
      title: '',
      synopsis: '',
      genres: [],
      chapters: [],
      characters: [],
      structure: { act1: '', act2a: '', act2b: '', act3: '' },
      foreshadows: [],
    };

    let currentSection = '';
    let currentChapter: ChapterExtracted | null = null;
    let inWorldSection = false;
    let worldSectionType: 'locations' | 'factions' | 'rules' | null = null;
    let inForeshadowSection = false;
    let foreshadowPhase: 'early' | 'mid' | 'late' | null = null;

    // 标题待定状态：# 标题 后面紧跟的才是真正的小说名
    let titlePending = false;

    // 章节详情状态
    let inChapterDetail = false;
    let currentChapterDetail: 'coreEvent' | 'coolPoint' | 'hook' | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过空行
      if (!line) continue;

      // 标题检测
      const headingMatch = line.match(/^#{1,6}\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();

        // 重置章节详情状态
        inChapterDetail = false;
        currentChapterDetail = null;

        // H1: 主标题
        if (level === 1) {
          // 检查是否是 "# 标题" 这种格式
          if (text.toLowerCase() === '标题') {
            titlePending = true;
            currentSection = 'titlePending';
          } else {
            // H1 直接作为小说名称
            result.title = text;
            currentSection = 'title';
            titlePending = false;
          }
          inWorldSection = false;
          inForeshadowSection = false;
          foreshadowPhase = null;
        }

        // H2: 主要区块
        if (level === 2) {
          const normalized = text.toLowerCase();

          if (normalized.includes('简介') || normalized.includes('概述')) {
            currentSection = 'synopsis';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('题材') || normalized.includes('标签')) {
            currentSection = 'genres';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('章节')) {
            currentSection = 'chapters';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('角色') || normalized.includes('人物')) {
            currentSection = 'characters';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('伏笔')) {
            currentSection = 'foreshadows';
            inWorldSection = false;
            inForeshadowSection = true;
            foreshadowPhase = null;
          } else if (normalized.includes('字数')) {
            currentSection = 'wordCount';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('第一幕') || normalized.includes('建置')) {
            currentSection = 'act1';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('第二幕a') || normalized.includes('对抗（上）') || normalized.includes('对抗(上)')) {
            currentSection = 'act2a';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('第二幕b') || normalized.includes('对抗（下）') || normalized.includes('对抗(下)')) {
            currentSection = 'act2b';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('第三幕') || normalized.includes('结局')) {
            currentSection = 'act3';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('世界观') || normalized.includes('设定')) {
            currentSection = 'worldSetting';
            inWorldSection = true;
            inForeshadowSection = false;
          } else if (normalized.includes('地点')) {
            currentSection = 'worldLocation';
            inWorldSection = true;
            worldSectionType = 'locations';
            inForeshadowSection = false;
          } else if (normalized.includes('势力')) {
            currentSection = 'worldFaction';
            inWorldSection = true;
            worldSectionType = 'factions';
            inForeshadowSection = false;
          } else if (normalized.includes('规则') || normalized.includes('力量')) {
            currentSection = 'worldRule';
            inWorldSection = true;
            worldSectionType = 'rules';
            inForeshadowSection = false;
          } else if (normalized.includes('核心卖点') || normalized.includes('爽点设计')) {
            currentSection = 'coreSellingPoints';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('早期伏笔')) {
            currentSection = 'foreshadows';
            inForeshadowSection = true;
            foreshadowPhase = 'early';
            inWorldSection = false;
          } else if (normalized.includes('中期伏笔')) {
            currentSection = 'foreshadows';
            inForeshadowSection = true;
            foreshadowPhase = 'mid';
            inWorldSection = false;
          } else if (normalized.includes('长期伏笔') || normalized.includes('全篇伏笔')) {
            currentSection = 'foreshadows';
            inForeshadowSection = true;
            foreshadowPhase = 'late';
            inWorldSection = false;
          } else {
            currentSection = 'other';
          }

          // 章节标题
          if (currentSection === 'chapters') {
            const chapterMatch = text.match(/第\s*(\d+)\s*章[：:]\s*(.+)/);
            if (chapterMatch) {
              if (currentChapter) {
                result.chapters.push(currentChapter);
              }
              currentChapter = {
                title: `第${chapterMatch[1]}章：${chapterMatch[2].trim()}`,
                summary: '',
                keyEvents: [],
                involvedCharacters: [],
              };
              inChapterDetail = false;
            }
          }

          // 角色标题
          if (currentSection === 'characters') {
            const charMatch = text.match(/^(.+?)[（(](.+?)[）)]/);
            if (charMatch) {
              result.characters.push({
                name: charMatch[1].trim(),
                role: charMatch[2].trim(),
                description: '',
                personality: [],
              });
            } else if (text.length < 20) {
              result.characters.push({
                name: text,
                role: '角色',
                description: '',
                personality: [],
              });
            }
          }

          continue;
        }

        // H3: 子区块（角色详情、章节详情、伏笔）
        if (level === 3) {
          // 章节详情
          if (currentSection === 'chapters' && currentChapter) {
            if (text.includes('核心事件') || text.includes('核心冲突')) {
              inChapterDetail = true;
              currentChapterDetail = 'coreEvent';
            } else if (text.includes('爽点') || text.includes('爽点安排')) {
              inChapterDetail = true;
              currentChapterDetail = 'coolPoint';
            } else if (text.includes('钩子') || text.includes('章尾钩子') || text.includes('悬念')) {
              inChapterDetail = true;
              currentChapterDetail = 'hook';
            } else {
              inChapterDetail = false;
              currentChapterDetail = null;
            }
          }

          // 角色详情
          if (currentSection === 'characters' && result.characters.length > 0) {
            const lastChar = result.characters[result.characters.length - 1];
            const descMatch = text.match(/[:-]\s*(.+)/);
            if (descMatch) {
              lastChar.description = descMatch[1].trim();
            }
          }
        }
      }

      // 列表项处理
      if (line.startsWith('-') || line.startsWith('*')) {
        const item = line.substring(1).trim();

        // 处理标题待定状态下的列表项
        if (titlePending && !result.title) {
          result.title = item;
          titlePending = false;
          currentSection = 'synopsis';
          continue;
        }

        switch (currentSection) {
          case 'genres':
            result.genres.push(item);
            break;

          case 'foreshadows':
            result.foreshadows.push({
              hint: item,
              type: 'mystery',
              phase: foreshadowPhase || undefined,
            });
            break;

          case 'chapters':
            if (currentChapter) {
              if (inChapterDetail && currentChapterDetail === 'coolPoint') {
                if (!currentChapter.coolPoints) {
                  currentChapter.coolPoints = [];
                }
                currentChapter.coolPoints.push(item);
              } else if (inChapterDetail && currentChapterDetail === 'hook') {
                currentChapter.hook = item;
              } else if (!currentChapter.summary) {
                currentChapter.summary = item;
              }
            }
            break;

          case 'wordCount': {
            const wordMatch = item.match(/(\d+)\s*[-~至]\s*(\d+)\s*万?字/);
            if (wordMatch) {
              const avg = (parseInt(wordMatch[1]) + parseInt(wordMatch[2])) / 2;
              result.estimatedWordCount = avg * 10000;
            }
            break;
          }

          case 'coreSellingPoints':
            if (!result.coreSellingPoints) {
              result.coreSellingPoints = [];
            }
            result.coreSellingPoints.push(item);
            break;

          case 'worldLocation':
          case 'worldFaction':
          case 'worldRule':
            if (inWorldSection && worldSectionType && !result.worldSetting) {
              result.worldSetting = { locations: [], factions: [], rules: [] };
            }

            if (inWorldSection && worldSectionType && result.worldSetting) {
              const [name, ...descParts] = item.split(/[：:]/);
              const description = descParts.join('：').trim();

              if (worldSectionType === 'locations') {
                result.worldSetting.locations.push({
                  name: name.trim(),
                  description: description,
                });
              } else if (worldSectionType === 'factions') {
                result.worldSetting.factions.push({
                  name: name.trim(),
                  description: description,
                });
              } else if (worldSectionType === 'rules') {
                result.worldSetting.rules.push({
                  name: name.trim(),
                  description: description,
                });
              }
            }
            break;
        }
      }

      // 段落内容
      if (!line.startsWith('#') && !line.startsWith('-') && !line.startsWith('*')) {
        // 处理标题待定状态下的段落（# 标题 后面紧跟的段落）
        if (titlePending && !result.title && line.trim()) {
          result.title = line.trim();
          titlePending = false;
          currentSection = 'synopsis';
        }

        switch (currentSection) {
          case 'synopsis':
            if (!result.synopsis) {
              result.synopsis = line;
            }
            break;

          case 'act1':
            if (!result.structure.act1) {
              result.structure.act1 = this.collectParagraph(lines, i).substring(0, 100);
            }
            break;

          case 'act2a':
            if (!result.structure.act2a) {
              result.structure.act2a = this.collectParagraph(lines, i).substring(0, 100);
            }
            break;

          case 'act2b':
            if (!result.structure.act2b) {
              result.structure.act2b = this.collectParagraph(lines, i).substring(0, 100);
            }
            break;

          case 'act3':
            if (!result.structure.act3) {
              result.structure.act3 = this.collectParagraph(lines, i).substring(0, 100);
            }
            break;

          case 'chapters':
            if (currentChapter) {
              if (inChapterDetail && currentChapterDetail === 'coreEvent') {
                currentChapter.coreEvent = (currentChapter.coreEvent || '') + ' ' + line;
              } else if (inChapterDetail && currentChapterDetail === 'hook') {
                currentChapter.hook = (currentChapter.hook || '') + ' ' + line;
              } else if (!currentChapter.summary) {
                currentChapter.summary = line.substring(0, 100);
              }
            }
            break;

          case 'coreSellingPoints':
            if (!result.coreSellingPoints) {
              result.coreSellingPoints = [];
            }
            if (!result.coreSellingPoints.length || result.coreSellingPoints[result.coreSellingPoints.length - 1].length > 0) {
              result.coreSellingPoints.push(line);
            } else {
              result.coreSellingPoints[result.coreSellingPoints.length - 1] += ' ' + line;
            }
            break;

          case 'characters':
            if (result.characters.length > 0) {
              const lastChar = result.characters[result.characters.length - 1];
              if (!lastChar.description) {
                lastChar.description = line;
              }
            }
            break;
        }
      }
    }

    // 保存最后的章节
    if (currentChapter) {
      result.chapters.push(currentChapter);
    }

    return result;
  }

  /**
   * 收集段落内容（直到遇到下一个标题）
   */
  private collectParagraph(lines: string[], startIndex: number): string {
    const content: string[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) break;
      if (line && !line.startsWith('-') && !line.startsWith('*')) {
        content.push(line);
      }
    }

    return content.join(' ').trim();
  }
}

// 导出单例
export const markdownExtractor = new MarkdownExtractor();
