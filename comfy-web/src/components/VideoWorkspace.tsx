'use client';

import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';

interface VideoGalleryItem {
  id: string;
  filename: string;
  prompt: string;
  timestamp: number;
}

interface VideoWorkspaceProps {
  videoGallery: VideoGalleryItem[];
  setVideoGallery: React.Dispatch<React.SetStateAction<VideoGalleryItem[]>>;
  videoResult: VideoGalleryItem | null;
  setVideoResult: React.Dispatch<React.SetStateAction<VideoGalleryItem | null>>;
  workspaceState: {
    prompt: string;
    uploadedImage: string | null;
    uploadedImageName: string;
    videoSize: '480' | '720';
    matchImageSize: boolean;
    durationFrames: number;
  };
  setWorkspaceState: React.Dispatch<React.SetStateAction<{
    prompt: string;
    uploadedImage: string | null;
    uploadedImageName: string;
    videoSize: '480' | '720';
    matchImageSize: boolean;
    durationFrames: number;
  }>>;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableModels: string[];
  openConfirm: (title: string, message: string, onConfirm: () => void) => void;
  closeConfirm: () => void;
}

const STORAGE_KEY = 'video_workspace_state';
const VIDEO_GALLERY_KEY = 'video_gallery';

interface VideoWorkspaceState {
  prompt: string;
  uploadedImage: string | null;
  uploadedImageName: string;
  videoSize: '480' | '720';
  matchImageSize: boolean;
  durationFrames: number;
}

