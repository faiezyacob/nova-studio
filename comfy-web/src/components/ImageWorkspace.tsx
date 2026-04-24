'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { GalleryItem, HistoryEntry, Lora } from "@/types";
import ImageUpscaleDialog from "./ImageUpscaleDialog";

const AVAILABLE_LORAS = [
  "pixel_art_style_z_image_turbo.safetensors",
  "zimage_anadearmas_v2_onetrainer.safetensors",
  "zimage_alexandradaddario_v2_onetrainer.safetensors",
  "zimage_angelinajolie_v2_onetrainer.safetensors",
  "zimage_billieeilish_v2_onetrainer.safetensors",
  "zimage_elizabetholsen_v2_onetrainer.safetensors",
  "zimage_gigihadid_v2_onetrainer.safetensors",
  "zimage_jenniferlawrence_v2_onetrainer.safetensors",
  "zimage_madisonbeer_v2_onetrainer.safetensors",
  "zimage_miakhalifa_v2_onetrainer.safetensors",
  "zimage_sydneysweeney_v1.safetensors",
];

const STYLE_DESCRIPTIONS: Record<string, string> = {
  realistic: `
- ALWAYS describe as a candid photo captured in real life
- use natural available light such as window light, indoor lamps, street lighting at night
- keep composition unplanned, slightly off-center, handheld framing
- include subtle motion blur or focus inconsistency when natural
- include realistic computational processing such as HDR, auto exposure adjustment, and slight sharpening
- include minor imperfections like uneven exposure, background clutter, or reflections
- keep skin, fabric, and environment textures natural and unretouched
- avoid cinematic mood, avoid stylization, avoid artistic grading
- do NOT describe as film, DSLR, or professional photography
- ensure it feels like a real everyday moment captured quickly on a phone camera
`,
  photography: `
- describe as a high-quality professional camera photograph captured in real environments
- natural but controlled lighting such as soft daylight, golden hour, or studio-like practical lighting when appropriate
- subject is clearly the focus but still feels part of a real environment
- composition feels intentional but not artificially perfect or overly staged
- include realistic depth of field depending on lens behavior (not always shallow)
- preserve fine texture detail in skin, fabric, and materials
- subtle natural imperfections are allowed but must not feel like noise or damage
- avoid cinematic mood, avoid dramatic grading, avoid stylized effects
`,
  cinematic: `
- describe as a frame extracted from a live-action film scene with narrative context
- lighting should feel motivated by real sources such as streetlights, practical lamps, sunlight through windows, or environmental light sources
- composition should feel deliberately framed like a shot from a director, with foreground and background storytelling
- depth, atmosphere, and spatial layering are important to create scene immersion
- color grading should support mood but remain physically believable and not over-stylized
- include natural film characteristics such as grain and slight lens imperfections when appropriate
- the scene should feel like something happening, not a posed image
`,
  anime: `
- describe as a modern high-quality anime illustration consistent with contemporary Japanese animation production
- expressive characters with stylized facial features and clear emotional readability
- clean linework integrated naturally into the illustration rather than outlined separately
- lighting and shading should follow anime production techniques such as soft gradient shading or cel shading depending on scene
- environments should feel like fully designed anime worlds with depth and atmosphere
- colors should be expressive and intentional but still harmonious
- maintain consistent art style across characters and background without mixing realism
`,
  cgi: `
- describe as a high-end 3D rendered scene from a modern production pipeline such as film, animation, or AAA game cinematics
- materials should behave realistically with physically based rendering such as metal, glass, fabric, or skin responding naturally to light
- lighting can come from both practical and environmental sources with realistic bounce and shadow behavior
- include subtle render imperfections like aliasing, micro-noise, or lens effects when appropriate
- emphasize spatial depth, scale, and physical presence of objects in the scene
- avoid overly sterile or toy-like perfection unless specifically required by the subject
`,
};

