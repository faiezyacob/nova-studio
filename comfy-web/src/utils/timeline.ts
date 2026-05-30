import { TimelineItem, TimelineTrack } from '@/types/editor';

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`;
}

export function getActiveItems(
  items: Record<string, TimelineItem>,
  currentTime: number
): TimelineItem[] {
  const active: TimelineItem[] = [];
  for (const item of Object.values(items)) {
    if (
      currentTime >= item.startTime &&
      currentTime < item.startTime + item.duration
    ) {
      active.push(item);
    }
  }
  return active;
}

export function getSourceTime(item: TimelineItem, timelineTime: number): number {
  const localTime = timelineTime - item.startTime;
  const ratio = localTime / item.duration;
  return item.sourceStart + ratio * (item.sourceEnd - item.sourceStart);
}

export function getActiveItemsForTrack(
  itemIds: string[],
  items: Record<string, TimelineItem>,
  currentTime: number
): TimelineItem[] {
  return itemIds
    .map((id) => items[id])
    .filter(
      (item): item is TimelineItem =>
        !!item &&
        currentTime >= item.startTime &&
        currentTime < item.startTime + item.duration
    )
    .sort((a, b) => a.startTime - b.startTime);
}

export function getTrackDuration(
  track: TimelineTrack,
  items: Record<string, TimelineItem>
): number {
  let maxEnd = 0;
  for (const id of track.itemIds) {
    const item = items[id];
    if (item) {
      const end = item.startTime + item.duration;
      if (end > maxEnd) maxEnd = end;
    }
  }
  return maxEnd;
}

export function getTotalDuration(
  tracks: TimelineTrack[],
  items: Record<string, TimelineItem>
): number {
  let maxEnd = 0;
  for (const track of tracks) {
    const dur = getTrackDuration(track, items);
    if (dur > maxEnd) maxEnd = dur;
  }
  return maxEnd || 0;
}

export function findItemAtTime(
  items: Record<string, TimelineItem>,
  time: number
): TimelineItem | null {
  for (const item of Object.values(items)) {
    if (time >= item.startTime && time < item.startTime + item.duration) {
      return item;
    }
  }
  return null;
}

// ─── Snap System ───────────────────────────────────────────

export interface SnapPoint {
  time: number;
  type: 'playhead' | 'clip-start' | 'clip-end';
}

export interface SnapResult {
  time: number;
  snapped: boolean;
  snapTime: number | null;
}

const SNAP_THRESHOLD_PX = 8;

export function getSnapPoints(
  items: Record<string, TimelineItem>,
  currentTime: number
): SnapPoint[] {
  const points: SnapPoint[] = [
    { time: currentTime, type: 'playhead' },
  ];
  for (const item of Object.values(items)) {
    points.push({ time: item.startTime, type: 'clip-start' });
    points.push({ time: item.startTime + item.duration, type: 'clip-end' });
  }
  return points;
}

export function snapTime(
  time: number,
  items: Record<string, TimelineItem>,
  currentTime: number,
  zoom: number,
  excludeId?: string
): SnapResult {
  const threshold = SNAP_THRESHOLD_PX / zoom;
  const points = getSnapPoints(items, currentTime);

  let bestSnap: number | null = null;
  let bestDist = threshold;
  let bestSameTrack = false;

  for (const point of points) {
    if (Math.abs(time - point.time) < bestDist) {
      bestDist = Math.abs(time - point.time);
      bestSnap = point.time;
    }
  }

  if (bestSnap !== null) {
    return { time: bestSnap, snapped: true, snapTime: bestSnap };
  }

  return { time, snapped: false, snapTime: null };
}

export function snapPixels(
  pixelX: number,
  items: Record<string, TimelineItem>,
  currentTime: number,
  zoom: number,
  excludeId?: string
): { x: number; snapped: boolean; snapTime: number | null } {
  const time = pixelX / zoom;
  const result = snapTime(time, items, currentTime, zoom, excludeId);
  return { x: result.time * zoom, snapped: result.snapped, snapTime: result.snapTime };
}

// ─── Ripple Delete ─────────────────────────────────────────

export function rippleDelete(
  tracks: TimelineTrack[],
  items: Record<string, TimelineItem>,
  itemId: string
): { tracks: TimelineTrack[]; items: Record<string, TimelineItem> } {
  const item = items[itemId];
  if (!item) return { tracks, items };

  const itemDuration = item.duration;
  const itemStart = item.startTime;

  const newItems = { ...items };
  delete newItems[itemId];

  const newTracks = tracks.map((track) => {
    if (track.id === item.trackId) {
      return {
        ...track,
        itemIds: track.itemIds.filter((id) => id !== itemId),
      };
    }
    return track;
  });

  for (const track of newTracks) {
    if (track.id === item.trackId) {
      for (const id of track.itemIds) {
        const otherItem = newItems[id];
        if (otherItem && otherItem.startTime > itemStart) {
          newItems[id] = {
            ...otherItem,
            startTime: otherItem.startTime - itemDuration,
          };
        }
      }
      break;
    }
  }

  return { tracks: newTracks, items: newItems };
}

// ─── Split ─────────────────────────────────────────────────

export function splitItemAtTime(
  item: TimelineItem,
  splitTimelineTime: number,
  newIdA: string,
  newIdB: string
): [TimelineItem, TimelineItem] {
  const localTime = splitTimelineTime - item.startTime;
  const ratio = localTime / item.duration;
  const splitSourceTime = item.sourceStart + ratio * (item.sourceEnd - item.sourceStart);

  const itemA: TimelineItem = {
    ...item,
    id: newIdA,
    sourceEnd: splitSourceTime,
    duration: localTime,
  };

  const itemB: TimelineItem = {
    ...item,
    id: newIdB,
    sourceStart: splitSourceTime,
    startTime: splitTimelineTime,
    duration: item.duration - localTime,
  };

  return [itemA, itemB];
}

// ─── Ripple Insert ─────────────────────────────────────────

export function rippleInsert(
  items: Record<string, TimelineItem>,
  track: TimelineTrack,
  movingItemId: string,
  dropTime: number
): { items: Record<string, TimelineItem>; track: TimelineTrack } {
  const movingItem = items[movingItemId];
  if (!movingItem) return { items, track };

  const newItems = { ...items };
  const movingDuration = movingItem.duration;
  const oldStartTime = movingItem.startTime;

  const sortedOnTrack = track.itemIds
    .map((id) => newItems[id])
    .filter(Boolean)
    .sort((a, b) => a.startTime - b.startTime);

  let shiftStartIndex = -1;
  for (let i = 0; i < sortedOnTrack.length; i++) {
    const other = sortedOnTrack[i];
    if (other.id === movingItemId) continue;
    if (other.startTime >= dropTime) {
      shiftStartIndex = i;
      break;
    }
  }

  for (let i = 0; i < sortedOnTrack.length; i++) {
    const other = sortedOnTrack[i];
    if (other.id === movingItemId) continue;
    if (other.startTime >= dropTime) {
      newItems[other.id] = {
        ...other,
        startTime: other.startTime + movingDuration,
      };
    }
  }

  if (oldStartTime !== dropTime) {
    let otherShiftStartIndex = -1;
    const allSorted = Object.values(newItems)
      .filter((i) => i.trackId === track.id && i.id !== movingItemId)
      .sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < allSorted.length; i++) {
      if (allSorted[i].startTime >= oldStartTime) {
        otherShiftStartIndex = i;
        break;
      }
    }

    if (otherShiftStartIndex !== -1 && oldStartTime < dropTime) {
      for (let i = otherShiftStartIndex; i < allSorted.length; i++) {
        const other = allSorted[i];
        if (other.startTime >= dropTime) continue;
        if (other.startTime >= oldStartTime) {
          newItems[other.id] = {
            ...other,
            startTime: other.startTime - movingDuration,
          };
        }
      }
    }
  }

  newItems[movingItemId] = {
    ...movingItem,
    startTime: dropTime,
  };

  const reorderedIds = Object.values(newItems)
    .filter((i) => i.trackId === track.id)
    .sort((a, b) => a.startTime - b.startTime)
    .map((i) => i.id);

  return {
    items: newItems,
    track: { ...track, itemIds: reorderedIds },
  };
}

// ─── Collision ─────────────────────────────────────────────

export function checkOverlap(
  items: Record<string, TimelineItem>,
  trackId: string,
  startTime: number,
  duration: number,
  excludeId?: string
): TimelineItem[] {
  const end = startTime + duration;
  const overlapping: TimelineItem[] = [];
  for (const item of Object.values(items)) {
    if (item.trackId !== trackId) continue;
    if (excludeId && item.id === excludeId) continue;
    const itemEnd = item.startTime + item.duration;
    if (startTime < itemEnd && end > item.startTime) {
      overlapping.push(item);
    }
  }
  return overlapping;
}

export function findInsertIndex(
  items: Record<string, TimelineItem>,
  track: TimelineTrack,
  time: number
): number {
  const sorted = track.itemIds
    .map((id) => items[id])
    .filter(Boolean)
    .sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sorted.length; i++) {
    if (time <= sorted[i].startTime) {
      return i;
    }
  }
  return sorted.length;
}

export function pxToTime(px: number, zoom: number): number {
  return px / zoom;
}

export function timeToPx(time: number, zoom: number): number {
  return time * zoom;
}
