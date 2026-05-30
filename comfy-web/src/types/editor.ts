export interface VideoGalleryItem {
  id: string;
  filename: string;
  prompt: string;
  timestamp: number;
  subfolder?: string;
  resolution?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  model?: string;
}

export interface TimelineItem {
  id: string;
  trackId: string;
  type: 'video' | 'audio';
  source: string;
  sourceStart: number;
  sourceEnd: number;
  startTime: number;
  duration: number;
  title: string;
  thumbnail?: string;
  volume: number;
  muted: boolean;
  speed: number;
  videoWidth?: number;
  videoHeight?: number;
}

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio';
  name: string;
  itemIds: string[];
  locked: boolean;
  muted: boolean;
  height: number;
}

export interface EditorState {
  tracks: TimelineTrack[];
  items: Record<string, TimelineItem>;
  currentTime: number;
  duration: number;
  playing: boolean;
  selectedItemId: string | null;
  zoom: number;
  fps: number;
  resolution: { width: number; height: number };
  audioFile: File | null;
  audioVolume: number;
  removeOriginalAudio: boolean;
  videoGallery: VideoGalleryItem[];
  history: { tracks: TimelineTrack[]; items: Record<string, TimelineItem> }[];
  future: { tracks: TimelineTrack[]; items: Record<string, TimelineItem> }[];
  rippleTrimMode: boolean;
  snapGuideTime: number | null;
}

export interface EditorActions {
  addClip: (video: VideoGalleryItem) => void;
  addTrack: (type: 'video' | 'audio', name?: string) => string;
  removeTrack: (trackId: string) => void;
  moveItem: (itemId: string, newStartTime: number) => void;
  trimItem: (itemId: string, sourceStart: number, sourceEnd: number) => void;
  trimClipStart: (itemId: string, newSourceStart: number) => void;
  trimClipEnd: (itemId: string, newSourceEnd: number) => void;
  splitItem: (itemId: string, splitTime: number) => void;
  removeItem: (itemId: string) => void;
  insertClipAtTime: (itemId: string, trackId: string, dropTime: number) => void;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setZoom: (zoom: number) => void;
  adjustZoom: (delta: number) => void;
  selectItem: (itemId: string | null) => void;
  setAudioFile: (file: File | null) => void;
  setAudioVolume: (volume: number) => void;
  setRemoveOriginalAudio: (remove: boolean) => void;
  setVideoGallery: (gallery: VideoGalleryItem[]) => void;
  setDuration: (duration: number) => void;
  reorderTrackItem: (trackId: string, fromIndex: number, toIndex: number) => void;
  addItemToTrack: (trackId: string, item: TimelineItem) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  setRippleTrimMode: (mode: boolean) => void;
  setSnapGuideTime: (time: number | null) => void;
}

export type EditorStore = EditorState & EditorActions;
