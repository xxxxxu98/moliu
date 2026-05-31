/**
 * Remark AST Parser for Outline Extraction
 * Uses unified + remark ecosystem to parse Markdown into structured data
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit, type SKIP } from 'unist-util-visit';
import type {
  Node,
  Parent,
  Heading,
  List,
  ListItem,
  Paragraph,
  Text,
  Table,
  TableRow,
} from 'mdast';
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
  characters: Partial<Character>[];
  structure: Structure;
  foreshadows: ForeshadowEnhanced[];
  worldSetting?: WorldSetting;
  estimatedWordCount?: number;
  coreSellingPoints?: string[];
  emotionGoal?: {
    primary: string;
    secondary?: string;
    arc?: string;
    density?: number;
    highPoints?: number[];
    lowPoints?: number[];
  };
  coolPointDesign?: {
    patterns: string[];
    arranged: Array<{ type: string; description: string; suggestedChapter?: number }>;
  };
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
  conflictDesign?: {
    source: string;
    escalation: string[];
    majorConflicts: string[];
  };
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
      structure: {
        act1: { title: '第一幕：建置', content: '', wordCountRatio: 0.2 },
        act2a: { title: '第二幕A：对抗（上）', content: '', wordCountRatio: 0.25 },
        act2b: { title: '第二幕B：对抗（下）', content: '', wordCountRatio: 0.25 },
        act3: { title: '第三幕：结局', content: '', wordCountRatio: 0.3 },
      },
      foreshadows: [],
    };

    // 3. 遍历 AST 提取内容
    try {
      this.extractContent(ast as Root, result);
    } catch (err) {
      // 静默处理解析错误
    }

    // 4. 清理并返回
    return this.cleanResult(result);
  }

  /**
   * 将纯文本结构转换为 Schema 期望的 Act 结构
   */
  private buildAct(
    text: string,
    defaultTitle: string,
    defaultRatio: number
  ): { title: string; content: string; wordCountRatio: number } {
    return {
      title: defaultTitle,
      content: text.substring(0, 200),
      wordCountRatio: defaultRatio,
    };
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

    // 八条故事线状态
    let currentStoryLine: keyof Extract<Structure, any> | null = null;

    // 情绪目标状态
    let emotionField:
      | 'primary'
      | 'secondary'
      | 'arc'
      | 'density'
      | 'highPoints'
      | 'lowPoints'
      | null = null;

    // 矛盾设计状态
    let conflictField: 'source' | 'escalation' | 'majorConflicts' | null = null;

    // 爽点设计子区块状态
    let coolPointDesignField: 'patterns' | 'arranged' | null = null;

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
          return;
        }

        // H2: 主要区块
        if (level === 2) {
          // 重置标题待定状态
          titlePending = false;
          // 重置各子状态
          inChapterDetail = false;
          currentChapterDetail = null;
          currentStoryLine = null;
          emotionField = null;
          conflictField = null;

          // 识别区块类型（支持多种标题别名）
          if (
            normalizedText.includes('基本信息') ||
            normalizedText.includes('简介') ||
            normalizedText.includes('概述')
          ) {
            currentSection = 'basicInfo';
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
          } else if (
            normalizedText.includes('角色') ||
            normalizedText.includes('人物') ||
            normalizedText.includes('主角') ||
            normalizedText.includes('配角') ||
            normalizedText.includes('其他角色')
          ) {
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
          } else if (
            normalizedText.includes('情绪目标') ||
            (normalizedText.includes('情绪') && !normalizedText.includes('爽点'))
          ) {
            currentSection = 'emotionGoal';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('爽点类型') || normalizedText.includes('爽点安排')) {
            currentSection = 'coolPointDesign';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('八条故事线') || normalizedText.includes('故事线')) {
            currentSection = 'storyLines';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('矛盾设计') || normalizedText.includes('冲突设计')) {
            currentSection = 'conflictDesign';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('矛盾递进')) {
            currentSection = 'conflictDesign';
            conflictField = 'escalation';
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
          } else if (normalizedText.includes('子情节')) {
            currentSection = 'subplots';
            inWorldSection = false;
            inForeshadowSection = false;
          } else {
            currentSection = 'other';
          }

          // 识别八条故事线子区块
          if (currentSection === 'storyLines') {
            if (normalizedText.includes('地图线')) currentStoryLine = 'map' as any;
            else if (normalizedText.includes('阵营线')) currentStoryLine = 'faction' as any;
            else if (normalizedText.includes('人物线')) currentStoryLine = 'character' as any;
            else if (normalizedText.includes('金手指线')) currentStoryLine = 'goldenfinger' as any;
            else if (normalizedText.includes('世界观线')) currentStoryLine = 'worldRules' as any;
            else if (normalizedText.includes('矛盾线')) currentStoryLine = 'conflict' as any;
            else if (normalizedText.includes('收集线')) currentStoryLine = 'collection' as any;
            else if (normalizedText.includes('感情线') || normalizedText.includes('浪漫线'))
              currentStoryLine = 'romance' as any;
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

          // 识别四幕结构子区块（H3 层级）
          if (inStructureSection) {
            if (normalizedText.includes('第一幕') || normalizedText.includes('建置')) {
              structureField = 'act1';
            } else if (
              normalizedText.includes('第二幕a') ||
              normalizedText.includes('第二幕-a') ||
              normalizedText.includes('对抗（上）') ||
              normalizedText.includes('对抗(上)') ||
              normalizedText.includes('对抗上半')
            ) {
              structureField = 'act2a';
            } else if (
              normalizedText.includes('第二幕b') ||
              normalizedText.includes('第二幕-b') ||
              normalizedText.includes('对抗（下）') ||
              normalizedText.includes('对抗(下)') ||
              normalizedText.includes('对抗下半')
            ) {
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
          // 注意：不在这里 return，让 H3 处理逻辑也能执行
        }

        // H3: 也作为主要区块处理（兼容 AI 使用 H3 格式的情况）
        if (level === 3) {
          // 重置章节详情状态
          inChapterDetail = false;
          currentChapterDetail = null;
          emotionField = null;
          // 不要重置 conflictField，让它在冲突设计子区块中保持
          // 注意：保留 currentStoryLine，因为 H3 可能是八条故事线的子区块
          // 只有当不是八条故事线的子区块时才重置
          // 如果当前已经是 storyLines 区块，且当前 H3 不是八条故事线标题，则重置 currentStoryLine
          if (!normalizedText.includes('故事线') && !normalizedText.includes('线')) {
            currentStoryLine = null;
          }

          // 如果当前 H3 是八条故事线的子区块标题（如 "### 地图线"），初始化 result.storyLines
          const isStoryLineSubHeading =
            normalizedText.includes('地图线') ||
            normalizedText.includes('阵营线') ||
            normalizedText.includes('人物线') ||
            normalizedText.includes('金手指线') ||
            normalizedText.includes('世界观线') ||
            normalizedText.includes('矛盾线') ||
            normalizedText.includes('收集线') ||
            normalizedText.includes('感情线') ||
            normalizedText.includes('浪漫线');

          if (isStoryLineSubHeading) {
            // 初始化 result.storyLines
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
            // 识别具体是哪条线
            if (normalizedText.includes('地图线')) currentStoryLine = 'map' as any;
            else if (normalizedText.includes('阵营线')) currentStoryLine = 'faction' as any;
            else if (normalizedText.includes('人物线')) currentStoryLine = 'character' as any;
            else if (normalizedText.includes('金手指线')) currentStoryLine = 'goldenfinger' as any;
            else if (normalizedText.includes('世界观线')) currentStoryLine = 'worldRules' as any;
            else if (normalizedText.includes('矛盾线')) currentStoryLine = 'conflict' as any;
            else if (normalizedText.includes('收集线')) currentStoryLine = 'collection' as any;
            else if (normalizedText.includes('感情线') || normalizedText.includes('浪漫线'))
              currentStoryLine = 'romance' as any;
            // 保持 currentSection 不变（已是 'other'，但后续段落会设置它）
            return;
          }

          // 识别区块类型
          if (
            normalizedText.includes('基本信息') ||
            normalizedText.includes('简介') ||
            normalizedText.includes('概述')
          ) {
            currentSection = 'basicInfo';
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
          } else if (
            normalizedText.includes('章节') ||
            normalizedText.includes('大纲')
          ) {
            currentSection = 'chapters';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (
            normalizedText.includes('角色') ||
            normalizedText.includes('人物') ||
            normalizedText.includes('主角') ||
            normalizedText.includes('配角') ||
            normalizedText.includes('其他角色')
          ) {
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
          } else if (
            normalizedText.includes('情绪目标') ||
            (normalizedText.includes('情绪') && !normalizedText.includes('爽点'))
          ) {
            currentSection = 'emotionGoal';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('爽点类型')) {
            currentSection = 'coolPointDesign';
            coolPointDesignField = 'patterns';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('爽点安排')) {
            currentSection = 'coolPointDesign';
            coolPointDesignField = 'arranged';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('八条故事线') || normalizedText.includes('故事线')) {
            currentSection = 'storyLines';
            inWorldSection = false;
            inForeshadowSection = false;
          // 先检查更具体的条件
          } else if (normalizedText.includes('矛盾递进')) {
            currentSection = 'conflictDesign';
            conflictField = 'escalation';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('主要冲突')) {
            currentSection = 'conflictDesign';
            conflictField = 'majorConflicts';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('矛盾设计') || normalizedText.includes('冲突设计')) {
            currentSection = 'conflictDesign';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('矛盾递进')) {
            currentSection = 'conflictDesign';
            conflictField = 'escalation';
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
          } else if (normalizedText.includes('子情节')) {
            currentSection = 'subplots';
            inWorldSection = false;
            inForeshadowSection = false;
          } else if (normalizedText.includes('地点')) {
            // H3 层级的地点子区块
            worldSectionType = 'locations';
            inWorldSection = true;
            inForeshadowSection = false;
          } else if (normalizedText.includes('势力')) {
            // H3 层级的势力子区块
            worldSectionType = 'factions';
            inWorldSection = true;
            inForeshadowSection = false;
          } else if (normalizedText.includes('规则') || normalizedText.includes('力量')) {
            // H3 层级的规则子区块
            worldSectionType = 'rules';
            inWorldSection = true;
            inForeshadowSection = false;
          } else {
            currentSection = 'other';
          }

          // 识别八条故事线子区块（如果 currentSection 是 storyLines）
          if (currentSection === 'storyLines') {
            if (normalizedText.includes('地图线')) currentStoryLine = 'map' as any;
            else if (normalizedText.includes('阵营线')) currentStoryLine = 'faction' as any;
            else if (normalizedText.includes('人物线')) currentStoryLine = 'character' as any;
            else if (normalizedText.includes('金手指线')) currentStoryLine = 'goldenfinger' as any;
            else if (normalizedText.includes('世界观线')) currentStoryLine = 'worldRules' as any;
            else if (normalizedText.includes('矛盾线')) currentStoryLine = 'conflict' as any;
            else if (normalizedText.includes('收集线')) currentStoryLine = 'collection' as any;
            else if (normalizedText.includes('感情线') || normalizedText.includes('浪漫线'))
              currentStoryLine = 'romance' as any;
          }

          // 识别章节
          if (currentSection === 'chapters') {
            const chapterMatch = text.match(/第\s*(\d+)\s*章[：:]\s*(.+)/);
            if (chapterMatch) {
              if (currentChapter) {
                result.chapters.push(currentChapter);
              }
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

          // 识别四幕结构子区块（H3 层级）
          // 注意：此时不应该改变 currentSection，因为 H3 是一级标题的子区块
          if (inStructureSection) {
            if (normalizedText.includes('第一幕') || normalizedText.includes('建置')) {
              structureField = 'act1';
            } else if (
              normalizedText.includes('第二幕a') ||
              normalizedText.includes('第二幕-a') ||
              normalizedText.includes('对抗（上）') ||
              normalizedText.includes('对抗(上)') ||
              normalizedText.includes('对抗上半')
            ) {
              structureField = 'act2a';
            } else if (
              normalizedText.includes('第二幕b') ||
              normalizedText.includes('第二幕-b') ||
              normalizedText.includes('对抗（下）') ||
              normalizedText.includes('对抗(下)') ||
              normalizedText.includes('对抗下半')
            ) {
              structureField = 'act2b';
            } else if (normalizedText.includes('第三幕') || normalizedText.includes('结局')) {
              structureField = 'act3';
            } else {
              structureField = null;
            }
          }

          // 如果是结构子区块标题（H3），保持 currentSection 为 'structure'
          if (inStructureSection && structureField) {
            currentSection = 'structure';
          }
          // 不要在这里 return，让 H3 处理逻辑也能执行
        }

        // H4: 子区块处理（章节详情、角色详情、世界观子区块等）
        if (level === 4) {
          // 章节详情
          if (currentSection === 'chapters' && currentChapter) {
            if (normalizedText.includes('核心事件') || normalizedText.includes('核心冲突')) {
              inChapterDetail = true;
              currentChapterDetail = 'coreEvent';
            } else if (normalizedText.includes('爽点') || normalizedText.includes('爽点安排')) {
              inChapterDetail = true;
              currentChapterDetail = 'coolPoint';
            } else if (
              normalizedText.includes('钩子') ||
              normalizedText.includes('章尾钩子') ||
              normalizedText.includes('悬念')
            ) {
              inChapterDetail = true;
              currentChapterDetail = 'hook';
            } else {
              inChapterDetail = false;
              currentChapterDetail = null;
            }
          }

          // 角色详情 - 但要跳过加粗格式的字段（如 **姓名**：林深）
          if (currentSection === 'characters') {
            // 如果是加粗格式的字段（如 **姓名**：），不创建新角色，等待列表处理
            if (!text.startsWith('**') && !normalizedText.includes('姓名') && !normalizedText.includes('描述')) {
              const rawName = text.replace(/^#+\s*/, '').trim();
              // 尝试提取角色名和角色类型
              const charMatch = rawName.match(/^(.+?)[（(]([^）)]+)[）)]$/);
              let charName = rawName;
              let charRole = '配角';

              if (charMatch) {
                charName = charMatch[1].trim();
                charRole = this.normalizeCharacterRole(charMatch[2].trim());
              }

              currentCharacter = {
                name: charName,
                role: charRole,
                identity: '',
                personality: [],
                strengths: [],
                weaknesses: [],
                goals: [],
                currentDilemma: '',
              };
            }
          }

          // 世界观子区块（H4 层级的地点、势力、规则）
          if (inWorldSection && !worldSectionType) {
            if (normalizedText.includes('地点')) {
              worldSectionType = 'locations';
            } else if (normalizedText.includes('势力')) {
              worldSectionType = 'factions';
            } else if (normalizedText.includes('规则') || normalizedText.includes('力量')) {
              worldSectionType = 'rules';
            }
          }
        }
      }

      // 段落处理
      if (node.type === 'paragraph') {
        const parent = (node as any).parent;
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
              const ratios: Record<keyof Structure, number> = {
                act1: 0.2,
                act2a: 0.25,
                act2b: 0.25,
                act3: 0.3,
              };
              const titles: Record<keyof Structure, string> = {
                act1: '第一幕：建置',
                act2a: '第二幕A：对抗（上）',
                act2b: '第二幕B：对抗（下）',
                act3: '第三幕：结局',
              };
              result.structure[structureField] = this.buildAct(
                text.trim(),
                titles[structureField],
                ratios[structureField]
              );
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
          case 'emotionGoal':
            if (!result.emotionGoal) {
              result.emotionGoal = {
                primary: '',
                arc: 'rising',
                density: 3000,
                highPoints: [],
                lowPoints: [],
              };
            }
            // 尝试从段落中解析情绪字段
            this.parseEmotionFromText(result, text);
            break;
          case 'coolPointDesign':
            if (!result.coolPointDesign) {
              result.coolPointDesign = { patterns: [], arranged: [] };
            }
            // 根据子区块类型处理
            if (coolPointDesignField === 'patterns' && text.trim()) {
              // 爽点类型段落，解析逗号分隔的类型
              const patterns = text.trim().split(/[、，,]/).filter(Boolean);
              result.coolPointDesign.patterns.push(...patterns);
            } else if (coolPointDesignField === 'arranged' && text.trim()) {
              // 爽点安排段落，添加到 arranged
              result.coolPointDesign.arranged.push({ type: 'paragraph', description: text.trim() });
            } else if (!coolPointDesignField && text.trim()) {
              // 兼容：如果没有子区块标记，当作段落处理
              result.coolPointDesign.arranged.push({ type: 'paragraph', description: text.trim() });
            }
            break;
          case 'conflictDesign':
            if (!result.conflictDesign) {
              result.conflictDesign = { source: '', escalation: [], majorConflicts: [] };
            }
            this.parseConflictFromText(result, text);
            break;
          case 'storyLines':
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
            if (currentStoryLine && text.trim()) {
              (result.storyLines as any)[currentStoryLine] = (
                (result.storyLines as any)[currentStoryLine] +
                ' ' +
                text.trim()
              ).trim();
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
        if (currentCharacter && !currentCharacter.identity) {
          currentCharacter.identity = text;
        }
      }

      // 列表处理
      if (node.type === 'list') {
        const list = node as List;
        const items = this.extractListItems(list);

        // 处理标题待定状态下的第一个列表项
        if (titlePending && !result.title) {
          const pendingItems = this.extractListItems(list);
          if (pendingItems.length > 0) {
            result.title = pendingItems[0];
            titlePending = false;
          }
        }

        switch (currentSection) {
          case 'basicInfo':
            // 处理 "- **字段名**：值" 格式
            for (const item of items) {
              if (!item.trim()) continue;
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
            }
            break;
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
          case 'emotionGoal':
            if (!result.emotionGoal) {
              result.emotionGoal = {
                primary: '',
                arc: 'rising',
                density: 3000,
                highPoints: [],
                lowPoints: [],
              };
            }
            for (const item of items) {
              // 支持加粗格式 **核心情绪**：值
              const coreMatch = item.match(/\*\*核心情绪\*\*[：:]\s*(.+)/) || item.match(/核心情绪[：:]\s*(.+)/);
              if (coreMatch) {
                result.emotionGoal.primary = coreMatch[1].trim();
                continue;
              }
              // 支持加粗格式 **情绪弧线**：值
              const arcMatch = item.match(/\*\*情绪弧线\*\*[：:]\s*(.+)/) || item.match(/情绪弧线[：:]\s*(.+)/);
              if (arcMatch) {
                result.emotionGoal.arc = arcMatch[1].trim();
                continue;
              }
              // 支持加粗格式 **情绪密度**：值
              const densityMatch = item.match(/\*\*情绪密度\*\*[：:]\s*(\d+)/) || item.match(/情绪密度[：:]\s*(\d+)/);
              if (densityMatch) {
                result.emotionGoal.density = parseInt(densityMatch[1]);
                continue;
              }
              // 支持加粗格式 **情绪高点**：值
              const highMatch = item.match(/\*\*情绪高点\*\*[：:]\s*([\d,，\s（）()]+)/) || item.match(/情绪高点[：:]\s*([\d,，\s（）()]+)/);
              if (highMatch) {
                result.emotionGoal.highPoints = highMatch[1]
                  .split(/[,\s，]+/)
                  .filter(Boolean)
                  .map(s => parseInt(s.replace(/[（）()]/g, '')))
                  .filter(n => !isNaN(n));
                continue;
              }
              // 支持加粗格式 **情绪低点**：值
              const lowMatch = item.match(/\*\*情绪低点\*\*[：:]\s*([\d,，\s（）()]+)/) || item.match(/情绪低点[：:]\s*([\d,，\s（）()]+)/);
              if (lowMatch) {
                result.emotionGoal.lowPoints = lowMatch[1]
                  .split(/[,\s，]+/)
                  .filter(Boolean)
                  .map(s => parseInt(s.replace(/[（）()]/g, '')))
                  .filter(n => !isNaN(n));
              }
            }
            break;
          case 'coolPointDesign':
            if (!result.coolPointDesign) {
              result.coolPointDesign = { patterns: [], arranged: [] };
            }
            for (const item of items) {
              // 支持加粗格式 **爽点类型**：打脸爽、装逼爽...
              if (item.includes('**爽点类型**') || item.includes('爽点类型')) {
                const patterns = item
                  .replace(/^\*\*爽点类型\*\*[：:]\s*/, '')
                  .replace(/^爽点类型[：:]\s*/, '')
                  .split(/[、，,]/)
                  .filter(Boolean);
                result.coolPointDesign.patterns.push(...patterns);
              } else if (item.includes('**爽点安排**') || item.includes('爽点安排')) {
                // 爽点安排通常是表格，会在表格处理中处理
              } else {
                // 表格行格式：章节 | 类型 | 描述
                const chapterMatch = item.match(/第\s*(\d+)\s*章/);
                result.coolPointDesign.arranged.push({
                  type: item.substring(0, 20),
                  description: item,
                  suggestedChapter: chapterMatch ? parseInt(chapterMatch[1]) : undefined,
                });
              }
            }
            break;
          case 'conflictDesign':
            if (!result.conflictDesign) {
              result.conflictDesign = { source: '', escalation: [], majorConflicts: [] };
            }
            for (const item of items) {
              // 支持加粗格式 **冲突来源**：值
              const sourceMatch = item.match(/\*\*冲突来源\*\*[：:]\s*(.+)/) || item.match(/冲突来源[：:]\s*(.+)/);
              if (sourceMatch) {
                result.conflictDesign.source = sourceMatch[1].trim();
                continue;
              }
              // 支持数字列表格式 "1. 一级矛盾：..." 或 "一级矛盾：生存 vs 死亡（垃圾坟场的资源争夺）"
              const escalationNumMatch = item.match(/^(?:\d+[.、:：]\s*)?(?:(?:一级|二级|三级|四级)矛盾[：:]\s*)?(.+)/);
              if (escalationNumMatch && conflictField === 'escalation') {
                result.conflictDesign.escalation.push(escalationNumMatch[1].trim());
                continue;
              }
              // 支持加粗格式 **矛盾递进**：值
              const escalationMatch = item.match(/\*\*矛盾递进\*\*[：:](.+)/) || item.match(/矛盾递进[：:](.+)/);
              if (escalationMatch) {
                result.conflictDesign.escalation = escalationMatch[1]
                  .split(/[、，,]+/)
                  .map(s => s.trim())
                  .filter(Boolean);
                continue;
              }
              // 支持数字列表格式 "1. 冲突：..."
              const conflictNumMatch = item.match(/^\d+[.、]\s*(?:冲突[：:])?\s*(.+)/);
              if (conflictNumMatch && conflictField === 'majorConflicts') {
                result.conflictDesign.majorConflicts.push(conflictNumMatch[1].trim());
                continue;
              }
              // 如果 conflictField 未设置但列表项是 "xxx vs yyy" 格式，也添加到 majorConflicts
              if (!conflictField && conflictNumMatch) {
                result.conflictDesign.majorConflicts.push(conflictNumMatch[1].trim());
                continue;
              }
              // 如果 conflictField 未设置且列表项不以数字开头，添加到 majorConflicts
              if (!conflictField && !/^\d+/.test(item.trim())) {
                result.conflictDesign.majorConflicts.push(item.trim());
                continue;
              }
              // 如果 conflictField 是 majorConflicts，直接添加（兜底）
              if (conflictField === 'majorConflicts') {
                result.conflictDesign.majorConflicts.push(item.trim());
                continue;
              }
              // 支持加粗格式 **主要冲突**：值
              const conflictMatch = item.match(/\*\*主要冲突\*\*[：:]\s*(.+)/) || item.match(/主要冲突[：:]\s*(.+)/);
              if (conflictMatch) {
                result.conflictDesign.majorConflicts = conflictMatch[1]
                  .split(/[、，,]+/)
                  .map(s => s.trim())
                  .filter(Boolean);
              }
            }
            break;
          case 'storyLines':
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
            for (const item of items) {
              if (currentStoryLine && item.trim()) {
                (result.storyLines as any)[currentStoryLine] = (
                  (result.storyLines as any)[currentStoryLine] +
                  ' ' +
                  item.trim()
                ).trim();
              }
            }
            break;
          case 'characters':
            // 解析角色列表
            for (const item of items) {
              if (!item.trim()) continue;

              // 跳过角色区块的子标题（如 "主角"、"其他角色"）
              if (item.includes('主角') || item.includes('其他角色') || item.includes('配角')) {
                continue;
              }

              // 格式1: `**姓名**：值` 或 `**角色类型**：值`
              const fieldMatch = item.match(/\*\*([^*]+)\*\*[：:]\s*(.+)/);
              if (fieldMatch) {
                const fieldName = fieldMatch[1].trim();
                const fieldValue = fieldMatch[2].trim();

                // 跳过非角色字段
                if (!['姓名', '角色类型', '描述', '性格标签', '金手指', '优势', '短板', '人际关系'].includes(fieldName)) {
                  continue;
                }

                // 如果没有当前角色，创建一个
                if (!currentCharacter) {
                  currentCharacter = this.createNewCharacter('');
                }

                switch (fieldName) {
                  case '姓名':
                    // 如果当前角色已有姓名，先保存再创建新的
                    if (currentCharacter.name && currentCharacter.name.trim()) {
                      result.characters.push({ ...currentCharacter });
                      currentCharacter = this.createNewCharacter(fieldValue);
                    } else {
                      currentCharacter.name = fieldValue;
                    }
                    break;
                  case '角色类型':
                    currentCharacter.role = this.normalizeCharacterRole(fieldValue);
                    break;
                  case '描述':
                    currentCharacter.identity = fieldValue;
                    currentCharacter.description = fieldValue;
                    break;
                }
                continue;
              }

              // 格式2: `角色名（role）：描述` 或 `角色名：描述`
              const simpleMatch = item.match(/^(.+?)[（(]([^）)]+)[）)][：:]\s*(.+)/);
              if (simpleMatch) {
                const charName = simpleMatch[1].trim();
                const charRole = simpleMatch[2].trim();
                const charDesc = simpleMatch[3].trim();

                // 保存之前的角色
                if (currentCharacter && currentCharacter.name) {
                  result.characters.push({ ...currentCharacter });
                }

                currentCharacter = this.createNewCharacter(charName, charRole, charDesc);
                continue;
              }

              // 格式3: `角色名：描述`（无括号）
              const colonMatch = item.match(/^([^：:：]+)[：:]\s*(.+)/);
              if (colonMatch && !item.includes('**')) {
                const charName = colonMatch[1].trim();
                const charDesc = colonMatch[2].trim();

                // 跳过标题类内容
                if (charName.includes('角色') || charName.includes('人物')) {
                  continue;
                }

                if (currentCharacter && currentCharacter.name) {
                  result.characters.push({ ...currentCharacter });
                }

                currentCharacter = this.createNewCharacter(charName, '配角', charDesc);
              }
            }
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
              } as any);
            } else if (worldSectionType === 'factions') {
              result.worldSetting.factions.push({
                name: name.trim(),
                description: description || '',
              } as any);
            } else if (worldSectionType === 'rules') {
              result.worldSetting.rules.push({
                name: name.trim(),
                description: description || '',
              } as any);
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
    if (currentCharacter && (currentCharacter as any).name) {
      result.characters.push(currentCharacter as Character);
    }
  }

  /**
   * 获取节点预览文本（调试用）
   */
  private getNodePreview(node: MDElement): string {
    if (node.type === 'heading') {
      const heading = node as Heading;
      const text = this.extractHeadingText(heading);
      return text.substring(0, 60);
    }
    if (node.type === 'paragraph') {
      const para = node as Paragraph;
      const text = this.extractText(para);
      return text.substring(0, 60);
    }
    if (node.type === 'list') {
      const list = node as List;
      return `list(${list.children.length} items)`;
    }
    if (node.type === 'table') {
      const table = node as Table;
      return `table(${table.children.length} rows)`;
    }
    return node.type;
  }

  /**
   * 提取标题文本
   */
  private extractHeadingText(heading: Heading): string {
    return heading.children
      .map(child => {
        if (child.type === 'text') {
          return (child as Text).value;
        }
        if (child.type === 'inlineCode') {
          return (child as any).value;
        }
        return '';
      })
      .join('');
  }

  /**
   * 提取段落文本（支持加粗等内联格式）
   */
  private extractText(node: Paragraph): string {
    return this.extractInlineText(node);
  }

  /**
   * 递归提取内联文本（支持加粗、斜体等）
   * 注意：不处理嵌套的列表节点（list/listItem），只提取当前层级的文本
   */
  private extractInlineText(node: any, skipLists: boolean = true): string {
    if (!node.children) {
      if (node.type === 'text') return node.value || '';
      if (node.type === 'inlineCode') return node.value || '';
      return '';
    }

    return node.children.map((child: any) => {
      if (child.type === 'text') return child.value || '';
      if (child.type === 'inlineCode') return child.value || '';
      // 跳过嵌套列表，只提取当前层级的文本内容
      if (skipLists && (child.type === 'list' || child.type === 'listItem')) return '';
      if (child.type === 'strong') return `**${this.extractInlineText(child, skipLists)}**`;
      if (child.type === 'emphasis') return `*${this.extractInlineText(child, skipLists)}*`;
      if (child.type === 'link') return this.extractInlineText(child, skipLists);
      if (child.type === 'paragraph') return this.extractInlineText(child, skipLists);
      return this.extractInlineText(child, skipLists);
    }).join('');
  }

  /**
   * 提取表格单元格文本
   */
  private extractTableCellText(cell: any): string {
    if (!cell.children) return '';
    return cell.children
      .map((child: any) => {
        if (child.type === 'text') {
          return child.value || '';
        }
        if (child.type === 'inlineCode') {
          return child.value || '';
        }
        return '';
      })
      .join('');
  }

  /**
   * 提取列表项（不递归处理嵌套列表）
   */
  private extractListItems(list: List): string[] {
    const items: string[] = [];

    for (const item of list.children) {
      if (item.type === 'listItem') {
        const listItem = item as ListItem;
        // 获取段落文本
        for (const child of listItem.children) {
          if (child.type === 'paragraph') {
            const text = this.extractInlineText(child);
            if (text.trim()) {
              items.push(text.trim());
            }
          }
        }
        // 注意：不递归处理嵌套列表，由调用方自行处理
      }
    }

    return items;
  }

  /**
   * 提取嵌套列表项（只提取直接子列表）
   */
  private extractNestedListItems(listItem: any): string[] {
    const items: string[] = [];

    for (const child of listItem.children) {
      if (child.type === 'list') {
        for (const nestedItem of child.children) {
          if (nestedItem.type === 'listItem') {
            // 提取嵌套列表项的文本
            for (const nestedChild of nestedItem.children) {
              if (nestedChild.type === 'paragraph') {
                const text = this.extractInlineText(nestedChild);
                if (text.trim()) {
                  items.push(text.trim());
                }
              }
            }
          }
        }
      }
    }

    return items;
  }

  /**
   * 提取表格内容
   */
  private extractTableContent(table: Table, result: ParseResult, section: string): void {
    const rows = table.children as TableRow[];
    if (rows.length < 2) return;

    // 提取表头
    const headerRow = rows[0];
    const headers = headerRow.children.map(cell => {
      if (cell.type === 'tableCell') {
        return this.extractTableCellText(cell as any).trim();
      }
      return '';
    });

    // 提取数据行
    for (let i = 1; i < rows.length; i++) {
      const dataRow = rows[i];
      const values = dataRow.children.map(cell => {
        if (cell.type === 'tableCell') {
          return this.extractTableCellText(cell as any).trim();
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
        if (lastChar && !lastChar.identity) {
          lastChar.identity = Object.values(rowData).join('；');
        }
      }

      // 世界设定 - 地点表格
      if (
        (section === 'worldSetting' || section === 'worldLocation') &&
        this.isLocationsTable(headers)
      ) {
        if (!result.worldSetting) {
          result.worldSetting = { locations: [], factions: [], rules: [] };
        }
        const locationName = rowData['地点名称'] || rowData['名称'] || rowData['地点'] || '';
        const description = rowData['描述'] || rowData['说明'] || '';
        const level = rowData['等级'] || rowData['层级'] || '';
        if (locationName) {
          result.worldSetting.locations.push({
            name: locationName,
            description: description,
            level: level || undefined,
          } as any);
        }
      }

      // 世界设定 - 势力表格
      if (
        (section === 'worldSetting' || section === 'worldFaction') &&
        this.isFactionsTable(headers)
      ) {
        if (!result.worldSetting) {
          result.worldSetting = { locations: [], factions: [], rules: [] };
        }
        const factionName = rowData['势力名称'] || rowData['名称'] || rowData['势力'] || '';
        const description = rowData['描述'] || rowData['说明'] || '';
        const allies = rowData['盟友'] || '';
        const enemies = rowData['敌人'] || '';
        if (factionName) {
          result.worldSetting.factions.push({
            name: factionName,
            description: description,
            allies: allies.split(/[、，,]/).filter(Boolean),
            enemies: enemies.split(/[、，,]/).filter(Boolean),
          } as any);
        }
      }

      // 世界设定 - 规则表格
      if ((section === 'worldSetting' || section === 'worldRule') && this.isRulesTable(headers)) {
        if (!result.worldSetting) {
          result.worldSetting = { locations: [], factions: [], rules: [] };
        }
        const ruleName = rowData['规则名称'] || rowData['名称'] || rowData['规则'] || '';
        const description = rowData['描述'] || rowData['说明'] || '';
        const category = rowData['类别'] || '';
        if (ruleName) {
          result.worldSetting.rules.push({
            name: ruleName,
            description: description,
            category: category || undefined,
          } as any);
        }
      }

      // 章节概览表格
      if (section === 'chapters' && this.isChaptersTable(headers)) {
        const chapterTitle = rowData['标题'] || rowData['章节标题'] || rowData['章节'] || '';
        const chapterNum = rowData['章节'] || '';
        const summary = rowData['摘要'] || rowData['简介'] || rowData['概要'] || '';
        const keyEvents = rowData['关键事件'] || rowData['事件'] || '';
        const characters = rowData['涉及角色'] || rowData['角色'] || '';

        if (chapterTitle || chapterNum) {
          const num = chapterNum
            ? parseInt(chapterNum.replace(/第|章/g, ''))
            : result.chapters.length + 1;
          result.chapters.push({
            number: num,
            title: chapterTitle || `第${num}章`,
            summary: summary,
            objectives: [],
            coolPoints: [],
            foreshadows: [],
            strand: 'quest',
            status: 'outline',
            keyEvents: keyEvents ? [keyEvents] : [],
            involvedCharacters: characters ? characters.split(/[、，,]/).filter(Boolean) : [],
          });
        }
      }

      // 伏笔表格
      if (section === 'foreshadows' && this.isForeshadowTable(headers)) {
        const hint = rowData['内容'] || rowData['伏笔'] || rowData['描述'] || '';
        const type = rowData['类型'] || '';
        const suggestedChapter = rowData['建议章节'] || rowData['章节'] || '';
        if (hint) {
          result.foreshadows.push({
            hint: hint,
            type: this.normalizeForeshadowType(type),
            suggestedChapter: suggestedChapter ? parseInt(suggestedChapter) : undefined,
            status: 'active',
          });
        }
      }

      // 爽点安排表格
      if (section === 'coolPointDesign' && this.isCoolPointTable(headers)) {
        if (!result.coolPointDesign) {
          result.coolPointDesign = { patterns: [], arranged: [] };
        }
        const chapter = rowData['章节'] || '';
        const type = rowData['类型'] || '';
        const description = rowData['描述'] || '';
        result.coolPointDesign.arranged.push({
          type: type,
          description: description,
          suggestedChapter: chapter ? parseInt(chapter) : undefined,
        });
      }

      // 核心卖点表格
      if (section === 'coreSellingPoints' && this.isCoreSellingPointsTable(headers)) {
        if (!result.coreSellingPoints) {
          result.coreSellingPoints = [];
        }
        const name = rowData['名称'] || rowData['卖点'] || rowData['标题'] || '';
        const description = rowData['描述'] || rowData['说明'] || '';
        const priority = rowData['优先级'] || rowData['优先'] || '';
        if (name) {
          result.coreSellingPoints.push(name + (description ? `：${description}` : '') + (priority ? ` [优先级：${priority}]` : ''));
        }
      }
    }
  }

  /**
   * 判断是否为核心卖点表格
   */
  private isCoreSellingPointsTable(headers: string[]): boolean {
    const normalized = headers.map(h => h.toLowerCase());
    return (
      normalized.some(h => h.includes('卖点')) ||
      normalized.some(h => h.includes('selling')) ||
      normalized.some(h => h.includes('名称')) ||
      normalized.some(h => h.includes('priority'))
    );
  }

  /**
   * 判断是否为地点表格
   */
  private isLocationsTable(headers: string[]): boolean {
    const normalized = headers.map(h => h.toLowerCase());
    return normalized.some(h => h.includes('地点')) || normalized.some(h => h.includes('location'));
  }

  /**
   * 判断是否为势力表格
   */
  private isFactionsTable(headers: string[]): boolean {
    const normalized = headers.map(h => h.toLowerCase());
    return normalized.some(h => h.includes('势力')) || normalized.some(h => h.includes('faction'));
  }

  /**
   * 判断是否为规则表格
   */
  private isRulesTable(headers: string[]): boolean {
    const normalized = headers.map(h => h.toLowerCase());
    return normalized.some(h => h.includes('规则')) || normalized.some(h => h.includes('rule'));
  }

  /**
   * 判断是否为章节表格
   */
  private isChaptersTable(headers: string[]): boolean {
    const normalized = headers.map(h => h.toLowerCase());
    return normalized.some(h => h.includes('章节')) || normalized.some(h => h.includes('chapter'));
  }

  /**
   * 判断是否为伏笔表格
   */
  private isForeshadowTable(headers: string[]): boolean {
    const normalized = headers.map(h => h.toLowerCase());
    return (
      normalized.some(h => h.includes('伏笔')) ||
      normalized.some(h => h.includes('foreshadow')) ||
      normalized.some(h => h.includes('内容')) ||
      normalized.some(h => h.includes('hint'))
    );
  }

  /**
   * 判断是否为爽点表格
   */
  private isCoolPointTable(headers: string[]): boolean {
    const normalized = headers.map(h => h.toLowerCase());
    return (
      normalized.some(h => h.includes('爽点')) ||
      normalized.some(h => h.includes('cool')) ||
      normalized.some(h => h.includes('章节'))
    );
  }

  /**
   * 规范化伏笔类型
   */
  private normalizeForeshadowType(type: string): 'item' | 'dialogue' | 'event' | 'mystery' {
    if (!type) return 'mystery';
    const t = type.toLowerCase();
    if (t.includes('道具') || t.includes('物品') || t.includes('item')) return 'item';
    if (t.includes('对话') || t.includes('dialogue')) return 'dialogue';
    if (t.includes('事件') || t.includes('event')) return 'event';
    // 悬念/mystery 放在最后，作为默认值
    return 'mystery';
  }

  /**
   * 从文本解析情绪目标字段
   */
  private parseEmotionFromText(result: ParseResult, text: string): void {
    if (!result.emotionGoal) return;
    // 核心情绪
    const coreMatch = text.match(/核心情绪[：:]\s*(.+)/);
    if (coreMatch) {
      result.emotionGoal.primary = coreMatch[1].trim();
      return;
    }
    // 次要情绪
    const secMatch = text.match(/次要情绪[：:]\s*(.+)/);
    if (secMatch) {
      result.emotionGoal.secondary = secMatch[1].trim();
      return;
    }
    // 情绪弧线
    const arcMatch = text.match(/情绪弧线[：:]\s*(.+)/);
    if (arcMatch) {
      result.emotionGoal.arc = arcMatch[1].trim();
      return;
    }
    // 情绪密度
    const densityMatch = text.match(/情绪密度[：:]\s*(\d+)/);
    if (densityMatch) {
      result.emotionGoal.density = parseInt(densityMatch[1]);
      return;
    }
    // 情绪高点
    const highMatch = text.match(/情绪高点[：:]\s*([\d,，\s]+)/);
    if (highMatch) {
      result.emotionGoal.highPoints = highMatch[1]
        .split(/[,\s，]+/)
        .filter(Boolean)
        .map(Number);
      return;
    }
    // 情绪低点
    const lowMatch = text.match(/情绪低点[：:]\s*([\d,，\s]+)/);
    if (lowMatch) {
      result.emotionGoal.lowPoints = lowMatch[1]
        .split(/[,\s，]+/)
        .filter(Boolean)
        .map(Number);
    }
  }

  /**
   * 从文本解析矛盾设计字段
   */
  private parseConflictFromText(result: ParseResult, text: string): void {
    if (!result.conflictDesign) return;
    // 冲突来源
    const sourceMatch = text.match(/冲突来源[：:]\s*(.+)/);
    if (sourceMatch) {
      result.conflictDesign.source = sourceMatch[1].trim();
      return;
    }
    // 矛盾递进（数字列表）
    const escalationMatch = text.match(/矛盾递进[：:]([\s\S]+)/);
    if (escalationMatch) {
      result.conflictDesign.escalation = escalationMatch[1]
        .split(/[、，,\n]+/)
        .map(s => s.trim())
        .filter(Boolean);
      return;
    }
    // 主要冲突
    const conflictMatch = text.match(/主要冲突[：:]\s*([\s\S]+)/);
    if (conflictMatch) {
      result.conflictDesign.majorConflicts = conflictMatch[1]
        .split(/[、，,\n]+/)
        .map(s => s.trim())
        .filter(Boolean);
    }
  }

  /**
   * 规范化角色类型
   * 返回中文枚举值，与 CharacterSchema 中的 z.enum(['主角', '女主', '导师', '反派', '配角']) 匹配
   */
  private normalizeCharacterRole(role: string): '主角' | '女主' | '导师' | '反派' | '配角' {
    if (!role) return '配角';
    const r = role.toLowerCase();

    // 女主/女一（网文特色，女性主角）
    if (r.includes('女主') || r.includes('女一')) return '女主';

    // 主角/男主/男一（主角）
    if (r.includes('主角') || r.includes('protagonist') || r.includes('hero') || r.includes('男主') || r.includes('男一')) return '主角';

    // 反派/敌人
    if (r.includes('反派') || r.includes('antagonist') || r.includes('敌人') || r.includes('villain') || r.includes('boss')) return '反派';

    // 导师/师父/师尊
    if (r.includes('导师') || r.includes('mentor') || r.includes('师父') || r.includes('师尊') || r.includes('师傅')) return '导师';

    // 配角/次要角色/小角色/龙套/伙伴/宠物/坐骑/灵兽（都归为配角）
    if (r.includes('配角') || r.includes('supporting') || r.includes('secondary') || r.includes('minor') || r.includes('小角色') || r.includes('龙套') || r.includes('伙伴') || r.includes('宠物') || r.includes('坐骑') || r.includes('灵兽') || r.includes('comrade') || r.includes('companion') || r.includes('pet')) return '配角';

    // 默认返回配角
    return '配角';
  }

  /**
   * 创建新角色对象
   */
  private createNewCharacter(name: string, role: string = '配角', description: string = ''): Character {
    return {
      name,
      role: this.normalizeCharacterRole(role),
      description,
      identity: description,
      personality: [],
      strengths: [],
      weaknesses: [],
      goals: [],
      currentDilemma: '',
      relationships: [],
    };
  }

  /**
   * 清理结果
   */
  private cleanResult(result: ParseResult): ParseResult {
    return {
      title: result.title || '未命名大纲',
      synopsis: result.synopsis || '',
      genres: result.genres.filter(g => g.trim()),
      chapters: result.chapters.filter(ch => ch.title),
      characters: result.characters.filter(c => c.name || c.role),
      structure: result.structure,
      foreshadows: result.foreshadows,
      worldSetting: result.worldSetting,
      estimatedWordCount: result.estimatedWordCount,
      coreSellingPoints: result.coreSellingPoints,
      emotionGoal: result.emotionGoal,
      coolPointDesign: result.coolPointDesign,
      storyLines: result.storyLines,
      conflictDesign: result.conflictDesign,
    };
  }
}

// 导出单例
export const remarkParser = new RemarkParser();
