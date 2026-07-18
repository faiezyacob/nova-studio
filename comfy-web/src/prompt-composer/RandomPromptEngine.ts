import {
  PromptCategoryKey,
  PromptState,
  ThemePackData,
  CATEGORY_CONFIGS,
  CATEGORY_ORDER,
  RelationshipRule,
  TemplateDefinition,
  TemplateState,
  TemplateCategoryKey,
  ResolvedTemplate,
} from "@/types/prompt-composer";

function getAvailableValues(
  category: PromptCategoryKey,
  packData: ThemePackData,
  rules: RelationshipRule[],
  currentState: PromptState
): string[] {
  const baseValues = (packData.categories[category] || []).map(v => v.name);
  if (rules.length === 0) return baseValues;

  const allowed = new Set<string>();
  const forbidden = new Set<string>();

  for (const rule of rules) {
    const match = rule.when.values.includes(
      currentState[rule.when.category]?.value[0] || ""
    );
    const target = match ? rule.then : rule.otherwise;
    const targetValues = target[category];
    if (targetValues) {
      if (match) {
        targetValues.forEach(v => allowed.add(v));
      } else {
        targetValues.forEach(v => forbidden.add(v));
      }
    }
  }

  if (allowed.size === 0 && forbidden.size === 0) return baseValues;
  if (allowed.size > 0) return baseValues.filter(v => allowed.has(v));
  return baseValues.filter(v => !forbidden.has(v));
}

function getWeightedRandom(values: string[], packData: ThemePackData, category: PromptCategoryKey): string {
  const packValues = packData.categories[category] || [];
  const weighted: string[] = [];

  for (const name of values) {
    const pv = packValues.find(v => v.name === name);
    const weight = pv?.weight ?? 1;
    for (let i = 0; i < weight; i++) {
      weighted.push(name);
    }
  }

  if (weighted.length === 0) return "";
  return weighted[Math.floor(Math.random() * weighted.length)];
}

export function randomizeCategory(
  state: PromptState,
  category: PromptCategoryKey,
  packData: ThemePackData,
  rules: RelationshipRule[] = []
): PromptState {
  if (state[category].locked || !state[category].enabled) return state;

  const config = CATEGORY_ORDER;
  const categoryIndex = config.indexOf(category);
  const newState = { ...state };

  // Build partial state up to this category for rule evaluation
  const partialState = { ...state };
  for (const key of config) {
    if (config.indexOf(key) >= categoryIndex) break;
    partialState[key] = { ...newState[key] };
  }

  const available = getAvailableValues(category, packData, rules, partialState);
  if (available.length === 0) return newState;

  const selected = getWeightedRandom(available, packData, category);
  const isMulti = category === "hair" || category === "eyes" || category === "clothing"
    || category === "accessories" || category === "environment" || category === "lighting"
    || category === "mood" || category === "details";

  if (isMulti && Math.random() > 0.5) {
    const count = Math.floor(Math.random() * 2) + 1;
    const picked: string[] = [];
    const pool = [...available];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    newState[category] = { ...newState[category], value: picked };
  } else {
    newState[category] = { ...newState[category], value: [selected] };
  }

  return newState;
}

export function randomizeAll(
  state: PromptState,
  packData: ThemePackData,
  rules: RelationshipRule[] = []
): PromptState {
  let newState = { ...state };
  for (const category of CATEGORY_ORDER) {
    newState = randomizeCategory(newState, category, packData, rules);
  }
  return newState;
}

export function randomizeUnlocked(
  state: PromptState,
  packData: ThemePackData,
  rules: RelationshipRule[] = []
): PromptState {
  return randomizeAll(state, packData, rules);
}

export function mutate(
  state: PromptState,
  percentage: number,
  packData: ThemePackData,
  rules: RelationshipRule[] = []
): PromptState {
  const unlockedCategories = CATEGORY_ORDER.filter(
    k => !state[k].locked && state[k].enabled
  );

  const mutateCount = Math.max(1, Math.round((percentage / 100) * unlockedCategories.length));

  const shuffled = [...unlockedCategories].sort(() => Math.random() - 0.5);
  const toMutate = shuffled.slice(0, mutateCount);

  let newState = { ...state };
  for (const category of toMutate) {
    newState = randomizeCategory(newState, category, packData, rules);
  }
  return newState;
}

