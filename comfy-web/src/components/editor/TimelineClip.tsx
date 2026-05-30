'use client';

import { useRef, useState, useCallback } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { timeToPx, snapTime } from '@/utils/timeline';

const CLIP_COLORS = [
  '#c9a87a', '#7ac9c9', '#a8c97a', '#c97a9b', '#8b9bb4',
  '#c9c97a', '#9b7ac9', '#c97a7a', '#7ac9a8', '#a87ac9',
];

const HANDLE_WIDTH = 7;

interface TimelineClipProps {
  itemId: string;
  trackIndex: number;
}

export default function TimelineClip({ itemId, trackIndex }: TimelineClipProps) {
  const item = useEditorStore((s) => s.items[itemId]);
  const zoom = useEditorStore((s) => s.zoom);
  const selectedItemId = useEditorStore((s) => s.selectedItemId);
  const selectItem = useEditorStore((s) => s.selectItem);
  const removeItem = useEditorStore((s) => s.removeItem);
  const setSnapGuideTime = useEditorStore((s) => s.setSnapGuideTime);

  const [isDragging, setIsDragging] = useState(false);
  const [isTrimming, setIsTrimming] = useState<'start' | 'end' | null>(null);

  if (!item) return null;

  const isSelected = selectedItemId === item.id;
  const color = CLIP_COLORS[trackIndex % CLIP_COLORS.length];
  const left = timeToPx(item.startTime, zoom);
  const width = Math.max(timeToPx(item.duration, zoom), 10);

  // ─── Move drag ──────────────────────────────────────────
  const dragRef = useRef<{ startX: number; startTime: number; hasMoved: boolean } | null>(null);

  const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    selectItem(itemId);

    const state = useEditorStore.getState();
    const currentItem = state.items[itemId];
    if (!currentItem) return;

    dragRef.current = {
      startX: e.clientX,
      startTime: currentItem.startTime,
      hasMoved: false,
    };
    setIsDragging(true);
  }, [itemId, selectItem]);

  const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    drag.hasMoved = true;
    const dx = e.clientX - drag.startX;
    const deltaTime = dx / zoom;
    const rawTime = Math.max(0, drag.startTime + deltaTime);

    const state = useEditorStore.getState();
    const snapResult = snapTime(rawTime, state.items, state.currentTime, zoom, itemId);

    state.moveItem(itemId, snapResult.time);

    setSnapGuideTime(snapResult.snapped && snapResult.snapTime !== null ? snapResult.snapTime : null);
  }, [itemId, zoom, setSnapGuideTime]);

  const handleDragPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    setIsDragging(false);
    if (!drag) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      return;
    }

    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setSnapGuideTime(null);

    if (drag.hasMoved) {
      const state = useEditorStore.getState();
      const currentItem = state.items[itemId];
      if (!currentItem) { dragRef.current = null; return; }

      const dx = e.clientX - drag.startX;
      const deltaTime = dx / zoom;
      const rawTime = Math.max(0, drag.startTime + deltaTime);
      const snapResult = snapTime(rawTime, state.items, state.currentTime, zoom, itemId);

      state.pushHistory();
      state.insertClipAtTime(itemId, currentItem.trackId, Math.max(0, snapResult.time));
    }

    dragRef.current = null;
  }, [itemId, zoom]);

  // ─── Trim ──────────────────────────────────────────────
  const trimRef = useRef<{ startX: number; startSource: number; handle: 'start' | 'end' } | null>(null);

  const handleTrimPointerDown = useCallback((e: React.PointerEvent, handle: 'start' | 'end') => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const state = useEditorStore.getState();
    state.pushHistory();

    const currentItem = state.items[itemId];
    if (!currentItem) return;

    trimRef.current = {
      startX: e.clientX,
      startSource: handle === 'start' ? currentItem.sourceStart : currentItem.sourceEnd,
      handle,
    };
    setIsTrimming(handle);
  }, [itemId]);

  const handleTrimPointerMove = useCallback((e: React.PointerEvent) => {
    const trim = trimRef.current;
    if (!trim) return;

    const dx = e.clientX - trim.startX;
    const deltaTime = dx / zoom;

    const state = useEditorStore.getState();
    const currentItem = state.items[itemId];
    if (!currentItem) return;

    if (trim.handle === 'start') {
      const newSourceStart = Math.max(0, Math.min(trim.startSource + deltaTime, currentItem.sourceEnd - 0.1));
      state.trimClipStart(itemId, newSourceStart);
    } else {
      const newSourceEnd = Math.max(currentItem.sourceStart + 0.1, trim.startSource + deltaTime);
      state.trimClipEnd(itemId, newSourceEnd);
    }
  }, [itemId, zoom]);

  const handleTrimPointerUp = useCallback((e: React.PointerEvent) => {
    setIsTrimming(null);
    trimRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const style: React.CSSProperties = {
    position: 'absolute',
    left,
    top: 2,
    width,
    height: 58,
    zIndex: isDragging ? 100 : isSelected ? 10 : 1,
    opacity: isDragging ? 0.85 : 1,
    touchAction: 'none',
  };

  return (
    <div
      style={style}
      className="timeline-clip"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={handleDragPointerDown}
      onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerUp}
    >
      <div
        className="clip-visual"
        style={{
          position: 'absolute',
          inset: 0,
          background: isSelected
            ? `linear-gradient(180deg, ${color}dd, ${color}88)`
            : `linear-gradient(180deg, ${color}66, ${color}44)`,
          borderRadius: 6,
          border: isSelected
            ? `2px solid ${color}`
            : isDragging
            ? `2px solid ${color}aa`
            : '2px solid transparent',
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: 'border-color 0.1s, filter 0.1s',
          filter: isDragging ? 'brightness(1.15)' : isTrimming ? 'brightness(1.1)' : undefined,
        }}
      >
        <div className="px-2 py-1 overflow-hidden" style={{ height: '100%' }}>
          <p className="text-[10px] text-white/90 truncate font-medium leading-tight">{item.title}</p>
          <p className="text-[9px] text-white/60 font-mono tabular-nums mt-0.5">
            {Math.round(item.duration * 10) / 10}s
          </p>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); removeItem(itemId); }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#cc3333',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isSelected ? 1 : 0,
          transition: 'opacity 0.12s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        ✕
      </button>

      {/* Left trim handle */}
      <div
        className="trim-handle-left"
        onPointerDown={(e) => handleTrimPointerDown(e, 'start')}
        onPointerMove={handleTrimPointerMove}
        onPointerUp={handleTrimPointerUp}
        style={{
          position: 'absolute',
          left: -HANDLE_WIDTH / 2,
          top: 0,
          width: HANDLE_WIDTH,
          height: '100%',
          cursor: 'ew-resize',
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isTrimming === 'start' || isSelected ? 1 : 0,
          transition: 'opacity 0.12s',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            width: 3,
            height: '50%',
            borderRadius: 2,
            background: '#fff',
            opacity: 0.8,
            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      {/* Right trim handle */}
      <div
        className="trim-handle-right"
        onPointerDown={(e) => handleTrimPointerDown(e, 'end')}
        onPointerMove={handleTrimPointerMove}
        onPointerUp={handleTrimPointerUp}
        style={{
          position: 'absolute',
          right: -HANDLE_WIDTH / 2,
          top: 0,
          width: HANDLE_WIDTH,
          height: '100%',
          cursor: 'ew-resize',
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isTrimming === 'end' || isSelected ? 1 : 0,
          transition: 'opacity 0.12s',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            width: 3,
            height: '50%',
            borderRadius: 2,
            background: '#fff',
            opacity: 0.8,
            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          }}
        />
      </div>
    </div>
  );
}
