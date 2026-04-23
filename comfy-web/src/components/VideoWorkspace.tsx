'use client';

import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import VideoUpscaleDialog from './VideoUpscaleDialog';

interface VideoGalleryItem {
  id: string;
  filename: string;
  prompt: string;
  timestamp: number;
  subfolder?: string;
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
    videoSize: '480' | '540' | '720';
    matchImageSize: boolean;
    durationFrames: number;
  };
  setWorkspaceState: React.Dispatch<React.SetStateAction<{
    prompt: string;
    uploadedImage: string | null;
    uploadedImageName: string;
    videoSize: '480' | '540' | '720';
    matchImageSize: boolean;
    durationFrames: number;
  }>>;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableModels: string[];
  openConfirm: (title: string, message: string, onConfirm: () => void) => void;
  closeConfirm: () => void;
}

function ChevronIcon() {
  return (
    <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b6560]">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

const STORAGE_KEY = 'video_workspace_state';
const VIDEO_GALLERY_KEY = 'video_gallery';

interface VideoWorkspaceState {
  prompt: string;
  uploadedImage: string | null;
  uploadedImageName: string;
  videoSize: '480' | '540' | '720';
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
  const [isUpscaleOpen, setIsUpscaleOpen] = useState(false);
  const [videoToUpscale, setVideoToUpscale] = useState<VideoGalleryItem | null>(null);
  const [isCombineMode, setIsCombineMode] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [isCombining, setIsCombining] = useState(false);

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
    '540': { width: 540, height: 960 },
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
    const maxLongSide = videoSize === '720' ? 1280 : videoSize === '540' ? 960 : 832;
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

    localStorage.setItem("loaded_model", selectedModel);
    setIsEnhancing(true);
    setError('');

    try {
      const thumbnailBase64 = await createImageThumbnail(uploadedImage, 400);
      const durationSeconds = (durationFrames / 16).toFixed(1);

      const response = await fetch('/api/lmstudio/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: 'system',
              content: `You are an expert prompt engineer for Wan 2.2 Image-to-Video (I2V) generation. 
You will receive an image, a raw user prompt, and a target duration.

Your job: Write a highly descriptive, cinematic motion prompt that naturally progresses the exact scene in the image and ensures the requested action reaches a clear, definitive completion.

CRITICAL RULES FOR WAN 2.2:
1. NO TIME PHRASES IN OUTPUT: Never include phrases like "over X seconds" or "within the duration." Video models do not understand time measurements. Instead, use the provided duration to judge how much action is physically possible, and describe the visual sequence in real-time.
2. ENSURE ACTION COMPLETION: Force the completion of the action by explicitly describing the final resting or completed state (e.g., instead of "starts drinking", use "raises the glass, takes a sip, and lowers it back to the table").
3. ANCHOR TO THE IMAGE: The first part of your prompt MUST perfectly describe the subject and setting exactly as they appear in the provided image.
4. STRUCTURE: Use 2 to 3 concise sentences. 
   - Sentence 1: The subject, setting, and the initiation of the movement.
   - Sentence 2: The progression and explicit completion/end-state of the action.
   - Sentence 3: Cinematic camera movement (e.g., slow pan, gentle tracking) and atmospheric details.
5. TEMPORAL STABILITY: Use dynamic but grounded verbs. Avoid sudden, explosive, or physically impossible transitions. Maintain the core intent of the user's raw prompt.

Return ONLY the final optimized prompt inside <prompt></prompt> tags.`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `User's raw prompt: "${prompt}"\nTarget Video Duration: ${durationSeconds} seconds.\n\nBased on the image, write a prompt that describes exactly enough action to realistically fill this timeframe, ending with the action fully completed.`
                },
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
        toast.loading("Unloading LM Studio...", { id: "video-gen" });
        const unloadRes = await fetch('/api/lmstudio/unload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel }),
        });
        if (unloadRes.ok) {
          // Wait for VRAM to settle
          await new Promise(r => setTimeout(r, 1000));
        }
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

      const videoFilename = result.video_path || '';
      const videoSubfolder = result.subfolder || 'video';

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
        subfolder: videoSubfolder,
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

  const extractLastFrame = (videoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      
      video.onloadedmetadata = () => {
        video.currentTime = video.duration;
      };
      
      video.onloadeddata = () => {
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        }, 100);
      };
      
      video.onerror = () => {
        reject(new Error('Failed to load video'));
      };
    });
  };

  const useVideoAsInput = async (video: VideoGalleryItem) => {
    try {
      toast.loading('Extracting last frame...', { id: 'extract-frame' });
      const frameDataUrl = await extractLastFrame(`/generated/${video.filename}`);
      updateWorkspaceState({ 
        uploadedImage: frameDataUrl, 
        uploadedImageName: `frame_${video.filename.replace(/\.[^.]+$/, '.png')}` 
      });
      toast.success('Last frame extracted. Ready for video generation.', { id: 'extract-frame' });
    } catch (err) {
      console.error('Extract failed:', err);
      toast.error('Failed to extract last frame', { id: 'extract-frame' });
    }
  };

  const toggleCombineMode = () => {
    if (isCombineMode) {
      setIsCombineMode(false);
      setSelectedVideos([]);
    } else {
      setIsCombineMode(true);
      setSelectedVideos([]);
    }
  };

  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideos(prev => {
      if (prev.includes(videoId)) {
        return prev.filter(id => id !== videoId);
      }
      return [...prev, videoId];
    });
  };

  const combineVideos = async () => {
    if (selectedVideos.length < 2) {
      toast.error('Select at least 2 videos to combine');
      return;
    }

    const orderedVideos = selectedVideos
      .map(id => videoGallery.find(v => v.id === id))
      .filter((v): v is VideoGalleryItem => v !== undefined);

    setIsCombining(true);
    try {
      toast.loading('Combining videos...', { id: 'combine' });

      const response = await fetch('/api/video/combine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videos: orderedVideos.map(v => ({
            filename: v.filename,
            subfolder: v.subfolder || 'video'
          }))
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to combine videos');
      }

      const result = await response.json();
      
      const newVideo: VideoGalleryItem = {
        id: result.prompt_id || `combined_${Date.now()}`,
        filename: result.video_path || result.output_filename,
        prompt: `Combined: ${orderedVideos.map(v => v.prompt).join(' → ')}`,
        timestamp: Date.now(),
        subfolder: result.subfolder || 'video',
      };

      setVideoResult(newVideo);
      setVideoGallery(prev => {
        const updated = [newVideo, ...prev];
        localStorage.setItem(VIDEO_GALLERY_KEY, JSON.stringify(updated));
        return updated;
      });
      
      setIsCombineMode(false);
      setSelectedVideos([]);
      toast.success('Videos combined!', { id: 'combine' });
    } catch (err) {
      console.error('Combine failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to combine videos', { id: 'combine' });
    } finally {
      setIsCombining(false);
    }
  };

  const deleteVideo = async (id: string) => {
    const videoToDelete = videoGallery.find(v => v.id === id);
    if (!videoToDelete) return;

    try {
      const deleteUrl = videoToDelete.subfolder
        ? `/api/comfy/images?filename=${videoToDelete.filename}&subfolder=${videoToDelete.subfolder}`
        : `/api/comfy/images?filename=${videoToDelete.filename}`;
      await fetch(deleteUrl, { method: 'DELETE' });
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

  const clearVideoGallery = async () => {
    try {
      await fetch("/api/comfy/images?type=video", { method: "DELETE" });
    } catch {
      // Still clear local state even if server deletion fails.
    }

    setVideoGallery([]);
    setVideoResult(null);
    localStorage.removeItem(VIDEO_GALLERY_KEY);
    toast.success("Gallery cleared");
    closeConfirm();
  };

  const openUpscale = (video: VideoGalleryItem) => {
    setVideoToUpscale(video);
    setIsUpscaleOpen(true);
  };

  const handleUpscaleSuccess = (newVideo: VideoGalleryItem) => {
    setVideoResult(newVideo);
    setVideoGallery(prev => {
      const updated = [newVideo, ...prev];
      localStorage.setItem(VIDEO_GALLERY_KEY, JSON.stringify(updated));
      return updated;
    });
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
          <div className="flex items-center gap-2">
            {videoGallery.length > 0 && (
              <button
                onClick={() => openConfirm("Clear Gallery", "This will delete all videos from the server.", () => clearVideoGallery())}
                className="rounded-lg border border-[#5a4a3d] px-3 py-1.5 text-xs text-[#e1bfa0] transition hover:border-[#775e4b] hover:text-[#f2cdae]"
              >
                Clear Gallery
              </button>
            )}
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
            <div className="flex flex-wrap items-start gap-6">

              {/* Video Size */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Video Size</p>
                <div className="flex h-[38px] items-center gap-1 rounded-xl border border-[#494741] bg-[#262624] p-1">
                  {(['480', '540', '720'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => updateWorkspaceState({ videoSize: size })}
                      disabled={isGenerating}
                      className={`h-full rounded-lg px-4 text-sm font-medium transition ${videoSize === size
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
                  className={`flex h-[38px] items-center gap-2 rounded-xl border border-[#494741] bg-[#262624] px-4 text-sm transition hover:border-[#5a554a] disabled:opacity-50 ${matchImageSize && uploadedImage ? 'text-[#c9a87a]' : 'text-[#bcb6aa]'
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
                <div className="flex h-[38px] items-center justify-center rounded-lg bg-[#262624] border border-[#494741] px-4 text-sm tabular-nums text-[#c9a87a]">
                  {targetDimensions.width} × {targetDimensions.height}
                </div>
              </div>

              {/* Duration in Frames */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Duration (Frames)</p>
                <div className="flex h-[38px] items-center gap-3">
                  <input
                    type="range"
                    min="17"
                    max="161"
                    step="16"
                    value={durationFrames}
                    onChange={(e) => updateWorkspaceState({ durationFrames: parseInt(e.target.value) })}
                    disabled={isGenerating}
                    className="w-32 appearance-none rounded-full bg-[#494741] py-1 disabled:opacity-50 cursor-pointer
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
                  <span className="flex h-[30px] w-12 items-center justify-center rounded-lg bg-[#262624] border border-[#494741] text-center text-sm tabular-nums text-[#c9a87a]">
                    {durationFrames}
                  </span>
                </div>
                <p className="text-[11px] text-[#6b6560] leading-none">
                  ~{(durationFrames / 16).toFixed(1)}s at 16fps (81 frames is optimal)
                </p>
              </div>
            </div>
          </div>

          {/* Prompt Input */}
          <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Motion Model</span>
                <div className="relative min-w-[200px]">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isEnhancing || availableModels.length === 0}
                    className="w-full h-[32px] rounded-lg border border-[#494741] bg-[#262624] px-3 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none truncate disabled:opacity-50"
                  >
                    {availableModels.length === 0 ? (
                      <option value="">Loading models...</option>
                    ) : (
                      availableModels.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))
                    )}
                  </select>
                  <ChevronIcon />
                </div>
              </div>

              <div className="flex flex-col gap-1 items-end self-end">
                <button
                  onClick={enhancePrompt}
                  disabled={isEnhancing || !prompt.trim() || !selectedModel || availableModels.length === 0}
                  className="cursor-pointer h-[32px] flex items-center gap-1.5 rounded-lg border border-[#5a4f40] bg-[#3a352e] px-4 text-xs font-medium text-[#f2dbc0] transition hover:bg-[#4a433a] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isEnhancing ? (
                    <>
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Enhancing...
                    </>
                  ) : '✦ Enhance'}
                </button>
              </div>
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
              <p className="mb-3 text-[10px] uppercase tracking-widest text-[#6b6560]">Video Preview</p>
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
                    View
                  </button>
                  <button
                    onClick={() => openUpscale(videoResult)}
                    className="rounded-lg border border-[#c9a87a]/40 bg-[#c9a87a]/10 px-3 py-2 text-xs text-[#c9a87a] transition hover:bg-[#c9a87a]/20"
                  >
                    Upscale
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
                <div className="flex items-center gap-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Video History</p>
                  <span className="text-xs text-[#6b6560]">{videoGallery.length}</span>
                </div>
                {isCombineMode ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#c9a87a]">{selectedVideos.length} selected</span>
                    <button
                      onClick={combineVideos}
                      disabled={isCombining || selectedVideos.length < 2}
                      className="cursor-pointer flex items-center gap-1.5 rounded-lg bg-[#c9a87a] px-3 py-1.5 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isCombining ? (
                        <>
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Combining...
                        </>
                      ) : (
                        <>
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Proceed
                        </>
                      )}
                    </button>
                    <button
                      onClick={toggleCombineMode}
                      className="rounded-lg border border-[#5a4a3d] px-3 py-1.5 text-xs text-[#e1bfa0] transition hover:border-[#775e4b] hover:text-[#f2cdae]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={toggleCombineMode}
                    className="rounded-lg border border-[#5a4f40] bg-[#3a352e] px-3 py-1.5 text-xs text-[#f2dbc0] transition hover:bg-[#4a433a]"
                  >
                    Combine
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {videoGallery.map((video) => (
                  <div
                    key={video.id}
                    onClick={() => isCombineMode ? toggleVideoSelection(video.id) : setVideoResult(video)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        isCombineMode ? toggleVideoSelection(video.id) : setVideoResult(video);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className={`group relative aspect-[1/1] cursor-pointer overflow-hidden rounded-lg bg-[#1a1a18] transition hover:ring-2 hover:ring-[#c9a87a] outline-none ${isCombineMode && selectedVideos.includes(video.id) ? 'ring-2 ring-[#c9a87a]' : ''}`}
                  >
                    {isCombineMode && selectedVideos.includes(video.id) && (
                      <div className="absolute inset-0 bg-[#c9a87a]/20 flex items-center justify-center z-10">
                        <span className="bg-[#c9a87a] text-[#1f1f1d] text-xs font-bold px-2 py-1 rounded">
                          {selectedVideos.indexOf(video.id) + 1}
                        </span>
                      </div>
                    )}
                    <video
                      src={`/generated/${video.filename}`}
                      className="h-full w-full object-cover"
                      muted
                      preload="metadata"
                    />
                    <div className="absolute inset-x-0 top-0 -translate-y-full p-2 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                      <div className="flex items-center justify-end">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              useVideoAsInput(video);
                            }}
                            className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                            title="Use Last Frame as Input"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(video.prompt);
                              toast.success('Copied');
                            }}
                            className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                            title="Copy Prompt"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                          {/* <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateWorkspaceState({ prompt: video.prompt });
                              toast.success('Prompt loaded');
                            }}
                            className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                            title="Use Prompt"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </button> */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openUpscale(video);
                            }}
                            className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                            title="Upscale"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/generated/${video.filename}`, '_blank');
                            }}
                            className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                            title="View"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openConfirm("Delete Video", "This will delete the video from the server.", () => deleteVideo(video.id));
                            }}
                            className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                            title="Delete"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2.5">
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-[#e7e2d8] opacity-90">{video.prompt}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {videoToUpscale && (
        <VideoUpscaleDialog
          isOpen={isUpscaleOpen}
          onClose={() => setIsUpscaleOpen(false)}
          video={videoToUpscale}
          onSuccess={handleUpscaleSuccess}
        />
      )}
    </>
  );
}