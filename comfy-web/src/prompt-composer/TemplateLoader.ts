import {
  TemplateDefinition,
  ResolvedTemplate,
  PromptValue,
  TemplateCategoryKey,
} from "@/types/prompt-composer";

const TEMPLATES_PATH = "/packs/templates";
const DEFAULT_PACK_PATH = "/packs/default";

let cachedTemplates: TemplateDefinition[] | null = null;
const resolvedCache = new Map<string, ResolvedTemplate>();

export async function loadTemplateList(): Promise<TemplateDefinition[]> {
  if (cachedTemplates) return cachedTemplates;

  try {
    const res = await fetch(`${TEMPLATES_PATH}/index.json`);
    if (!res.ok) throw new Error(`Failed to fetch template index: ${res.status}`);
    const ids: string[] = await res.json();

    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const tplRes = await fetch(`${TEMPLATES_PATH}/${id}.json`);
        if (!tplRes.ok) throw new Error(`Failed to fetch template ${id}`);
        return tplRes.json() as Promise<TemplateDefinition>;
      })
    );

    cachedTemplates = results
      .filter((r): r is PromiseFulfilledResult<TemplateDefinition> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((a, b) => a.name.localeCompare(b.name));

    return cachedTemplates || [];
  } catch (err) {
    console.error("Failed to load template list:", err);
    return [];
  }
}

export async function loadTemplate(id: string): Promise<ResolvedTemplate | null> {
  if (resolvedCache.has(id)) return resolvedCache.get(id)!;

  const templates = await loadTemplateList();
  const definition = templates.find((t) => t.id === id);
  if (!definition) return null;

  const categoryData: Partial<Record<TemplateCategoryKey, PromptValue[]>> = {};

  const loadPromises = definition.categories.map(async (cat) => {
    const packPath = cat.pack || `${DEFAULT_PACK_PATH}/${cat.key}.json`;
    try {
      const res = await fetch(packPath);
      if (!res.ok) return { key: cat.key, values: [] as PromptValue[] };
      const values = (await res.json()) as PromptValue[];
      return { key: cat.key, values };
    } catch {
      return { key: cat.key, values: [] as PromptValue[] };
    }
  });

  const results = await Promise.allSettled(loadPromises);
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.values.length > 0) {
      categoryData[result.value.key] = result.value.values;
    }
  }

  const resolved: ResolvedTemplate = { definition, categories: categoryData };
  resolvedCache.set(id, resolved);
  return resolved;
}

export async function loadAllTemplates(): Promise<ResolvedTemplate[]> {
  const definitions = await loadTemplateList();
  const results = await Promise.allSettled(
    definitions.map((def) => loadTemplate(def.id))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<ResolvedTemplate | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((t): t is ResolvedTemplate => t !== null);
}

export function clearTemplateCache(): void {
  cachedTemplates = null;
  resolvedCache.clear();
}
