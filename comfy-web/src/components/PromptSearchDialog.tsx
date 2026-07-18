'use client';

import { useState, useRef, useEffect, useMemo } from "react";
import { PromptValue } from "@/types/prompt-composer";

export const SUBJECT_CATEGORIES = [
  { value: "", label: "All" },
  { value: "humans", label: "Humans" },
  { value: "modern", label: "Modern People" },
  { value: "fantasy", label: "Fantasy Races" },
  { value: "monsters", label: "Monsters & Creatures" },
  { value: "animals", label: "Animals" },
  { value: "sci-fi", label: "Sci-Fi" },
  { value: "anime", label: "Anime" },
] as const;

export const CLOTHING_CATEGORIES = [
  { value: "", label: "All" },
  { value: "modern", label: "Modern" },
  { value: "casual", label: "Casual" },
  { value: "fantasy", label: "Fantasy" },
  { value: "sci-fi", label: "Sci-Fi" },
  { value: "anime", label: "Anime" },
  { value: "seductive", label: "Seductive" },
  { value: "dark", label: "Dark / Gothic" },
  { value: "vintage", label: "Vintage" },
  { value: "cultural", label: "Cultural" },
] as const;

const CATEGORY_FILTERS: Record<string, readonly { value: string; label: string }[]> = {
  subject: SUBJECT_CATEGORIES,
  clothing: CLOTHING_CATEGORIES,
  pose: [
    { value: "", label: "All" },
    { value: "general", label: "General" },
    { value: "action", label: "Action" },
    { value: "fantasy", label: "Fantasy" },
    { value: "seductive", label: "Seductive" },
    { value: "anime", label: "Anime" },
  ],
  location: [
    { value: "", label: "All" },
    { value: "nature", label: "Nature" },
    { value: "urban", label: "Urban" },
    { value: "fantasy", label: "Fantasy" },
    { value: "sci-fi", label: "Sci-Fi" },
    { value: "dark", label: "Dark" },
    { value: "anime", label: "Anime" },
    { value: "cultural", label: "Cultural" },
    { value: "indoor", label: "Indoor" },
    { value: "outdoor", label: "Outdoor" },
  ],
  hair: [
    { value: "", label: "All" },
    { value: "default", label: "Default" },
    { value: "styled", label: "Styled" },
    { value: "modern", label: "Modern" },
    { value: "anime", label: "Anime" },
    { value: "fantasy", label: "Fantasy" },
    { value: "textured", label: "Textured" },
  ],
  footwear: [
    { value: "", label: "All" },
    { value: "modern", label: "Modern" },
    { value: "casual", label: "Casual" },
    { value: "fantasy", label: "Fantasy" },
    { value: "sci-fi", label: "Sci-Fi" },
    { value: "anime", label: "Anime" },
    { value: "seductive", label: "Seductive" },
    { value: "dark", label: "Dark / Gothic" },
    { value: "vintage", label: "Vintage" },
    { value: "cultural", label: "Cultural" },
    { value: "streetwear", label: "Streetwear" },
    { value: "korean", label: "Korean" },
    { value: "old_money", label: "Old Money" },
    { value: "athleisure", label: "Athleisure" },
  ]
};

interface PromptSearchDialogProps {
  values: PromptValue[];
  selected: string[];
  multi: boolean;
  categoryLabel: string;
  categoryKey?: string;
  onConfirm: (values: string[]) => void;
  onClose: () => void;
}

export default function PromptSearchDialog({
  values,
  selected,
  multi,
  categoryLabel,
  categoryKey,
  onConfirm,
  onClose,
}: PromptSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selected));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const filtered = useMemo(() => {
    let result = values;
    if (categoryFilter) {
      result = result.filter(v => v.category === categoryFilter);
    }
    if (!query.trim()) return result;
    const q = query.toLowerCase();
    return result.filter(
      v => v.name.toLowerCase().includes(q) ||
        v.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [values, query, categoryFilter]);

  const toggleValue = (name: string) => {
    setLocalSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        if (!multi) next.clear();
        next.add(name);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm([...localSelected]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-[20px] border border-border-strong bg-surface-3 p-5 shadow-[var(--shadow-dialog)] animate-fade-in">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">{categoryLabel}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-subtle transition hover:bg-hover hover:text-text-primary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-border-strong bg-surface-2 py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition placeholder:text-text-subtle focus:border-gold-focus"
          />
        </div>

        {categoryKey && CATEGORY_FILTERS[categoryKey] && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS[categoryKey].map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(cat.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  categoryFilter === cat.value
                    ? "bg-gold/20 text-gold border border-gold/30"
                    : "border border-border-subtle bg-surface-2 text-text-subtle hover:border-border-strong hover:text-text-secondary"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-border-subtle bg-surface-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-text-muted">No results found</p>
          ) : (
            <div className="p-1">
              {filtered.map((value) => {
                const isSelected = localSelected.has(value.name);
                return (
                  <button
                    key={value.name}
                    onClick={() => toggleValue(value.name)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                      isSelected
                        ? "bg-gold/[0.08] text-gold"
                        : "text-text-secondary hover:bg-hover hover:text-text-primary"
                    }`}
                  >
                    {multi && (
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                          isSelected
                            ? "border-gold bg-gold text-[#1f1f1d]"
                            : "border-border-strong bg-surface-2"
                        }`}
                      >
                        {isSelected && (
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    )}
                    {!multi && (
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                          isSelected
                            ? "border-gold bg-gold"
                            : "border-border-strong bg-surface-2"
                        }`}
                      >
                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-[#1f1f1d]" />}
                      </span>
                    )}
                    <span className="flex-1 truncate">{value.name}</span>
                    {value.tags.length > 0 && (
                      <span className="shrink-0 text-[10px] text-text-subtle">
                        {value.tags[0]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={handleConfirm} className="btn-primary flex-1">
            Select ({localSelected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
