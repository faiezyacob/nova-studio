'use client';

import { useState } from 'react';
import { toast } from 'sonner';

interface VideoUpscaleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  video: {
    filename: string;
    subfolder?: string;
    prompt: string;
  };
  onSuccess: (newVideo: any) => void;
}

const UPSCALE_MODELS = [
  { 
    id: 'RealESRGAN_x2plus.pth', 
    label: 'RealESRGAN x2+', 
    desc: 'Faster, 2x enlargement. Great for moderate resolution increases.' 
  },
  { 
    id: 'RealESRGAN_x4plus.safetensors', 
    label: 'RealESRGAN x4+', 
    desc: 'Highest quality, 4x enlargement. Best for low-res sources.' 
  },
];

export default function VideoUpscaleDialog({ isOpen, onClose, video, onSuccess }: VideoUpscaleDialogProps) {
  const [upscaleModel, setUpscaleModel] = useState(UPSCALE_MODELS[0].id);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleUpscale = async () => {
    setIsProcessing(true);
    const toastId = toast.loading('Initiating upscale...');

    try {
      const response = await fetch('/api/comfy/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: video.filename,
          subfolder: video.subfolder || 'video',
          upscale_model: upscaleModel,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upscale failed');
      }

      const result = await response.json();
      toast.loading('Upscaling video... this may take a few minutes', { id: toastId });

      // Caching logic
      try {
        const cacheUrl = `/api/comfy/images?filename=${encodeURIComponent(result.video_path)}&subfolder=${encodeURIComponent(result.subfolder || '')}`;
        await fetch(cacheUrl);
      } catch (e) {
        console.warn('Failed to cache upscaled video', e);
      }

      const modelLabel = UPSCALE_MODELS.find(m => m.id === upscaleModel)?.label || upscaleModel;
      const newVideo = {
        id: `upscale_${Date.now()}`,
        filename: result.video_path,
        prompt: `[${modelLabel}] ${video.prompt}`,
        timestamp: Date.now(),
        subfolder: result.subfolder || '',
      };

      onSuccess(newVideo);
      toast.success('Upscale complete!', { id: toastId });
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Upscale failed', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!isProcessing ? onClose : undefined}
      />
      
      <div className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-[#3f3e3a] bg-[#2a2a28] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="border-b border-[#3a3936] bg-[#2f2f2d] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c9a87a]/10 text-[#c9a87a]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#edeae2]">Model Upscale</h2>
              <p className="text-xs text-[#9f988c]">Choose a professional AI model to enhance your video</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Source Video Preview */}
          <div className="rounded-xl bg-[#1a1a18] p-3 border border-[#3a3936]">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-lg bg-black shrink-0">
                <video 
                  src={`/generated/${video.filename}`} 
                  className="h-full w-full object-cover opacity-60" 
                  muted 
                />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs text-[#6b6560] uppercase tracking-wider mb-1 font-semibold text-[9px]">Source Video</p>
                <p className="text-sm text-[#bcb6aa] truncate">{video.prompt}</p>
              </div>
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-[#6b6560] font-bold">Upscale Model</p>
            <div className="grid grid-cols-1 gap-3">
              {UPSCALE_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setUpscaleModel(m.id)}
                  className={`group flex items-start gap-4 rounded-xl border p-4 text-left transition ${
                    upscaleModel === m.id
                      ? 'border-[#c9a87a] bg-[#3a352e] ring-1 ring-[#c9a87a]'
                      : 'border-[#3f3e3a] bg-[#262624] hover:border-[#5a554a] hover:bg-[#2d2d2b]'
                  }`}
                >
                  <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    upscaleModel === m.id ? 'border-[#c9a87a] bg-[#c9a87a]' : 'border-[#494741]'
                  }`}>
                    {upscaleModel === m.id && (
                      <svg className="h-3 w-3 text-[#1f1f1d]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L7 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className={`text-sm font-semibold block ${upscaleModel === m.id ? 'text-[#f2dbc0]' : 'text-[#edeae2]'}`}>
                      {m.label}
                    </span>
                    <span className="text-[11px] leading-relaxed text-[#6b6560] group-hover:text-[#9f988c] transition-colors">{m.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[#3a3936] bg-[#2f2f2d] px-6 py-4">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-xl px-4 py-2 text-sm font-medium text-[#9f988c] transition hover:text-[#edeae2] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpscale}
            disabled={isProcessing}
            className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-[#c9a87a] px-6 py-2.5 text-sm font-bold text-[#1f1f1d] transition hover:bg-[#d8b88d] disabled:opacity-50 shadow-lg shadow-[#c9a87a]/10"
          >
            {isProcessing ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <span>Start AI Upscale</span>
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
