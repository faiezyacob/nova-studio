import {
  ThemePackData,
  ThemePackMeta,
  PromptCategoryKey,
  PromptValue,
  RelationshipRule,
} from "@/types/prompt-composer";

const PACK_BASE_PATH = "/packs/default";

let cachedPack: ThemePackData | null = null;

export async function loadPack(): Promise<ThemePackData> {
  if (cachedPack) return cachedPack;

  const meta = await fetchJSON<ThemePackMeta>(`${PACK_BASE_PATH}/meta.json`);
  const categories: Partial<Record<PromptCategoryKey, PromptValue[]>> = {};

  const categoryKeys: PromptCategoryKey[] = [
    "subject", "ethnicity", "age", "bodyType", "skin",
    "hair", "hairColor", "facialHair", "eyes",
    "expression", "pose", "clothing", "accessories",
    "location", "weather", "time",
    "lighting", "camera", "lens", "composition",
    "mood", "style", "quality", "details",
  ];

  const results = await Promise.allSettled(
    categoryKeys.map(async (key) => {
      try {
        const values = await fetchJSON<PromptValue[]>(`${PACK_BASE_PATH}/${key}.json`);
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

  cachedPack = { meta, categories };
  return cachedPack;
}

export async function loadRules(): Promise<RelationshipRule[]> {
  try {
    return await fetchJSON<RelationshipRule[]>(`${PACK_BASE_PATH}/rules.json`);
  } catch {
    return [];
  }
}

export async function loadCategoryData(
  packPath: string
): Promise<PromptValue[]> {
  try {
    return await fetchJSON<PromptValue[]>(packPath);
  } catch {
    return [];
  }
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}
