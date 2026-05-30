'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/editorStore';

export function usePlayback() {
  const playing = useEditorStore((s) => s.playing);
  const duration = useEditorStore((s) => s.duration);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setPlaying = useEditorStore((s) => s.setPlaying);

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      return;
    }

    lastTimeRef.current = performance.now();
    const currentTimeRef = { current: useEditorStore.getState().currentTime };

    const tick = (now: number) => {
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      const newTime = currentTimeRef.current + delta;

      if (newTime >= duration) {
        setCurrentTime(duration);
        setPlaying(false);
        return;
      }

      currentTimeRef.current = newTime;
      setCurrentTime(newTime);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [playing, duration, setCurrentTime, setPlaying]);
}
