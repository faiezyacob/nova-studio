'use client';

import { useEffect, useRef, useCallback } from 'react';

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
    text?: BBoxElement;
  };
}

const COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
  '#9966FF', '#FF9F40', '#E76F51', '#2A9D8F',
];

const HANDLE_RADIUS = 7;
const MIN_SIZE = 10;
const SIZE = 600;
const SCALE = SIZE / 1000;

export function parseBlueprint(prompt: string): IdeogramBlueprint | null {
  try {
    const parsed = JSON.parse(prompt);
    const cd = parsed?.compositional_deconstruction;
    if (!cd) return null;
    const hasBbox = cd.elements?.some((e: BBoxElement) => e.bbox) || !!cd.text?.bbox;
    if (hasBbox) return parsed;
    return null;
  } catch {
    return null;
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function drawScene(canvas: HTMLCanvasElement, elements: BBoxElement[], dragIdx: number = -1) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = `${SIZE}px`;
  canvas.style.height = `${SIZE}px`;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#1f1f1d';
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.strokeStyle = '#3a3936';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 10; i++) {
    const p = (i / 10) * SIZE;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(SIZE, p);
    ctx.stroke();
  }

  elements.forEach((el, i) => {
    if (!el.bbox) return;
    const [yMin, xMin, yMax, xMax] = el.bbox;
    const x = xMin * SCALE;
    const y = yMin * SCALE;
    const bw = (xMax - xMin) * SCALE;
    const bh = (yMax - yMin) * SCALE;
    const color = COLORS[i % COLORS.length];

    ctx.fillStyle = color + '30';
    ctx.fillRect(x, y, bw, bh);

    ctx.strokeStyle = i === dragIdx ? '#ffffff' : color;
    ctx.lineWidth = i === dragIdx ? 3 : 2;
    ctx.strokeRect(x, y, bw, bh);

    if (i === dragIdx) {
      const handles = [
        [x, y], [x + bw / 2, y], [x + bw, y],
        [x, y + bh / 2], [x + bw, y + bh / 2],
        [x, y + bh], [x + bw / 2, y + bh], [x + bw, y + bh],
      ];
      for (const [hx, hy] of handles) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

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
}

type DragMode = 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br'
  | 'resize-t' | 'resize-b' | 'resize-l' | 'resize-r';

interface DragState {
  index: number;
  mode: DragMode;
  startCx: number;
  startCy: number;
  origBBox: [number, number, number, number];
}

function getHandleAt(px: number, py: number, bbox: [number, number, number, number], scale: number): DragMode | null {
  const [yMin, xMin, yMax, xMax] = bbox;
  const x1 = xMin * scale, y1 = yMin * scale;
  const x2 = xMax * scale, y2 = yMax * scale;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const r = HANDLE_RADIUS + 2;

  const handles: [number, number, DragMode][] = [
    [x1, y1, 'resize-tl'], [x2, y1, 'resize-tr'], [x1, y2, 'resize-bl'], [x2, y2, 'resize-br'],
    [cx, y1, 'resize-t'], [cx, y2, 'resize-b'],
    [x1, cy, 'resize-l'], [x2, cy, 'resize-r'],
  ];

  for (const [hx, hy, mode] of handles) {
    if (Math.abs(px - hx) <= r && Math.abs(py - hy) <= r) return mode;
  }
  return null;
}

function hitTest(px: number, py: number, elements: BBoxElement[]): { index: number; mode: DragMode } | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el.bbox) continue;
    const [yMin, xMin, yMax, xMax] = el.bbox;
    const x1 = xMin * SCALE, y1 = yMin * SCALE;
    const x2 = xMax * SCALE, y2 = yMax * SCALE;

    const handle = getHandleAt(px, py, el.bbox, SCALE);
    if (handle) return { index: i, mode: handle };

    if (px >= x1 && px <= x2 && py >= y1 && py <= y2) {
      return { index: i, mode: 'move' };
    }
  }
  return null;
}

