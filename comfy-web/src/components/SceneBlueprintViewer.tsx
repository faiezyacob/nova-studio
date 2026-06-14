'use client';

import { useEffect, useRef } from 'react';

export interface BBoxElement {
  type: string;
  desc: string;
  text?: string;
  bbox?: [number, number, number, number];
}

interface IdeogramBlueprint {
  compositional_deconstruction?: {
    background?: string;
    elements?: BBoxElement[];
  };
}

const COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
  '#9966FF', '#FF9F40', '#E76F51', '#2A9D8F',
];

export function parseBlueprint(prompt: string): IdeogramBlueprint | null {
  try {
    const parsed = JSON.parse(prompt);
    if (parsed?.compositional_deconstruction?.elements?.some((e: BBoxElement) => e.bbox)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export default function SceneBlueprintViewer({
  prompt,
  onClose,
}: {
  prompt: string;
  onClose: () => void;
}) {
  const data = parseBlueprint(prompt);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!data) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const size = 600;

      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#1f1f1d';
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = '#3a3936';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 10; i++) {
        const p = (i / 10) * size;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.stroke();
      }

      const elements = data.compositional_deconstruction!.elements!;
      elements.forEach((el, i) => {
        if (!el.bbox) return;
        const [yMin, xMin, yMax, xMax] = el.bbox;
        const s = size / 1000;
        const x = xMin * s;
        const y = yMin * s;
        const bw = (xMax - xMin) * s;
        const bh = (yMax - yMin) * s;
        const color = COLORS[i % COLORS.length];

        ctx.fillStyle = color + '30';
        ctx.fillRect(x, y, bw, bh);

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, bw, bh);

        const label = `${i + 1}. ${el.desc.split(/[,.]/)[0].trim()}`;
        ctx.font = `bold 12px monospace`;
        const tw = ctx.measureText(label).width;

        const lx = x;
        const ly = y > 24 ? y - 24 : y + bh + 2;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(lx, ly, tw + 8, 20, 3);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.fillText(label, lx + 4, ly + 14);
      });
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [data]);

  if (!data) return null;

  const elements = data.compositional_deconstruction!.elements!.filter((e) => e.bbox);

  return (
    <div className="mt-4 rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] max-w-5xl m-auto p-4 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-[#4BC0C0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-widest text-[#4BC0C0]">Scene Blueprint — Layout Preview</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-[#494741] px-2 py-1 text-xs text-[#9f988c] transition hover:border-[#5a4f40] hover:text-[#edeae2]"
        >
          Close
        </button>
      </div>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <div className="flex flex-col items-center">
          <canvas
            ref={canvasRef}
            className="rounded-lg border border-[#3a3936]"
          />
          <p className="mt-1.5 text-[9px] text-[#6b6560] font-mono">0–1000 coordinate grid</p>
        </div>

        <div className="w-full shrink-0 space-y-2 lg:w-80">
          <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Elements</p>
          <div className="max-h-[400px] space-y-1.5 overflow-y-auto">
            {elements.map((el, i) => {
              const color = COLORS[i % COLORS.length];
              return (
                <div key={i} className="rounded-lg border border-[#3f3e3a] bg-[#262624] p-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white" style={{ backgroundColor: color }}>
                      {i + 1}
                    </span>
                    <span className="text-[11px] font-medium text-[#edeae2] capitalize">{el.type}</span>
                    <span className="ml-auto text-[10px] text-[#6b6560] font-mono">
                      [{el.bbox!.join(', ')}]
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#9f988c] line-clamp-2">{el.desc}</p>
                </div>
              );
            })}
          </div>

          {data.compositional_deconstruction?.background && (
            <div className="rounded-lg border border-[#3f3e3a] bg-[#262624] p-2">
              <p className="text-[10px] uppercase tracking-widest text-[#6b6560] mb-1">Background</p>
              <p className="text-[10px] leading-relaxed text-[#9f988c]">{data.compositional_deconstruction.background}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
