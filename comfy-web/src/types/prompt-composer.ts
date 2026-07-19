export type PromptCategoryKey =
  | "subject"
  | "ethnicity"
  | "age"
  | "bodyType"
  | "skin"
  | "hair"
  | "hairColor"
  | "eyes"
  | "expression"
  | "pose"
  | "headPosition"
  | "handPosition"
  | "gaze"
  | "top"
  | "pants"
  | "footwear"
  | "accessories"
  | "location"
  | "weather"
  | "time"
  | "lightSource"
  | "lightStyle"
  | "cameraAngle"
  | "cameraShot"
  | "lens"
  | "composition"
  | "mood"
  | "style"
  | "details";

export interface PromptValue {
  name: string;
  weight: number;
  tags: string[];
  category?: string;
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
  probability?: number;
}

export const CATEGORY_CONFIGS: CategoryConfig[] = [
  { key: "subject", label: "Subject", multi: false, order: 0, description: "Main focus of the image" },
  { key: "ethnicity", label: "Ethnicity", multi: false, order: 1, description: "Character ethnicity" },
  { key: "age", label: "Age", multi: false, order: 2, description: "Character age group" },
  { key: "bodyType", label: "Body Type", multi: false, order: 3, description: "Character body type" },
  { key: "skin", label: "Skin", multi: false, order: 4, description: "Skin tone and complexion" },
  { key: "hair", label: "Hair", multi: false, order: 5, description: "Hair style and texture" },
  { key: "hairColor", label: "Hair Color", multi: false, order: 6, description: "Hair color" },
  { key: "eyes", label: "Eyes", multi: true, order: 7, description: "Eye color and style" },
  { key: "expression", label: "Expression", multi: false, order: 8, description: "Facial expression" },
  { key: "headPosition", label: "Head Position", multi: false, order: 9, description: "Head orientation and tilt", probability: 0.8 },
  { key: "gaze", label: "Gaze", multi: false, order: 10, description: "Eye direction", probability: 0.8 },
  { key: "pose", label: "Pose", multi: false, order: 11, description: "Primary body posture" },
  { key: "handPosition", label: "Hand Position", multi: true, order: 12, description: "Arm and hand placement", probability: 0.75 },
  { key: "top", label: "Top", multi: true, order: 13, description: "Upper body garments and outfits" },
  { key: "pants", label: "Pants", multi: false, order: 14, description: "Lower body garments and bottoms" },
  { key: "footwear", label: "Footwear", multi: false, order: 15, description: "Shoes, boots, and sandals" },
  { key: "accessories", label: "Accessories", multi: true, order: 16, description: "Jewelry, props, items" },
  { key: "location", label: "Location", multi: false, order: 17, description: "Scene location" },
  { key: "weather", label: "Weather", multi: false, order: 18, description: "Weather conditions" },
  { key: "time", label: "Time", multi: false, order: 19, description: "Time of day" },
  { key: "lightSource", label: "Light Source", multi: false, order: 20, description: "Source of light in the scene" },
  { key: "lightStyle", label: "Light Style", multi: true, order: 21, description: "Lighting technique and quality" },
  { key: "cameraAngle", label: "Camera Angle", multi: false, order: 22, description: "Camera positioning and perspective" },
  { key: "cameraShot", label: "Camera Shot", multi: false, order: 23, description: "Framing and shot type" },
  { key: "lens", label: "Lens", multi: false, order: 24, description: "Lens focal length and type" },
  { key: "composition", label: "Composition", multi: false, order: 25, description: "Framing and layout" },
  { key: "mood", label: "Mood", multi: true, order: 26, description: "Emotional atmosphere" },
  { key: "style", label: "Art Style", multi: false, order: 27, description: "Artistic style" },
  { key: "details", label: "Details", multi: true, order: 28, description: "Extra descriptive details" },
];

export const CATEGORY_ORDER: PromptCategoryKey[] = CATEGORY_CONFIGS.map(c => c.key);

export function createEmptyState(): PromptState {
  const state = {} as PromptState;
  for (const key of CATEGORY_ORDER) {
    state[key] = { value: [], locked: false, enabled: true };
  }
  return state;
}

export function migrateState(state: Partial<PromptState>): PromptState {
  const result = {} as PromptState;
  for (const key of CATEGORY_ORDER) {
    const existing = state[key];
    if (existing && typeof existing === "object" && "enabled" in existing) {
      result[key] = { value: existing.value ?? [], locked: existing.locked ?? false, enabled: existing.enabled ?? true };
    } else {
      result[key] = { value: [], locked: false, enabled: true };
    }
  }
  return result;
}


