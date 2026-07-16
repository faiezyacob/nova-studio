'use client';

interface PromptPreviewProps {
  prompt: string;
  onCopy: () => void;
}

export default function PromptPreview({ prompt, onCopy }: PromptPreviewProps) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-text-subtle">
          Generated Prompt
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-text-subtle">
            {prompt.length} chars
          </span>
          <button
            onClick={onCopy}
            className="rounded-md p-1 text-text-subtle transition hover:bg-hover hover:text-gold"
            title="Copy prompt"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="max-h-24 overflow-y-auto rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs leading-relaxed text-text-secondary">
        {prompt || <span className="text-text-subtle italic">Randomize or select values to build a prompt...</span>}
      </div>
    </div>
  );
}
