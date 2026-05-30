'use client';

import { useEditorStore } from '@/stores/editorStore';
import { formatTime } from '@/utils/timeline';

export default function Toolbar() {
  const playing = useEditorStore((s) => s.playing);
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const zoom = useEditorStore((s) => s.zoom);
  const historyLen = useEditorStore((s) => s.history.length);
  const futureLen = useEditorStore((s) => s.future.length);
  const rippleTrimMode = useEditorStore((s) => s.rippleTrimMode);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const setZoom = useEditorStore((s) => s.setZoom);
  const splitItem = useEditorStore((s) => s.splitItem);
  const items = useEditorStore((s) => s.items);
  const currentTimeVal = useEditorStore((s) => s.currentTime);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setRippleTrimMode = useEditorStore((s) => s.setRippleTrimMode);

  const handleSplit = () => {
    const item = Object.values(items).find(
      (i) => currentTimeVal >= i.startTime && currentTimeVal < i.startTime + i.duration
    );
    if (item) {
      splitItem(item.id, currentTimeVal);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-[#3a3936] bg-[#2f2f2d] px-3 py-1.5 shrink-0">
      {/* Transport */}
      <button
        onClick={togglePlay}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[#c9a87a] text-[#1f1f1d] transition hover:bg-[#d8b88d]"
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? (
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={historyLen === 0}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b6560] transition hover:bg-[#3a3936] hover:text-[#bcb6aa] disabled:opacity-30"
        title="Undo (Ctrl+Z)"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h13a5 5 0 0 1 0 10H9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10l4-4M3 10l4 4" />
        </svg>
      </button>
      <button
        onClick={redo}
        disabled={futureLen === 0}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b6560] transition hover:bg-[#3a3936] hover:text-[#bcb6aa] disabled:opacity-30"
        title="Redo (Ctrl+Shift+Z)"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H8a5 5 0 0 0 0 10h4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 10l-4-4M21 10l-4 4" />
        </svg>
      </button>

      <div className="mx-1 h-5 w-px bg-[#3a3936]" />

      {/* Split button */}
      <button
        onClick={handleSplit}
        className="flex h-7 items-center gap-1 rounded-lg border border-[#5a4f40] px-2 text-[10px] text-[#f2dbc0] transition hover:bg-[#4a433a]"
        title="Split clip at playhead (S)"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 2h-5v20h5V2zM2 8l5 4-5 4V8zM22 8l-5 4 5 4V8z" />
        </svg>
        Split
      </button>

      <div className="mx-1 h-5 w-px bg-[#3a3936]" />

      {/* Time display */}
      <span className="font-mono text-xs tabular-nums text-[#c9a87a] min-w-[40px]">
        {formatTime(currentTime)}
      </span>
      <span className="text-[10px] text-[#6b6560]">/</span>
      <span className="font-mono text-xs tabular-nums text-[#6b6560]">
        {formatTime(duration)}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {/* Ripple trim toggle */}
        <button
          onClick={() => setRippleTrimMode(!rippleTrimMode)}
          className={`flex h-6 items-center gap-1 rounded-lg border px-2 text-[9px] transition ${
            rippleTrimMode
              ? 'border-[#c9a87a]/40 bg-[#c9a87a]/10 text-[#c9a87a]'
              : 'border-[#3a3936] text-[#6b6560] hover:border-[#5a4f40]'
          }`}
          title="Ripple trim mode"
        >
          <svg className={`h-3 w-3 ${rippleTrimMode ? 'text-[#c9a87a]' : 'text-[#6b6560]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Ripple
        </button>

        <span className="text-[10px] text-[#6b6560] min-w-[32px] text-right">{zoom}%</span>
        <input
          type="range"
          min={20}
          max={400}
          value={zoom}
          onChange={(e) => setZoom(parseInt(e.target.value))}
          className="w-16 appearance-none rounded-full bg-[#494741] h-1 cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#c9a87a]
            [&::-webkit-slider-thumb]:cursor-pointer"
          title="Zoom (Ctrl+Scroll)"
        />
      </div>
    </div>
  );
}