export function generatePrompt(state: PromptState): string {
  const parts: string[] = [];

  const orderedKeys: PromptCategoryKey[] = [
    "subject", "ethnicity", "age", "bodyType", "skin",
    "hair", "hairColor", "facialHair", "eyes",
    "expression", "pose", "clothing", "accessories",
    "location", "environment", "weather", "time",
    "lighting", "camera", "lens", "composition",
    "mood", "style", "quality", "details",
  ];

  for (const key of orderedKeys) {
    const cat = state[key];
    if (!cat.enabled || cat.value.length === 0) continue;
    const config = CATEGORY_CONFIGS.find((c) => c.key === key);
    const label = config?.label ?? key;
    parts.push(`${label}: ${cat.value.join(", ")}`);
  }

  return parts.join(", ");
}

export function applyLocks(
  current: PromptState,
  next: PromptState
): PromptState {
  const result = { ...next };
  for (const key of CATEGORY_ORDER) {
    if (current[key].locked) {
      result[key] = { ...current[key] };
    }
  }
  return result;
}

export function generateInspirationPrompt(concept: string, _packData: ThemePackData): Partial<PromptState> {
  const state: Partial<PromptState> = {};

  const conceptLower = concept.toLowerCase();

  if (conceptLower.includes("dragon") || conceptLower.includes("monster") || conceptLower.includes("creature")) {
    state.subject = { value: ["creature"], locked: false, enabled: true };
  }
  if (conceptLower.includes("knight") || conceptLower.includes("warrior") || conceptLower.includes("sword")) {
    state.subject = { value: ["warrior"], locked: false, enabled: true };
  }
  if (conceptLower.includes("space") || conceptLower.includes("galaxy") || conceptLower.includes("star")) {
    state.location = { value: ["outer space"], locked: false, enabled: true };
  }
  if (conceptLower.includes("forest") || conceptLower.includes("tree") || conceptLower.includes("woods")) {
    state.location = { value: ["forest"], locked: false, enabled: true };
  }
  if (conceptLower.includes("city") || conceptLower.includes("urban") || conceptLower.includes("street")) {
    state.location = { value: ["city street"], locked: false, enabled: true };
  }
  if (conceptLower.includes("night") || conceptLower.includes("dark") || conceptLower.includes("moon")) {
    state.time = { value: ["night"], locked: false, enabled: true };
  }
  if (conceptLower.includes("sunset") || conceptLower.includes("golden") || conceptLower.includes("dawn")) {
    state.time = { value: ["golden hour"], locked: false, enabled: true };
  }
  if (conceptLower.includes("rain") || conceptLower.includes("storm") || conceptLower.includes("wet")) {
    state.weather = { value: ["rain"], locked: false, enabled: true };
  }
  if (conceptLower.includes("snow") || conceptLower.includes("ice") || conceptLower.includes("cold")) {
    state.weather = { value: ["snow"], locked: false, enabled: true };
  }
  if (conceptLower.includes("cathedral") || conceptLower.includes("temple") || conceptLower.includes("castle")) {
    state.environment = { value: ["ancient architecture"], locked: false, enabled: true };
  }
  if (conceptLower.includes("neon") || conceptLower.includes("cyber") || conceptLower.includes("futuristic")) {
    state.style = { value: ["cyberpunk"], locked: false, enabled: true };
    state.lighting = { value: ["neon glow"], locked: false, enabled: true };
  }
  if (conceptLower.includes("dream") || conceptLower.includes("surreal") || conceptLower.includes("impossible")) {
    state.style = { value: ["surrealism"], locked: false, enabled: true };
  }
  if (conceptLower.includes("horror") || conceptLower.includes("scary") || conceptLower.includes("dark")) {
    state.mood = { value: ["horror"], locked: false, enabled: true };
  }
  if (conceptLower.includes("cute") || conceptLower.includes("adorable") || conceptLower.includes("kawaii")) {
    state.mood = { value: ["cute"], locked: false, enabled: true };
  }

  return state;
}

function templateGetAvailableValues(
  category: TemplateCategoryKey,
  packData: Partial<Record<TemplateCategoryKey, { name: string; weight: number; tags: string[] }[]>>,
  rules: RelationshipRule[],
  currentState: TemplateState,
  categoryOrder: TemplateCategoryKey[]
): string[] {
  const baseValues = (packData[category] || []).map(v => v.name);
  if (rules.length === 0) return baseValues;

  const allowed = new Set<string>();
  const forbidden = new Set<string>();

  for (const rule of rules) {
    const match = rule.when.values.includes(
      currentState[rule.when.category]?.value[0] || ""
    );
    const target = match ? rule.then : rule.otherwise;
    const targetValues = target[category as PromptCategoryKey];
    if (targetValues) {
      if (match) {
        targetValues.forEach(v => allowed.add(v));
      } else {
        targetValues.forEach(v => forbidden.add(v));
      }
    }
  }

  if (allowed.size === 0 && forbidden.size === 0) return baseValues;
  if (allowed.size > 0) return baseValues.filter(v => allowed.has(v));
  return baseValues.filter(v => !forbidden.has(v));
}

