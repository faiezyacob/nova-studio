export type TimeUpdateCallback = (time: number) => void;

export class TimelinePlaybackEngine {
  private _time = 0;
  private _duration = 0;
  private _playing = false;
  private _speed = 1;
  private _lastTs = 0;
  private _rafId = 0;
  private _callbacks = new Set<TimeUpdateCallback>();

  get time(): number {
    return this._time;
  }

  get playing(): boolean {
    return this._playing;
  }

  get duration(): number {
    return this._duration;
  }

  setDuration(d: number): void {
    this._duration = d;
  }

  play(): void {
    if (this._playing) return;
    if (this._time >= this._duration && this._duration > 0) {
      this._time = 0;
    }
    this._playing = true;
    this._lastTs = performance.now();
    this._schedule();
    this._notify();
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    cancelAnimationFrame(this._rafId);
  }

  toggle(): void {
    this._playing ? this.pause() : this.play();
  }

  seek(t: number): void {
    const clamped = Math.max(0, Math.min(t, this._duration || 0));
    if (Math.abs(this._time - clamped) < 0.01) return;
    this._time = clamped;
    this._notify();
  }

  setSpeed(s: number): void {
    this._speed = s;
  }

  subscribe(cb: TimeUpdateCallback): () => void {
    this._callbacks.add(cb);
    return () => this._callbacks.delete(cb);
  }

  private _tick = (now: number): void => {
    if (!this._playing) return;
    const dt = (now - this._lastTs) / 1000;
    this._lastTs = now;
    this._time += dt * this._speed;
    if (this._time >= this._duration) {
      this._time = this._duration;
      this._playing = false;
    }
    this._notify();
    if (this._playing) this._schedule();
  };

  private _schedule(): void {
    this._rafId = requestAnimationFrame(this._tick);
  }

  private _notify(): void {
    for (const cb of this._callbacks) cb(this._time);
  }

  destroy(): void {
    this.pause();
    this._callbacks.clear();
  }
}

// Module-level singleton for cross-component access
let _sharedEngine: TimelinePlaybackEngine | null = null;

export function setSharedEngine(e: TimelinePlaybackEngine | null): void {
  _sharedEngine = e;
}

export function getSharedEngine(): TimelinePlaybackEngine | null {
  return _sharedEngine;
}
