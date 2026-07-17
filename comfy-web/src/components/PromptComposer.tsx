'use client';

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  PromptCategoryKey,
  PromptState,
  ThemePackData,
  RelationshipRule,
  CATEGORY_CONFIGS,
  CATEGORY_ORDER,
  createEmptyState,
} from "@/types/prompt-composer";
import { loadPack, loadRules } from "@/prompt-composer/PackLoader";
import {
  randomizeAll,
  randomizeUnlocked,
  randomizeCategory,
  mutate as mutateState,
  generatePrompt,
} from "@/prompt-composer/RandomPromptEngine";
import {
  savePreset,
  listPresets,
  deletePreset,
} from "@/prompt-composer/PresetManager";
import PromptCategoryCard from "./PromptCategoryCard";
import PromptSearchDialog from "./PromptSearchDialog";
import MutationDialog from "./MutationDialog";
import PromptSummary from "./PromptSummary";
import type { ComposerPreset } from "@/types/prompt-composer";

interface PromptComposerProps {
  onUsePrompt: (prompt: string) => void;
  composerState: PromptState;
  onComposerStateChange: React.Dispatch<React.SetStateAction<PromptState>>;
  mutationPercent: number;
  onMutationPercentChange: (percent: number) => void;
}

export default function PromptComposer({
  onUsePrompt,
  composerState,
  onComposerStateChange,
  mutationPercent,
  onMutationPercentChange,
}: PromptComposerProps) {
  const state = composerState;
  const setState = onComposerStateChange;
  const [packData, setPackData] = useState<ThemePackData | null>(null);
  const [rules, setRules] = useState<RelationshipRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchCategory, setSearchCategory] = useState<PromptCategoryKey | null>(null);
  const [showMutationDialog, setShowMutationDialog] = useState(false);

  const [presets, setPresets] = useState<ComposerPreset[]>([]);
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    initPack();
  }, []);

  useEffect(() => {
    loadPresets();
  }, []);

  const initPack = async () => {
    setLoading(true);
    try {
      const pack = await loadPack();
      setPackData(pack);

      const packRules = await loadRules();
      setRules(packRules);
    } catch (err) {
      console.error("Failed to load prompt pack:", err);
      toast.error("Failed to load prompt pack");
    } finally {
      setLoading(false);
    }
  };

  const loadPresets = async () => {
    const list = await listPresets();
    setPresets(list);
  };

  const getValuesForCategory = useCallback(
    (category: PromptCategoryKey) => {
      if (!packData) return [];
      const baseValues = packData.categories[category] || [];

      if (rules.length === 0) return baseValues;

      const allowed = new Set<string>();
      const forbidden = new Set<string>();
      let hasRelevantRule = false;

      for (const rule of rules) {
        const conditionValues = state[rule.when.category]?.value || [];
        const matches = conditionValues.some((v) =>
          rule.when.values.includes(v)
        );

        const target = matches ? rule.then : rule.otherwise;
        const targetValues = target[category];

        if (targetValues) {
          hasRelevantRule = true;
          if (matches) {
            targetValues.forEach((v) => allowed.add(v));
          } else {
            targetValues.forEach((v) => forbidden.add(v));
          }
        }
      }

      if (!hasRelevantRule) return baseValues;
      if (allowed.size > 0) return baseValues.filter((v) => allowed.has(v.name));
      return baseValues.filter((v) => !forbidden.has(v.name));
    },
    [packData, rules, state]
  );

  const handleRandomizeCategory = (category: PromptCategoryKey) => {
    if (!packData) return;
    setState((prev) => randomizeCategory(prev, category, packData, rules));
  };

  const handleRandomizeAll = () => {
    if (!packData) return;
    setState((prev) => randomizeAll(prev, packData, rules));
  };

  const handleRandomizeUnlocked = () => {
    if (!packData) return;
    setState((prev) => randomizeUnlocked(prev, packData, rules));
  };

  const handleMutate = (percent: number) => {
    if (!packData) return;
    onMutationPercentChange(percent);
    setState((prev) => mutateState(prev, percent, packData, rules));
    setShowMutationDialog(false);
    toast.success(`Mutated at ${percent}%`);
  };

  const handleToggleLock = (category: PromptCategoryKey) => {
    setState((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        locked: !prev[category].locked,
      },
    }));
  };

  const handleToggleEnabled = (category: PromptCategoryKey) => {
    setState((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        enabled: !prev[category].enabled,
      },
    }));
  };

  const handleLockAll = () => {
    setState((prev) => {
      const next = { ...prev };
      for (const key of CATEGORY_ORDER) {
        next[key] = { ...next[key], locked: true };
      }
      return next;
    });
  };

  const handleUnlockAll = () => {
    setState((prev) => {
      const next = { ...prev };
      for (const key of CATEGORY_ORDER) {
        next[key] = { ...next[key], locked: false };
      }
      return next;
    });
  };

  const handleReset = () => {
    setState(createEmptyState());
  };

  const handleSelectValues = (category: PromptCategoryKey, values: string[]) => {
    setState((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        value: values,
      },
    }));
    setSearchCategory(null);
  };

  const handleCopyPrompt = () => {
    const prompt = generatePrompt(state);
    navigator.clipboard.writeText(prompt);
    toast.success("Prompt copied");
  };

  const handleUsePrompt = () => {
    const prompt = generatePrompt(state);
    if (!prompt.trim()) {
      toast.error("No prompt to use. Randomize or select values first.");
      return;
    }
    onUsePrompt(prompt);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) return;
    await savePreset(presetName, state, "default", mutationPercent);
    setPresetName("");
    setShowPresetDialog(false);
    await loadPresets();
    toast.success("Preset saved");
  };

  const handleLoadPreset = async (preset: ComposerPreset) => {
    setState(preset.state);
    onMutationPercentChange(preset.mutationPercent);
    toast.success(`Loaded "${preset.name}"`);
  };

  const handleDeletePreset = async (id: string) => {
    await deletePreset(id);
    await loadPresets();
    toast.success("Preset deleted");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading prompt pack...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={handleRandomizeAll}
          className="rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-secondary transition hover:border-gold/40 hover:text-gold"
          title="Randomize all"
        >
          All
        </button>
        <button
          onClick={handleRandomizeUnlocked}
          className="rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-secondary transition hover:border-gold/40 hover:text-gold"
          title="Randomize unlocked"
        >
          Unlocked
        </button>
        <button
          onClick={() => setShowMutationDialog(true)}
          className="rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-secondary transition hover:border-gold/40 hover:text-gold"
          title="Mutate"
        >
          Mutate
        </button>
        <button
          onClick={handleLockAll}
          className="rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-secondary transition hover:border-gold/40 hover:text-gold"
          title="Lock all"
        >
          Lock
        </button>
        <button
          onClick={handleUnlockAll}
          className="rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-secondary transition hover:border-gold/40 hover:text-gold"
          title="Unlock all"
        >
          Unlock
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-secondary transition hover:border-red-500/40 hover:text-red-400"
          title="Reset all"
        >
          Reset
        </button>
      </div>

      {/* Category cards grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {CATEGORY_CONFIGS.map((config) => (
          <PromptCategoryCard
            key={config.key}
            config={config}
            state={state[config.key]}
            onOpenSearch={(cat) => setSearchCategory(cat)}
            onRandomize={handleRandomizeCategory}
            onToggleLock={handleToggleLock}
            onToggleEnabled={handleToggleEnabled}
          />
        ))}
      </div>

      {/* Prompt summary */}
      <PromptSummary composerState={state} onCopy={handleCopyPrompt} />

      {/* Preset management */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowPresetDialog(true)}
          className="rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 text-[11px] text-text-secondary transition hover:border-gold/40 hover:text-gold"
        >
          Save Preset
        </button>
        {presets.length > 0 && (
          <div className="flex items-center gap-1">
            {presets.slice(0, 3).map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleLoadPreset(preset)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleDeletePreset(preset.id);
                }}
                className="rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-[10px] text-text-muted transition hover:border-border-strong hover:text-text-secondary"
                title="Click to load, right-click to delete"
              >
                {preset.name}
              </button>
            ))}
            {presets.length > 3 && (
              <span className="text-[10px] text-text-subtle">+{presets.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleUsePrompt}
          className="btn-primary flex-1"
        >
          Use Prompt
        </button>
      </div>

      {/* Search dialog */}
      {searchCategory && (
        <PromptSearchDialog
          values={getValuesForCategory(searchCategory)}
          selected={state[searchCategory]?.value || []}
          multi={
            CATEGORY_CONFIGS.find((c) => c.key === searchCategory)?.multi || false
          }
          categoryLabel={
            CATEGORY_CONFIGS.find((c) => c.key === searchCategory)?.label || ""
          }
          onConfirm={(values) => handleSelectValues(searchCategory, values)}
          onClose={() => setSearchCategory(null)}
        />
      )}

      {/* Mutation dialog */}
      {showMutationDialog && (
        <MutationDialog
          currentPercent={mutationPercent}
          onConfirm={handleMutate}
          onClose={() => setShowMutationDialog(false)}
        />
      )}

      {/* Save preset dialog */}
      {showPresetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-[20px] border border-border-strong bg-surface-3 p-5 shadow-[var(--shadow-dialog)] animate-fade-in">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">Save Preset</h3>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name..."
              className="mb-4 w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-subtle focus:border-gold-focus"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePreset();
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowPresetDialog(false)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
                className="btn-primary flex-1"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