function templateGetWeightedRandom(
  values: string[],
  packData: Partial<Record<TemplateCategoryKey, { name: string; weight: number; tags: string[] }[]>>,
  category: TemplateCategoryKey
): string {
  const packValues = packData[category] || [];
  const weighted: string[] = [];

  for (const name of values) {
    const pv = packValues.find(v => v.name === name);
    const weight = pv?.weight ?? 1;
    for (let i = 0; i < weight; i++) {
      weighted.push(name);
    }
  }

  if (weighted.length === 0) return "";
  return weighted[Math.floor(Math.random() * weighted.length)];
}

export function templateRandomizeCategory(
  state: TemplateState,
  category: TemplateCategoryKey,
  template: TemplateDefinition,
  resolvedTemplate: ResolvedTemplate,
  rules: RelationshipRule[] = []
): TemplateState {
  const catDef = template.categories.find(c => c.key === category);
  if (!catDef) return state;
  if (state[category]?.locked || !state[category]?.enabled) return state;

  const categoryOrder = template.categories.map(c => c.key);
  const categoryIndex = categoryOrder.indexOf(category);
  const newState = { ...state };

  const partialState = { ...state };
  for (const key of categoryOrder) {
    if (categoryOrder.indexOf(key) >= categoryIndex) break;
    partialState[key] = { ...newState[key] };
  }

  const available = templateGetAvailableValues(category, resolvedTemplate.categories, rules, partialState, categoryOrder);
  if (available.length === 0) return newState;

  const selected = templateGetWeightedRandom(available, resolvedTemplate.categories, category);

  if (catDef.multi && Math.random() > 0.5) {
    const count = Math.floor(Math.random() * 2) + 1;
    const picked: string[] = [];
    const pool = [...available];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    newState[category] = { ...newState[category], value: picked };
  } else {
    newState[category] = { ...newState[category], value: [selected] };
  }

  return newState;
}

export function templateRandomizeAll(
  state: TemplateState,
  template: TemplateDefinition,
  resolvedTemplate: ResolvedTemplate,
  rules: RelationshipRule[] = []
): TemplateState {
  let newState = { ...state };
  for (const cat of template.categories) {
    newState = templateRandomizeCategory(newState, cat.key, template, resolvedTemplate, rules);
  }
  return newState;
}

export function templateRandomizeUnlocked(
  state: TemplateState,
  template: TemplateDefinition,
  resolvedTemplate: ResolvedTemplate,
  rules: RelationshipRule[] = []
): TemplateState {
  return templateRandomizeAll(state, template, resolvedTemplate, rules);
}

export function templateMutate(
  state: TemplateState,
  percentage: number,
  template: TemplateDefinition,
  resolvedTemplate: ResolvedTemplate,
  rules: RelationshipRule[] = []
): TemplateState {
  const unlockedCategories = template.categories
    .filter(c => !state[c.key]?.locked && state[c.key]?.enabled)
    .map(c => c.key);

  const mutateCount = Math.max(1, Math.round((percentage / 100) * unlockedCategories.length));
  const shuffled = [...unlockedCategories].sort(() => Math.random() - 0.5);
  const toMutate = shuffled.slice(0, mutateCount);

  let newState = { ...state };
  for (const category of toMutate) {
    newState = templateRandomizeCategory(newState, category, template, resolvedTemplate, rules);
  }
  return newState;
}

export function templateGeneratePrompt(
  state: TemplateState,
  template: TemplateDefinition
): string {
  const parts: string[] = [];

  for (const cat of template.categories) {
    const catState = state[cat.key];
    if (!catState || !catState.enabled || catState.value.length === 0) continue;
    parts.push(`${cat.label}: ${catState.value.join(", ")}`);
  }

  return parts.join(", ");
}

export function templateApplyLocks(
  current: TemplateState,
  next: TemplateState,
  template: TemplateDefinition
): TemplateState {
  const result = { ...next };
  for (const cat of template.categories) {
    if (current[cat.key]?.locked) {
      result[cat.key] = { ...current[cat.key] };
    }
  }
  return result;
}
