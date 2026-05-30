/**
 * Regex-based Markdown Extractor
 * Fallback parser when remark AST parsing fails
 */

import type {
  Outline,
  Chapter,
  Character,
  Structure,
  WorldSetting,
} from '../schemas/outline.schema';

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
  coreSellingPoints?: Array<{ name: string; description: string; priority: number }>;
  // 新增：情绪目标
  emotionGoal?: {
    primary: string;
    secondary?: string;
    arc?: string;
    density?: number;
    highPoints?: number[];
    lowPoints?: number[];
  };
  // 新增：爽点设计
  coolPointDesign?: {
    patterns: string[];
    arranged: Array<{ type: string; description: string; suggestedChapter?: number }>;
  };
  // 新增：八条故事线
  storyLines?: {
    map: string;
    faction: string;
    character: string;
    goldenfinger: string;
    worldRules: string;
    conflict: string;
    collection: string;
    romance: string;
  };
  // 新增：矛盾设计
  conflictDesign?: {
    source: string;
    escalation: string[];
    majorConflicts: string[];
  };
}

/**
 * Act 结构（用于 Structure）
 */
interface ActContent {
  title: string;
  content: string;
  wordCountRatio: number;
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
      structure: {
        act1: { title: '第一幕：建置', content: '', wordCountRatio: 0.2 },
        act2a: { title: '第二幕A：对抗（上）', content: '', wordCountRatio: 0.25 },
        act2b: { title: '第二幕B：对抗（下）', content: '', wordCountRatio: 0.25 },
        act3: { title: '第三幕：结局', content: '', wordCountRatio: 0.3 },
      },
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
    
    // 冲突设计子区块状态
    let conflictDesignSubSection: 'source' | 'escalation' | 'majorConflicts' | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过空行
      if (!line) continue;

      // 标题检测
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
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

