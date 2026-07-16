'use client';

import { ThemePackMeta } from "@/types/prompt-composer";

interface ThemePackSelectorProps {
  packs: ThemePackMeta[];
  selectedPack: string;
  onSelect: (packName: string) => void;
  disabled?: boolean;
}

export default function ThemePackSelector({
  packs,
  selectedPack,
  onSelect,
  disabled,
}: ThemePackSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-text-subtle">Pack</span>
      <div className="relative">
        <select
          value={selectedPack}
          onChange={(e) => onSelect(e.target.value)}
          disabled={disabled}
          className="rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 pr-7 text-xs text-text-primary outline-none transition focus:border-gold-focus appearance-none disabled:opacity-50"
        >
          {packs.map((pack) => (
            <option key={pack.name} value={pack.name}>
              {pack.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
