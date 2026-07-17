export type PromptCategoryKey =
  | "subject"
  | "ethnicity"
  | "age"
  | "bodyType"
  | "skin"
  | "hair"
  | "hairColor"
  | "hairStyle"
  | "facialHair"
  | "eyes"
  | "expression"
  | "pose"
  | "clothing"
  | "accessories"
  | "location"
  | "environment"
  | "weather"
  | "time"
  | "lighting"
  | "camera"
  | "lens"
  | "composition"
  | "mood"
  | "style"
  | "quality"
  | "details";

export interface PromptValue {
  name: string;
  weight: number;
  tags: string[];
}

export interface CategoryState {
  value: string[];
  locked: boolean;
  enabled: boolean;
}

export type PromptState = Record<PromptCategoryKey, CategoryState>;

export interface ThemePackMeta {
  name: string;
  description: string;
  version: string;
}

export interface ThemePackData {
  meta: ThemePackMeta;
  categories: Partial<Record<PromptCategoryKey, PromptValue[]>>;
}

export interface RelationshipCondition {
  category: PromptCategoryKey;
  values: string[];
}

export interface RelationshipRule {
  when: RelationshipCondition;
  then: Partial<Record<PromptCategoryKey, string[]>>;
  otherwise: Partial<Record<PromptCategoryKey, string[]>>;
}

export interface ComposerPreset {
  id: string;
  name: string;
  state: PromptState;
  packName: string;
  mutationPercent: number;
  createdAt: number;
}

export interface CategoryConfig {
  key: PromptCategoryKey;
  label: string;
  multi: boolean;
  order: number;
  description: string;
}

export const CATEGORY_CONFIGS: CategoryConfig[] = [
  { key: "subject", label: "Subject", multi: false, order: 0, description: "Main focus of the image" },
  { key: "ethnicity", label: "Ethnicity", multi: false, order: 1, description: "Character ethnicity" },
  { key: "age", label: "Age", multi: false, order: 2, description: "Character age group" },
  { key: "bodyType", label: "Body Type", multi: false, order: 3, description: "Character body type" },
  { key: "skin", label: "Skin", multi: false, order: 4, description: "Skin tone and complexion" },
  { key: "hair", label: "Hair", multi: true, order: 5, description: "Hair style and texture" },
  { key: "hairColor", label: "Hair Color", multi: false, order: 6, description: "Hair color" },
  { key: "hairStyle", label: "Hair Style", multi: false, order: 7, description: "Hair styling details" },
  { key: "facialHair", label: "Facial Hair", multi: false, order: 8, description: "Facial hair style" },
  { key: "eyes", label: "Eyes", multi: true, order: 9, description: "Eye color and style" },
  { key: "expression", label: "Expression", multi: false, order: 10, description: "Facial expression" },
  { key: "pose", label: "Pose", multi: false, order: 11, description: "Body pose or action" },
  { key: "clothing", label: "Clothing", multi: true, order: 12, description: "Outfit and garments" },
  { key: "accessories", label: "Accessories", multi: true, order: 13, description: "Jewelry, props, items" },
  { key: "location", label: "Location", multi: false, order: 14, description: "Scene location" },
  { key: "environment", label: "Environment", multi: true, order: 15, description: "Surrounding details" },
  { key: "weather", label: "Weather", multi: false, order: 16, description: "Weather conditions" },
  { key: "time", label: "Time", multi: false, order: 17, description: "Time of day" },
  { key: "lighting", label: "Lighting", multi: true, order: 18, description: "Light sources and quality" },
  { key: "camera", label: "Camera", multi: false, order: 19, description: "Camera angle and type" },
  { key: "lens", label: "Lens", multi: false, order: 20, description: "Lens focal length and type" },
  { key: "composition", label: "Composition", multi: false, order: 21, description: "Framing and layout" },
  { key: "mood", label: "Mood", multi: true, order: 22, description: "Emotional atmosphere" },
  { key: "style", label: "Art Style", multi: false, order: 23, description: "Artistic style" },
  { key: "quality", label: "Quality", multi: false, order: 24, description: "Image quality tags" },
  { key: "details", label: "Details", multi: true, order: 25, description: "Extra descriptive details" },
];

export const CATEGORY_ORDER: PromptCategoryKey[] = CATEGORY_CONFIGS.map(c => c.key);

export function createEmptyState(): PromptState {
  const state = {} as PromptState;
  for (const key of CATEGORY_ORDER) {
    state[key] = { value: [], locked: false, enabled: true };
  }
  return state;
}
