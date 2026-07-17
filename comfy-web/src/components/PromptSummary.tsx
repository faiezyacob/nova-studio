'use client';

import { useMemo } from "react";
import {
  PromptCategoryKey,
  PromptState,
  CATEGORY_ORDER,
} from "@/types/prompt-composer";

interface SummaryGroup {
  key: string;
  label: string;
  categoryKeys: PromptCategoryKey[];
}

const SUMMARY_GROUPS: SummaryGroup[] = [
  { key: "subject", label: "Subject", categoryKeys: ["subject", "ethnicity", "age"] },
  { key: "appearance", label: "Appearance", categoryKeys: ["bodyType", "skin", "hair", "hairColor", "hairStyle", "facialHair", "eyes"] },
  { key: "expression", label: "Expression", categoryKeys: ["expression"] },
  { key: "pose", label: "Pose", categoryKeys: ["pose"] },
  { key: "clothing", label: "Clothing", categoryKeys: ["clothing"] },
  { key: "accessories", label: "Accessories", categoryKeys: ["accessories"] },
  { key: "environment", label: "Environment", categoryKeys: ["location", "environment", "weather", "time"] },
  { key: "lighting", label: "Lighting", categoryKeys: ["lighting"] },
  { key: "camera", label: "Camera", categoryKeys: ["camera", "lens", "composition"] },
  { key: "mood", label: "Mood", categoryKeys: ["mood"] },
  { key: "style", label: "Style", categoryKeys: ["style"] },
  { key: "quality", label: "Quality", categoryKeys: ["quality"] },
  { key: "details", label: "Details", categoryKeys: ["details"] },
];

function formatLabel(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface PromptSummaryProps {
  composerState: PromptState;
  onCopy: () => void;
}

interface SummarySection {
  key: string;
  label: string;
  values: string[];
}

export default function PromptSummary({ composerState, onCopy }: PromptSummaryProps) {
  const sections = useMemo<SummarySection[]>(() => {
    const result: SummarySection[] = [];

    for (const group of SUMMARY_GROUPS) {
      const values: string[] = [];

      for (const catKey of group.categoryKeys) {
        const catState = composerState[catKey];
        if (catState.enabled && catState.value.length > 0) {
          for (const v of catState.value) {
            values.push(formatLabel(v));
          }
        }
      }

      if (values.length > 0) {
        result.push({ key: group.key, label: group.label, values });
      }
    }

    return result;
  }, [composerState]);

  const totalChars = useMemo(() => {
    const parts: string[] = [];
    for (const key of CATEGORY_ORDER) {
      const cat = composerState[key];
      if (!cat.enabled || cat.value.length === 0) continue;
      parts.push(cat.value.join(", "));
    }
    return parts.join(", ").length;
  }, [composerState]);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-text-subtle">
          Prompt Summary
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-text-subtle">
            {totalChars} chars
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
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border-subtle bg-surface-1 px-3 py-2">
        {sections.length === 0 ? (
          <p className="text-xs leading-relaxed text-text-subtle">
            No prompt attributes selected.
            <br />
            Start building your prompt by choosing categories or clicking Random.
          </p>
        ) : (
          <div className="space-y-2.5">
            {sections.map((section) => (
              <div key={section.key}>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {section.label}
                </h4>
                <ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-text-secondary marker:text-text-subtle">
                  {section.values.map((value, i) => (
                    <li key={`${section.key}-${i}`}>
                      {value}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
