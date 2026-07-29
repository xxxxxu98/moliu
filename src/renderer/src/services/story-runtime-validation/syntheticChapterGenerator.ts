import type {
  SyntheticChapter,
  SyntheticChapterGeneratorOptions,
  SyntheticChapterOracle,
  ValidationCategory,
} from './types';

const CATEGORIES: readonly ValidationCategory[] = [
  'character_memory',
  'character_knowledge',
  'character_ability',
  'fact',
  'style',
  'temporal_causality',
  'world_rule',
];

const CHARACTER_NAMES: readonly string[] = ['沈砚', '闻雪', '陆照', '宁川', '顾青', '苏棠'];
const LOCATIONS: readonly string[] = ['临渊城', '白塔', '雾港', '北境驿站', '星沉谷'];
const ITEMS: readonly string[] = ['铜纹钥匙', '无字令', '赤羽灯', '潮汐罗盘', '旧王印'];
const DEFAULT_SEED = 20260729;

function mixSeed(seed: number, chapterNumber: number): number {
  let value = (seed ^ Math.imul(chapterNumber, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function select<T>(values: readonly T[], randomValue: number, offset: number): T {
  return values[(randomValue + offset) % values.length];
}

function countCharacters(content: string): number {
  return Array.from(content.replace(/\s/g, '')).length;
}

function buildCategoryConstraint(
  category: ValidationCategory,
  character: string,
  location: string,
  item: string,
  chapterNumber: number
): { mustCover: string; forbiddenFact: string; body: string } {
  const previousChapter = Math.max(1, chapterNumber - 1);
  const constraints: Record<
    ValidationCategory,
    { mustCover: string; forbiddenFact: string; body: string }
  > = {
    character_memory: {
      mustCover: `${character}记得${item}来自${location}`,
      forbiddenFact: `${character}从未见过${item}`,
      body: `${character}触到${item}的刻痕，立刻想起在${location}立下的约定，没有把旧事错认成梦。`,
    },
    character_knowledge: {
      mustCover: `${character}尚不知道密令内容`,
      forbiddenFact: `${character}准确说出尚未获知的密令`,
      body: `${character}只知道密令与${location}有关，却不知道其中原文，因此没有提前作出只有知情者才能作出的判断。`,
    },
    character_ability: {
      mustCover: `${character}只能维持三息术法`,
      forbiddenFact: `${character}连续维持术法十息`,
      body: `${character}依照既定能力只维持三息术法，第四息到来前便收手，改用${item}脱困。`,
    },
    fact: {
      mustCover: `${item}当前由${character}保管`,
      forbiddenFact: `${item}已经被永久销毁`,
      body: `账册再次确认，${item}仍由${character}保管，封蜡与上一章一致，这一事实没有被新的传闻覆盖。`,
    },
    style: {
      mustCover: '保持第三人称限知与冷峻克制',
      forbiddenFact: '切换全知视角并直接解释所有人的心理',
      body: `雨落得很直。${character}看见${location}的灯逐盏熄灭，只记下脚步与门缝里的光，没有替旁人解释心思。`,
    },
    temporal_causality: {
      mustCover: `第${previousChapter}章的行动先于本章结果`,
      forbiddenFact: '结果早于原因发生',
      body: `承接第${previousChapter}章留下的行动，信使先抵达${location}，随后${character}才收到回音，先因后果没有倒置。`,
    },
    world_rule: {
      mustCover: '城门结界只在日落后开启',
      forbiddenFact: '正午时城门结界自行开启',
      body: `${character}在日落前停步等待。天光完全沉下后，${location}的结界才依照世界规则开启。`,
    },
  };

  return constraints[category];
}

function buildOracle(
  category: ValidationCategory,
  chapterNumber: number,
  character: string,
  location: string,
  item: string,
  constraint: ReturnType<typeof buildCategoryConstraint>
): SyntheticChapterOracle {
  const introducedEntities =
    chapterNumber % 17 === 0 ? [`支线人物-${String(chapterNumber).padStart(4, '0')}`] : [];

  return {
    knownEntities: [...CHARACTER_NAMES, ...LOCATIONS, ...ITEMS],
    introducedEntities,
    mustCover: [constraint.mustCover],
    forbiddenFacts: [constraint.forbiddenFact],
    stateExpectations: [
      {
        entityId: character,
        field: category === 'character_ability' ? 'ability_limit' : 'current_location',
        expectedValue: category === 'character_ability' ? '三息' : location,
      },
      {
        entityId: item,
        field: 'holder',
        expectedValue: character,
      },
    ],
    style: {
      perspective: 'third_person_limited',
      tone: '冷峻克制',
      forbiddenPatterns: ['众人都不知道', '命运的齿轮', '不禁倒吸一口凉气'],
    },
    causalPredecessors: chapterNumber > 1 ? [chapterNumber - 1] : [],
    worldRules: ['城门结界只在日落后开启', '未登记的传送术无法穿过白塔边界'],
  };
}

/**
 * 按需生成章节，不在仓库中保存 100/500/2000 章的大型 fixture。
 * 同一 seed 与章节数的输出逐章完全一致，也可中途停止迭代。
 */
export function* generateSyntheticChapters(
  options: SyntheticChapterGeneratorOptions
): Generator<SyntheticChapter, void, undefined> {
  const seed = options.seed ?? DEFAULT_SEED;

  for (let chapterNumber = 1; chapterNumber <= options.chapterCount; chapterNumber += 1) {
    const randomValue = mixSeed(seed, chapterNumber);
    const category = CATEGORIES[(chapterNumber - 1) % CATEGORIES.length];
    const character = select(CHARACTER_NAMES, randomValue, 0);
    const location = select(LOCATIONS, randomValue, 3);
    const item = select(ITEMS, randomValue, 7);
    const constraint = buildCategoryConstraint(
      category,
      character,
      location,
      item,
      chapterNumber
    );
    const title = `第${chapterNumber}章 ${location}的回声`;
    const content = [
      `夜色压住${location}的檐角，${character}携着${item}沿石阶前行。`,
      constraint.body,
      `本章编号为${chapterNumber}，所有变化均以已发生事件和可见证据为准。`,
    ].join('\n');

    yield {
      id: `synthetic-${String(chapterNumber).padStart(4, '0')}`,
      chapterNumber,
      title,
      category,
      content,
      characterCount: countCharacters(content),
      oracle: buildOracle(
        category,
        chapterNumber,
        character,
        location,
        item,
        constraint
      ),
    };
  }
}

export function createSyntheticChapter(
  chapterNumber: number,
  options: SyntheticChapterGeneratorOptions
): SyntheticChapter {
  if (chapterNumber < 1 || chapterNumber > options.chapterCount) {
    throw new RangeError(`章节编号必须位于 1 到 ${options.chapterCount} 之间`);
  }

  let current: SyntheticChapter | undefined;
  for (const chapter of generateSyntheticChapters(options)) {
    if (chapter.chapterNumber === chapterNumber) {
      current = chapter;
      break;
    }
  }

  if (!current) {
    throw new Error(`无法生成第 ${chapterNumber} 章`);
  }
  return current;
}
