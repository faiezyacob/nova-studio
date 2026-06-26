'use client';

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useHotkeys } from 'react-hotkeys-hook';
import { useEditorStore } from '@/stores/editorStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { usePlayback } from '@/hooks/usePlayback';
import { formatTime } from '@/utils/timeline';
import type { VideoGalleryItem } from '@/types/editor';
import PreviewCanvas from '@/components/editor/PreviewCanvas';
import Timeline from '@/components/editor/Timeline';
import AudioTrack from '@/components/editor/AudioTrack';
import Toolbar from '@/components/editor/Toolbar';
import Inspector from '@/components/editor/Inspector';
import { getActiveRenderer } from '@/engine';

interface VideoEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  videoGallery: VideoGalleryItem[];
  onSuccess: (newVideo: VideoGalleryItem) => void;
}

export default function VideoEditorDialog({ isOpen, onClose, videoGallery, onSuccess }: VideoEditorDialogProps) {
  const { addClip, setVideoGallery, selectItem } = useEditorStore();
  const items = useEditorStore((s) => s.items);
  const currentTime = useEditorStore((s) => s.currentTime);
  const playing = useEditorStore((s) => s.playing);
  const duration = useEditorStore((s) => s.duration);
  const audioFile = useEditorStore((s) => s.audioFile);
  const audioVolume = useEditorStore((s) => s.audioVolume);
  const removeOriginalAudio = useEditorStore((s) => s.removeOriginalAudio);
  const setRemoveOriginalAudio = useEditorStore((s) => s.setRemoveOriginalAudio);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setAudioFile = useEditorStore((s) => s.setAudioFile);

  useKeyboardShortcuts();
  usePlayback();

  const debugRef = useRef(false);

  useHotkeys('ctrl+d', (e) => {
    e.preventDefault();
    const r = getActiveRenderer();
    if (r) {
      debugRef.current = !debugRef.current;
      r.setDebug(debugRef.current);
    }
  });

  useEffect(() => {
    if (isOpen) {
      setVideoGallery(videoGallery);
    }
  }, [isOpen, videoGallery, setVideoGallery]);

  useEffect(() => {
    return () => {
      setPlaying(false);
      selectItem(null);
      setAudioFile(null);
    };
  }, []);

  const remainingClips = useMemo(
    () => videoGallery.filter((v) => !Object.values(items).some((i) => i.source === v.filename)),
    [videoGallery, items]
  );

  const handleAddClip = useCallback(
    (video: VideoGalleryItem) => {
      if (Object.values(items).some((i) => i.source === video.filename)) {
        toast.info('Clip already in timeline');
        return;
      }
      addClip(video);
    },
    [items, addClip]
  );

  const handleRender = useCallback(async () => {
    if (Object.keys(items).length === 0) {
      toast.error('Add at least one clip to the timeline');
      return;
    }

    const sortedItems = Object.values(items)
      .filter((i) => i.type === 'video')
      .sort((a, b) => a.startTime - b.startTime);

    for (const item of sortedItems) {
      if (item.sourceStart >= item.sourceEnd) {
        toast.error(`Trim start must be before trim end for "${item.title}"`);
        return;
      }
    }

    const toastId = toast.loading('Processing video...');

    try {
      let audioData: string | undefined;
      if (audioFile) {
        const buffer = await audioFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        audioData = btoa(binary);
      }

      const response = await fetch('/api/video/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clips: sortedItems.map((item) => ({
            filename: item.source,
            subfolder: 'video',
            trim_start: item.sourceStart > 0 ? item.sourceStart : undefined,
            trim_end: item.sourceEnd > 0 ? item.sourceEnd : undefined,
          })),
          audio: audioData
            ? { data: audioData, filename: audioFile?.name, volume: audioVolume }
            : undefined,
          remove_original_audio: removeOriginalAudio,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to render video');
      }

      const result = await response.json();
      const prompts = sortedItems.map((item) => item.title).join(' → ');
      const firstItem = sortedItems[0];
      const galleryItem = videoGallery.find((v) => v.filename === firstItem?.source);
      const firstVideo = videoGallery[0];

      const newVideo: VideoGalleryItem = {
        id: result.prompt_id || `edited_${Date.now()}`,
        filename: result.video_path,
        prompt: `Edited: ${prompts}`,
        timestamp: Date.now(),
        subfolder: result.subfolder || 'video',
        resolution: galleryItem?.resolution || firstVideo?.resolution,
        width: galleryItem?.width || firstVideo?.width,
        height: galleryItem?.height || firstVideo?.height,
        thumbnail: galleryItem?.thumbnail || firstVideo?.thumbnail,
        model: galleryItem?.model || firstVideo?.model,
      };

      onSuccess(newVideo);
      toast.success('Video rendered!', { id: toastId });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Render failed', { id: toastId });
    }
  }, [items, audioFile, audioVolume, removeOriginalAudio, videoGallery, onSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={!playing ? onClose : undefined} />

      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col rounded-[20px] border border-border-subtle bg-surface-3 shadow-[var(--shadow-dialog)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle bg-surface-2 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/[0.08] text-gold">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5V4zM12.5 8.5a.5.5 0 00-1 0v3.793l-1.146-1.147a.5.5 0 00-.708.708l2 2a.5.5 0 00.708 0l2-2a.5.5 0 00-.708-.708L12.5 12.293V8.5zM4 5.5A2.5 2.5 0 016.5 3h1A1.5 1.5 0 019 4.5V5h6v-.5A1.5 1.5 0 0116.5 3h1A2.5 2.5 0 0120 5.5v12a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 012 17.5v-12z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Video Editor</h2>
              <p className="text-xs text-text-muted">Timeline-based NLE</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-text-subtle">
              Total: <span className="text-gold font-mono tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Source Clips Panel */}
          <div className="flex w-56 flex-col border-r border-border-subtle bg-surface-2 shrink-0">
            <div className="border-b border-border-subtle px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-text-subtle">Source Clips</p>
              <p className="text-[10px] text-text-subtle mt-0.5">Click to add to timeline</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {remainingClips.length === 0 ? (
                <p className="text-xs text-text-subtle text-center py-8">All clips added</p>
              ) : (
                remainingClips.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => handleAddClip(v)}
                    className="group w-full rounded-xl border border-border-subtle bg-surface-3 overflow-hidden text-left transition duration-150 ease-out hover:border-border-strong hover:bg-hover"
                  >
                    <div className="aspect-video w-full bg-black overflow-hidden">
                      {v.thumbnail ? (
                        <img src={v.thumbnail} alt="" className="h-full w-full object-cover opacity-70 group-hover:opacity-90 transition" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-border-strong">
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="truncate text-[11px] text-text-secondary leading-snug">{v.prompt}</p>
                      {v.resolution && (
                        <span className="mt-1 inline-block rounded bg-surface-1 px-1 py-0.5 text-[9px] text-text-subtle">
                          {v.resolution}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Main Panel */}
          <div className="flex flex-1 flex-col min-w-0">
            {/* Toolbar */}
            <Toolbar />

            {/* Timeline area */}
            <div className="flex-1 flex flex-col min-h-0">
              {Object.keys(items).length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="mx-auto mb-3 h-10 w-10 text-border-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5V4zM12.5 8.5a.5.5 0 00-1 0v3.793l-1.146-1.147a.5.5 0 00-.708.708l2 2a.5.5 0 00.708 0l2-2a.5.5 0 00-.708-.708L12.5 12.293V8.5zM4 5.5A2.5 2.5 0 016.5 3h1A1.5 1.5 0 019 4.5V5h6v-.5A1.5 1.5 0 0116.5 3h1A2.5 2.5 0 0120 5.5v12a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 012 17.5v-12z" />
                    </svg>
                    <p className="text-sm text-text-subtle">Click clips from the left panel to build your timeline</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Preview Canvas + Timeline split */}
                  <div className="flex flex-col flex-1 min-h-0">
                    {/* Canvas preview */}
                    <div className="shrink-0 bg-surface-1 px-4 py-3 border-b border-border-subtle">
                      <div className="flex items-start gap-4">
                        <div className="relative aspect-video w-72 shrink-0 overflow-hidden rounded-lg bg-black">
                          <PreviewCanvas />
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-text-secondary font-medium">
                              {playing ? 'Playing' : 'Paused'}
                            </span>
                          </div>
                          <div className="mt-2 text-[11px] text-text-subtle leading-relaxed">
                            <span className="text-gold font-mono tabular-nums">{formatTime(currentTime)}</span>
                            {' / '}
                            <span className="font-mono tabular-nums">{formatTime(duration)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Timeline */}
                    <Timeline />
                  </div>

                  {/* Inspector */}
                  <Inspector />
                </>
              )}
            </div>

            {/* Audio Track */}
            <AudioTrack />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border-subtle bg-surface-2 px-6 py-4 shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-text-subtle">Space: Play/Pause · S: Split · Del: Delete · ←→: Seek</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-[10px] px-4 py-2 text-sm font-medium text-text-muted transition duration-150 ease-out hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={handleRender}
              disabled={Object.keys(items).length === 0}
              className="group relative flex items-center gap-2 overflow-hidden rounded-[10px] bg-gold px-6 py-2.5 text-sm font-bold text-[#1f1f1d] transition duration-150 ease-out hover:bg-gold-hover hover:translate-y-[-1px] active:scale-[0.97] disabled:opacity-50 shadow-[var(--shadow-btn)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Render Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
