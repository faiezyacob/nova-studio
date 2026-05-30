import { VideoPoolManager } from './videoPool';
import { TimelinePlaybackEngine } from './playbackEngine';
import { getSourceTime } from '@/utils/timeline';
import type { TimelineItem, TimelineTrack } from '@/types/editor';

export type QualityMode = 'full' | 'half' | 'quarter';

export interface TimelineState {
  tracks: TimelineTrack[];
  items: Record<string, TimelineItem>;
  resolution: { width: number; height: number };
}

interface RenderLayer {
  video: HTMLVideoElement;
  sourceTime: number;
  item: TimelineItem;
  track: TimelineTrack;
}

const VERTEX_SHADER_SRC = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const FRAGMENT_SHADER_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
  gl_FragColor = texture2D(u_tex, v_uv);
}
`;

export class PreviewRenderer {
  private canvas: HTMLCanvasElement;
  private pool: VideoPoolManager;
  private engine: TimelinePlaybackEngine;
  private quality: QualityMode = 'full';
  private debugMode = false;
  private disposed = false;

  // Canvas2D path
  private ctx: CanvasRenderingContext2D | null = null;
  private offscreen: HTMLCanvasElement | null = null;
  private offCtx: CanvasRenderingContext2D | null = null;

  // WebGL path
  private gl: WebGLRenderingContext | null = null;
  private webglReady = false;
  private textures = new Map<string, WebGLTexture>();
  private program: WebGLProgram | null = null;
  private posBuf: WebGLBuffer | null = null;
  private uvBuf: WebGLBuffer | null = null;
  private posLoc = -1;
  private uvLoc = -1;
  private texLoc: WebGLUniformLocation | null = null;

  // State snapshot
  private state: TimelineState = {
    tracks: [],
    items: {},
    resolution: { width: 854, height: 480 },
  };

  // Active playback tracking
  private activeSources = new Set<string>();
  private lastRenderTime = -1;

  // Debug stats
  private stats = { fps: 0, frames: 0, timeStart: 0, renderTime: 0 };

  // Engine subscription
  private unsubTime: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    pool: VideoPoolManager,
    engine: TimelinePlaybackEngine,
  ) {
    this.canvas = canvas;
    this.pool = pool;
    this.engine = engine;

    this._initWebGL();
    if (!this.webglReady) {
      this._initCanvas2D();
    }
    this._initOffscreen();

    this.unsubTime = this.engine.subscribe((time) => {
      this._render(time);
    });
  }

  // ── Public API ──────────────────────────────────────────

  updateState(s: TimelineState): void {
    this.state = s;
  }

  setQuality(q: QualityMode): void {
    this.quality = q;
  }

  setDebug(on: boolean): void {
    this.debugMode = on;
  }

  /** Render a single frame at the given time (used for seeking) */
  renderFrame(time: number): void {
    this._render(time);
  }

  requestFrame(cb: () => void): () => void {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  }

  dispose(): void {
    this.disposed = true;
    this.unsubTime?.();

    if (this.gl) {
      this.gl.useProgram(null);
      for (const tex of this.textures.values()) {
        this.gl.deleteTexture(tex);
      }
      this.textures.clear();
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.posBuf) this.gl.deleteBuffer(this.posBuf);
      if (this.uvBuf) this.gl.deleteBuffer(this.uvBuf);
      this.gl = null;
    }

    this.offscreen?.remove();
    this.offscreen = null;
    this.offCtx = null;
    this.ctx = null;
  }

  // ── Initialization ──────────────────────────────────────

  private _initCanvas2D(): void {
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });
  }

  private _initOffscreen(): void {
    this.offscreen = document.createElement('canvas');
    this.offCtx = this.offscreen.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });
  }

  private _initWebGL(): void {
    try {
      const gl = this.canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      }) as WebGLRenderingContext | null;

      if (!gl) return;

      // Compile shaders
      const vs = this._compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
      if (!vs || !fs) return this._cleanupWebGL(gl);

      const prog = gl.createProgram();
      if (!prog) return this._cleanupWebGL(gl);
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        return this._cleanupWebGL(gl);
      }

      const posLoc = gl.getAttribLocation(prog, 'a_pos');
      const uvLoc = gl.getAttribLocation(prog, 'a_uv');
      const texLoc = gl.getUniformLocation(prog, 'u_tex');

      if (posLoc < 0 || uvLoc < 0 || !texLoc) return this._cleanupWebGL(gl);

      // Create static quad buffers (unit quad)
      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        gl.STATIC_DRAW,
      );

      const uvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
        gl.STATIC_DRAW,
      );

      gl.useProgram(prog);
      gl.uniform1i(texLoc, 0);

      this.gl = gl;
      this.program = prog;
      this.posBuf = posBuf;
      this.uvBuf = uvBuf;
      this.posLoc = posLoc;
      this.uvLoc = uvLoc;
      this.texLoc = texLoc;
      this.webglReady = true;
    } catch {
      this._cleanupWebGL(this.gl);
    }
  }

  private _compileShader(
    gl: WebGLRenderingContext,
    type: number,
    src: string,
  ): WebGLShader | null {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  private _cleanupWebGL(gl: WebGLRenderingContext | null): void {
    if (gl) {
      const ext = gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    }
    this.gl = null;
    this.webglReady = false;
  }

  // ── Layer Resolution ────────────────────────────────────

  private _getActiveLayers(time: number): RenderLayer[] {
    const layers: RenderLayer[] = [];
    for (const track of this.state.tracks) {
      if (track.muted || track.type !== 'video') continue;
      for (const id of track.itemIds) {
        const item = this.state.items[id];
        if (!item) continue;
        if (time < item.startTime || time >= item.startTime + item.duration) continue;
        const sourceTime = getSourceTime(item, time);
        const video = this.pool.get(item.source);
        layers.push({ video, sourceTime, item, track });
      }
    }
    return layers;
  }

  private _qualityScale(): number {
    switch (this.quality) {
      case 'half':
        return 0.5;
      case 'quarter':
        return 0.25;
      default:
        return 1;
    }
  }

  // ── Render ──────────────────────────────────────────────

  private _render(time: number): void {
    if (this.disposed) return;

    const t0 = performance.now();
    const layers = this._getActiveLayers(time);
    const scale = this._qualityScale();
    const res = this.state.resolution;
    const rw = Math.round(res.width * scale);
    const rh = Math.round(res.height * scale);

    if (rw < 1 || rh < 1) return;

    if (this.engine.playing) {
      this._syncPlaybackLayers(layers);
    } else {
      this._syncStaticLayers(layers);
    }

    if (this.webglReady && this.gl) {
      this._renderWebGL(layers, rw, rh, res);
    } else {
      this._renderCanvas2D(layers, rw, rh, res);
    }

    this.lastRenderTime = time;

    if (this.debugMode && layers.length > 0) {
      this._drawDebug(time);
    }

    this.stats.renderTime = performance.now() - t0;
    this.stats.frames++;

    this._updateFps();
  }

  /** During playback: start videos, let them play, only correct drift */
  private _syncPlaybackLayers(layers: RenderLayer[]): void {
    const activeNow = new Set<string>(layers.map((l) => l.item.source));

    for (const layer of layers) {
      if (!this.activeSources.has(layer.item.source)) {
        this.pool.seekTo(layer.video, layer.sourceTime);
        this.pool.play(layer.video);
      } else {
        const drift = Math.abs(layer.video.currentTime - layer.sourceTime);
        if (drift > 0.12) {
          this.pool.pause(layer.video);
          this.pool.seekTo(layer.video, layer.sourceTime);
          this.pool.play(layer.video);
        }
      }
    }

    for (const source of this.activeSources) {
      if (!activeNow.has(source)) {
        this.pool.pause(this.pool.get(source));
      }
    }

    this.activeSources = activeNow;
  }

  /** During pause/scrub: exact seek, keep paused */
  private _syncStaticLayers(layers: RenderLayer[]): void {
    for (const source of this.activeSources) {
      this.pool.pause(this.pool.get(source));
    }
    this.activeSources.clear();

    for (const layer of layers) {
      this.pool.seekTo(layer.video, layer.sourceTime);
    }
  }

  // ── Canvas2D Render Path ────────────────────────────────

  private _renderCanvas2D(
    layers: RenderLayer[],
    rw: number,
    rh: number,
    res: { width: number; height: number },
  ): void {
    const oc = this.offscreen;
    const octx = this.offCtx;
    if (!oc || !octx) return;

    // Resize offscreen if needed
    if (oc.width !== rw || oc.height !== rh) {
      oc.width = rw;
      oc.height = rh;
    }

    // Clear to black
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, rw, rh);

    // Composite each layer
    for (const layer of layers) {
      const { video, item } = layer;
      if (video.readyState < 2 /* HAVE_CURRENT_DATA */) continue;

      const vw = item.videoWidth || video.videoWidth || res.width;
      const vh = item.videoHeight || video.videoHeight || res.height;
      const sx = rw / vw;
      const sy = rh / vh;
      const s = Math.max(sx, sy);
      const dw = vw * s;
      const dh = vh * s;
      const dx = (rw - dw) / 2;
      const dy = (rh - dh) / 2;

      octx.drawImage(video, dx, dy, dw, dh);
    }

    // Blit offscreen → visible canvas
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.canvas.width !== rw || this.canvas.height !== rh) {
      this.canvas.width = rw;
      this.canvas.height = rh;
    }
    ctx.drawImage(oc, 0, 0);
  }

  // ── WebGL Render Path ───────────────────────────────────

  private _getOrCreateTexture(key: string): WebGLTexture | null {
    const gl = this.gl;
    if (!gl) return null;

    let tex = this.textures.get(key);
    if (tex) return tex;

    tex = gl.createTexture();
    if (!tex) return null;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.textures.set(key, tex);
    return tex;
  }

  private _renderWebGL(
    layers: RenderLayer[],
    rw: number,
    rh: number,
    res: { width: number; height: number },
  ): void {
    const gl = this.gl!;

    if (this.canvas.width !== rw || this.canvas.height !== rh) {
      this.canvas.width = rw;
      this.canvas.height = rh;
      gl.viewport(0, 0, rw, rh);
    }

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);

    for (const layer of layers) {
      const { video, item } = layer;
      if (video.readyState < 2 /* HAVE_CURRENT_DATA */) continue;

      const tex = this._getOrCreateTexture(item.source);
      if (!tex) continue;

      gl.bindTexture(gl.TEXTURE_2D, tex);
      try {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          video,
        );
      } catch {
        continue;
      }

      // Calculate quad geometry (centered, fill)
      const vw = item.videoWidth || video.videoWidth || res.width;
      const vh = item.videoHeight || video.videoHeight || res.height;
      const sx = rw / vw;
      const sy = rh / vh;
      const s = Math.max(sx, sy);
      const dw = vw * s;
      const dh = vh * s;
      const dx = (rw - dw) / 2;
      const dy = (rh - dh) / 2;

      // Clip-space coordinates [-1, 1]
      const l = (dx / rw) * 2 - 1;
      const r = ((dx + dw) / rw) * 2 - 1;
      const t = 1 - (dy / rh) * 2;
      const b = 1 - ((dy + dh) / rh) * 2;

      const verts = new Float32Array([l, b, r, b, l, t, r, t]);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.posLoc);
      gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
      gl.enableVertexAttribArray(this.uvLoc);
      gl.vertexAttribPointer(this.uvLoc, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  // ── Debug Overlay ───────────────────────────────────────

  private _updateFps(): void {
    const now = performance.now();
    if (now - this.stats.timeStart >= 1000) {
      this.stats.fps = this.stats.frames;
      this.stats.frames = 0;
      this.stats.timeStart = now;
    }
  }

  private _drawDebug(time: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(6, 6, 175, 82);

    ctx.fillStyle = '#8f8';
    ctx.font = '11px monospace';
    const ls = 14;
    let ly = 20;

    ctx.fillText(`FPS: ${this.stats.fps}`, 12, ly);
    ly += ls;
    ctx.fillText(`Render: ${this.stats.renderTime.toFixed(1)}ms`, 12, ly);
    ly += ls;
    ctx.fillText(`Time: ${time.toFixed(2)}s`, 12, ly);
    ly += ls;
    const backend = this.webglReady ? 'WebGL' : 'Canvas2D';
    ctx.fillText(`Backend: ${backend}`, 12, ly);
    ly += ls;
    ctx.fillText(`Quality: ${this.quality}`, 12, ly);

    ctx.restore();
  }
}

// Module-level singleton for debug/quality control
let _activeRenderer: PreviewRenderer | null = null;

export function setActiveRenderer(r: PreviewRenderer | null): void {
  _activeRenderer = r;
}

export function getActiveRenderer(): PreviewRenderer | null {
  return _activeRenderer;
}