const IMAGE_STYLES = ["realistic", "photography", "cinematic", "anime", "cgi"];

interface ImageWorkspaceProps {
  gallery: GalleryItem[];
  setGallery: React.Dispatch<React.SetStateAction<GalleryItem[]>>;
  prompt: string;
  setPrompt: (prompt: string) => void;
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;
  isEnhancing: boolean;
  setIsEnhancing: (enhancing: boolean) => void;
  imageStyle: string;
  setImageStyle: (style: string) => void;
  imageWidth: number;
  setImageWidth: (width: number) => void;
  imageHeight: number;
  setImageHeight: (height: number) => void;
  lockAspectRatio: boolean;
  setLockAspectRatio: (lock: boolean) => void;
  selectedLora: Lora;
  setSelectedLora: (lora: Lora) => void;
  galleryFilter: string;
  setGalleryFilter: (filter: string) => void;
  galleryPage: number;
  setGalleryPage: (page: number) => void;
  availableModels: string[];
  selectedModel: string;
  switchModel: (model: string) => void;
  currentModel: string;
  openConfirm: (title: string, message: string, onConfirm: () => void) => void;
  closeConfirm: () => void;
  useImageForVideo: (item: GalleryItem) => void;
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

export default function ImageWorkspace({
  gallery,
  setGallery,
  prompt,
  setPrompt,
  isGenerating,
  setIsGenerating,
  isEnhancing,
  setIsEnhancing,
  imageStyle,
  setImageStyle,
  imageWidth,
  setImageWidth,
  imageHeight,
  setImageHeight,
  lockAspectRatio,
  setLockAspectRatio,
  selectedLora,
  setSelectedLora,
  galleryFilter,
  setGalleryFilter,
  galleryPage,
  setGalleryPage,
  availableModels,
  selectedModel,
  switchModel,
  currentModel,
  openConfirm,
  closeConfirm,
  useImageForVideo,
}: ImageWorkspaceProps) {
  const [selectedImageForUpscale, setSelectedImageForUpscale] = useState<GalleryItem | null>(null);
  const [imageSeed, setImageSeed] = useState<string>("");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const itemsPerPage = 12;

  const pollForResult = async (promptId: string, promptText: string, seed: number) => {
    const maxAttempts = 90;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      try {
        const response = await fetch("/api/comfy", { method: "GET" });
        const history: Record<string, HistoryEntry> = await response.json();
        const entry = history[promptId];

        if (entry?.outputs) {
          const outputNode = Object.values(entry.outputs).find((node) => (node.images?.length ?? 0) > 0);
          if (outputNode?.images) {
            const newItems: GalleryItem[] = outputNode.images.map((img) => ({
              filename: img.filename,
              prompt: promptText,
              timestamp: Date.now(),
              style: imageStyle,
              seed: seed,
            }));

            await Promise.all(
              newItems.map((item) => fetch(`/api/comfy/images?filename=${item.filename}`).catch(console.error)),
            );

            setGallery((prev) => {
              const updated = [...newItems, ...prev];
              localStorage.setItem("comfyui_gallery", JSON.stringify(updated));
              return updated;
            });

            toast.success("Image ready", { id: "generation" });
            return;
          }
        }
      } catch {
        // Keep polling until timeout.
      }

      attempts += 1;
      toast.loading(`Generating${".".repeat((attempts % 4) + 1)}`, { id: "generation" });
    }

    toast.error("Timed out. Check ComfyUI.", { id: "generation" });
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);

