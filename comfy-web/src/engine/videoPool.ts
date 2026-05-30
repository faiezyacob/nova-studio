export class VideoPoolManager {
  private pool = new Map<string, HTMLVideoElement>();
  private container: HTMLDivElement | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
  }

  private urlFor(source: string): string {
    return `/generated/${source}`;
  }

  get(source: string): HTMLVideoElement {
    const url = this.urlFor(source);
    let el = this.pool.get(url);
    if (el) return el;

    el = document.createElement('video');
    el.preload = 'auto';
    el.muted = true;
    el.playsInline = true;
    el.crossOrigin = 'anonymous';
    el.src = url;
    el.load();
    this.container!.appendChild(el);
    this.pool.set(url, el);
    return el;
  }

  preload(sources: string[]): void {
    for (const s of sources) this.get(s);
  }

  seekTo(video: HTMLVideoElement, time: number): void {
    video.currentTime = time;
  }

  play(video: HTMLVideoElement): void {
    video.play().catch(() => {});
  }

  pause(video: HTMLVideoElement): void {
    video.pause();
  }

  dispose(): void {
    for (const el of this.pool.values()) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.pool.clear();
    this.container?.remove();
    this.container = null;
  }
}
