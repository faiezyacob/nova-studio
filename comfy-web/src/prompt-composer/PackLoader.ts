import {
  ThemePackData,
  ThemePackMeta,
  PromptCategoryKey,
  PromptValue,
} from "@/types/prompt-composer";

const PACK_BASE_PATH = "/packs";

const cachedPacks: Map<string, ThemePackData> = new Map();
let discoveredPacks: string[] = [];

export async function discoverPacks(): Promise<string[]> {
  try {
    const res = await fetch(`${PACK_BASE_PATH}/index.json`);
    if (!res.ok) {
      discoveredPacks = ["default"];
      return discoveredPacks;
    }
    const data = await res.json();
    discoveredPacks = Array.isArray(data) ? data : ["default"];
    return discoveredPacks;
  } catch {
    discoveredPacks = ["default"];
    return discoveredPacks;
  }
}

export async function loadPack(packName: string): Promise<ThemePackData> {
  if (cachedPacks.has(packName)) {
    return cachedPacks.get(packName)!;
  }

  const meta = await fetchJSON<ThemePackMeta>(`${PACK_BASE_PATH}/${packName}/meta.json`);
  const categories: Partial<Record<PromptCategoryKey, PromptValue[]>> = {};

  const categoryKeys: PromptCategoryKey[] = [
    "subject", "species", "gender", "age", "hair", "eyes",
    "expression", "pose", "clothing", "accessories",
    "location", "environment", "weather", "season", "time",
    "lighting", "camera", "lens", "composition",
    "mood", "style", "quality", "details",
  ];

  const results = await Promise.allSettled(
    categoryKeys.map(async (key) => {
      try {
        const values = await fetchJSON<PromptValue[]>(`${PACK_BASE_PATH}/${packName}/${key}.json`);
        return { key, values };
      } catch {
        return { key, values: [] as PromptValue[] };
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.values.length > 0) {
      categories[result.value.key] = result.value.values;
    }
  }

  const pack: ThemePackData = { meta, categories };
  cachedPacks.set(packName, pack);
  return pack;
}

export async function loadAllPacks(): Promise<ThemePackData[]> {
  const packNames = await discoverPacks();
  const packs = await Promise.allSettled(
    packNames.map(name => loadPack(name))
  );
  return packs
    .filter((r): r is PromiseFulfilledResult<ThemePackData> => r.status === "fulfilled")
    .map(r => r.value);
}

export async function loadRules(packName: string): Promise<import("@/types/prompt-composer").RelationshipRule[]> {
  try {
    return await fetchJSON<import("@/types/prompt-composer").RelationshipRule[]>(
      `${PACK_BASE_PATH}/${packName}/rules.json`
    );
  } catch {
    return [];
  }
}

export function getCachedPack(packName: string): ThemePackData | undefined {
  return cachedPacks.get(packName);
}

export function clearPackCache(): void {
  cachedPacks.clear();
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}
