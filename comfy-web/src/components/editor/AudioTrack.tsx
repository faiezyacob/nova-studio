'use client';

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useEditorStore } from '@/stores/editorStore';

export default function AudioTrack() {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioFile = useEditorStore((s) => s.audioFile);
  const audioVolume = useEditorStore((s) => s.audioVolume);
  const setAudioVolume = useEditorStore((s) => s.setAudioVolume);
  const setAudioFile = useEditorStore((s) => s.setAudioFile);
  const currentTime = useEditorStore((s) => s.currentTime);
  const playing = useEditorStore((s) => s.playing);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      return;
    }

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#c9a87a44',
      progressColor: '#c9a87a',
      cursorColor: '#c9a87a',
      cursorWidth: 0,
      barWidth: 2,
      barGap: 1,
      height: 48,
      normalize: true,
      backend: 'WebAudio',
    });

    ws.load(audioUrl);
    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [audioUrl]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !audioUrl) return;

    ws.setVolume(audioVolume);
  }, [audioVolume, audioUrl]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !audioUrl) return;

    if (playing) {
      ws.play();
    } else {
      ws.pause();
    }
  }, [playing, audioUrl]);

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !audioUrl) return;

    if (!playing) {
      ws.seekTo(currentTime / (ws.getDuration() || 1));
    }
  }, [currentTime, playing, audioUrl]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) return;
    setAudioFile(file);
  };

  return (
    <div className="shrink-0 border-t border-[#3a3936] bg-[#262624]">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-[#6b6560]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Audio</span>
        </div>

        <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleUpload} className="hidden" />

        {audioFile ? (
          <div className="flex items-center gap-3 flex-1">
            <div ref={waveformRef} className="flex-1 h-12 rounded bg-[#1f1f1d] overflow-hidden" />
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-[#6b6560]">Vol</span>
              <input
                type="range" min={0} max={1} step={0.05}
                value={audioVolume}
                onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                className="w-16 appearance-none rounded-full bg-[#494741] h-1 cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#c9a87a]
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <span className="text-[10px] text-[#6b6560] w-8">{Math.round(audioVolume * 100)}%</span>
            </div>
            <button
              onClick={() => setAudioFile(null)}
              className="rounded-lg p-1 text-[#8b3a3a] hover:bg-[#3f2a27] hover:text-[#ffbeb4]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => audioInputRef.current?.click()}
            className="rounded-lg border border-[#5a4f40] px-3 py-1.5 text-xs text-[#f2dbc0] transition hover:bg-[#4a433a]"
          >
            Upload Audio
          </button>
        )}
      </div>
    </div>
  );
}