export default function VideoWorkspace({
  videoGallery,
  setVideoGallery,
  videoResult,
  setVideoResult,
  workspaceState,
  setWorkspaceState,
  selectedModel,
  setSelectedModel,
  availableModels,
  openConfirm,
  closeConfirm,
}: VideoWorkspaceProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const { prompt, uploadedImage, uploadedImageName, videoSize, matchImageSize, durationFrames } = workspaceState;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateWorkspaceState = (updates: Partial<typeof workspaceState>) => {
    setWorkspaceState(prev => ({ ...prev, ...updates }));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateWorkspaceState({ uploadedImage: url, uploadedImageName: file.name });
    setVideoResult(null);
  };

  const SIZE_PRESETS = {
    '480': { width: 480, height: 832 },
    '720': { width: 720, height: 1280 },
  };

  useEffect(() => {
    if (availableModels.length > 0 && !selectedModel) {
      setSelectedModel(availableModels[0]);
    }
  }, [availableModels, selectedModel]);

  useEffect(() => {
    if (uploadedImage) {
      setIsCalculating(true);
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        setIsCalculating(false);
      };
      img.onerror = () => {
        setImageDimensions(null);
        setIsCalculating(false);
      };
      img.src = uploadedImage;
    } else {
      setImageDimensions(null);
    }
  }, [uploadedImage]);

  const calculateTargetDimensions = () => {
    if (!uploadedImage || !imageDimensions || !matchImageSize) {
      return SIZE_PRESETS[videoSize];
    }

    const { width, height } = imageDimensions;
    const aspectRatio = width / height;
    const targetShortSide = parseInt(videoSize);

    let newWidth, newHeight;
    if (width > height) {
      // Landscape: height will be targetShortSide
      newHeight = targetShortSide;
      newWidth = Math.round(targetShortSide * aspectRatio);
    } else {
      // Portrait or Square: width will be targetShortSide
      newWidth = targetShortSide;
      newHeight = Math.round(targetShortSide / aspectRatio);
    }

    // Ensure divisible by 8 (required by ComfyUI nodes)
    newWidth = Math.floor(newWidth / 8) * 8;
    newHeight = Math.floor(newHeight / 8) * 8;

    // Cap long side to prevent memory issues (e.g., 1280 for 720p level, 832 for 480p level)
    const maxLongSide = videoSize === '720' ? 1280 : 832;
    if (newWidth > maxLongSide) {
      newHeight = Math.floor((newHeight * maxLongSide / newWidth) / 8) * 8;
      newWidth = maxLongSide;
    }
    if (newHeight > maxLongSide) {
      newWidth = Math.floor((newWidth * maxLongSide / newHeight) / 8) * 8;
      newHeight = maxLongSide;
    }

    return { width: newWidth, height: newHeight };
  };

  const targetDimensions = calculateTargetDimensions();


  const createImageThumbnail = (imageUrl: string, maxWidth: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Use JPEG with 80% quality → much smaller than PNG
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = imageUrl;
    });
  };

  const enhancePrompt = async () => {
    if (!prompt.trim() || !selectedModel || !uploadedImage) {
      toast.error('Please provide a prompt, select a model, and upload an image');
      return;
    }

    setIsEnhancing(true);
    setError('');

    try {
      const thumbnailBase64 = await createImageThumbnail(uploadedImage, 400);

      const response = await fetch('/api/lmstudio/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: 'system',
              content: `You are a world-class prompt engineer for image-to-video animation using Wan2.2.
You will be given an image and a raw user prompt.

Your job: Write a single, cinematic, highly descriptive motion prompt that perfectly matches what is actually visible in the image.

Rules:
- Analyze the image content, subject, style, lighting, and composition
- Describe natural, believable motion that fits the scene
- Include precise camera movements (slow zoom in, gentle pan left, orbit around subject, etc.)
- Use timing and pacing (e.g. "starts slow then accelerates", "over 4 seconds")
- Keep it one flowing sentence, 60–90 words max
- Return ONLY the final prompt inside <prompt></prompt>`
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: `User's raw prompt: "${prompt}"\n\nImprove and expand this into a perfect motion prompt based on the image.` },
                {
                  type: 'image_url',
                  image_url: {
                    url: thumbnailBase64,
                  }
                }
              ]
            }
          ],
          temperature: 0.6,
        }),
      });

      let errorMessage = '';
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        errorMessage = errorData.error || `Server error: ${response.status}`;
        if (errorMessage.includes('Channel Error') || errorMessage.includes('channel')) {
          errorMessage = 'Model does not support vision. Please select a vision-capable model (e.g., Llama 3.2 Vision, Qwen2-VL)';
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content || '';

      if (!rawText) {
        throw new Error('Empty response from model');
      }

      const match = rawText.match(/<prompt>([\s\S]*?)<\/prompt>/i);
      const enhanced = match?.[1]?.trim() || rawText.trim();

      if (enhanced && enhanced !== prompt) {
        updateWorkspaceState({ prompt: enhanced });
        toast.success('Prompt enhanced with image context ✨');
      } else {
        toast.info('Already optimal');
      }

    } catch (err) {
      console.error('Enhancement error:', err);
      const message = err instanceof Error ? err.message : 'Enhancement failed';
      setError(message);
      toast.error(message);
    } finally {
      setIsEnhancing(false);
    }
  };

  const generateVideo = async () => {
    if (!uploadedImage || !prompt.trim()) return;

    setIsGenerating(true);
    setError('');
    setVideoResult(null);

    try {
      try {
        await fetch('/api/lmstudio/unload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel }),
        });
      } catch (err) {
        console.warn('Unload request failed:', err);
      }

      const formData = new FormData();

      const imageResponse = await fetch(uploadedImage);
      const imageBlob = await imageResponse.blob();
      const imageFile = new File([imageBlob], uploadedImageName || 'image.png', { type: 'image/png' });
      formData.append('image', imageFile);
      console.log('[VIDEO] Sending prompt:', prompt);
      formData.append('prompt', prompt);
      const { width: finalWidth, height: finalHeight } = targetDimensions;
      formData.append('width', String(finalWidth));
      formData.append('height', String(finalHeight));
      formData.append('frames', String(durationFrames));

      const response = await fetch('/api/comfy/wan', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate video');
      }

      const result = await response.json();
      console.log('[VIDEO] Generation result:', result);
      toast.loading('Generating video...', { id: 'video-gen' });

      await new Promise(resolve => setTimeout(resolve, 8000));

      let videoFilename = result.video_path || '';
      let videoSubfolder = result.subfolder || 'video';

      try {
        const cacheUrl = `/api/comfy/images?filename=${encodeURIComponent(videoFilename)}&subfolder=${encodeURIComponent(videoSubfolder)}`;
        console.log('[VIDEO] Caching video, URL:', cacheUrl);
        const cacheResponse = await fetch(cacheUrl);
        if (!cacheResponse.ok) {
          const errorText = await cacheResponse.text();
          console.error('[VIDEO] Cache failed:', cacheResponse.status, errorText);
        } else {
          console.log('[VIDEO] Cached video to public/generated:', videoFilename);
        }
      } catch (e) {
        console.warn('Failed to cache video locally', e);
      }

      const newVideo: VideoGalleryItem = {
        id: result.prompt_id || `video_${Date.now()}`,
        filename: videoFilename,
        prompt: prompt,
        timestamp: Date.now(),
      };

      console.log('[VIDEO] New video created:', newVideo);

      setVideoResult(newVideo);
      setVideoGallery((prev: VideoGalleryItem[]) => {
        const updated = [newVideo, ...prev];
        localStorage.setItem(VIDEO_GALLERY_KEY, JSON.stringify(updated));
        return updated;
      });
      toast.success('Video ready', { id: 'video-gen' });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      toast.error(err instanceof Error ? err.message : 'Generation failed', { id: 'video-gen' });
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteVideo = async (id: string) => {
    const videoToDelete = videoGallery.find(v => v.id === id);
    if (!videoToDelete) return;

    try {
      // Use the same API as images, since it handles the same directory
      await fetch(`/api/comfy/images?filename=${videoToDelete.filename}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete failed:', err);
    }

    const updated = videoGallery.filter(v => v.id !== id);
    setVideoGallery(updated);
    localStorage.setItem(VIDEO_GALLERY_KEY, JSON.stringify(updated));

    if (videoResult?.id === id) {
      setVideoResult(null);
    }

    toast.success('Video deleted');
    closeConfirm();
  };

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[#3a3936] bg-[#2a2a28]/95 px-8 py-5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#c9a87a]" />
            <div>
              <h1 className="text-base font-semibold text-[#edeae2]">Wan Video Generator</h1>
              <p className="text-xs text-[#9f988c]">Image to video with Wan2.2</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto w-full max-w-4xl space-y-6">

          {/* Image Upload Section */}
          <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
            <p className="mb-3 text-[10px] uppercase tracking-widest text-[#6b6560]">Upload Image</p>

            {!uploadedImage ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#4a4944] bg-[#262624] px-6 py-10 transition hover:border-[#5a554a] hover:bg-[#2d2d2b]"
              >
                <svg className="mb-3 h-10 w-10 text-[#6b6560]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-[#bcb6aa]">Click to upload an image</p>
                <p className="mt-1 text-xs text-[#6b6560]">PNG, JPG up to 10MB</p>
              </div>
            ) : (
              <div className="relative flex items-center gap-4">
                <div className="relative h-32 w-32 overflow-hidden rounded-xl border border-[#4a4944]">
                  <img src={uploadedImage} alt="Uploaded" className="h-full w-full object-cover" />
                </div>
                <div className="flex flex-1 flex-col justify-center">
                  <p className="text-sm text-[#edeae2] truncate">{uploadedImageName}</p>
                  <p className="text-xs text-[#6b6560]">Ready for video generation</p>
                </div>
                <button
                  onClick={() => updateWorkspaceState({ uploadedImage: null, uploadedImageName: '' })}
                  className="rounded-lg border border-[#5a4a3d] px-3 py-2 text-xs text-[#e1bfa0] transition hover:border-[#775e4b] hover:text-[#f2cdae]"
                >
                  Remove
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>

          {/* Size & Duration Controls */}
          <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
            <div className="flex flex-wrap items-center gap-6">

              {/* Video Size */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Video Size</p>
                <div className="flex gap-1 rounded-xl border border-[#494741] bg-[#262624] p-1">
                  {(['480', '720'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => updateWorkspaceState({ videoSize: size })}
                      disabled={isGenerating}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${videoSize === size
                        ? 'bg-[#c9a87a] text-[#1f1f1d]'
                        : 'text-[#bcb6aa] hover:text-[#edeae2]'
                        } disabled:opacity-50`}
                    >
                      {size}p
                    </button>
                  ))}
                </div>
              </div>

              {/* Match Aspect Ratio Toggle */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Aspect Ratio</p>
                <button
                  onClick={() => updateWorkspaceState({ matchImageSize: !matchImageSize })}
                  disabled={isGenerating || !uploadedImage}
                  className={`flex items-center gap-2 rounded-xl border border-[#494741] bg-[#262624] px-4 py-2 text-sm transition hover:border-[#5a554a] disabled:opacity-50 ${matchImageSize && uploadedImage ? 'text-[#c9a87a]' : 'text-[#bcb6aa]'
                    }`}
                >
                  <div className={`h-3 w-3 rounded-sm border transition-colors ${matchImageSize && uploadedImage ? 'bg-[#c9a87a] border-[#c9a87a]' : 'border-[#6b6560]'
                    }`}>
                    {matchImageSize && uploadedImage && (
                      <svg className="h-full w-full text-[#1f1f1d]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L7 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  Match Image
                </button>
              </div>

              {/* Resolution Display */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Target Resolution</p>
                <div className="flex items-center justify-center rounded-lg bg-[#262624] border border-[#494741] px-3 py-2 text-sm tabular-nums text-[#c9a87a]">
                  {targetDimensions.width} × {targetDimensions.height}
                </div>
              </div>

              {/* Duration in Frames */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Duration (Frames)</p>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="17"
                    max="161"
                    step="16"
                    value={durationFrames}
                    onChange={(e) => updateWorkspaceState({ durationFrames: parseInt(e.target.value) })}
                    disabled={isGenerating}
                    className="w-32 appearance-none rounded-full bg-[#494741] py-1.5 disabled:opacity-50 cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-[#c9a87a]
                      [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-moz-range-thumb]:h-4
                      [&::-moz-range-thumb]:w-4
                      [&::-moz-range-thumb]:rounded-full
                      [&::-moz-range-thumb]:bg-[#c9a87a]
                      [&::-moz-range-thumb]:border-0"
                  />
                  <span className="w-12 rounded-lg bg-[#262624] border border-[#494741] px-2 py-1 text-center text-sm tabular-nums text-[#c9a87a]">
                    {durationFrames}
                  </span>
                </div>
                <p className="text-xs text-[#6b6560]">
                  ~{(durationFrames / 16).toFixed(1)}s at 16fps
                </p>
              </div>
            </div>
          </div>

          {/* Prompt Input */}
          <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isEnhancing || availableModels.length === 0}
                  className="rounded-lg border border-[#494741] bg-[#262624] px-2 py-1.5 text-xs text-[#edeae2] outline-none focus:border-[#b9986d] disabled:opacity-50"
                >
                  {availableModels.length === 0 ? (
                    <option value="">Loading models...</option>
                  ) : (
                    availableModels.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))
                  )}
                </select>
              </div>
              <button
                onClick={enhancePrompt}
                disabled={isEnhancing || !prompt.trim() || !selectedModel || availableModels.length === 0}
                className="cursor-pointer rounded-lg border border-[#5a4f40] bg-[#3a352e] px-3 py-1.5 text-xs font-medium text-[#f2dbc0] transition hover:bg-[#4a433a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isEnhancing ? 'Enhancing...' : '✦ Enhance'}
              </button>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => updateWorkspaceState({ prompt: e.target.value })}
              placeholder="Describe the motion, camera movement, and action..."
              rows={4}
              disabled={isGenerating}
              className="w-full resize-none rounded-xl border border-[#494741] bg-[#262624] px-3 py-3 text-sm text-[#ece8df] outline-none transition placeholder:text-[#6b6560] focus:border-[#b9986d] disabled:opacity-60"
            />

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-[#6b6560]">Describe how the image should animate</p>

              <button
                onClick={generateVideo}
                disabled={isGenerating || !uploadedImage || !prompt.trim()}
                className="cursor-pointer flex items-center gap-1.5 rounded-lg bg-[#c9a87a] px-4 py-2 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isGenerating ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Generate Video
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-[#7d463f] bg-[#3f2a27] px-3 py-2 text-sm text-[#ffbeb4]">
              {error}
            </p>
          )}

          {/* Video Result */}
          {videoResult && (
            <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
              <p className="mb-3 text-[10px] uppercase tracking-widest text-[#6b6560]">Generated Video</p>
              <div className="flex items-center gap-4">
                <div className="flex-1 overflow-hidden rounded-xl bg-[#1a1a18]">
                  <video
                    src={`/generated/${videoResult.filename}`}
                    controls
                    className="w-full max-h-[400px]"
                    poster={uploadedImage || undefined}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => window.open(`/generated/${videoResult.filename}`, '_blank')}
                    className="rounded-lg border border-[#5a4f40] bg-[#3a352e] px-3 py-2 text-xs text-[#f2dbc0] transition hover:bg-[#4a433a]"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(videoResult.prompt)}
                    className="rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 text-xs text-[#bcb6aa] transition hover:border-[#5a4f40] hover:text-[#edeae2]"
                  >
                    Copy Prompt
                  </button>
                  <button
                    onClick={() => openConfirm("Delete Video", "This will delete the video from the server.", () => deleteVideo(videoResult.id))}
                    className="rounded-lg border border-[#7d463f] bg-[#3f2a27] px-3 py-2 text-xs text-[#ffbeb4] transition hover:bg-[#5a3430] hover:text-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Video Gallery */}
          {videoGallery.length > 0 && (
            <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Video History</p>
                <span className="text-xs text-[#6b6560]">{videoGallery.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {videoGallery.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => setVideoResult(video)}
                    className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-[#1a1a18] transition hover:ring-2 hover:ring-[#c9a87a]"
                  >
                    <video
                      src={`/generated/${video.filename}`}
                      className="h-full w-full object-cover"
                      muted
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openConfirm("Delete Video", "This will delete the video from the server.", () => deleteVideo(video.id));
                          }}
                          className="rounded-lg bg-black/60 p-2 text-white/70 backdrop-blur-sm transition hover:bg-red-500/80 hover:text-white"
                          title="Delete Video"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}