        // H2 或 H3: 主要区块（兼容 AI 使用 H3 格式的情况）
        if (level === 2 || level === 3) {
          const normalized = text.toLowerCase();

          // 重置章节详情状态
          inChapterDetail = false;
          currentChapterDetail = null;

          // 区块识别
          if (normalized.includes('简介') || normalized.includes('概述')) {
            currentSection = 'synopsis';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('基本信息')) {
            currentSection = 'basicInfo';
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
          } else if (
            normalized.includes('第二幕a') ||
            normalized.includes('对抗（上') ||
            normalized.includes('对抗(上)')
          ) {
            currentSection = 'act2a';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (
            normalized.includes('第二幕b') ||
            normalized.includes('对抗（下') ||
            normalized.includes('对抗(下)')
          ) {
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
          } else if (normalized.includes('核心卖点') || normalized.includes('卖点')) {
            currentSection = 'coreSellingPoints';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (
            normalized.includes('情绪目标') ||
            (normalized.includes('情绪') && !normalized.includes('爽点'))
          ) {
            currentSection = 'emotionGoal';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('爽点设计')) {
            currentSection = 'coolPointDesign';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('八条故事线') || normalized.includes('故事线')) {
            currentSection = 'storyLines';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('矛盾设计') || normalized.includes('冲突设计')) {
            currentSection = 'conflictDesign';
            inWorldSection = false;
            inForeshadowSection = false;
            conflictDesignSubSection = null;
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
          } else if (normalized.includes('地图线')) {
            currentSection = 'storyLine-map';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('阵营线')) {
            currentSection = 'storyLine-faction';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('人物线')) {
            currentSection = 'storyLine-character';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('金手指线')) {
            currentSection = 'storyLine-goldenfinger';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('矛盾线')) {
            currentSection = 'storyLine-conflict';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('感情线') || normalized.includes('浪漫线')) {
            currentSection = 'storyLine-romance';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('收集线')) {
            currentSection = 'storyLine-collection';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalized.includes('世界观线')) {
            currentSection = 'storyLine-worldRules';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (level === 3 && (normalized.includes('冲突来源') || normalized.includes('矛盾递进') || normalized.includes('主要冲突'))) {
            // H3 标题作为冲突设计的子区块处理
            if (currentSection !== 'conflictDesign') {
              currentSection = 'conflictDesign';
            }
            if (normalized.includes('冲突来源')) {
              conflictDesignSubSection = 'source';
            } else if (normalized.includes('矛盾递进')) {
              conflictDesignSubSection = 'escalation';
            } else if (normalized.includes('主要冲突')) {
              conflictDesignSubSection = 'majorConflicts';
            }
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

        // H4: 子区块处理
        if (level === 4) {
          // 章节详情
          if (currentSection === 'chapters' && currentChapter) {
            if (text.includes('核心事件') || text.includes('核心冲突')) {
              inChapterDetail = true;
              currentChapterDetail = 'coreEvent';
            } else if (text.includes('爽点') || text.includes('爽点安排')) {
              inChapterDetail = true;
              currentChapterDetail = 'coolPoint';
            } else if (
              text.includes('钩子') ||
              text.includes('章尾钩子') ||
              text.includes('悬念')
            ) {
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

          // 世界观子区块（H4 层级的地点、势力、规则）
          if (inWorldSection && !worldSectionType) {
            if (text.includes('地点')) {
              currentSection = 'worldLocation';
              worldSectionType = 'locations';
            } else if (text.includes('势力')) {
              currentSection = 'worldFaction';
              worldSectionType = 'factions';
            } else if (text.includes('规则') || text.includes('力量')) {
              currentSection = 'worldRule';
              worldSectionType = 'rules';
            }
          }
        }
      }

      // 列表项处理（支持无序列表和编号列表）
      const isBulletList = line.startsWith('-') || line.startsWith('*');
      const numberedMatch = line.match(/^(\d+)[.、)]\s*(.+)/);
      
      if (isBulletList || numberedMatch) {
        // 提取列表内容
        const item = isBulletList 
          ? line.substring(1).trim() 
          : (numberedMatch ? numberedMatch[2].trim() : '');
        
        // 获取编号（如果有）
        const itemNumber = numberedMatch ? parseInt(numberedMatch[1]) : null;

        // 处理标题待定状态下的列表项
        if (titlePending && !result.title) {
          result.title = item;
          titlePending = false;
          currentSection = 'synopsis';
          continue;
        }

        switch (currentSection) {
          // 基本信息区块 - 处理 **字段名**：值 格式
          case 'basicInfo':
            // 处理 "- **字段名**：值" 格式
            const fieldMatch = item.match(/\*\*([^*]+)\*\*[：:]\s*(.+)/);
            if (fieldMatch) {
              const fieldName = fieldMatch[1].trim();
              const fieldValue = fieldMatch[2].trim();
              switch (fieldName) {
                case '标题':
                case '书名':
                  result.title = fieldValue;
                  break;
                case '题材标签':
                case '题材':
                case '标签':
                  const genres = fieldValue
                    .split(/[、，,]/)
                    .map(g => g.trim())
                    .filter(Boolean);
                  result.genres.push(...genres);
                  break;
                case '预估字数':
                case '字数':
                case '目标字数':
                  const numMatch = fieldValue.match(/(\d+)/);
                  if (numMatch) result.estimatedWordCount = parseInt(numMatch[1]);
                  break;
                case '一句话简介':
                case '简介':
                case '一句话概括':
                  result.synopsis = fieldValue;
                  break;
              }
            }
            break;

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
            // 解析卖点格式：名称 - 描述
            const [spName, ...spDescParts] = item.split(/[-：:]/);
            result.coreSellingPoints.push({
              name: spName.trim(),
              description: spDescParts.join(':').trim() || '',
              priority: result.coreSellingPoints.length + 1,
            });
            break;

          // 情绪目标
          case 'emotionGoal':
            if (!result.emotionGoal) {
              result.emotionGoal = {
                primary: '',
              };
            }
            if (item.includes('核心情绪') || item.includes('primary')) {
              const match = item.match(/[：:]\s*(.+)/);
              if (match) result.emotionGoal.primary = match[1].trim();
            } else if (item.includes('情绪弧线') || item.includes('arc')) {
              const match = item.match(/[：:]\s*(.+)/);
              if (match) result.emotionGoal.arc = match[1].trim();
            }
            break;

          // 爽点设计
          case 'coolPointDesign':
            if (!result.coolPointDesign) {
              result.coolPointDesign = { patterns: [], arranged: [] };
            }
            if (item.startsWith('类型') || item.startsWith('爽点类型')) {
              const patterns = item
                .replace(/^[^-：:]+[：:]\s*/, '')
                .split(/[、，,]/)
                .filter(Boolean);
              result.coolPointDesign.patterns.push(...patterns);
            } else {
              // 作为爽点安排
              const chapterMatch = item.match(/第\s*(\d+)\s*章/);
              result.coolPointDesign.arranged.push({
                type: item.substring(0, 20),
                description: item,
                suggestedChapter: chapterMatch ? parseInt(chapterMatch[1]) : undefined,
              });
            }
            break;

          // 八条故事线
          case 'storyLine-map':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.map = item;
            break;
          case 'storyLine-faction':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.faction = item;
            break;
          case 'storyLine-character':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.character = item;
            break;
          case 'storyLine-goldenfinger':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.goldenfinger = item;
            break;
          case 'storyLine-worldRules':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.worldRules = item;
            break;
          case 'storyLine-conflict':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.conflict = item;
            break;
          case 'storyLine-collection':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.collection = item;
            break;
          case 'storyLine-romance':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.romance = item;
            break;

          // 矛盾设计
          case 'conflictDesign':
            if (!result.conflictDesign) {
              result.conflictDesign = { source: '', escalation: [], majorConflicts: [] };
            }
            
            // 根据子区块类型和列表类型处理
            if (conflictDesignSubSection === 'source' || item.includes('冲突来源')) {
              const match = item.match(/[：:]\s*(.+)/);
              if (match) {
                result.conflictDesign.source = match[1].trim();
              } else if (item.trim() && !item.includes('冲突来源')) {
                result.conflictDesign.source = item.trim();
              }
            } else if (conflictDesignSubSection === 'escalation' && numberedMatch) {
              // 编号列表在 escalation 子区块，添加到 escalation
              const match = item.match(/[：:]\s*(.+)/);
              if (match) {
                result.conflictDesign.escalation = match[1].split(/[、，,]/).filter(Boolean);
              } else if (item.trim()) {
                result.conflictDesign.escalation.push(item.trim());
              }
            } else if (conflictDesignSubSection === 'majorConflicts' || isBulletList) {
              // 无序列表或 majorConflicts 子区块，添加到 majorConflicts
              const match = item.match(/[：:]\s*(.+)/);
              if (match) {
                result.conflictDesign.majorConflicts.push(match[1].trim());
              } else if (item.trim()) {
                result.conflictDesign.majorConflicts.push(item.trim());
              }
            } else if (numberedMatch) {
              // 其他编号列表（没有明确子区块）添加到 escalation
              const match = item.match(/[：:]\s*(.+)/);
              if (match) {
                result.conflictDesign.escalation = match[1].split(/[、，,]/).filter(Boolean);
              } else if (item.trim()) {
                result.conflictDesign.escalation.push(item.trim());
              }
            } else if (item.trim()) {
              // 其他情况添加到主要冲突
              result.conflictDesign.majorConflicts.push(item.trim());
            }
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
                } as any);
              } else if (worldSectionType === 'factions') {
                result.worldSetting.factions.push({
                  name: name.trim(),
                  description: description,
                } as any);
              } else if (worldSectionType === 'rules') {
                result.worldSetting.rules.push({
                  name: name.trim(),
                  description: description,
                } as any);
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
            result.structure.act1 = {
              title: '第一幕：建置',
              content: this.collectParagraph(lines, i).substring(0, 200),
              wordCountRatio: 0.2,
            };
            break;

          case 'act2a':
            result.structure.act2a = {
              title: '第二幕A：对抗（上）',
              content: this.collectParagraph(lines, i).substring(0, 200),
              wordCountRatio: 0.25,
            };
            break;

          case 'act2b':
            result.structure.act2b = {
              title: '第二幕B：对抗（下）',
              content: this.collectParagraph(lines, i).substring(0, 200),
              wordCountRatio: 0.25,
            };
            break;

          case 'act3':
            result.structure.act3 = {
              title: '第三幕：结局',
              content: this.collectParagraph(lines, i).substring(0, 200),
              wordCountRatio: 0.3,
            };
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

          // 核心卖点（段落形式）
          case 'coreSellingPoints':
            if (!result.coreSellingPoints) {
              result.coreSellingPoints = [];
            }
            // 检查最后一个卖点是否已有内容，有则追加，无则新建
            const lastSP = result.coreSellingPoints[result.coreSellingPoints.length - 1];
            if (lastSP && lastSP.description && !lastSP.priority) {
              lastSP.description += ' ' + line;
            } else if (line.trim()) {
              result.coreSellingPoints.push({
                name: line.substring(0, 20),
                description: line,
                priority: result.coreSellingPoints.length + 1,
              });
            }
            break;

          // 情绪目标（段落形式）
          case 'emotionGoal':
            if (!result.emotionGoal) {
              result.emotionGoal = { primary: '' };
            }
            if (!result.emotionGoal.primary && line.trim()) {
              result.emotionGoal.primary = line;
            } else if (result.emotionGoal.primary) {
              result.emotionGoal.primary += ' ' + line;
            }
            break;

          // 爽点设计（段落形式）
          case 'coolPointDesign':
            if (!result.coolPointDesign) {
              result.coolPointDesign = { patterns: [], arranged: [] };
            }
            const lastCool =
              result.coolPointDesign.arranged[result.coolPointDesign.arranged.length - 1];
            if (lastCool && !lastCool.type) {
              lastCool.description += ' ' + line;
            } else if (line.trim()) {
              result.coolPointDesign.arranged.push({
                type: line.substring(0, 20),
                description: line,
              });
            }
            break;

          // 八条故事线（段落形式）
          case 'storyLine-map':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.map = (result.storyLines.map + ' ' + line).trim();
            break;
          case 'storyLine-faction':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.faction = (result.storyLines.faction + ' ' + line).trim();
            break;
          case 'storyLine-character':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.character = (result.storyLines.character + ' ' + line).trim();
            break;
          case 'storyLine-goldenfinger':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.goldenfinger = (result.storyLines.goldenfinger + ' ' + line).trim();
            break;
          case 'storyLine-worldRules':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.worldRules = (result.storyLines.worldRules + ' ' + line).trim();
            break;
          case 'storyLine-conflict':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.conflict = (result.storyLines.conflict + ' ' + line).trim();
            break;
          case 'storyLine-collection':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.collection = (result.storyLines.collection + ' ' + line).trim();
            break;
          case 'storyLine-romance':
            if (!result.storyLines) {
              result.storyLines = {
                map: '',
                faction: '',
                character: '',
                goldenfinger: '',
                worldRules: '',
                conflict: '',
                collection: '',
                romance: '',
              };
            }
            result.storyLines.romance = (result.storyLines.romance + ' ' + line).trim();
            break;

          // 矛盾设计（段落形式）
          case 'conflictDesign':
            if (!result.conflictDesign) {
              result.conflictDesign = { source: '', escalation: [], majorConflicts: [] };
            }
            if (!result.conflictDesign.source && line.trim()) {
              result.conflictDesign.source = line;
            } else if (line.trim()) {
              result.conflictDesign.source += ' ' + line;
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

    // 解析 Markdown 表格
    this.parseTables(markdown, result);

    return result;
  }

  /**
   * 解析 Markdown 中的表格内容
   */
  private parseTables(markdown: string, result: ExtractedContent): void {
    // 规范化换行符（Windows CRLF -> LF）
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n');

    // 匹配 GFM 表格格式（支持 CRLF）
    const tableRegex = /\|(.+)\|\r?\n\|[-:\s|]+\|\r?\n((?:\|.+\|\r?\n?)+)/g;
    let match;

    while ((match = tableRegex.exec(normalizedMarkdown)) !== null) {
      const tableContent = match[0];
      const rows = tableContent.split('\n').filter(line => line.trim().startsWith('|'));

      if (rows.length < 2) continue;

      // 解析表头
      const headerCells = this.parseTableRow(rows[0]);
      const headers = headerCells.map(cell => cell.trim().toLowerCase());

      // 判断表格类型
      if (this.isLocationsTable(headers)) {
        if (!result.worldSetting) {
          result.worldSetting = { locations: [], factions: [], rules: [] };
        }
        for (let i = 2; i < rows.length; i++) {
          const cells = this.parseTableRow(rows[i]);
          if (cells.length >= 2) {
            const name = cells[0].trim();
            const description = cells[1].trim();
            const level = cells[2]?.trim() || '';
            if (name) {
              result.worldSetting.locations.push({
                name,
                description,
                level: level || undefined,
              } as any);
            }
          }
        }
      } else if (this.isFactionsTable(headers)) {
        if (!result.worldSetting) {
          result.worldSetting = { locations: [], factions: [], rules: [] };
        }
        for (let i = 2; i < rows.length; i++) {
          const cells = this.parseTableRow(rows[i]);
          if (cells.length >= 2) {
            const name = cells[0].trim();
            const description = cells[1].trim();
            const allies = cells[2]?.trim() || '';
            const enemies = cells[3]?.trim() || '';
            if (name) {
              result.worldSetting.factions.push({
                name,
                description,
                allies: allies.split(/[、，,]/).filter(Boolean),
                enemies: enemies.split(/[、，,]/).filter(Boolean),
              } as any);
            }
          }
        }
      } else if (this.isRulesTable(headers)) {
        if (!result.worldSetting) {
          result.worldSetting = { locations: [], factions: [], rules: [] };
        }
        for (let i = 2; i < rows.length; i++) {
          const cells = this.parseTableRow(rows[i]);
          if (cells.length >= 2) {
            const name = cells[0].trim();
            const description = cells[1].trim();
            const category = cells[2]?.trim() || '';
            if (name) {
              result.worldSetting.rules.push({
                name,
                description,
                category: category || undefined,
              } as any);
            }
          }
        }
      } else if (this.isChaptersTable(headers)) {
        for (let i = 2; i < rows.length; i++) {
          const cells = this.parseTableRow(rows[i]);
          const chapter = this.findChapterFromCells(cells);
          if (chapter) {
            result.chapters.push(chapter);
          }
        }
      }
    }
  }

  /**
   * 解析单行表格
   */
  private parseTableRow(row: string): string[] {
    return row
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell);
  }

  /**
   * 判断是否为地点表格
   */
  private isLocationsTable(headers: string[]): boolean {
    return headers.some(h => h.includes('地点') || h.includes('location'));
  }

  /**
   * 判断是否为势力表格
   */
  private isFactionsTable(headers: string[]): boolean {
    return headers.some(h => h.includes('势力') || h.includes('faction'));
  }

  /**
   * 判断是否为规则表格
   */
  private isRulesTable(headers: string[]): boolean {
    return headers.some(h => h.includes('规则') || h.includes('rule'));
  }

  /**
   * 判断是否为章节表格
   */
  private isChaptersTable(headers: string[]): boolean {
    return headers.some(h => h.includes('章节') || h.includes('chapter'));
  }

  /**
   * 从表格单元格提取章节信息
   */
  private findChapterFromCells(cells: string[]): ChapterExtracted | null {
    // 尝试找到章节号和标题
    for (const cell of cells) {
      const chapterMatch = cell.match(/第\s*(\d+)\s*章[：:]\s*(.+)/);
      if (chapterMatch) {
        return {
          title: `第${chapterMatch[1]}章：${chapterMatch[2].trim()}`,
          summary: cells.find(c => c.includes('摘要') || c.includes('简介')) || '',
          keyEvents: [],
          involvedCharacters: [],
        };
      }
    }
    return null;
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
