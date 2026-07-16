type ProgressHandler = (data: ProgressData) => void;
type CompleteHandler = (data: CompleteData) => void;
type ErrorHandler = (data: ErrorData) => void;

export interface ProgressData {
  value: number;
  max: number;
  text?: string;
}

export interface CompleteData {
  video_path: string;
  subfolder: string;
  prompt_id: string;
  frame_path?: string;
  frame_subfolder?: string;
}

export interface ErrorData {
  error: string;
}

interface GenerationCallbacks {
  progress: Set<ProgressHandler>;
  complete: Set<CompleteHandler>;
  error: Set<ErrorHandler>;
}

const generations = new Map<string, GenerationCallbacks>();

function getOrCreate(id: string): GenerationCallbacks {
  let entry = generations.get(id);
  if (!entry) {
    entry = { progress: new Set(), complete: new Set(), error: new Set() };
    generations.set(id, entry);
  }
  return entry;
}

export function onProgress(id: string, handler: ProgressHandler): () => void {
  const entry = getOrCreate(id);
  entry.progress.add(handler);
  return () => entry.progress.delete(handler);
}

export function onComplete(id: string, handler: CompleteHandler): () => void {
  const entry = getOrCreate(id);
  entry.complete.add(handler);
  return () => entry.complete.delete(handler);
}

export function onError(id: string, handler: ErrorHandler): () => void {
  const entry = getOrCreate(id);
  entry.error.add(handler);
  return () => entry.error.delete(handler);
}

export function emitProgress(id: string, data: ProgressData): void {
  const entry = generations.get(id);
  if (entry) {
    for (const handler of entry.progress) {
      try { handler(data); } catch { /* ignore */ }
    }
  }
}

export function emitComplete(id: string, data: CompleteData): void {
  const entry = generations.get(id);
  if (entry) {
    for (const handler of entry.complete) {
      try { handler(data); } catch { /* ignore */ }
    }
  }
  removeAllListeners(id);
}

export function emitError(id: string, data: ErrorData): void {
  const entry = generations.get(id);
  if (entry) {
    for (const handler of entry.error) {
      try { handler(data); } catch { /* ignore */ }
    }
  }
  removeAllListeners(id);
}

export function removeAllListeners(id: string): void {
  generations.delete(id);
}
