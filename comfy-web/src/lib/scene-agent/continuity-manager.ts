export interface ContinuityState {
  lastFrameDataUrl: string | null;
  lastFrameFilename: string | null;
  lastPrompt: string | null;
  currentSegmentIndex: number;
  totalSegments: number;
  continuityNotes: string[];
  sceneDescription: string;
}

export function createInitialContinuity(): ContinuityState {
  return {
    lastFrameDataUrl: null,
    lastFrameFilename: null,
    lastPrompt: null,
    currentSegmentIndex: 0,
    totalSegments: 0,
    continuityNotes: [],
    sceneDescription: '',
  };
}

export function setContinuityOn(state: ContinuityState, partial: Partial<ContinuityState>): ContinuityState {
  return { ...state, ...partial };
}

export function setLastFrameOn(state: ContinuityState, dataUrl: string, filename: string): ContinuityState {
  return { ...state, lastFrameDataUrl: dataUrl, lastFrameFilename: filename };
}

export function advanceSegmentOn(state: ContinuityState): ContinuityState {
  return { ...state, currentSegmentIndex: state.currentSegmentIndex + 1 };
}

export function addContinuityNoteOn(state: ContinuityState, note: string): ContinuityState {
  return { ...state, continuityNotes: [...state.continuityNotes, note] };
}
