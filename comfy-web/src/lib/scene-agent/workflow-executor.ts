import { TaskQueue } from './task-queue';
import { fullCleanup } from './resource-manager';
import type { Lora } from '@/types';

const IMAGE_API_URL = '/api/comfy';
const WAN_API_URL = '/api/comfy/wan';
const LTX_API_URL = '/api/comfy/ltx';
const PROGRESS_SSE_URL = '/api/comfy/progress';
const COMBINE_API_URL = '/api/video/combine';

interface ImageResult {
  images: string[];
  prompt_id: string;
  seed: number;
}

interface VideoResult {
  video_path: string;
  subfolder: string;
  prompt_id: string;
  frame_path?: string;
  frame_subfolder?: string;
}

interface CombinedResult {
  video_path: string;
  subfolder: string;
  prompt_id: string;
}

export async function generateImage(
  prompt: string,
  width: number,
  height: number,
  lora: Lora | null,
  queue: TaskQueue,
  taskId: string,
): Promise<string | null> {
  const generationId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await fullCleanup();

  const eventSource = new EventSource(`${PROGRESS_SSE_URL}?generationId=${generationId}`);
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'progress') {
        queue.updateProgress(taskId, data.value, data.max);
      }
    } catch {}
  };
  eventSource.onerror = () => {};

  try {
    const loras = lora && lora.name ? [lora] : [];
    const res = await fetch(IMAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Generation-Id': generationId,
      },
      body: JSON.stringify({
        prompt: prompt.trim(),
        width,
        height,
        loras,
      }),
    });

    if (!res.ok) throw new Error('Image generation failed');

    const result: ImageResult = await res.json();

    if (result.images && result.images.length > 0) {
      const filename = result.images[0].split('/').pop() || `gen_${Date.now()}.png`;
      await fetch(`/api/comfy/images?filename=${filename}`).catch(() => {});
      return filename;
    }

    return null;
  } finally {
    eventSource.close();
  }
}

export async function generateVideoSegment(
  imageDataUrl: string,
  imageName: string,
  prompt: string,
  width: number | undefined,
  height: number | undefined,
  frames: number,
  workflow: 'wan' | 'ltx',
  queue: TaskQueue,
  taskId: string,
  imgWidth?: number,
  imgHeight?: number,
): Promise<VideoResult | null> {
  const generationId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await fullCleanup();

  const eventSource = new EventSource(`${PROGRESS_SSE_URL}?generationId=${generationId}`);
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'progress') {
        queue.updateProgress(taskId, data.value, data.max);
      }
    } catch {}
  };
  eventSource.onerror = () => {};

  try {
    const imageResponse = await fetch(imageDataUrl);
    const imageBlob = await imageResponse.blob();
    const imageFile = new File([imageBlob], imageName || 'image.png', { type: 'image/png' });

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('prompt', prompt);
    if (width !== undefined) formData.append('width', String(width));
    if (height !== undefined) formData.append('height', String(height));
    if (imgWidth !== undefined) formData.append('imgWidth', String(imgWidth));
    if (imgHeight !== undefined) formData.append('imgHeight', String(imgHeight));
    formData.append('frames', String(frames));

    let result: VideoResult;

    if (workflow === 'ltx') {
      const apiRes = await fetch(LTX_API_URL, {
        method: 'POST',
        headers: { 'X-Generation-Id': generationId },
        body: formData,
      });
      if (!apiRes.ok) {
        const err = await apiRes.json().catch(() => ({}));
        throw new Error(err.error || 'LTX video generation failed');
      }
      result = await apiRes.json();
    } else {
      const apiRes = await fetch(WAN_API_URL, {
        method: 'POST',
        headers: { 'X-Generation-Id': generationId },
        body: formData,
      });
      if (!apiRes.ok) {
        const err = await apiRes.json().catch(() => ({}));
        throw new Error(err.error || 'WAN video generation failed');
      }
      result = await apiRes.json();
    }

    const cacheUrl = `/api/comfy/images?filename=${encodeURIComponent(result.video_path)}&subfolder=${encodeURIComponent(result.subfolder || 'video')}`;
    await fetch(cacheUrl).catch(() => {});

    if (result.frame_path) {
      const frameCacheUrl = `/api/comfy/images?filename=${encodeURIComponent(result.frame_path)}&subfolder=${encodeURIComponent(result.frame_subfolder || '')}`;
      await fetch(frameCacheUrl).catch(() => {});
    }

    return result;
  } finally {
    eventSource.close();
  }
}

export async function extractLastFrameFromVideo(videoPath: string): Promise<{ dataUrl: string; filename: string } | null> {
  try {
    const res = await fetch('/api/video/extract-frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoPath }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Frame extraction failed');
    }

    const { frame_path } = await res.json();
    const frameFilename = videoPath.replace(/\.[^/.]+$/, '_frame.png');

    const imgRes = await fetch(`/generated/${frame_path}`);
    if (!imgRes.ok) throw new Error('Failed to fetch extracted frame');

    const blob = await imgRes.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return { dataUrl, filename: frameFilename };
  } catch (err) {
    console.error('Extract frame error:', err);
    return null;
  }
}

export async function mergeVideoSegments(
  segments: { filename: string; subfolder?: string }[],
): Promise<CombinedResult | null> {
  try {
    const res = await fetch(COMBINE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videos: segments }),
    });

    if (!res.ok) throw new Error('Failed to merge videos');
    return await res.json();
  } catch (err) {
    console.error('Merge error:', err);
    return null;
  }
}
