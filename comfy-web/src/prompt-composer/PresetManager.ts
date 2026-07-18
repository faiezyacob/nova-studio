import { ComposerPreset, PromptState } from "@/types/prompt-composer";
import { db } from "@/utils/db";

const PRESETS_KEY = "prompt_composer_presets";

export async function savePreset(
  name: string,
  state: PromptState,
  packName: string,
  mutationPercent: number
): Promise<ComposerPreset> {
  const presets = await listPresets();
  const preset: ComposerPreset = {
    id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    state: JSON.parse(JSON.stringify(state)),
    packName,
    mutationPercent,
    createdAt: Date.now(),
  };

  presets.unshift(preset);
  await db.set(PRESETS_KEY, presets);
  return preset;
}

export async function listPresets(): Promise<ComposerPreset[]> {
  try {
    const saved = await db.get<ComposerPreset[]>(PRESETS_KEY);
    if (Array.isArray(saved)) return saved;
  } catch {}
  return [];
}

export async function loadPreset(id: string): Promise<ComposerPreset | null> {
  const presets = await listPresets();
  return presets.find(p => p.id === id) || null;
}

export async function deletePreset(id: string): Promise<void> {
  const presets = await listPresets();
  const updated = presets.filter(p => p.id !== id);
  await db.set(PRESETS_KEY, updated);
}

export function exportPreset(preset: ComposerPreset): string {
  return JSON.stringify(preset, null, 2);
}

export async function importPreset(json: string): Promise<ComposerPreset | null> {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.name || !parsed.state) return null;

    const imported: ComposerPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: parsed.name,
      state: parsed.state,
      packName: parsed.packName || "default",
      mutationPercent: parsed.mutationPercent || 25,
      createdAt: Date.now(),
    };

    const presets = await listPresets();
    presets.unshift(imported);
    await db.set(PRESETS_KEY, presets);
    return imported;
  } catch {
    return null;
  }
}
