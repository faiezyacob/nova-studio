'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { GalleryItem, HistoryEntry, Lora } from "@/types";
import ImageUpscaleDialog from "./ImageUpscaleDialog";
import SceneBlueprintViewer from "./SceneBlueprintViewer";
import { db } from "@/utils/db";

const AVAILABLE_LORAS = [
  "RealisticSnapshot-Zimage-Turbov5.safetensors",
  "krea2_realism_lora.safetensors",
];

const STYLE_DESCRIPTIONS: Record<string, string> = {
  realistic: `
- ALWAYS describe as a candid photo taken on a modern smartphone camera in everyday conditions
- lighting must feel completely uncontrolled and ambient: harsh overhead indoor LEDs, mixed color temperature from multiple sources, flat overcast daylight, warm yellow tungsten, or uneven window light casting hard shadows
- include authentic phone camera artifacts: digital noise in shadow areas, luminance grain in low light, color smearing in highlights, lens flare from bright sources, slight barrel distortion at edges
- skin tones should appear slightly processed by computational photography: oversharpened edges, smoothed textures, unnatural micro-contrast from HDR merging
- colors may appear slightly oversaturated or shifted depending on auto white balance guessing incorrectly
- compression artifacts are acceptable especially in busy texture areas or gradients
- depth of field should feel like a phone sensor: mostly everything in focus unless portrait mode is active, in which case edge masking may appear slightly unnatural around hair or complex outlines
- composition is accidental or rushed: subject may be slightly cut off, tilted horizon, dead center framing, or too much empty space
- backgrounds should feel real and lived-in: generic interiors, ordinary streets, unremarkable environments
- avoid any cinematic framing, dramatic lighting, professional composition, or artistic intent
- avoid clean studio-like results, avoid beautiful bokeh, avoid color grading of any kind
- the image should feel like something pulled from someone's camera roll without a second thought
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

function beautifyIfJson(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

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
    <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle">
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
  const [showBlueprintPanel, setShowBlueprintPanel] = useState(false);
  const [imageSeed, setImageSeed] = useState<string>("");
  const [imageWorkflow, setImageWorkflow] = useState<string>("z-image-turbo");
  const [sageAttention, setSageAttention] = useState(true);
  const [kreaRebalance, setKreaRebalance] = useState(true);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [isRepairing, setIsRepairing] = useState(false);
  const [progress, setProgress] = useState<{ value: number; max: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const itemsPerPage = 12;

  const pollForResult = async (promptId: string, promptText: string, seed: number, width: number, height: number, generationStartTime: number) => {
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
              width: width,
              height: height,
              generationTime: Math.round((Date.now() - generationStartTime) / 100) / 10,
            }));

            await Promise.all(
              newItems.map((item) => fetch(`/api/comfy/images?filename=${item.filename}`).catch(console.error)),
            );

            const updated = [...newItems, ...gallery];
            setGallery(updated);
            await db.set("comfyui_gallery", updated);

            toast.success("Image ready", { id: "generation" });
            return;
          }
        }
      } catch {
      }

      attempts += 1;
      toast.loading(`Generating${".".repeat((attempts % 4) + 1)}`, { id: "generation" });
    }

    toast.error("Timed out. Check ComfyUI.", { id: "generation" });
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;

    const generationStartTime = Date.now();
    const generationId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    window.dispatchEvent(new Event('vram-stats-request'));
    setIsGenerating(true);
    setProgress(null);

    let eventSource: EventSource | null = null;

    try {
      if (currentModel) {
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

      toast.loading("Generating...", { id: "generation" });

      try {
        eventSource = new EventSource(`/api/comfy/progress?generationId=${generationId}`);
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'progress') {
              setProgress({ value: data.value, max: data.max });
            }
          } catch { /* ignore malformed messages */ }
        };
        eventSource.onerror = () => {
          console.warn('[IMAGE] SSE connection failed, continuing without progress bar');
        };
      } catch (e) {
        console.warn('[IMAGE] Failed to create SSE connection:', e);
      }

      const response = await fetch("/api/comfy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Generation-Id": generationId,
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          width: finalWidth,
          height: finalHeight,
          workflow: imageWorkflow,
          loras: imageWorkflow === 'ideogram4' ? [] : (selectedLora.name ? [selectedLora] : []),
          seed: imageSeed ? parseInt(imageSeed) : undefined,
          sageAttention,
          kreaRebalance
        }),
      });

      if (!response.ok) throw new Error("Failed to start generation");
      const result = await response.json();
      const generatedSeed = result.seed;

      let newItems: GalleryItem[] = [];

      if (result.images && result.images.length > 0) {
        newItems = result.images.map((imgUrl: string) => ({
          filename: imgUrl.split('/').pop() || `gen_${Date.now()}.png`,
          prompt: prompt.trim(),
          timestamp: Date.now(),
          style: imageStyle,
          seed: generatedSeed,
          width: finalWidth,
          height: finalHeight,
          generationTime: Math.round((Date.now() - generationStartTime) / 100) / 10,
        }));

        await Promise.all(
          newItems.map((item) => fetch(`/api/comfy/images?filename=${item.filename}`).catch(console.error)),
        );
      } else {
        await pollForResult(result.prompt_id, prompt.trim(), generatedSeed, finalWidth, finalHeight, generationStartTime);
        return;
      }

      const updated = [...newItems, ...gallery];
      setGallery(updated);
      await db.set("comfyui_gallery", updated);

      toast.success("Image ready", { id: "generation" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message, { id: "generation" });
    } finally {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      setIsGenerating(false);
      setProgress(null);
      window.dispatchEvent(new Event('vram-stats-request'));
    }
  };

  const visualReasoningSystemPrompt = `
  You are a STRICT JSON GENERATOR for Ideogram 4.0.

Your ONLY job is to output a single valid minified JSON object.
No markdown. No explanations. No extra text.

The output must be fully parseable by JSON.parse().

If anything is missing from the user prompt, you must infer a visually reasonable value.
Never output null, undefined, partial JSON, or placeholders.

You MUST silently self-correct before output if the JSON is invalid.

────────────────────────
HARD OUTPUT RULES
────────────────────────

- Output ONLY one JSON object
- No markdown or code fences
- No comments
- No trailing commas
- All keys must use double quotes
- All strings must use double quotes
- Must be valid minified JSON
- Must contain EXACTLY these top-level keys in order:
  1. "high_level_description"
  2. "style_description"
  3. "compositional_deconstruction"

────────────────────────
SCHEMA
────────────────────────

1. "high_level_description"
- Start directly with the subject
- Include subject, action, environment, mood, and spatial placement
- Must mention composition (center, left, right, foreground, etc.)

────────────────────────

2. "style_description"

Must contain EXACTLY:

{
  "aesthetics": "3–20 comma-separated visual descriptors",
  "lighting": "explicit light source, direction, and shadow behavior",
  "medium": "photograph | illustration | 3d_render | graphic_design | painting | sketch | pixel_art | printmaking | collage | comic",
  "art_style": "ONLY if medium is not photograph. Otherwise omit this key",
  "color_palette": ["#RRGGBB", "#RRGGBB", "#RRGGBB"]
}

RULES:
- "aesthetics" = comma-separated ONLY (no sentences)
- "lighting" must name real light sources (sunlight, studio softbox, neon sign, etc.)
- "color_palette" must contain exactly 3 hex colors
- If medium = "photograph", DO NOT include "art_style"

────────────────────────
SELECTED STYLE
────────────────────────

${STYLE_DESCRIPTIONS[imageStyle] || ""}

IMPORTANT:

The selected style must influence the generated JSON.

The style should primarily affect:
- high_level_description
- style_description.aesthetics
- style_description.lighting
- style_description.medium
- style_description.art_style (when applicable)
- background mood and atmosphere

Do not merely describe the subject.
Describe the scene as if it naturally exists in the selected style.

────────────────────────

3. "compositional_deconstruction"

Must contain:

{
  "background": "at least 3 sentences describing environment only",
  "elements": [ ... ]
}

────────────────────────

ELEMENTS

Object:

{
  "type":"obj",
  "desc":"detailed visual description",
  "bbox":[y_min,x_min,y_max,x_max]
}

Text:

{
  "type":"text",
  "text":"exact text",
  "desc":"font style, size, color, placement",
  "bbox":[y_min,x_min,y_max,x_max]
}

BBOX RULES

- bbox is a MUST in any object or text element if the prompt implies a specific spatial placement or composition
- bbox MUST be an array of four integers
- bbox is required for text or obj elements
- Format: [y_min,x_min,y_max,x_max]
- Values must be between 0 and 1000
- Never output bbox as a string
- Never output unnamed coordinate arrays

────────────────────────
STRICT CHARACTER RULES
────────────────────────

If an element is a character, it MUST include:

- age group
- skin tone or species description
- hair/headwear (mandatory)
- clothing (fabric + color)
- expression
- pose
- position in scene

All character details must be inside ONE element.
Do NOT split characters into multiple elements.

────────────────────────
BACKGROUND RULES
────────────────────────

Background may ONLY include:
- sky
- ground
- terrain
- walls
- atmosphere
- distant scenery

DO NOT include:
- characters
- objects
- props
- furniture

────────────────────────
VALIDATION RULES (must self-check)
────────────────────────

Before output:
- JSON must be valid
- All required fields present
- No missing commas/brackets
- No duplicate schema levels
- No extra keys
- Must strictly match schema structure

If invalid → regenerate internally before responding.

────────────────────────
EXAMPLE OUTPUT (FOLLOW THIS STRUCTURE EXACTLY)
────────────────────────

{
  "high_level_description":"Sonic the Hedgehog sits at center frame on a wooden chair holding a melting vanilla ice cream cone in his right hand. His body is angled slightly toward the viewer with a relaxed seated posture and energetic expression. The scene is placed in a minimalist studio environment with a playful mood and bright composition.",
  "style_description":{
    "aesthetics":"vibrant, colorful, expressive, stylized proportions, high contrast",
    "lighting":"bright studio softbox overhead, soft shadows under chair, gentle highlights on character",
    "medium":"illustration",
    "art_style":"Pixar animation, soft gradient shading, clean hard silhouettes, soft ambient occlusion, no surface texture",
    "color_palette":["#0055FF","#FFFFFF","#E6E6E6"]
  },
  "compositional_deconstruction":{
    "background":"A minimalist studio environment with a smooth light gray floor and a soft pastel blue backdrop. The atmosphere is clean and uncluttered with subtle confetti pieces floating in the air. Lighting is even and controlled, creating soft gradients across the space.",
    "elements":[
      {
        "type":"obj",
        "desc":"Sonic the Hedgehog, youthful anthropomorphic blue hedgehog with cobalt fur, green eyes, spiky quills, wearing white gloves and red sneakers, seated at center frame on a wooden chair, relaxed pose, holding ice cream cone, cheerful expression"
      },
      {
        "type":"obj",
        "desc":"simple wooden chair with four legs and straight backrest positioned at center frame beneath Sonic"
      },
      {
        "type":"obj",
        "desc":"vanilla ice cream cone with melting texture held in Sonic's right hand"
      }
    ]
  }
}
  `
;

  const repairIdeogramJson = async (brokenJson: string): Promise<string | null> => {
    const repairSystemPrompt = `You fix broken JSON. Output ONLY valid minified JSON. No markdown, no code fences, no explanations.`;

    const repairUserPrompt = `Fix the following broken JSON so it is valid and parseable by JSON.parse().

Rules:
- Output ONLY valid minified JSON
- No markdown, no code fences, no explanations
- Fix missing quotes, trailing commas, unclosed brackets, unescaped characters
- Preserve the original structure and values
- If something is unfixable, infer a reasonable default
- Never output partial or truncated JSON

Broken JSON:
${brokenJson}`;

    try {
      const response = await fetch("/api/lmstudio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: repairSystemPrompt },
            { role: "user", content: repairUserPrompt },
          ],
          temperature: 0,
        }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      JSON.parse(jsonMatch[0]);
      return jsonMatch[0];
    } catch {
      return null;
    }
  };

  const repairCurrentJson = async () => {
    if (!prompt.trim() || !selectedModel) return;

    await db.set("loaded_model", selectedModel);
    setIsRepairing(true);
    try {
      const repaired = await repairIdeogramJson(prompt.trim());
      if (repaired) {
        setPrompt(beautifyIfJson(repaired));
        toast.success("JSON repaired");
      } else {
        toast.error("Could not repair JSON");
      }
    } catch {
      toast.error("Failed to repair JSON");
    } finally {
      setIsRepairing(false);
    }
  };

  const enhancePrompt = async () => {
    if (!prompt.trim() || !selectedModel) return;

    await db.set("loaded_model", selectedModel);

    const isIdeogram = imageWorkflow === 'ideogram4';
    const systemPrompt = isIdeogram ? visualReasoningSystemPrompt : `
You are a prompt enhancer optimized for the z-image-turbo / Krea2 turbo model.
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
${STYLE_DESCRIPTIONS[imageStyle] || ""}
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
          temperature: isIdeogram ? 0.7 : 0.4
        }),
      });

      if (!response.ok) throw new Error("Failed to enhance prompt");
      const data = await response.json();
      const rawText =
        data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || "";

      let enhanced: string | null = null;

      if (isIdeogram) {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let jsonStr = jsonMatch[0].trim().replace(/\\(")/g, '$1');
          try {
            JSON.parse(jsonStr);
            enhanced = beautifyIfJson(jsonStr);
          } catch {
            toast.loading("Fixing broken JSON...", { id: "json-repair" });
            const repaired = await repairIdeogramJson(jsonStr);
            if (repaired) {
              enhanced = beautifyIfJson(repaired);
              toast.success("JSON repaired", { id: "json-repair" });
            } else {
              toast.error("Auto-repair failed. Try the Repair JSON button.", { id: "json-repair" });
              enhanced = beautifyIfJson(jsonStr);
            }
          }
        } else {
          enhanced = rawText.trim();
        }
      } else {
        const match = rawText.match(/<prompt>([\s\S]*?)<\/prompt>/i);
        enhanced =
          match?.[1]?.trim() ||
          rawText
            .split("\n")
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 20 && !line.match(/<|>|{|}|\[|\]|```|^[-*]/))
            .pop() ||
          prompt;
        enhanced = (enhanced ?? prompt).replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
      }

      if (enhanced && enhanced !== prompt) {
        setPrompt(enhanced);
        toast.success(isIdeogram ? "Visual plan created" : "Prompt enhanced");
      } else {
        toast.error("Enhancement failed");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to enhance prompt");
    } finally {
      setIsEnhancing(false);
      window.dispatchEvent(new Event('vram-stats-request'));
    }
  };

  const clearGallery = async () => {
    try {
      await fetch("/api/comfy/images?type=image", { method: "DELETE" });
    } catch {
    }

    setGallery([]);
    await db.remove("comfyui_gallery");
    toast.success("Gallery cleared");
    closeConfirm();
  };

  const deleteImage = async (index: number, showToast = true) => {
    const item = gallery[index];
    if (!item) return;

    try {
      await fetch(`/api/comfy/images?filename=${item.filename}`, { method: "DELETE" });
    } catch {
    }

    const updated = gallery.filter((_, i) => i !== index);
    setGallery(updated);
    await db.set("comfyui_gallery", updated);
    if (showToast) {
      toast.success("Deleted");
      closeConfirm();
    }
  };

  const toggleImageVisibility = async (index: number) => {
    const updated = gallery.map((item, i) =>
      i === index ? { ...item, hidden: !item.hidden } : item
    );
    setGallery(updated);
    await db.set("comfyui_gallery", updated);
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
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-surface-3/95 px-8 py-5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-gold" />
            <div>
              <h1 className="text-base font-semibold text-text-primary">Image Workspace</h1>
              <p className="text-xs text-text-muted">Prompt, enhance, generate, iterate.</p>
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
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${isSelectMode ? "border-gold text-gold" : "border-border-strong text-gold-dim hover:border-gold-focus hover:text-gold-hover"}`}
                >
                  {isSelectMode ? "Cancel" : "Select"}
                </button>
                {isSelectMode && selectedForDeletion.size > 0 && (
                  <button
                    onClick={() => openConfirm("Delete Selected", `Delete ${selectedForDeletion.size} image(s)?`, async () => {
                      const filenames = Array.from(selectedForDeletion);
                      const deleteFromGallery = gallery.filter(item => selectedForDeletion.has(item.filename));
                      const deleteFromServer = async () => {
                        for (const item of deleteFromGallery) {
                          try {
                            await fetch(`/api/comfy/images?filename=${item.filename}`, { method: "DELETE" });
                          } catch {
                          }
                        }
                      };
                      deleteFromServer();
                      const updated = gallery.filter(item => !selectedForDeletion.has(item.filename));
                      setGallery(updated);
                      await db.set("comfyui_gallery", updated);
                      toast.success(`Deleted ${filenames.length} image(s)`);
                      closeConfirm();
                      setSelectedForDeletion(new Set());
                      setIsSelectMode(false);
                    })}
                    className="rounded-lg border border-error/30 px-3 py-1.5 text-xs text-error transition hover:border-error hover:text-[#f87171]"
                  >
                    Delete ({selectedForDeletion.size})
                  </button>
                )}
                <button
                  onClick={() => openConfirm("Clear Gallery", "This will delete all images from the server.", () => clearGallery())}
                  className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-gold-dim transition hover:border-gold-focus hover:text-gold-hover"
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
          <div className="rounded-2xl border border-border-subtle bg-surface-3 max-w-5xl m-auto p-4 shadow-[var(--shadow-card)]">

            {/* Row 1: LLM + Engine + Style + Enhance */}
            <div className="mb-3 flex flex-wrap items-stretch gap-3">

              {/* LLM Model (for Enhance) */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-text-subtle">LLM</span>
                <div className="relative min-w-[140px] max-w-[200px]">
                  <select
                    value={selectedModel}
                    onChange={(e) => switchModel(e.target.value)}
                    disabled={isEnhancing || isGenerating || availableModels.length === 0}
                    className="w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 pr-8 text-xs text-text-primary outline-none transition focus:border-gold-focus appearance-none truncate disabled:opacity-50"
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

              {/* Image Engine */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-text-subtle">Engine</span>
                <div className="relative min-w-[140px] max-w-[200px]">
                  <select
                    value={imageWorkflow}
                    onChange={(e) => setImageWorkflow(e.target.value)}
                    disabled={isGenerating}
                    className="w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 pr-8 text-xs text-text-primary outline-none transition focus:border-gold-focus appearance-none truncate disabled:opacity-50"
                  >
                    <option value="z-image-turbo">Z Image Turbo</option>
                    <option value="krea2-turbo">Krea2 Turbo Enhanced</option>
                    <option value="ideogram4">Ideogram v4</option>
                  </select>
                  <ChevronIcon />
                </div>
              </div>

              {/* Sage Attention */}
              {imageWorkflow !== 'ideogram4' && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-text-subtle">Sage Attn</span>
                  <button
                    onClick={() => setSageAttention(!sageAttention)}
                    disabled={isGenerating}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition disabled:opacity-50 ${
                      sageAttention
                        ? "border-gold/50 bg-hover text-gold-dim"
                        : "border-border-strong bg-surface-2 text-text-subtle"
                    }`}
                    title="Toggle Sage Attention optimization"
                  >
                    <span className={`h-2 w-2 rounded-full ${sageAttention ? "bg-gold" : "bg-text-subtle"}`} />
                    {sageAttention ? "On" : "Off"}
                  </button>
                </div>
              )}

              {/* Krea Rebalance */}
              {imageWorkflow === 'krea2-turbo' && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-text-subtle">Rebalance</span>
                  <button
                    onClick={() => setKreaRebalance(!kreaRebalance)}
                    disabled={isGenerating}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition disabled:opacity-50 ${
                      kreaRebalance
                        ? "border-gold/50 bg-hover text-gold-dim"
                        : "border-border-strong bg-surface-2 text-text-subtle"
                    }`}
                    title="Toggle ConditioningKrea2Rebalance"
                  >
                    <span className={`h-2 w-2 rounded-full ${kreaRebalance ? "bg-gold" : "bg-text-subtle"}`} />
                    {kreaRebalance ? "On" : "Off"}
                  </button>
                </div>
              )}

              {/* Style */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-text-subtle">Style</span>
                <div className="relative">
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value)}
                    disabled={isGenerating}
                    className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 pr-8 text-xs text-text-primary outline-none transition focus:border-gold-focus appearance-none disabled:opacity-50"
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

              {/* Enhance + Repair */}
              <div className="ml-auto flex items-center gap-2">
                {imageWorkflow === 'ideogram4' && (
                  <>
                    <button
                      onClick={() => setShowBlueprintPanel(true)}
                      disabled={isGenerating || !prompt.trim()}
                      className="cursor-pointer rounded-lg border border-cyan/50 bg-cyan/[0.08] px-3 py-2 text-xs font-medium text-cyan transition hover:bg-cyan/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                      title="Preview object positions from bbox coordinates"
                    >
                      <span className="flex items-center gap-1.5">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                        Preview Layout
                      </span>
                    </button>
                    <button
                      onClick={repairCurrentJson}
                      disabled={isRepairing || isEnhancing || !prompt.trim() || !selectedModel || availableModels.length === 0}
                      className="cursor-pointer rounded-lg border border-gold-dim/40 bg-hover px-3 py-2 text-xs font-medium text-gold-dim transition hover:bg-active disabled:cursor-not-allowed disabled:opacity-40"
                      title="Fix invalid JSON in the prompt field"
                    >
                      {isRepairing ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Fixing…
                        </span>
                      ) : (
                        "⚡ Repair JSON"
                      )}
                    </button>
                  </>
                )}
                <button
                  onClick={enhancePrompt}
                  disabled={isEnhancing || !prompt.trim() || !selectedModel || availableModels.length === 0}
                  className="cursor-pointer rounded-lg border border-gold-dim/40 bg-hover px-3 py-2 text-xs font-medium text-gold-dim transition hover:bg-active disabled:cursor-not-allowed disabled:opacity-40"
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
            <div className="mb-3 h-px bg-border-subtle" />

            {/* Row 2: LoRA + Strength + Ratio */}
            <div className="mb-3 flex flex-wrap items-end gap-3">

              {imageWorkflow !== 'ideogram4' && (
                <>
                  {/* LoRA Select */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-text-subtle">LoRA</span>
                    <div className="relative">
                      <select
                        value={selectedLora.name}
                        onChange={(e) => setSelectedLora({ ...selectedLora, name: e.target.value })}
                        disabled={isGenerating}
                        className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 pr-8 text-xs text-text-primary outline-none transition focus:border-gold-focus appearance-none disabled:opacity-50"
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
                    <span className="text-[10px] uppercase tracking-widest text-text-subtle">Strength</span>
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
                bg-border-strong disabled:opacity-50 cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:h-3.5
                [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-gold
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:transition
                [&::-webkit-slider-thumb]:hover:bg-gold-hover
                [&::-moz-range-thumb]:h-3.5
                [&::-moz-range-thumb]:w-3.5
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-gold
                [&::-moz-range-thumb]:border-0
              "
                      />
                      <span className="w-9 text-center rounded-md bg-surface-2 border border-border-strong py-0.5 text-[11px] tabular-nums text-gold">
                        {selectedLora.strength_model.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Dimensions */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-text-subtle">Width</span>
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
                    className="w-20 rounded-lg border border-border-strong bg-surface-2 px-2 py-2 text-xs text-text-primary outline-none transition focus:border-gold-focus disabled:opacity-50"
                  />
                </div>

                <button
                  onClick={() => setLockAspectRatio(!lockAspectRatio)}
                  disabled={isGenerating}
                  className={`mb-0.5 rounded-lg border p-1.5 transition disabled:opacity-50 ${lockAspectRatio ? "border-gold text-gold" : "border-border-strong text-text-subtle"}`}
                  title="Lock aspect ratio"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </button>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-text-subtle">Height</span>
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
                    className="w-20 rounded-lg border border-border-strong bg-surface-2 px-2 py-2 text-xs text-text-primary outline-none transition focus:border-gold-focus disabled:opacity-50"
                  />
                </div>

                {/* Seed */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-text-subtle">Seed</span>
                  <input
                    type="text"
                    value={imageSeed}
                    onChange={(e) => setImageSeed(e.target.value)}
                    placeholder="Optional"
                    disabled={isGenerating}
                    className="w-28 rounded-lg border border-border-strong bg-surface-2 px-2 py-2 text-xs text-text-primary outline-none transition placeholder:text-text-subtle focus:border-gold-focus disabled:opacity-50"
                  />
                </div>
              </div>

            </div>

            {/* Divider */}
            <div className="mb-3 h-px bg-border-subtle" />

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
                className="w-full resize-none rounded-xl border border-border-strong bg-surface-2 px-3 py-3 text-sm text-text-primary outline-none transition placeholder:text-text-subtle focus:border-gold-focus disabled:opacity-60"
              />

              <div className="mt-2 flex flex-col gap-3">
                {isGenerating && (
                  <div className="rounded-lg border border-border-strong bg-surface-2 p-3">
                    <div className="mb-1.5 flex items-center justify-between text-xs text-text-secondary">
                      <span>{progress ? `Generating... ${progress.value}/${progress.max}` : 'Starting generation...'}</span>
                      {progress && <span>{Math.round((progress.value / progress.max) * 100)}%</span>}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-active">
                      <div
                        className={`h-full rounded-full bg-gold ${progress ? 'transition-all duration-500 ease-out' : 'animate-pulse'}`}
                        style={progress ? { width: `${Math.min(100, (progress.value / progress.max) * 100)}%` } : { width: '30%' }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-subtle">Shift + Enter for new line</span>

                  <button
                    onClick={generateImage}
                    disabled={isGenerating || !prompt.trim()}
                    className="cursor-pointer flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-[#1f1f1d] transition hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
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
          </div>

          {showBlueprintPanel && (
            <SceneBlueprintViewer
              prompt={prompt}
              onClose={() => setShowBlueprintPanel(false)}
              onChange={setPrompt}
            />
          )}

          {gallery.length > 0 && (
            <div className="space-y-3 pt-4 max-w-5xl m-auto pb-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.24em] text-text-muted">Library</p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5 rounded-lg border border-border-subtle bg-surface-2 p-0.5">
                    {filterStyles.map((style) => (
                      <button
                        key={style}
                        onClick={() => setGalleryFilter(style)}
                        className={`cursor-pointer rounded-[12px] px-4 py-1 text-[11px] capitalize transition-all duration-200 ${galleryFilter === style
                          ? "bg-gold text-[#1f1f1d]"
                          : "text-text-muted hover:text-text-primary"
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
                      className={`group relative overflow-hidden rounded-xl border bg-surface-2 cursor-pointer transition ${isSelectMode
                        ? isSelected ? "border-gold ring-2 ring-gold/50" : "border-border-subtle hover:border-border-strong"
                        : "border-border-subtle hover:border-border-strong"
                        }`}
                    >
                      {isSelectMode && (
                        <div className={`absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border-2 transition ${isSelected
                          ? "border-gold bg-gold" : "border-white/50 bg-black/30"
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
                        alt={beautifyIfJson(item.prompt)}
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
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(beautifyIfJson(item.prompt)); }}
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
                          <span className="inline-block rounded-md bg-gold/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#d8b88d] backdrop-blur-sm border border-gold/30">
                            {item.style}
                          </span>

                          {item.generationTime !== undefined && (
                            <span className="inline-block rounded-md bg-[#4a5a3a]/60 px-2 py-0.5 text-[9px] font-mono text-[#a0c080] backdrop-blur-sm border border-[#5a6a4a]">
                              {item.generationTime}s
                            </span>
                          )}

                          {item.seed !== undefined && (
                            <span className="inline-block rounded-md bg-border-strong/60 px-2 py-0.5 text-[9px] font-mono text-text-muted backdrop-blur-sm border border-border-strong">
                              #{item.seed}
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-text-primary opacity-90">{beautifyIfJson(item.prompt)}</p>
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
                    className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary transition hover:border-gold-dim/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-text-muted">
                    {galleryPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setGalleryPage(Math.min(totalPages, galleryPage + 1))}
                    disabled={galleryPage === totalPages}
                    className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary transition hover:border-gold-dim/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
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
        onSuccess={async (newImage) => {
          const updated = [newImage, ...gallery];
          setGallery(updated);
          await db.set("comfyui_gallery", updated);
          setSelectedImageForUpscale(null);
        }}
      />
    </>
  );
}
