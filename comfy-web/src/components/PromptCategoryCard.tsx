'use client';

import { PromptCategoryKey, CategoryState, CategoryConfig } from "@/types/prompt-composer";

interface PromptCategoryCardProps {
  config: CategoryConfig;
  state: CategoryState;
  onOpenSearch: (category: PromptCategoryKey) => void;
  onRandomize: (category: PromptCategoryKey) => void;
  onToggleLock: (category: PromptCategoryKey) => void;
  onToggleEnabled: (category: PromptCategoryKey) => void;
  onRemoveValue: (category: PromptCategoryKey, value: string) => void;
}

export default function PromptCategoryCard({
  config,
  state,
  onOpenSearch,
  onRandomize,
  onToggleLock,
  onToggleEnabled,
  onRemoveValue,
}: PromptCategoryCardProps) {
  const displayValue = state.value.length > 0
    ? state.value.join(", ")
    : "Not set";

  return (
    <div
      className={`group relative rounded-xl border p-3 transition-all duration-200 ${
        !state.enabled
          ? "border-border-subtle bg-surface-2/40 opacity-50"
          : state.locked
            ? "border-gold/40 bg-gold/[0.04]"
            : "border-border-subtle bg-surface-3 hover:border-border-strong hover:bg-hover"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-text-subtle">
          {config.label}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRandomize(config.key)}
            disabled={!state.enabled || state.locked}
            className="rounded-md p-1 text-text-subtle transition hover:bg-hover hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
            title="Randomize"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={() => onToggleLock(config.key)}
            disabled={!state.enabled}
            className={`rounded-md p-1 transition disabled:cursor-not-allowed disabled:opacity-30 ${
              state.locked
                ? "text-gold hover:bg-gold/10"
                : "text-text-subtle hover:bg-hover hover:text-gold"
            }`}
            title={state.locked ? "Unlock" : "Lock"}
          >
            {state.locked ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => onToggleEnabled(config.key)}
            className="rounded-md p-1 text-text-subtle transition hover:bg-hover hover:text-error"
            title={state.enabled ? "Disable" : "Enable"}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <button
        onClick={() => state.enabled && onOpenSearch(config.key)}
        disabled={!state.enabled}
        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
          state.enabled
            ? "border-border-subtle bg-surface-2 hover:border-border-strong focus:border-gold-focus"
            : "cursor-not-allowed border-transparent bg-surface-2/40"
        } ${state.value.length === 0 ? "text-text-subtle" : "text-text-primary"}`}
      >
        <span className="block truncate">{displayValue}</span>
      </button>

      {state.value.length > 0 && state.enabled && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {state.value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-md bg-hover px-2 py-0.5 text-[10px] text-text-secondary"
            >
              {v}
              {!state.locked && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveValue(config.key, v);
                  }}
                  className="text-text-subtle hover:text-error"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
