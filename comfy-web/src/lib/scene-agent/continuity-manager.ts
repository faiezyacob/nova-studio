export interface ContinuityState {
  lastFrameDataUrl: string | null;
  lastFrameFilename: string | null;
  lastPrompt: string | null;
  currentSegmentIndex: number;
  totalSegments: number;
  continuityNotes: string[];
  sceneDescription: string;
}

let _state: ContinuityState = {
  lastFrameDataUrl: null,
  lastFrameFilename: null,
  lastPrompt: null,
  currentSegmentIndex: 0,
  totalSegments: 0,
  continuityNotes: [],
  sceneDescription: '',
};

export function resetContinuity(): void {
  _state = {
    lastFrameDataUrl: null,
    lastFrameFilename: null,
    lastPrompt: null,
    currentSegmentIndex: 0,
    totalSegments: 0,
    continuityNotes: [],
    sceneDescription: '',
  };
}

export function getContinuity(): ContinuityState {
  return _state;
}

export function setContinuity(partial: Partial<ContinuityState>): void {
  _state = { ..._state, ...partial };
}

export function setLastFrame(dataUrl: string, filename: string): void {
  _state.lastFrameDataUrl = dataUrl;
  _state.lastFrameFilename = filename;
}

export function advanceSegment(): void {
  _state.currentSegmentIndex++;
}

export function addContinuityNote(note: string): void {
  _state.continuityNotes.push(note);
}
