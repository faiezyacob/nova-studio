'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { TimelinePlaybackEngine, setSharedEngine } from '@/engine/playbackEngine';

let engineInstance: TimelinePlaybackEngine | null = null;

export function getEngine(): TimelinePlaybackEngine | null {
  return engineInstance;
}

export function usePlayback() {
  const playing = useEditorStore((s) => s.playing);
  const duration = useEditorStore((s) => s.duration);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);

  const engineRef = useRef<TimelinePlaybackEngine | null>(null);
  const lastUiRef = useRef(0);

  useEffect(() => {
    const engine = new TimelinePlaybackEngine();
    engine.setDuration(duration);
    engineInstance = engine;
    engineRef.current = engine;
    setSharedEngine(engine);

    let fromEngine = false;

    // Engine updates store at ~30fps (throttled)
    const unsubTime = engine.subscribe((time) => {
      if (Math.abs(time - lastUiRef.current) > 0.033) {
        lastUiRef.current = time;
        fromEngine = true;
        setCurrentTime(time);
        fromEngine = false;
      }
    });

    // Store changes forward to engine (seeks via keyboard/timeline)
    const unsubStore = useEditorStore.subscribe((state, prev) => {
      if (fromEngine) return;
      if (Math.abs(state.currentTime - prev.currentTime) > 0.01) {
        engine.seek(state.currentTime);
      }
    });

    return () => {
      unsubTime();
      unsubStore();
      engine.destroy();
      if (engineInstance === engine) {
        engineInstance = null;
        setSharedEngine(null);
      }
      engineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    engineRef.current?.setDuration(duration);
  }, [duration]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (playing) {
      engine.play();
    } else {
      engine.pause();
    }
  }, [playing]);

  return { engine: engineRef.current };
}