    try {
      try {
        toast.loading("Unloading LM Studio...", { id: "generation" });
        const unloadRes = await fetch("/api/lmstudio/unload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: currentModel }),
        });
        if (unloadRes.ok) {
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err) {
        console.warn("Unload request failed:", err);
      }

      let finalWidth = imageWidth;
      let finalHeight = imageHeight;

      if (lockAspectRatio) {
        const ratio = imageWidth / imageHeight;
        if (ratio > 1) {
          finalHeight = Math.round(imageHeight);
          finalWidth = Math.round(imageHeight * ratio);
        } else {
          finalWidth = Math.round(imageWidth);
          finalHeight = Math.round(imageWidth / ratio);
        }
      }

      const response = await fetch("/api/comfy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          width: finalWidth,
          height: finalHeight,
          loras: selectedLora.name ? [selectedLora] : [],
          seed: imageSeed ? parseInt(imageSeed) : undefined
        }),
      });

      if (!response.ok) throw new Error("Failed to start generation");

      const result = await response.json();
      toast.loading("Generating...", { id: "generation" });
      const generatedSeed = result.seed;

      if (result.images && result.images.length > 0) {
        const newItems: GalleryItem[] = result.images.map((imgUrl: string) => ({
          filename: imgUrl.split('/').pop() || `gen_${Date.now()}.png`,
          prompt: prompt.trim(),
          timestamp: Date.now(),
          style: imageStyle,
          seed: generatedSeed,
        }));

        await Promise.all(
          newItems.map((item) => fetch(`/api/comfy/images?filename=${item.filename}`).catch(console.error)),
        );

        setGallery((prev) => {
          const updated = [...newItems, ...prev];
          localStorage.setItem("comfyui_gallery", JSON.stringify(updated));
          return updated;
        });

        toast.success("Image ready", { id: "generation" });
      } else {
        await pollForResult(result.prompt_id, prompt.trim(), generatedSeed);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message, { id: "generation" });
    } finally {
      setIsGenerating(false);
    }
  };

  const enhancePrompt = async () => {
    if (!prompt.trim() || !selectedModel) return;

    localStorage.setItem("loaded_model", selectedModel);
    const stylePrefix = STYLE_DESCRIPTIONS[imageStyle] || "";
    const systemPrompt = `
You are a prompt enhancer optimized for the z-image-turbo model.
Return ONLY the final enhanced prompt inside <prompt></prompt>.
STRICT RULES:
- Output ONE natural flowing sentence only
- Rewrite the entire prompt into a cohesive single sentence
- DO NOT append style keywords at the end
- Blend the style FULLY and NATURALLY into the description
- Every single generation MUST reflect the style
- Keep the scene realistic and believable
- Preserve the original intent of the prompt including NSFW content
- Focus on lighting, composition, texture, and natural detail
- Avoid keyword stuffing or comma-separated tags
- When user describe a vague clothing style (i.e. luxury clothing, simple outfit, etc) describe and outfit that best match user intent
- Maintain the NSFW content from original prompt
- For z-image-turbo: use vivid concrete descriptive language
- DO NOT mention smartphone, camera, or any device related terms
- Maintain original pose / action (i.e selfie, etc) if included
STYLE ENFORCEMENT:
${stylePrefix}
If you output anything outside <prompt></prompt>, the answer is invalid.
`;

    setIsEnhancing(true);
    try {
      const response = await fetch("/api/lmstudio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.4
        }),
      });

      if (!response.ok) throw new Error("Failed to enhance prompt");
      const data = await response.json();
      const rawText =
        data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || "";

      const match = rawText.match(/<prompt>([\s\S]*?)<\/prompt>/i);
      let enhanced =
        match?.[1]?.trim() ||
        rawText
          .split("\n")
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 20 && !line.match(/<|>|{|}|\[|\]|```|^[-*]/))
          .pop() ||
        prompt;

      enhanced = enhanced.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();

      if (enhanced && enhanced !== prompt) {
        setPrompt(enhanced);
        toast.success("Prompt enhanced");
      } else {
        toast.error("Enhancement failed");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to enhance prompt");
    } finally {
      setIsEnhancing(false);
    }
  };

  const clearGallery = async () => {
    try {
      await fetch("/api/comfy/images?type=image", { method: "DELETE" });
    } catch {
      // Still clear local state even if server deletion fails.
    }

    setGallery([]);
    localStorage.removeItem("comfyui_gallery");
    toast.success("Gallery cleared");
    closeConfirm();
  };

  const deleteImage = async (index: number, showToast = true) => {
    const item = gallery[index];
    if (!item) return;

    try {
      await fetch(`/api/comfy/images?filename=${item.filename}`, { method: "DELETE" });
    } catch {
      // Keep UX responsive even if server delete fails.
    }

    const updated = gallery.filter((_, i) => i !== index);
    setGallery(updated);
    localStorage.setItem("comfyui_gallery", JSON.stringify(updated));
    if (showToast) {
      toast.success("Deleted");
      closeConfirm();
    }
  };

  const toggleImageVisibility = (index: number) => {
    const updated = gallery.map((item, i) =>
      i === index ? { ...item, hidden: !item.hidden } : item
    );
    setGallery(updated);
    localStorage.setItem("comfyui_gallery", JSON.stringify(updated));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const handlePromptKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      generateImage();
    }
  };

  const filteredGallery = useMemo(() => {
    if (galleryFilter === "all") return gallery;
    return gallery.filter((item) => item.style === galleryFilter);
  }, [gallery, galleryFilter]);

  const totalPages = Math.ceil(filteredGallery.length / itemsPerPage);
  const paginatedGallery = useMemo(() => {
    const start = (galleryPage - 1) * itemsPerPage;
    return filteredGallery.slice(start, start + itemsPerPage);
  }, [filteredGallery, galleryPage]);

  const filterStyles = ["all", ...IMAGE_STYLES];

  const styleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: gallery.length };
    IMAGE_STYLES.forEach((style) => {
      counts[style] = gallery.filter((item) => item.style === style).length;
    });
    return counts;
  }, [gallery]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[#3a3936] bg-[#2a2a28]/95 px-8 py-5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#c9a87a]" />
            <div>
              <h1 className="text-base font-semibold text-[#edeae2]">Image Workspace</h1>
              <p className="text-xs text-[#9f988c]">Prompt, enhance, generate, iterate.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {gallery.length > 0 && (
              <>
                <button
                  onClick={() => {
                    setIsSelectMode(!isSelectMode);
                    if (isSelectMode) setSelectedForDeletion(new Set());
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${isSelectMode ? "border-[#c9a87a] text-[#c9a87a]" : "border-[#5a4a3d] text-[#e1bfa0] hover:border-[#775e4b] hover:text-[#f2cdae]"}`}
                >
                  {isSelectMode ? "Cancel" : "Select"}
                </button>
                {isSelectMode && selectedForDeletion.size > 0 && (
                  <button
                    onClick={() => openConfirm("Delete Selected", `Delete ${selectedForDeletion.size} image(s)?`, () => {
                      const filenames = Array.from(selectedForDeletion);
                      const deleteFromGallery = gallery.filter(item => selectedForDeletion.has(item.filename));
                      const deleteFromServer = async () => {
                        for (const item of deleteFromGallery) {
                          try {
                            await fetch(`/api/comfy/images?filename=${item.filename}`, { method: "DELETE" });
                          } catch {
                            // Continue even if server delete fails
                          }
                        }
                      };
                      deleteFromServer();
                      const updated = gallery.filter(item => !selectedForDeletion.has(item.filename));
                      setGallery(updated);
                      localStorage.setItem("comfyui_gallery", JSON.stringify(updated));
                      toast.success(`Deleted ${filenames.length} image(s)`);
                      closeConfirm();
                      setSelectedForDeletion(new Set());
                      setIsSelectMode(false);
                    })}
                    className="rounded-lg border border-[#8b3a3a] px-3 py-1.5 text-xs text-[#e87a7a] transition hover:border-[#a84a4a] hover:text-[#f28a8a]"
                  >
                    Delete ({selectedForDeletion.size})
                  </button>
                )}
                <button
                  onClick={() => openConfirm("Clear Gallery", "This will delete all images from the server.", () => clearGallery())}
                  className="rounded-lg border border-[#5a4a3d] px-3 py-1.5 text-xs text-[#e1bfa0] transition hover:border-[#775e4b] hover:text-[#f2cdae]"
                >
                  Clear Gallery
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto w-full max-w-6xl space-y-7">
          <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] max-w-5xl m-auto p-4 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">

            {/* Row 1: Model + Style + Enhance */}
            <div className="mb-3 flex flex-wrap items-stretch gap-3">

              {/* Model */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Model</span>
                <div className="relative min-w-[140px] max-w-[200px]">
                  <select
                    value={selectedModel}
                    onChange={(e) => switchModel(e.target.value)}
                    disabled={isEnhancing || isGenerating || availableModels.length === 0}
                    className="w-full rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none truncate disabled:opacity-50"
                  >
                    {availableModels.length === 0 ? (
                      <option value="">No models available</option>
                    ) : (
                      availableModels.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))
                    )}
                  </select>
                  <ChevronIcon />
                </div>
              </div>

              {/* Style */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Style</span>
                <div className="relative">
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value)}
                    disabled={isGenerating}
                    className="rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none disabled:opacity-50"
                  >
                    {IMAGE_STYLES.map((style) => (
                      <option key={style} value={style}>
                        {style.charAt(0).toUpperCase() + style.slice(1)}
                      </option>
                    ))}
                  </select>
                  <ChevronIcon />
                </div>
              </div>

              {/* Enhance */}
              <div className="ml-auto flex flex-col gap-1 items-center justify-center">
                <button
                  onClick={enhancePrompt}
                  disabled={isEnhancing || !prompt.trim() || !selectedModel || availableModels.length === 0}
                  className="cursor-pointer rounded-lg border border-[#5a4f40] bg-[#3a352e] px-3 py-2 text-xs font-medium text-[#f2dbc0] transition hover:bg-[#4a433a] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isEnhancing ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Enhancing…
                    </span>
                  ) : (
                    "✦ Enhance"
                  )}
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="mb-3 h-px bg-[#3a3835]" />

            {/* Row 2: LoRA + Strength + Ratio */}
            <div className="mb-3 flex flex-wrap items-end gap-3">

              {/* LoRA Select */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">LoRA</span>
                <div className="relative">
                  <select
                    value={selectedLora.name}
                    onChange={(e) => setSelectedLora({ ...selectedLora, name: e.target.value })}
                    disabled={isGenerating}
                    className="rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none disabled:opacity-50"
                  >
                    <option value="">None</option>
                    {AVAILABLE_LORAS.map((loraName) => (
                      <option key={loraName} value={loraName}>
                        {loraName.replace('.safetensors', '')}
                      </option>
                    ))}
                  </select>
                  <ChevronIcon />
                </div>
              </div>

              {/* Strength */}
              <div className="flex flex-col gap-1 min-w-[140px] max-w-[200px]">
                <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Strength</span>
                <div className="flex items-center gap-2 h-[34px]">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={selectedLora.strength_model}
                    onChange={(e) =>
                      setSelectedLora({ ...selectedLora, strength_model: parseFloat(e.target.value) })
                    }
                    disabled={isGenerating}
                    className="
            flex-1 h-1.5 appearance-none rounded-full outline-none
            bg-[#494741] disabled:opacity-50 cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:w-3.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[#c9a87a]
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition
            [&::-webkit-slider-thumb]:hover:bg-[#d8b88d]
            [&::-moz-range-thumb]:h-3.5
            [&::-moz-range-thumb]:w-3.5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-[#c9a87a]
            [&::-moz-range-thumb]:border-0
          "
                  />
                  <span className="w-9 text-center rounded-md bg-[#262624] border border-[#494741] py-0.5 text-[11px] tabular-nums text-[#c9a87a]">
                    {selectedLora.strength_model.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Dimensions */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Width</span>
                  <input
                    type="number"
                    value={imageWidth}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 512;
                      setImageWidth(val);
                      if (lockAspectRatio && imageHeight > 0) {
                        const aspectRatio = imageWidth / imageHeight;
                        setImageHeight(Math.round(val / aspectRatio));
                      }
                    }}
                    disabled={isGenerating}
                    min={256}
                    max={4096}
                    step={8}
                    className="w-20 rounded-lg border border-[#494741] bg-[#262624] px-2 py-2 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] disabled:opacity-50"
                  />
                </div>

                <button
                  onClick={() => setLockAspectRatio(!lockAspectRatio)}
                  disabled={isGenerating}
                  className={`mb-0.5 rounded-lg border p-1.5 transition disabled:opacity-50 ${lockAspectRatio ? "border-[#c9a87a] text-[#c9a87a]" : "border-[#494741] text-[#6b6560]"}`}
                  title="Lock aspect ratio"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </button>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Height</span>
                  <input
                    type="number"
                    value={imageHeight}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 512;
                      setImageHeight(val);
                      if (lockAspectRatio && imageHeight > 0) {
                        const aspectRatio = imageWidth / imageHeight;
                        setImageWidth(Math.round(val * aspectRatio));
                      }
                    }}
                    disabled={isGenerating}
                    min={256}
                    max={4096}
                    step={8}
                    className="w-20 rounded-lg border border-[#494741] bg-[#262624] px-2 py-2 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] disabled:opacity-50"
                  />
                </div>

                {/* Seed */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Seed</span>
                  <input
                    type="text"
                    value={imageSeed}
                    onChange={(e) => setImageSeed(e.target.value)}
                    placeholder="Optional"
                    disabled={isGenerating}
                    className="w-28 rounded-lg border border-[#494741] bg-[#262624] px-2 py-2 text-xs text-[#edeae2] outline-none transition placeholder:text-[#6b6560] focus:border-[#b9986d] disabled:opacity-50"
                  />
                </div>
              </div>

            </div>

            {/* Divider */}
            <div className="mb-3 h-px bg-[#3a3835]" />

            {/* Row 3: Prompt */}
            <div className="relative">
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="Describe the scene, mood, lens, and details…"
                rows={4}
                disabled={isGenerating}
                className="w-full resize-none rounded-xl border border-[#494741] bg-[#262624] px-3 py-3 text-sm text-[#ece8df] outline-none transition placeholder:text-[#6b6560] focus:border-[#b9986d] disabled:opacity-60"
              />

              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-[#6b6560]">Shift + Enter for new line</span>

                <button
                  onClick={generateImage}
                  disabled={isGenerating || !prompt.trim()}
                  className="cursor-pointer flex items-center gap-1.5 rounded-lg bg-[#c9a87a] px-4 py-2 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isGenerating ? (
                    <>
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                      </svg>
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {gallery.length > 0 && (
            <div className="space-y-3 pt-4 max-w-5xl m-auto pb-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.24em] text-[#a19a8d]">Library</p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5 rounded-lg border border-[#3f3e3a] bg-[#262624] p-0.5">
                    {filterStyles.map((style) => (
                      <button
                        key={style}
                        onClick={() => setGalleryFilter(style)}
                        className={`cursor-pointer rounded-[12px] px-4 py-1 text-[11px] capitalize transition-all duration-200 ${galleryFilter === style
                          ? "bg-[#c9a87a] text-[#1f1f1d]"
                          : "text-[#9f988c] hover:text-[#edeae2]"
                          }`}
                      >
                        {style} <span className={`ml-0.5 bg-white rounded-sm px-1 text-black text-[11px] ${galleryFilter === style ? "opacity-70" : "opacity-50"}`}>{styleCounts[style]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {paginatedGallery.map((item) => {
                  const originalIndex = gallery.findIndex((g) => g.filename === item.filename);
                  const isSelected = selectedForDeletion.has(item.filename);
                  return (
                    <div
                      key={item.filename}
                      onClick={() => {
                        if (isSelectMode) {
                          setSelectedForDeletion(prev => {
                            const next = new Set(prev);
                            if (next.has(item.filename)) {
                              next.delete(item.filename);
                            } else {
                              next.add(item.filename);
                            }
                            return next;
                          });
                        } else {
                          window.open(`/generated/${item.filename}`, "_blank");
                        }
                      }}
                      className={`group relative overflow-hidden rounded-xl border bg-[#32312e] cursor-pointer transition ${isSelectMode
                        ? isSelected ? "border-[#c9a87a] ring-2 ring-[#c9a87a]/50" : "border-[#3f3e3a] hover:border-[#5a5550]"
                        : "border-[#3f3e3a] hover:border-[#5a5550]"
                        }`}
                    >
                      {isSelectMode && (
                        <div className={`absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border-2 transition ${isSelected
                          ? "border-[#c9a87a] bg-[#c9a87a]" : "border-white/50 bg-black/30"
                          }`}>
                          {isSelected && (
                            <svg className="h-3 w-3 text-[#1f1f1d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                      <img
                        src={`/generated/${item.filename}`}
                        alt={item.prompt}
                        className={`aspect-square w-full object-cover transition duration-500 group-hover:scale-105 ${item.hidden ? "blur-xl" : ""}`}
                        loading="lazy"
                      />
                      <div className="absolute inset-x-0 top-0 -translate-y-full p-2 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                        <div className="flex items-center justify-end">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleImageVisibility(originalIndex);
                              }}
                              className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                {item.hidden ? (
                                  <>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </>
                                ) : (
                                  <>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75a3 3 0 000 4.5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 14.25a3 3 0 000-4.5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                                  </>
                                )}
                              </svg>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(item.prompt); }}
                              className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                              title="Copy Prompt"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                            {item.seed !== undefined && (
                              <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(String(item.seed)); }}
                                className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                                title="Copy Seed"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedImageForUpscale(item);
                              }}
                              className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                              title="Upscale Image"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); useImageForVideo(item); }}
                              className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                              title="Use for Video"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openConfirm("Delete Image", "This will delete the image from the server.", () => deleteImage(originalIndex));
                              }}
                              className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-block rounded-md bg-[#c9a87a]/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#d8b88d] backdrop-blur-sm border border-[#c9a87a]/30">
                            {item.style}
                          </span>
                          {item.seed !== undefined && (
                            <span className="inline-block rounded-md bg-[#494741]/60 px-2 py-0.5 text-[9px] font-mono text-[#9f988c] backdrop-blur-sm border border-[#5a5550]">
                              #{item.seed}
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-[#e7e2d8] opacity-90">{item.prompt}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <button
                    onClick={() => setGalleryPage(Math.max(1, galleryPage - 1))}
                    disabled={galleryPage === 1}
                    className="rounded-lg border border-[#494741] px-3 py-1.5 text-xs text-[#bcb6aa] transition hover:border-[#5a4f40] hover:text-[#edeae2] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-[#9f988c]">
                    {galleryPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setGalleryPage(Math.min(totalPages, galleryPage + 1))}
                    disabled={galleryPage === totalPages}
                    className="rounded-lg border border-[#494741] px-3 py-1.5 text-xs text-[#bcb6aa] transition hover:border-[#5a4f40] hover:text-[#edeae2] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <ImageUpscaleDialog
        isOpen={selectedImageForUpscale !== null}
        onClose={() => setSelectedImageForUpscale(null)}
        image={selectedImageForUpscale || { filename: '', prompt: '' }}
        onSuccess={(newImage) => {
          setGallery((prev) => {
            const updated = [newImage, ...prev];
            localStorage.setItem("comfyui_gallery", JSON.stringify(updated));
            return updated;
          });
          setSelectedImageForUpscale(null);
        }}
      />
    </>
  );
}
