'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/editorStore';

export default function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoPoolRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const rafRef = useRef<number>(0);

  const getVideoElement = (src: string): HTMLVideoElement => {
    const existing = videoPoolRef.current.get(src);
    if (existing) return existing;

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = src;
    video.style.display = 'none';
    document.body.appendChild(video);

    videoPoolRef.current.set(src, video);
    return video;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastResW = 0;
    let lastResH = 0;

    const render = () => {
      const state = useEditorStore.getState();
      const { tracks, items, currentTime, resolution } = state;

      if (resolution.width !== lastResW || resolution.height !== lastResH) {
        canvas.width = resolution.width;
        canvas.height = resolution.height;
        lastResW = resolution.width;
        lastResH = resolution.height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const time = currentTime;

      for (const track of tracks) {
        if (track.muted || track.type !== 'video') continue;

        for (const id of track.itemIds) {
          const item = items[id];
          if (!item) continue;
          if (time < item.startTime || time >= item.startTime + item.duration) continue;

          const localTime = time - item.startTime;
          const ratio = localTime / item.duration;
          const sourceTime = item.sourceStart + ratio * (item.sourceEnd - item.sourceStart);

          const video = getVideoElement(`/generated/${item.source}`);

          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const diff = Math.abs(video.currentTime - sourceTime);
            if (diff > 0.1) {
              video.currentTime = sourceTime;
            }
            const vw = item.videoWidth || video.videoWidth || resolution.width;
            const vh = item.videoHeight || video.videoHeight || resolution.height;
            const scaleX = canvas.width / vw;
            const scaleY = canvas.height / vh;
            const scale = Math.max(scaleX, scaleY);
            const dw = vw * scale;
            const dh = vh * scale;
            const dx = (canvas.width - dw) / 2;
            const dy = (canvas.height - dh) / 2;
            ctx.drawImage(video, dx, dy, dw, dh);
          }
        }
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const [, video] of videoPoolRef.current) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
      }
      videoPoolRef.current.clear();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-lg bg-black"
      style={{
        objectFit: 'contain',
        aspectRatio: `${useEditorStore.getState().resolution.width} / ${useEditorStore.getState().resolution.height}`,
      }}
    />
  );
}
