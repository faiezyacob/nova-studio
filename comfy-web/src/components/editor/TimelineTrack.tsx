'use client';

import { useEditorStore } from '@/stores/editorStore';
import TimelineClip from './TimelineClip';
import type { TimelineTrack as TrackType } from '@/types/editor';

interface TimelineTrackProps {
  track: TrackType;
  trackIndex: number;
}

const TRACK_LABELS: Record<string, string> = {
  video: 'V',
  audio: 'A',
};

export default function TimelineTrack({ track, trackIndex }: TimelineTrackProps) {
  const items = useEditorStore((s) => s.items);
  const selectItem = useEditorStore((s) => s.selectItem);

  const trackItems = track.itemIds
    .map((id) => items[id])
    .filter(Boolean)
    .sort((a, b) => a.startTime - b.startTime);

  const label = TRACK_LABELS[track.type] || '?';

  const handleTrackClick = () => {
    selectItem(null);
  };

  return (
    <div
      className="timeline-track group relative flex border-b border-[#3a3936] hover:bg-[#2d2d2b] transition-colors"
      style={{ height: track.height + 8 }}
      onClick={handleTrackClick}
    >
      <div className="flex w-16 shrink-0 items-center justify-center border-r border-[#3a3936] bg-[#262624] text-[10px] font-bold text-[#6b6560]">
        <span className="rounded bg-[#3a3936] px-1.5 py-0.5 text-[9px]">
          {label}{trackIndex + 1}
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden" style={{ minHeight: track.height }}>
        {trackItems.map((item) => (
          <TimelineClip key={item.id} itemId={item.id} trackIndex={trackIndex} />
        ))}
      </div>
    </div>
  );
}