function applyDrag(bbox: [number, number, number, number], mode: DragMode, dx: number, dy: number): [number, number, number, number] {
  let [yMin, xMin, yMax, xMax] = bbox;
  const ddx = dx / SCALE;
  const ddy = dy / SCALE;

  switch (mode) {
    case 'move':
      xMin += ddx; xMax += ddx;
      yMin += ddy; yMax += ddy;
      break;
    case 'resize-tl': xMin += ddx; yMin += ddy; break;
    case 'resize-tr': xMax += ddx; yMin += ddy; break;
    case 'resize-bl': xMin += ddx; yMax += ddy; break;
    case 'resize-br': xMax += ddx; yMax += ddy; break;
    case 'resize-t': yMin += ddy; break;
    case 'resize-b': yMax += ddy; break;
    case 'resize-l': xMin += ddx; break;
    case 'resize-r': xMax += ddx; break;
  }

  if (xMax - xMin < MIN_SIZE) {
    if (mode.includes('l')) xMin = xMax - MIN_SIZE;
    else xMax = xMin + MIN_SIZE;
  }
  if (yMax - yMin < MIN_SIZE) {
    if (mode.includes('t')) yMin = yMax - MIN_SIZE;
    else yMax = yMin + MIN_SIZE;
  }

  return [
    Math.round(clamp(yMin, 0, 1000)),
    Math.round(clamp(xMin, 0, 1000)),
    Math.round(clamp(yMax, 0, 1000)),
    Math.round(clamp(xMax, 0, 1000)),
  ] as [number, number, number, number];
}

