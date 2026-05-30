import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import {
  EditorStore,
  TimelineTrack,
  TimelineItem,
  VideoGalleryItem,
} from '@/types/editor';
import { getTotalDuration, splitItemAtTime, rippleInsert } from '@/utils/timeline';

const DEFAULT_FPS = 24;

interface EditorSnapshot {
  tracks: TimelineTrack[];
  items: Record<string, TimelineItem>;
}

const MAX_HISTORY = 50;

function recalcDuration(
  tracks: TimelineTrack[],
  items: Record<string, TimelineItem>
): number {
  return getTotalDuration(tracks, items);
}

function createDefaultTracks(): TimelineTrack[] {
  return [
    {
      id: nanoid(),
      type: 'video',
      name: 'Video Track 1',
      itemIds: [],
      locked: false,
      muted: false,
      height: 72,
    },
    {
      id: nanoid(),
      type: 'audio',
      name: 'Audio Track 1',
      itemIds: [],
      locked: false,
      muted: false,
      height: 60,
    },
  ];
}

function captureSnapshot(get: () => EditorStore): EditorSnapshot {
  const state = get();
  return {
    tracks: JSON.parse(JSON.stringify(state.tracks)),
    items: JSON.parse(JSON.stringify(state.items)),
  };
}

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    tracks: createDefaultTracks(),
    items: {},
    currentTime: 0,
    duration: 0,
    playing: false,
    selectedItemId: null,
    zoom: 80,
    fps: DEFAULT_FPS,
    resolution: { width: 854, height: 480 },
    audioFile: null,
    audioVolume: 0.5,
    removeOriginalAudio: false,
    videoGallery: [],
    history: [],
    future: [],
    rippleTrimMode: false,
    snapGuideTime: null,

    pushHistory: () => {
      const snapshot = captureSnapshot(get);
      set((draft) => {
        draft.history.push(snapshot);
        if (draft.history.length > MAX_HISTORY) {
          draft.history.shift();
        }
        draft.future = [];
      });
    },

    undo: () => {
      const state = get();
      if (state.history.length === 0) return;
      const snapshot = captureSnapshot(get);
      const prev = state.history[state.history.length - 1];
      set((draft) => {
        draft.future.push(snapshot);
        draft.history.pop();
        draft.tracks = JSON.parse(JSON.stringify(prev.tracks));
        draft.items = JSON.parse(JSON.stringify(prev.items));
        draft.duration = recalcDuration(draft.tracks, draft.items);
        if (draft.selectedItemId && !draft.items[draft.selectedItemId]) {
          draft.selectedItemId = null;
        }
      });
    },

    redo: () => {
      const state = get();
      if (state.future.length === 0) return;
      const snapshot = captureSnapshot(get);
      const next = state.future[state.future.length - 1];
      set((draft) => {
        draft.history.push(snapshot);
        draft.future.pop();
        draft.tracks = JSON.parse(JSON.stringify(next.tracks));
        draft.items = JSON.parse(JSON.stringify(next.items));
        draft.duration = recalcDuration(draft.tracks, draft.items);
        if (draft.selectedItemId && !draft.items[draft.selectedItemId]) {
          draft.selectedItemId = null;
        }
      });
    },

    addClip: (video: VideoGalleryItem) => {
      const state = get();
      if (Object.values(state.items).some((i) => i.source === video.filename)) {
        return;
      }

      const snapshot = captureSnapshot(get);
      const videoTrack = state.tracks.find((t) => t.type === 'video');
      if (!videoTrack) return;

      const existingItems = videoTrack.itemIds
        .map((id) => state.items[id])
        .filter(Boolean);
      const maxEnd = existingItems.reduce(
        (max, item) => Math.max(max, item.startTime + item.duration),
        0
      );

      const estDuration = 5;
      const newItem: TimelineItem = {
        id: nanoid(),
        trackId: videoTrack.id,
        type: 'video',
        source: video.filename,
        sourceStart: 0,
        sourceEnd: estDuration,
        startTime: maxEnd,
        duration: estDuration,
        title: video.prompt || video.filename,
        thumbnail: video.thumbnail,
        volume: 1,
        muted: false,
        speed: 1,
        videoWidth: video.width,
        videoHeight: video.height,
      };

      set((draft) => {
        draft.history.push(snapshot);
        if (draft.history.length > MAX_HISTORY) draft.history.shift();
        draft.future = [];
        const track = draft.tracks.find((t) => t.id === videoTrack.id);
        if (track) {
          track.itemIds.push(newItem.id);
        }
        draft.items[newItem.id] = newItem;
        draft.selectedItemId = newItem.id;
        draft.currentTime = newItem.startTime;
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });

      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      videoEl.muted = true;
      videoEl.src = `/generated/${video.filename}`;
      videoEl.onloadedmetadata = () => {
        const dur = videoEl.duration || 5;
        set((draft) => {
          const item = draft.items[newItem.id];
          if (item) {
            item.sourceEnd = dur;
            item.duration = dur;
          }
          draft.duration = recalcDuration(draft.tracks, draft.items);
        });
      };
    },

    addTrack: (type: 'video' | 'audio', name?: string) => {
      const id = nanoid();
      set((draft) => {
        const count =
          draft.tracks.filter((t) => t.type === type).length + 1;
        draft.tracks.push({
          id,
          type,
          name: name || `${type === 'video' ? 'Video' : 'Audio'} Track ${count}`,
          itemIds: [],
          locked: false,
          muted: false,
          height: type === 'video' ? 72 : 60,
        });
      });
      return id;
    },

    removeTrack: (trackId: string) => {
      const snapshot = captureSnapshot(get);
      set((draft) => {
        draft.history.push(snapshot);
        if (draft.history.length > MAX_HISTORY) draft.history.shift();
        draft.future = [];
        const track = draft.tracks.find((t) => t.id === trackId);
        if (!track) return;
        for (const id of track.itemIds) {
          delete draft.items[id];
        }
        draft.tracks = draft.tracks.filter((t) => t.id !== trackId);
        if (draft.selectedItemId && !draft.items[draft.selectedItemId]) {
          draft.selectedItemId = null;
        }
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });
    },

    moveItem: (itemId: string, newStartTime: number) => {
      set((draft) => {
        const item = draft.items[itemId];
        if (!item) return;
        item.startTime = Math.max(0, newStartTime);
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });
    },

    trimClipStart: (itemId: string, newSourceStart: number) => {
      set((draft) => {
        const item = draft.items[itemId];
        if (!item) return;
        const clamped = Math.max(0, Math.min(newSourceStart, item.sourceEnd - 0.1));
        const delta = clamped - item.sourceStart;
        item.sourceStart = clamped;
        item.duration = item.sourceEnd - item.sourceStart;
        if (draft.rippleTrimMode && delta !== 0) {
          const track = draft.tracks.find((t) => t.id === item.trackId);
          if (track) {
            for (const id of track.itemIds) {
              const other = draft.items[id];
              if (other && other.id !== itemId && other.startTime > item.startTime) {
                other.startTime += delta;
              }
            }
          }
        }
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });
    },

    trimClipEnd: (itemId: string, newSourceEnd: number) => {
      set((draft) => {
        const item = draft.items[itemId];
        if (!item) return;
        const clamped = Math.max(item.sourceStart + 0.1, newSourceEnd);
        const delta = clamped - item.sourceEnd;
        item.sourceEnd = clamped;
        item.duration = item.sourceEnd - item.sourceStart;
        if (draft.rippleTrimMode && delta !== 0) {
          const track = draft.tracks.find((t) => t.id === item.trackId);
          if (track) {
            for (const id of track.itemIds) {
              const other = draft.items[id];
              if (other && other.id !== itemId && other.startTime > item.startTime) {
                other.startTime += delta;
              }
            }
          }
        }
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });
    },

    trimItem: (itemId: string, sourceStart: number, sourceEnd: number) => {
      const snapshot = captureSnapshot(get);
      set((draft) => {
        draft.history.push(snapshot);
        if (draft.history.length > MAX_HISTORY) draft.history.shift();
        draft.future = [];
        const item = draft.items[itemId];
        if (!item) return;
        const clampedStart = Math.max(0, Math.min(sourceStart, sourceEnd - 0.1));
        const clampedEnd = Math.max(clampedStart + 0.1, sourceEnd);
        item.sourceStart = clampedStart;
        item.sourceEnd = clampedEnd;
        item.duration = clampedEnd - clampedStart;
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });
    },

    splitItem: (itemId: string, splitTime: number) => {
      const snapshot = captureSnapshot(get);
      set((draft) => {
        const item = draft.items[itemId];
        if (!item) return;
        if (
          splitTime <= item.startTime + 0.1 ||
          splitTime >= item.startTime + item.duration - 0.1
        )
          return;

        const newIdA = nanoid();
        const newIdB = nanoid();
        const [itemA, itemB] = splitItemAtTime(item, splitTime, newIdA, newIdB);

        draft.history.push(snapshot);
        if (draft.history.length > MAX_HISTORY) draft.history.shift();
        draft.future = [];

        draft.items[newIdA] = itemA;
        draft.items[newIdB] = itemB;
        delete draft.items[itemId];

        const track = draft.tracks.find((t) => t.id === item.trackId);
        if (track) {
          const idx = track.itemIds.indexOf(itemId);
          if (idx !== -1) {
            track.itemIds.splice(idx, 1, newIdA, newIdB);
          }
        }

        draft.selectedItemId = newIdA;
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });
    },

    insertClipAtTime: (itemId: string, trackId: string, dropTime: number) => {
      const snapshot = captureSnapshot(get);
      set((draft) => {
        const track = draft.tracks.find((t) => t.id === trackId);
        if (!track) return;
        const item = draft.items[itemId];
        if (!item) return;

        const result = rippleInsert(draft.items, track, itemId, Math.max(0, dropTime));
        draft.items = result.items;
        for (let i = 0; i < draft.tracks.length; i++) {
          if (draft.tracks[i].id === trackId) {
            draft.tracks[i] = result.track;
            break;
          }
        }

        draft.history.push(snapshot);
        if (draft.history.length > MAX_HISTORY) draft.history.shift();
        draft.future = [];

        draft.selectedItemId = itemId;
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });
    },

    removeItem: (itemId: string) => {
      const snapshot = captureSnapshot(get);
      set((draft) => {
        const track = draft.tracks.find((t) =>
          t.itemIds.includes(itemId)
        );
        const item = draft.items[itemId];
        if (!item || !track) return;

        const itemDuration = item.duration;
        const itemStart = item.startTime;

        draft.history.push(snapshot);
        if (draft.history.length > MAX_HISTORY) draft.history.shift();
        draft.future = [];

        delete draft.items[itemId];
        track.itemIds = track.itemIds.filter((id) => id !== itemId);

        for (const id of track.itemIds) {
          const other = draft.items[id];
          if (other && other.startTime > itemStart) {
            other.startTime -= itemDuration;
          }
        }

        if (draft.selectedItemId === itemId) {
          draft.selectedItemId = null;
        }
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });
    },

    setCurrentTime: (time: number) => {
      set((draft) => {
        draft.currentTime = Math.max(0, Math.min(time, draft.duration || 0));
      });
    },

    setPlaying: (playing: boolean) => {
      set((draft) => {
        draft.playing = playing;
      });
    },

    togglePlay: () => {
      set((draft) => {
        draft.playing = !draft.playing;
        if (draft.playing && draft.currentTime >= draft.duration) {
          draft.currentTime = 0;
        }
      });
    },

    setZoom: (zoom: number) => {
      set((draft) => {
        draft.zoom = Math.max(20, Math.min(400, zoom));
      });
    },

    adjustZoom: (delta: number) => {
      set((draft) => {
        draft.zoom = Math.max(20, Math.min(400, draft.zoom + delta));
      });
    },

    selectItem: (itemId: string | null) => {
      set((draft) => {
        draft.selectedItemId = itemId;
      });
    },

    setAudioFile: (file: File | null) => {
      set((draft) => {
        draft.audioFile = file;
      });
    },

    setAudioVolume: (volume: number) => {
      set((draft) => {
        draft.audioVolume = Math.max(0, Math.min(1, volume));
      });
    },

    setRemoveOriginalAudio: (remove: boolean) => {
      set((draft) => {
        draft.removeOriginalAudio = remove;
      });
    },

    setVideoGallery: (gallery: VideoGalleryItem[]) => {
      set((draft) => {
        draft.videoGallery = gallery;
      });
    },

    setDuration: (duration: number) => {
      set((draft) => {
        draft.duration = duration;
      });
    },

    reorderTrackItem: (trackId: string, fromIndex: number, toIndex: number) => {
      const snapshot = captureSnapshot(get);
      set((draft) => {
        draft.history.push(snapshot);
        if (draft.history.length > MAX_HISTORY) draft.history.shift();
        draft.future = [];
        const track = draft.tracks.find((t) => t.id === trackId);
        if (!track) return;
        const [moved] = track.itemIds.splice(fromIndex, 1);
        track.itemIds.splice(toIndex, 0, moved);
      });
    },

    addItemToTrack: (trackId: string, item: TimelineItem) => {
      const snapshot = captureSnapshot(get);
      set((draft) => {
        draft.history.push(snapshot);
        if (draft.history.length > MAX_HISTORY) draft.history.shift();
        draft.future = [];
        const track = draft.tracks.find((t) => t.id === trackId);
        if (!track) return;
        draft.items[item.id] = item;
        track.itemIds.push(item.id);
        draft.duration = recalcDuration(draft.tracks, draft.items);
      });
    },

    setRippleTrimMode: (mode: boolean) => {
      set((draft) => {
        draft.rippleTrimMode = mode;
      });
    },

    setSnapGuideTime: (time: number | null) => {
      set((draft) => {
        draft.snapGuideTime = time;
      });
    },
  }))
);
