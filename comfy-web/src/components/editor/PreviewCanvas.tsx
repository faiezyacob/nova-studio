'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { VideoPoolManager, PreviewRenderer, getSharedEngine, setActiveRenderer } from '@/engine';

export default function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pool = new VideoPoolManager();
    const engine = getSharedEngine();
    if (!engine) {
      pool.dispose();
      return;
    }

    const renderer = new PreviewRenderer(canvas, pool, engine);
    setActiveRenderer(renderer);

    const sync = (state: ReturnType<typeof useEditorStore.getState>) => {
      renderer.updateState({
        tracks: state.tracks,
        items: state.items,
        resolution: state.resolution,
      });
    };

    sync(useEditorStore.getState());
    const unsub = useEditorStore.subscribe(sync);

    return () => {
      unsub();
      setActiveRenderer(null);
      renderer.dispose();
      pool.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-lg bg-black"
      style={{ objectFit: 'contain' }}
    />
  );
}