export default function SceneBlueprintViewer({
  prompt,
  onClose,
  onChange,
}: {
  prompt: string;
  onClose: () => void;
  onChange?: (prompt: string) => void;
}) {
  const data = parseBlueprint(prompt);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragIdxRef = useRef<number>(-1);
  const drawReqRef = useRef<number>(0);
  const mutateRef = useRef<BBoxElement[]>([]);

  const getElements = useCallback((): BBoxElement[] => {
    return (data?.compositional_deconstruction?.elements ?? []).map((el, i) => {
      if (el.bbox) return el;
      const col = i % 2;
      const row = Math.floor(i / 2);
      return { ...el, bbox: [50 + row * 180, 50 + col * 350, 200 + row * 180, 200 + col * 350] as [number, number, number, number] };
    });
  }, [data]);

  const getTextElement = useCallback((): BBoxElement | null => {
    const t = data?.compositional_deconstruction?.text;
    if (!t?.bbox) return null;
    return t as BBoxElement;
  }, [data]);

  const getCanvasElements = useCallback((): BBoxElement[] => {
    const els = getElements();
    const text = getTextElement();
    if (text) els.push(text);
    return els;
  }, [getElements, getTextElement]);

  const hasText = !!getTextElement();

  const emitChange = useCallback((modifiedBboxElements: BBoxElement[]) => {
    if (!onChange || !data?.compositional_deconstruction) return;

    const hasTextEl = hasText;
    const elementCount = hasTextEl ? modifiedBboxElements.length - 1 : modifiedBboxElements.length;
    const originalElements = data.compositional_deconstruction.elements ?? [];
    const modifiedText = hasTextEl ? modifiedBboxElements[modifiedBboxElements.length - 1] : null;

    const allElements = originalElements.map((el, idx) => {
      if (idx < elementCount) {
        const m = modifiedBboxElements[idx];
        return { ...el, bbox: m.bbox, type: m.type, desc: m.desc };
      }
      return el;
    });

    const result: IdeogramBlueprint = {
      ...data,
      compositional_deconstruction: {
        ...data.compositional_deconstruction,
        elements: allElements,
        ...(modifiedText ? {
          text: {
            type: modifiedText.type,
            text: modifiedText.text ?? '',
            desc: modifiedText.desc,
            bbox: modifiedText.bbox!,
          },
        } : {}),
      },
    };

    onChange(JSON.stringify(result, null, 2));
  }, [data, hasText, onChange]);

  useEffect(() => {
    mutateRef.current = JSON.parse(JSON.stringify(getCanvasElements()));
  }, [getCanvasElements]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    drawScene(canvas, getCanvasElements(), dragIdxRef.current);
  }, [data, getCanvasElements]);

  const scheduleDraw = useCallback(() => {
    if (drawReqRef.current) cancelAnimationFrame(drawReqRef.current);
    drawReqRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawScene(canvas, mutateRef.current, dragIdxRef.current);
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!data) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const hit = hitTest(px, py, mutateRef.current);
    if (!hit) return;

    const el = mutateRef.current[hit.index];
    if (!el.bbox) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      index: hit.index,
      mode: hit.mode,
      startCx: px,
      startCy: py,
      origBBox: [...el.bbox],
    };
    dragIdxRef.current = hit.index;
  }, [data]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const dx = px - drag.startCx;
    const dy = py - drag.startCy;

    const newBBox = applyDrag(drag.origBBox, drag.mode, dx, dy);

    const el = mutateRef.current[drag.index];
    if (el) {
      el.bbox = newBBox;
      scheduleDraw();
    }
  }, [scheduleDraw]);

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;

    dragRef.current = null;
    dragIdxRef.current = -1;

    const canvas = canvasRef.current;
    if (canvas) {
      drawScene(canvas, mutateRef.current, -1);
    }

    emitChange(mutateRef.current);
  }, [emitChange]);

  const addElement = useCallback(() => {
    if (!onChange || !data?.compositional_deconstruction) return;
    const newEl: BBoxElement = {
      type: 'object',
      desc: 'new element',
      bbox: [200, 200, 400, 400],
    };
    const result: IdeogramBlueprint = {
      ...data,
      compositional_deconstruction: {
        ...data.compositional_deconstruction,
        elements: [...(data.compositional_deconstruction.elements ?? []), newEl],
      },
    };
    onChange(JSON.stringify(result, null, 2));
  }, [data, onChange]);

  const updateSidebarElement = useCallback((index: number, field: 'type' | 'desc', value: string) => {
    if (!onChange || !data?.compositional_deconstruction) return;
    const elements = [...(data.compositional_deconstruction.elements ?? [])];
    elements[index] = { ...elements[index], [field]: value };
    const result: IdeogramBlueprint = {
      ...data,
      compositional_deconstruction: {
        ...data.compositional_deconstruction,
        elements,
      },
    };
    onChange(JSON.stringify(result, null, 2));
  }, [data, onChange]);

  const updateSidebarElementBbox = useCallback((index: number, value: [number, number, number, number]) => {
    if (!onChange || !data?.compositional_deconstruction) return;
    const elements = [...(data.compositional_deconstruction.elements ?? [])];
    elements[index] = { ...elements[index], bbox: value };
    const result: IdeogramBlueprint = {
      ...data,
      compositional_deconstruction: {
        ...data.compositional_deconstruction,
        elements,
      },
    };
    onChange(JSON.stringify(result, null, 2));
  }, [data, onChange]);

  const updateTextContent = useCallback((field: 'type' | 'desc' | 'text', value: string) => {
    if (!onChange || !data?.compositional_deconstruction?.text) return;
    const result: IdeogramBlueprint = {
      ...data,
      compositional_deconstruction: {
        ...data.compositional_deconstruction,
        text: {
          ...data.compositional_deconstruction.text,
          [field]: value,
        },
      },
    };
    onChange(JSON.stringify(result, null, 2));
  }, [data, onChange]);

  const updateTextBbox = useCallback((value: [number, number, number, number]) => {
    if (!onChange || !data?.compositional_deconstruction?.text) return;
    const result: IdeogramBlueprint = {
      ...data,
      compositional_deconstruction: {
        ...data.compositional_deconstruction,
        text: {
          ...data.compositional_deconstruction.text,
          bbox: value,
        },
      },
    };
    onChange(JSON.stringify(result, null, 2));
  }, [data, onChange]);

  const updateBackground = useCallback((value: string) => {
    if (!onChange || !data?.compositional_deconstruction) return;
    const result: IdeogramBlueprint = {
      ...data,
      compositional_deconstruction: {
        ...data.compositional_deconstruction,
        background: value,
      },
    };
    onChange(JSON.stringify(result, null, 2));
  }, [data, onChange]);

  if (!data) return null;

  const allElements = data.compositional_deconstruction?.elements ?? [];
  const background = data.compositional_deconstruction?.background;
  const textEl = data.compositional_deconstruction?.text;

  return (
    <div className="mt-4 rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] max-w-5xl m-auto p-4 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-[#4BC0C0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-widest text-[#4BC0C0]">Scene Blueprint — Layout Editor</span>
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
            className="rounded-lg border border-[#3a3936] touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <p className="mt-1.5 text-[9px] text-[#6b6560] font-mono">0–1000 coordinate grid — drag to move, drag handles to resize</p>
        </div>

        <div className="w-full shrink-0 space-y-2 lg:w-80">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Elements</p>
            <button
              onClick={addElement}
              className="rounded border border-[#4BC0C0] px-1.5 py-0.5 text-[9px] text-[#4BC0C0] transition hover:bg-[#4BC0C0] hover:text-[#1f1f1d]"
            >
              + Add
            </button>
          </div>
          <div className="max-h-[400px] space-y-1.5 overflow-y-auto">
            {allElements.map((el, i) => {
              const color = COLORS[i % COLORS.length];
              const hasBbox = !!el.bbox;
              return (
                <div key={i} className="rounded-lg border border-[#3f3e3a] bg-[#262624] p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white" style={{ backgroundColor: color }}>
                      {i + 1}
                    </span>
                    <input
                      value={el.type}
                      onChange={(e) => updateSidebarElement(i, 'type', e.target.value)}
                      className="flex-1 bg-transparent text-[11px] font-medium text-[#edeae2] capitalize outline-none border-b border-transparent focus:border-[#4BC0C0] transition-colors"
                    />
                  </div>
                  <input
                    value={el.desc}
                    onChange={(e) => updateSidebarElement(i, 'desc', e.target.value)}
                    className="w-full bg-transparent text-[10px] leading-relaxed text-[#9f988c] outline-none border-b border-transparent focus:border-[#4BC0C0] transition-colors"
                  />
                  {hasBbox ? (
                    <div className="flex items-center gap-1 text-[10px] text-[#6b6560] font-mono">
                      <span className="shrink-0">bbox:</span>
                      {(['yMin', 'xMin', 'yMax', 'xMax'] as const).map((label, j) => (
                        <input
                          key={label}
                          type="number"
                          value={el.bbox![j]}
                          min={0}
                          max={1000}
                          onChange={(e) => {
                            const next = [...el.bbox!] as [number, number, number, number];
                            next[j] = Math.round(Number(e.target.value));
                            updateSidebarElementBbox(i, next);
                          }}
                          className="w-12 bg-[#1f1f1d] rounded px-1 py-0.5 text-center text-[9px] text-[#9f988c] outline-none border border-[#3f3e3a] focus:border-[#4BC0C0] transition-colors"
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[9px] text-[#6b6560] italic">No bbox set</p>
                  )}
                </div>
              );
            })}
          </div>

          {textEl && (
            <div className="rounded-lg border border-[#3f3e3a] bg-[#262624] p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white" style={{ backgroundColor: COLORS[allElements.length % COLORS.length] }}>
                  T
                </span>
                <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Text Overlay</p>
              </div>
              <input
                value={textEl.type}
                onChange={(e) => updateTextContent('type', e.target.value)}
                className="w-full bg-transparent text-[11px] font-medium text-[#edeae2] capitalize outline-none border-b border-transparent focus:border-[#4BC0C0] transition-colors"
              />
              <input
                value={textEl.text ?? ''}
                onChange={(e) => updateTextContent('text', e.target.value)}
                placeholder="Text content"
                className="w-full bg-transparent text-[10px] leading-relaxed text-[#9f988c] outline-none border-b border-transparent focus:border-[#4BC0C0] transition-colors"
              />
              <input
                value={textEl.desc}
                onChange={(e) => updateTextContent('desc', e.target.value)}
                className="w-full bg-transparent text-[10px] leading-relaxed text-[#9f988c] outline-none border-b border-transparent focus:border-[#4BC0C0] transition-colors"
              />
              {textEl.bbox && (
                <div className="flex items-center gap-1 text-[10px] text-[#6b6560] font-mono">
                  <span className="shrink-0">bbox:</span>
                  {(['yMin', 'xMin', 'yMax', 'xMax'] as const).map((label, j) => (
                    <input
                      key={label}
                      type="number"
                      value={textEl.bbox![j]}
                      min={0}
                      max={1000}
                      onChange={(e) => {
                        const next = [...textEl.bbox!] as [number, number, number, number];
                        next[j] = Math.round(Number(e.target.value));
                        updateTextBbox(next);
                      }}
                      className="w-12 bg-[#1f1f1d] rounded px-1 py-0.5 text-center text-[9px] text-[#9f988c] outline-none border border-[#3f3e3a] focus:border-[#4BC0C0] transition-colors"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {background !== undefined && (
            <div className="rounded-lg border border-[#3f3e3a] bg-[#262624] p-2">
              <p className="text-[10px] uppercase tracking-widest text-[#6b6560] mb-1">Background</p>
              <input
                value={background}
                onChange={(e) => updateBackground(e.target.value)}
                className="w-full bg-transparent text-[10px] leading-relaxed text-[#9f988c] outline-none border-b border-transparent focus:border-[#4BC0C0] transition-colors"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
