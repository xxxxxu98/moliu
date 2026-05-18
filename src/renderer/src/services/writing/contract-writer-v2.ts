/**
 * 合同写入服务 v2
 * Moliu v2.0 - 基于合同驱动架构的合同写入服务
 * 
 * 职责：
 * 1. 将大纲转换为 MasterContract
 * 2. 将章节计划转换为 ChapterContract
 * 3. 写入/读取合同文件
 * 4. 合同版本管理
 */

import { promises as fs } from "fs";
import { join, dirname } from "path";
import { useContractManager } from "@/composables/new/useContractManager";
import { GENRE_PROFILES } from "@/data/genre-profiles";
import { HOOK_TECHNIQUES } from "@/data/hook-techniques";
import { COOLPOINT_FORMULAS } from "@/data/coolpoint-formulas";
import type {
  MasterContract,
  VolumeContract,
  ChapterContract,
  ChapterBeginningNode,
  ChapterProgressNode,
  ChapterEndNode,
  CharacterContract,
  ForeshadowContract,
  PowerLevelContract,
  GenreProfile,
  CoreSetting,
  StrandPlan,
} from "@/types/contract";
import type { HookType, CoolPointType } from "@/types/evaluation";

// ============================================================
// Types
// ============================================================

export interface ContractWriteOptions {
  projectId: string;
  projectName: string;
  outputDir: string;
}

export interface OutlineToContractInput {
  title: string;
  synopsis: string;
  genres: string[];
  emotionGoals: string[];
  coreSetting: {
    worldType: string;
    powerSystem: string;
    goldenFinger: string;
    protagonistType: string;
    antagonistType?: string;
    mainConflict?: string;
  };
  coolPoints: CoolPointType[];
  hooks?: HookType[];
  characters?: {
    name: string;
    role: "protagonist" | "antagonist" | "supporting" | "minor";
    description: string;
  }[];
  chapters?: {
    number: number;
    title: string;
    synopsis: string;
  }[];
}

// ============================================================
// Service
// ============================================================

export class ContractWriterService {
  private projectId: string;
  private projectName: string;
  private outputDir: string;
  private contractManager: ReturnType<typeof useContractManager>;

  constructor(options: ContractWriteOptions) {
    this.projectId = options.projectId;
    this.projectName = options.projectName;
    this.outputDir = options.outputDir;
    this.contractManager = useContractManager();
  }

  /**
   * 从大纲输入生成主合同
   */
  async createMasterContract(input: OutlineToContractInput): Promise<MasterContract> {
    // 匹配题材 Profile
    const genreProfile = this.matchGenreProfile(input.genres);

    // 构建核心设定
    const coreSetting: CoreSetting = {
      worldType: this.mapWorldType(input.coreSetting.worldType),
      timePeriod: "当代",
      powerSystem: this.mapPowerSystem(input.coreSetting.powerSystem),
      socialStructure: "待填充",
      technologyLevel: "待填充",
      culturalBackground: "待填充",
      mainLocation: "待填充",
      rules: [],
    };

    // 构建角色合同
    const characters: CharacterContract[] = this.buildCharacterContracts(input.characters || []);

    // 构建核心伏笔
    const coreForeshadows: ForeshadowContract[] = this.buildCoreForeshadows(input);

    // 构建能力等级系统
    const powerSystem: PowerLevelContract = this.buildPowerSystem(input.coreSetting.powerSystem);

    // 构建 Strand 计划
    const strands: StrandPlan = this.buildStrandPlan(input);

    const masterContract: MasterContract = {
      meta: {
        version: "2.0",
        projectId: this.projectId,
        projectName: input.title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: "",
        description: input.synopsis,
      },
      genreProfile,
      coreSetting,
      characters,
      creativeConstraints: {
        minChapterLength: 2000,
        maxChapterLength: 5000,
        targetAudience: this.inferAudience(input.genres),
        prohibitedContent: [],
        requiredElements: input.coolPoints.map(cp => cp),
        antiTropes: [],
      },
      strands,
      coreForeshadows,
      powerSystem,
    };

    return masterContract;
  }

