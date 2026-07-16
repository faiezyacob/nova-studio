'use client';

import { useState } from "react";

interface MutationDialogProps {
  currentPercent: number;
  onConfirm: (percent: number) => void;
  onClose: () => void;
}

const MUTATION_LEVELS = [
  { value: 10, label: "Subtle", description: "Modify 1-2 fields" },
  { value: 25, label: "Moderate", description: "Modify several fields" },
  { value: 50, label: "Strong", description: "Recognizable variation" },
  { value: 100, label: "Complete", description: "Entirely new concept" },
];

export default function MutationDialog({
  currentPercent,
  onConfirm,
  onClose,
}: MutationDialogProps) {
  const [percent, setPercent] = useState(currentPercent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-[20px] border border-border-strong bg-surface-3 p-5 shadow-[var(--shadow-dialog)] animate-fade-in">
        <h3 className="mb-1 text-sm font-semibold text-text-primary">Mutation Intensity</h3>
        <p className="mb-5 text-xs text-text-muted">Higher values change more unlocked fields.</p>

        <div className="mb-5 space-y-2">
          {MUTATION_LEVELS.map((level) => (
            <button
              key={level.value}
              onClick={() => setPercent(level.value)}
              className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                percent === level.value
                  ? "border-gold/50 bg-gold/[0.08] text-gold"
                  : "border-border-subtle bg-surface-2 text-text-secondary hover:border-border-strong hover:bg-hover"
              }`}
            >
              <div>
                <span className="text-sm font-medium">{level.label}</span>
                <span className="ml-2 text-[11px] text-text-muted">{level.description}</span>
              </div>
              <span className="text-xs tabular-nums">{level.value}%</span>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={() => onConfirm(percent)} className="btn-primary flex-1">
            Mutate
          </button>
        </div>
      </div>
    </div>
  );
}
