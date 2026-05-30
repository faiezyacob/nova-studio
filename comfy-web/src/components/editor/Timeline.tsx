'use client';

import { useRef, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { timeToPx, formatTime } from '@/utils/timeline';
import TimelineTrack from './TimelineTrack';

const RULER_HEIGHT = 28;
const LABEL_WIDTH = 64;

export default function Timeline() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadDragRef = useRef<{ startX: number; startTime: number } | null>(null);

  const tracks = useEditorStore((s) => s.tracks);
  const items = useEditorStore((s) => s.items);
  const zoom = useEditorStore((s) => s.zoom);
  const duration = useEditorStore((s) => s.duration);
  const currentTime = useEditorStore((s) => s.currentTime);
  const snapGuideTime = useEditorStore((s) => s.snapGuideTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setPlaying = useEditorStore((s) => s.setPlaying);

  const trackTotalHeight = tracks.reduce((sum, t) => sum + t.height + 8, 0);
  const totalWidth = Math.max(timeToPx(Math.max(duration, 1), zoom), 600) + LABEL_WIDTH;

  const rulerTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = zoom > 150 ? 0.5 : zoom > 60 ? 1 : 2;
    for (let t = 0; t <= Math.max(duration, 1) + step; t += step) {
      ticks.push(Math.round(t * 10) / 10);
    }
    return ticks;
  }, [duration, zoom]);

  // ─── Timeline click to seek ──────────────────────────
  const getTimeFromPointer = useCallback((clientX: number) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const scrollLeft = timelineRef.current?.scrollLeft || 0;
    const x = clientX - rect.left + scrollLeft - LABEL_WIDTH;
    return Math.max(0, Math.min(x / zoom, duration));
  }, [zoom, duration]);

  const handleTimelinePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const time = getTimeFromPointer(e.clientX);
    setCurrentTime(time);
    setPlaying(false);
  }, [getTimeFromPointer, setCurrentTime, setPlaying]);

  const handleRulerPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const time = getTimeFromPointer(e.clientX);
    setCurrentTime(time);
    setPlaying(false);
  }, [getTimeFromPointer, setCurrentTime, setPlaying]);

  // ─── Playhead dragging ──────────────────────────────
  const handlePlayheadPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPlaying(false);
    playheadDragRef.current = {
      startX: e.clientX,
      startTime: currentTime,
    };
  }, [currentTime, setPlaying]);

  const handlePlayheadPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = playheadDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const newTime = Math.max(0, Math.min(drag.startTime + dx / zoom, duration));
    setCurrentTime(newTime);
  }, [zoom, duration, setCurrentTime]);

  const handlePlayheadPointerUp = useCallback((e: React.PointerEvent) => {
    playheadDragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // ─── Ctrl+Wheel zoom ────────────────────────────────
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        useEditorStore.getState().adjustZoom(delta);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const playheadX = timeToPx(currentTime, zoom);
  const snapGuideX = snapGuideTime !== null ? timeToPx(snapGuideTime, zoom) : null;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div ref={timelineRef} className="flex-1 overflow-auto overscroll-contain bg-[#2a2a28]">
        <div style={{ minWidth: totalWidth, position: 'relative' }}>
          {/* Ruler */}
          <div
            className="timeline-ruler"
            style={{
              height: RULER_HEIGHT,
              position: 'sticky',
              top: 0,
              zIndex: 20,
              background: '#2a2a28',
              borderBottom: '1px solid #3a3936',
            }}
            onPointerDown={handleRulerPointerDown}
          >
            {rulerTicks.map((t) => {
              const x = timeToPx(t, zoom);
              const isEven = t % 1 === 0;
              return (
                <div key={t} style={{ position: 'absolute', left: x + LABEL_WIDTH, top: 0, height: '100%' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: isEven ? '18px' : '22px',
                      width: '1px',
                      height: isEven ? '10px' : '6px',
                      background: '#4a4944',
                    }}
                  />
                  {isEven && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 3,
                        top: 4,
                        fontSize: 9,
                        color: '#6b6560',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatTime(t)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tracks area */}
          <div
            className="timeline-tracks"
            onPointerDown={handleTimelinePointerDown}
          >
            {tracks.map((track, index) => (
              <TimelineTrack key={track.id} track={track} trackIndex={index} />
            ))}
          </div>

          {/* Playhead line (extends across ruler + tracks) */}
          <div
            className="playhead"
            style={{
              position: 'absolute',
              left: playheadX + LABEL_WIDTH,
              top: 0,
              width: 2,
              height: RULER_HEIGHT + trackTotalHeight,
              background: '#c9a87a',
              zIndex: 30,
              boxShadow: '0 0 8px #c9a87a88',
              pointerEvents: 'none',
            }}
          >
            <div
              className="playhead-diamond"
              style={{
                position: 'absolute',
                top: 0,
                left: -6,
                width: 14,
                height: 14,
                background: '#c9a87a',
                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                cursor: 'ew-resize',
                pointerEvents: 'auto',
              }}
              onPointerDown={handlePlayheadPointerDown}
              onPointerMove={handlePlayheadPointerMove}
              onPointerUp={handlePlayheadPointerUp}
            />
          </div>

          {/* Snap guide line */}
          {snapGuideX !== null && (
            <div
              className="snap-guide"
              style={{
                position: 'absolute',
                left: snapGuideX + LABEL_WIDTH,
                top: 0,
                width: 1,
                height: RULER_HEIGHT + trackTotalHeight,
                background: '#ff6b6b',
                zIndex: 29,
                pointerEvents: 'none',
                transition: 'none',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
