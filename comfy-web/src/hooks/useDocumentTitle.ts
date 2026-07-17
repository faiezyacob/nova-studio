'use client';

import { useEffect } from 'react';

const BASE_TITLE = 'Nova Studio';

export function useDocumentTitle(
  isGenerating: boolean,
  progress: { value: number; max: number } | null,
  label?: string
) {
  useEffect(() => {
    if (!isGenerating) {
      document.title = BASE_TITLE;
      return;
    }

    const pct = progress
      ? `${Math.round((progress.value / progress.max) * 100)}%`
      : null;

    document.title = pct
      ? `${pct} ${label || 'Generating'} — ${BASE_TITLE}`
      : `Generating${label ? ` ${label}` : ''}… — ${BASE_TITLE}`;
  }, [isGenerating, progress?.value, progress?.max, label]);
}