  /**
   * 生成章节合同
   */
  async createChapterContract(
    chapterNumber: number,
    chapterTitle: string,
    synopsis: string,
    foreshadows: string[],
    coolPoints: string[],
    hooks: HookType[]
  ): Promise<ChapterContract> {
    // 章节开始节点 (CBN)
    const cbn: ChapterBeginningNode = {
      id: `cbn-${chapterNumber}`,
      summary: synopsis.slice(0, 200),
      charactersPresent: [],
      location: "",
      timeContext: "",
      precedingChapterId: chapterNumber > 1 ? `chapter-${chapterNumber - 1}` : null,
      emotionalState: "待确定",
      hooksToSet: hooks,
      foreshadowReminders: foreshadows.slice(0, 2),
    };

    // 章节进度节点 (CPNs)
    const cpns: ChapterProgressNode[] = this.generateCPNs(synopsis, coolPoints);

    // 章节结束节点 (CEN)
    const cen: ChapterEndNode = {
      id: `cen-${chapterNumber}`,
      summary: synopsis.slice(-200),
      charactersState: {},
      plotAdvancement: "待填充",
      hooksRevealed: [],
      foreshadowAdvances: foreshadows,
      cliffhanger: this.generateCliffhanger(chapterNumber, synopsis),
      nextChapterPreview: "",
    };

    return {
      cbn,
      cpns,
      cen,
      foreshadowOps: foreshadows.map(f => ({
        id: `foreshadow-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        foreshadowId: f,
        operation: "advance",
        detail: synopsis.slice(0, 100),
      })),
    };
  }

  /**
   * 写入合同文件
   */
  async writeMasterContract(contract: MasterContract): Promise<string> {
    const dir = join(this.outputDir, this.projectId, "contracts");
    await fs.mkdir(dir, { recursive: true });

    const filePath = join(dir, "MASTER_SETTING.json");
    await fs.writeFile(filePath, JSON.stringify(contract, null, 2), "utf-8");

    return filePath;
  }

  async writeVolumeContract(volumeNumber: number, contract: VolumeContract): Promise<string> {
    const dir = join(this.outputDir, this.projectId, "contracts");
    await fs.mkdir(dir, { recursive: true });

    const filePath = join(dir, `Volume_${volumeNumber.toString().padStart(3, "0")}.json`);
    await fs.writeFile(filePath, JSON.stringify(contract, null, 2), "utf-8");

    return filePath;
  }

  async writeChapterContract(chapterNumber: number, contract: ChapterContract): Promise<string> {
    const dir = join(this.outputDir, this.projectId, "contracts", "chapters");
    await fs.mkdir(dir, { recursive: true });

    const filePath = join(dir, `Chapter_${chapterNumber.toString().padStart(4, "0")}.json`);
    await fs.writeFile(filePath, JSON.stringify(contract, null, 2), "utf-8");

    return filePath;
  }

  /**
   * 读取合同文件
   */
  async readMasterContract(): Promise<MasterContract | null> {
    try {
      const filePath = join(this.outputDir, this.projectId, "contracts", "MASTER_SETTING.json");
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async readChapterContract(chapterNumber: number): Promise<ChapterContract | null> {
    try {
      const filePath = join(
        this.outputDir,
        this.projectId,
        "contracts",
        "chapters",
        `Chapter_${chapterNumber.toString().padStart(4, "0")}.json`
      );
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private matchGenreProfile(genres: string[]): GenreProfile {
    const firstGenre = genres[0]?.toLowerCase() || "urban";
    const profile = GENRE_PROFILES.find(
      p => p.name.toLowerCase().includes(firstGenre)
    );
    return profile || GENRE_PROFILES[0];
  }

  private mapWorldType(worldType: string): string {
    const mapping: Record<string, string> = {
      urban: "现代都市",
      ancient: "古代社会",
      xianxia: "修仙世界",
      fantasy: "异世界",
      scifi: "未来/星际",
      historical: "历史架空",
    };
    return mapping[worldType] || worldType;
  }

  private mapPowerSystem(powerSystem: string): string {
    const mapping: Record<string, string> = {
      cultivation: "修仙境界体系",
      system: "系统流",
      martial: "武学体系",
      magic: "魔法体系",
      tech: "科技力量",
      none: "无特殊体系",
    };
    return mapping[powerSystem] || powerSystem;
  }

  private buildCharacterContracts(
    characters: OutlineToContractInput["characters"]
  ): CharacterContract[] {
    return characters.map((char, index) => ({
      id: `char-${index + 1}`,
      name: char.name,
      role: char.role,
      description: char.description,
      personalityTraits: [],
      abilities: [],
      relationships: [],
      arcDescription: "",
      firstAppearance: 1,
      status: "active",
    }));
  }

  private buildCoreForeshadows(input: OutlineToContractInput): ForeshadowContract[] {
    const foreshadows: ForeshadowContract[] = [];

    // 基于冲突创建伏笔
    if (input.coreSetting.mainConflict) {
      foreshadows.push({
        id: `fs-conflict-${Date.now()}`,
        type: "plot",
        setupChapter: 1,
        revealChapter: Math.max(20, Math.floor(Math.random() * 30) + 20),
        description: input.coreSetting.mainConflict,
        hint: "待填充",
        importance: "core",
        status: "active",
      });
    }

    // 基于金手指创建伏笔
    if (input.coreSetting.goldenFinger) {
      foreshadows.push({
        id: `fs-goldenfinger-${Date.now()}`,
        type: "ability",
        setupChapter: 1,
        revealChapter: Math.max(3, Math.floor(Math.random() * 5) + 3),
        description: input.coreSetting.goldenFinger,
        hint: "待填充",
        importance: "major",
        status: "active",
      });
    }

    return foreshadows;
  }

  private buildPowerSystem(powerSystemType: string): PowerLevelContract {
    if (powerSystemType === "cultivation") {
      return {
        name: "修仙境界",
        levels: [
          { name: "炼气期", order: 1, description: "入门修炼" },
          { name: "筑基期", order: 2, description: "奠定基础" },
          { name: "金丹期", order: 3, description: "结成金丹" },
          { name: "元婴期", order: 4, description: "元婴出窍" },
          { name: "化神期", order: 5, description: "化凡为神" },
        ],
        progressionRule: "境界突破需机缘与努力",
      };
    }

    return {
      name: "通用等级",
      levels: [
        { name: "初级", order: 1, description: "" },
        { name: "中级", order: 2, description: "" },
        { name: "高级", order: 3, description: "" },
        { name: "大师", order: 4, description: "" },
        { name: "宗师", order: 5, description: "" },
      ],
      progressionRule: "通过修炼/学习提升",
    };
  }

  private buildStrandPlan(input: OutlineToContractInput): StrandPlan {
    return {
      questLines: [
        {
          id: `quest-1-${Date.now()}`,
          name: "主线任务",
          description: input.coreSetting.mainConflict || "待填充",
          status: "active",
        },
      ],
      fireLines: [
        {
          id: `fire-1-${Date.now()}`,
          name: "爽点线",
          coolPoints: input.coolPoints.slice(0, 3),
          targetChapters: [],
        },
      ],
      constellationLines: [],
    };
  }

  private generateCPNs(synopsis: string, coolPoints: string[]): ChapterProgressNode[] {
    const cpns: ChapterProgressNode[] = [];

    // 生成 2-4 个进度节点
    const count = Math.min(4, Math.max(2, Math.floor(synopsis.length / 500)));

    for (let i = 0; i < count; i++) {
      cpns.push({
        id: `cpn-${Date.now()}-${i}`,
        order: i + 1,
        description: synopsis.slice(
          (i * synopsis.length) / count,
          ((i + 1) * synopsis.length) / count
        ),
        coolPointOps: coolPoints.slice(i % coolPoints.length, (i % coolPoints.length) + 1),
        characterActions: [],
        foreshadowOps: [],
      });
    }

    return cpns;
  }

  private generateCliffhanger(chapterNumber: number, synopsis: string): string {
    // 基于章节数生成不同的钩子结尾
    const cliffhangers = [
      "就在此时，意外发生了...",
      "突然，一个声音从黑暗中传来...",
      "他没想到，真正的高手竟然是...",
      "这一刻，所有的计划都被打乱了...",
      "悬念：主角将如何应对？",
    ];

    return cliffhangers[chapterNumber % cliffhangers.length];
  }

  private inferAudience(genres: string[]): "male" | "female" | "general" {
    const maleGenres = ["玄幻", "修仙", "都市", "科幻", "军事", "游戏"];
    const femaleGenres = ["言情", "总裁", "校园", "甜宠", "宫斗"];

    const genreStr = genres.join("");

    if (maleGenres.some(g => genreStr.includes(g))) return "male";
    if (femaleGenres.some(g => genreStr.includes(g))) return "female";
    return "general";
  }
}

// ============================================================
// Export singleton factory
// ============================================================

export function createContractWriterService(
  options: ContractWriteOptions
): ContractWriterService {
  return new ContractWriterService(options);
}
