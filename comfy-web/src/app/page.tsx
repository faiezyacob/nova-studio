'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Toaster, toast } from "sonner";

function MessageContent({ content }: { content: string }) {
  const formatInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={i} className="rounded bg-[#1f1f1d] px-1.5 py-0.5 text-[#d8bb92] font-mono text-xs">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("~~") && part.endsWith("~~")) {
        return <del key={i} className="text-[#9f988c]">{part.slice(2, -2)}</del>;
      }
      return part;
    });
  };

  const formatted = useMemo(() => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let itemKey = 0;

    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let liGroup: React.ReactNode[] = [];
    const flushLiGroup = () => {
      if (liGroup.length > 0) {
        elements.push(
          <ul key={`ul-${itemKey++}`} className="my-1 space-y-1">
            {liGroup.map((content, idx) => (
              <li key={`li-${itemKey}-${idx}`} className="ml-2 list-disc">
                {content}
              </li>
            ))}
          </ul>
        );
        liGroup = [];
      }
    };

    const stripMarkdown = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/~~([^~]+)~~/g, "$1");

    const flushCodeBlock = () => {
      if (codeBlockLines.length > 0) {
        const codeText = stripMarkdown(codeBlockLines.join("\n")).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        elements.push(
          <pre key={`code-${itemKey++}`} className="group relative my-2 rounded-lg bg-[#1f1f1d] p-3 text-xs text-[#d8bb92] font-mono overflow-x-auto">
            <button
              onClick={() => { navigator.clipboard.writeText(codeText); toast.success("Copied"); }}
              className="absolute right-2 top-2 rounded bg-[#3a3936] px-2 py-1 text-[10px] text-[#bcb6aa] opacity-0 transition group-hover:opacity-100 hover:bg-[#4a463f] hover:text-[#f2dbc0]"
            >
              Copy
            </button>
            <code>{codeText}</code>
          </pre>
        );
        codeBlockLines = [];
      }
    };

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        if (inCodeBlock) {
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          flushLiGroup();
          inCodeBlock = true;
        }
      } else if (inCodeBlock) {
        codeBlockLines.push(line);
      } else if (trimmed.startsWith("> ") || trimmed.startsWith(">")) {
        flushLiGroup();
        const bqText = stripMarkdown(trimmed.slice(2));
        elements.push(
          <div key={`bq-${i}`} className="group relative my-2 rounded-r-lg border-l-2 border-[#c9a87a] bg-[#1f1f1d]/50 pl-3 pr-8 py-2">
            <button
              onClick={() => { navigator.clipboard.writeText(bqText); toast.success("Copied"); }}
              className="absolute right-2 top-2 rounded bg-[#3a3936] px-2 py-1 text-[10px] text-[#bcb6aa] opacity-0 transition group-hover:opacity-100 hover:bg-[#4a463f] hover:text-[#f2dbc0]"
            >
              Copy
            </button>
            <span className="text-[#bcb6aa] italic">{formatInline(bqText)}</span>
          </div>
        );
      } else if (trimmed.startsWith("### ")) {
        flushLiGroup();
        elements.push(<h3 key={`h3-${i}`} className="mt-3 mb-1 text-sm font-semibold text-[#c9a87a]">{trimmed.slice(4)}</h3>);
      } else if (trimmed.startsWith("## ")) {
        flushLiGroup();
        elements.push(<h3 key={`h3-${i}`} className="mt-3 mb-1 text-base font-bold text-[#c9a87a]">{trimmed.slice(3)}</h3>);
      } else if (trimmed === "---") {
        flushLiGroup();
        elements.push(<hr key={`hr-${i}`} className="my-3 border-[#46443f]" />);
      } else if (/^[-*] /.test(trimmed)) {
        liGroup.push(formatInline(trimmed.replace(/^[-*] /, "")));
      } else if (/^\d+\. /.test(trimmed)) {
        liGroup.push(formatInline(trimmed.replace(/^\d+\. /, "")));
      } else {
        flushLiGroup();
        if (trimmed !== "") {
          elements.push(
            <span key={`span-${i}`} className="block">
              {formatInline(line)}
            </span>
          );
        }
      }
    });
    flushLiGroup();
    return elements;
  }, [content]);

  return <div className="leading-relaxed">{formatted}</div>;
}

interface HistoryEntry {
  outputs: {
    [nodeId: string]: {
      images?: { filename: string; subfolder: string; type: string }[];
    };
  };
}

interface GalleryItem {
  filename: string;
  prompt: string;
  timestamp: number;
  style: string;
  hidden?: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
}

type AppMode = "image" | "chat";

const STYLE_DESCRIPTIONS: Record<string, string> = {
  realistic: `
- ALWAYS describe as a low-quality photo
- ALWAYS include heavy grain (do not include film), noise
- use available light only — natural window light, warm tungsten bulbs, or dim ambient light (NEVER mention warm, fluorescent lighting, or studio lighting)
- keep it candid, unposed, slightly off-angle or tilted
- mention the photo looks like it was taken quickly on an old or mid-range smartphone (Do not mention smartphone)
- include imperfections: overexposure, or lens flare if appropriate
- avoid mentioning term that introduce color tint like warm, cool, etc.
`,
  photography: `
- ALWAYS describe as a high-resolution professional photograph
- ALWAYS use soft natural lighting with clean shadows
- ALWAYS include shallow depth of field with sharp subject and soft background
- position subject using rule of thirds or slightly off-center
- ALWAYS ensure composition feels intentional, balanced, and visually pleasing
- keep background simple, uncluttered, and non-distracting
- include fine detail and clarity in the subject
- avoid any grain, noise, blur, or imperfections
`,
  cinematic: `
- ALWAYS describe as a dramatic cinematic film still
- ALWAYS use strong directional or moody lighting
- ALWAYS include heavy contrast, deep shadows, and rich color grading
- ALWAYS add a sense of story, tension, or atmosphere like a scene from a movie
- use a widescreen composition feel with subject placed intentionally in frame
- ALWAYS include visible film grain and a color-graded tone
- keep the mood dark, intense, or emotionally charged
`,
  anime: `
- ALWAYS describe as a high-quality anime-style illustration
- ALWAYS use clean bold outlines and cel-shaded or soft anime coloring
- ALWAYS include stylized anime facial features
- use vibrant saturated colors with dynamic lighting typical of anime art
- ALWAYS match the background style to anime environments
- keep the art style consistent with modern anime aesthetics
- avoid any photorealistic elements
`,
  cgi: `
- ALWAYS describe as a high-quality photorealistic 3D CGI render
- ALWAYS include detailed physically-based materials
- ALWAYS use dramatic studio or environmental lighting with realistic shadows and reflections
- ALWAYS emphasize depth, texture detail, and render quality
- include ambient occlusion and realistic light bounce
- keep the scene polished and production-quality like a game cinematic or animated film render
- avoid any hand-drawn or painterly qualities
`,
};

const IMAGE_STYLES = ["realistic", "photography", "cinematic", "anime", "cgi"];

export default function App() {
  const [mode, setMode] = useState<AppMode>("image");
  const [modeHydrated, setModeHydrated] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [error, setError] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [currentModel, setCurrentModel] = useState("");
  const [imageStyle, setImageStyle] = useState("realistic");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modeManuallySet = useRef(false);

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  const adjustChatHeight = () => {
    const el = chatInputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  };

  const [galleryFilter, setGalleryFilter] = useState("all");

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const openConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ open: true, title, message, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmModal(null);
  };

  const handleSetMode = (newMode: AppMode) => {
    modeManuallySet.current = true;
    setMode(newMode);
  };

  const activeSession = useMemo(
    () => chatSessions.find((session) => session.id === activeSessionId),
    [chatSessions, activeSessionId],
  );

  const switchModel = async (newModel: string) => {
    if (newModel && newModel !== currentModel) {
      if (currentModel) {
        try {
          await fetch("/api/lmstudio/unload", { method: "POST" });
        } catch (err) {
          console.error("Failed to unload model:", err);
        }
      }
      setCurrentModel(newModel);
    }
    setSelectedModel(newModel);
  };

  const switchChatModel = async (newModel: string) => {
    if (!activeSessionId) return;

    setChatSessions((prev) =>
      prev.map((session) =>
        session.id === activeSessionId ? { ...session, model: newModel } : session,
      ),
    );

    if (newModel && newModel !== currentModel) {
      if (currentModel) {
        try {
          await fetch("/api/lmstudio/unload", { method: "POST" });
        } catch (err) {
          console.error("Failed to unload model:", err);
        }
      }
      setCurrentModel(newModel);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/lmstudio/models");
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map((model: { id: string }) => model.id);
        setAvailableModels(models);
        if (models.length > 0 && !selectedModel) {
          setSelectedModel(models[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch models:", err);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    const savedSessions = localStorage.getItem("chat_sessions");
    if (!savedSessions) return;

    try {
      const parsed = JSON.parse(savedSessions);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setChatSessions(parsed);
        setActiveSessionId(parsed[0].id);
      }
    } catch (e) {
      console.error("Failed to load chat sessions", e);
    }
  }, []);

  useEffect(() => {
    if (chatSessions.length > 0) {
      localStorage.setItem("chat_sessions", JSON.stringify(chatSessions));
    } else {
      localStorage.removeItem("chat_sessions");
    }
  }, [chatSessions]);

  useEffect(() => {
    if (modeManuallySet.current) {
      localStorage.setItem("app_mode", mode);
    }
  }, [mode]);

  useEffect(() => {
    const saved = localStorage.getItem("app_mode");
    if (saved === "chat" || saved === "image") {
      setMode(saved);
    }
    setModeHydrated(true);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("comfyui_gallery");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const migrated: GalleryItem[] = parsed.map((item: GalleryItem | string) => {
          if (typeof item === "string") {
            const url = new URL(item, "http://localhost");
            return {
              filename: url.searchParams.get("filename") || "unknown",
              prompt: "Previous generation",
              timestamp: Date.now(),
              style: "realistic",
            };
          }

          return {
            ...item,
            style: item.style || "realistic",
          };
        });
        setGallery(migrated);
        localStorage.setItem("comfyui_gallery", JSON.stringify(migrated));
      } else {
        setGallery(parsed);
      }
    } catch (e) {
      console.error("Failed to load gallery", e);
    }
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: `session_${Date.now()}`,
      title: `New Chat ${chatSessions.length + 1}`,
      messages: [],
      model: selectedModel || availableModels[0] || "",
      createdAt: Date.now(),
    };

    setChatSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setChatInput("");
  };

  const deleteSession = (sessionId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();

    const updated = chatSessions.filter((session) => session.id !== sessionId);
    setChatSessions(updated);

    if (activeSessionId === sessionId) {
      setActiveSessionId(updated.length > 0 ? updated[0].id : null);
    }

    toast.success("Chat deleted");
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !activeSession || isChatLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: chatInput.trim(),
      timestamp: Date.now(),
    };

    setChatSessions((prev) =>
      prev.map((session) =>
        session.id === activeSessionId
          ? { ...session, messages: [...session.messages, userMessage] }
          : session,
      ),
    );

    setChatInput("");
    setIsChatLoading(true);

    try {
      const currentSession = chatSessions.find((session) => session.id === activeSessionId);
      const modelToUse = currentSession?.model || selectedModel || availableModels[0];

      if (modelToUse && currentModel !== modelToUse) {
        if (currentModel) {
          try {
            await fetch("/api/lmstudio/unload", { method: "POST" });
          } catch {
            // Intentionally swallow unload failures so chat can still continue.
          }
        }
        setCurrentModel(modelToUse);
      }

      const messages = [
        ...(currentSession?.messages || []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage.content },
      ];

      const response = await fetch("/api/lmstudio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelToUse, messages, temperature: 0.7 }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: "assistant",
        content:
          data.choices?.[0]?.message?.content ||
          data.choices?.[0]?.message?.reasoning_content ||
          "No response",
        timestamp: Date.now(),
      };

      setChatSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId
            ? { ...session, messages: [...session.messages, assistantMessage] }
            : session,
        ),
      );

      const firstUserMsg = [...(currentSession?.messages || []), userMessage].find(
        (m) => m.role === "user",
      );

      if (firstUserMsg && currentSession) {
        const title =
          firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "");
        setChatSessions((prev) =>
          prev.map((session) => (session.id === activeSessionId ? { ...session, title } : session)),
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      toast.error(message);

      setChatSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId
            ? {
              ...session,
              messages: [
                ...session.messages,
                {
                  id: `msg_${Date.now()}_error`,
                  role: "assistant",
                  content: `Error: ${message}`,
                  timestamp: Date.now(),
                },
              ],
            }
            : session,
        ),
      );
    } finally {
      setIsChatLoading(false);
    }
  };

  const enhancePrompt = async () => {
    if (!prompt.trim() || !selectedModel) return;

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
          temperature: 0.4,
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

  const pollForResult = async (promptId: string, promptText: string) => {
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
    setError("Generation timed out.");
  };

  const generateImage = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError("");

    try {
      if (currentModel) {
        try {
          await fetch("/api/lmstudio/unload", { method: "POST" });
        } catch {
          // Non-blocking unload request.
        }
      }

      const response = await fetch("/api/comfy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!response.ok) throw new Error("Failed to start generation");

      const result = await response.json();
      toast.loading("Generating...", { id: "generation" });
      await pollForResult(result.prompt_id, prompt.trim());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(message);
      toast.error(message, { id: "generation" });
    } finally {
      setIsGenerating(false);
    }
  };

  const clearGallery = async () => {
    try {
      await fetch("/api/comfy/images", { method: "DELETE" });
    } catch {
      // Still clear local state even if server deletion fails.
    }

    setGallery([]);
    localStorage.removeItem("comfyui_gallery");
    toast.success("Gallery cleared");
    closeConfirm();
  };

  const deleteImage = async (index: number) => {
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
    toast.success("Deleted");
    closeConfirm();
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

  const handleChatKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const filteredGallery = useMemo(() => {
    if (galleryFilter === "all") return gallery;
    return gallery.filter((item) => item.style === galleryFilter);
  }, [gallery, galleryFilter]);

  const filterStyles = ["all", ...IMAGE_STYLES];

  const styleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: gallery.length };
    IMAGE_STYLES.forEach((style) => {
      counts[style] = gallery.filter((item) => item.style === style).length;
    });
    return counts;
  }, [gallery]);

  return (
    <div className="min-h-screen bg-[#252523] text-[#edeae2]">
      <Toaster
        theme="dark"
        position="top-right"
        visibleToasts={1}
        toastOptions={{
          style: {
            background: '#2f2f2d',
            border: '1px solid #3f3e3a',
            color: '#edeae2',
          },
        }}
      />

      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 h-screen w-72 border-r border-[#3a3936] bg-[#2b2b29]">
          <div className="flex h-full flex-col">
            <div className="border-b border-[#3a3936] p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#4a4944] bg-[#32312e]">
                  <div className="h-4 w-4 rounded-full border-2 border-[#c9a87a]" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[#9d988d]">Nova Studio</p>
                  <p className="text-sm font-semibold text-[#edeae2]">Local AI Workspace</p>
                </div>
              </div>

              {modeHydrated && (
                <div className="grid grid-cols-2 rounded-xl border border-[#4a4944] bg-[#32312e] p-1">
                  {(["image", "chat"] as AppMode[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => handleSetMode(tab)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition ${mode === tab
                        ? "bg-[#c9a87a] text-[#1f1f1d]"
                        : "text-[#bcb6aa] hover:text-[#ece8df]"
                        }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {mode === "chat" ? (
              <>
                <div className="p-3">
                  <button
                    onClick={createNewSession}
                    className="w-full rounded-lg bg-[#c9a87a] px-3 py-2.5 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d]"
                  >
                    New Chat
                  </button>
                </div>

                <div className="p-3 flex-1 space-y-1 overflow-y-auto pb-3">
                  {chatSessions.length === 0 && (
                    <p className="px-3 py-8 text-center text-xs text-[#9f988c]">No chats yet</p>
                  )}

                  {chatSessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => setActiveSessionId(session.id)}
                      className={`group flex cursor-pointer items-center gap-2 rounded-lg mb-2 border px-3 py-2 transition ${activeSessionId === session.id
                        ? "border-[#555149] bg-[#383733] text-[#f1ede4]"
                        : "border-[#3a3936] text-[#bcb6aa] hover:border-[#4b4740] hover:bg-[#343330] hover:text-[#f1ede4]"
                        }`}
                    >
                      <span className="truncate text-xs">{session.title}</span>
                      <span className="ml-auto" />
                      <button
                        onClick={(e) => deleteSession(session.id, e)}
                        className="rounded p-1 text-[#958d80] opacity-0 transition group-hover:opacity-100 hover:bg-[#4a463f] hover:text-[#f5d4a7]"
                        type="button"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto p-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#9f988c]">Recent Images</p>
                  {gallery.length > 0 && <p className="text-[11px] text-[#9f988c]">{gallery.length}</p>}
                </div>
                <div className="space-y-1">
                  {gallery.length === 0 && (
                    <p className="px-3 py-8 text-center text-xs text-[#9f988c]">No images yet</p>
                  )}
                  {gallery.slice(0, 10).map((item, index) => (
                    <button
                      key={`${item.filename}-${index}`}
                      onClick={() => window.open(`/generated/${item.filename}`, "_blank")}
                      className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-[#4b4740] hover:bg-[#343330]"
                    >
                      <img src={`/generated/${item.filename}`} alt={item.prompt} className={`h-9 w-9 rounded transition duration-500 object-cover ${item.hidden ? "blur-[4px]" : ""}`} />
                      <span className="truncate text-xs text-[#cec8bb]">{item.prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-[#3a3936] p-3">
              <div className="space-y-1 text-xs text-[#bcb6aa]">
                <a
                  href="http://127.0.0.1:1234"
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-transparent px-3 py-2 transition hover:border-[#4b4740] hover:bg-[#343330] hover:text-[#f1ede4]"
                >
                  LM Studio
                </a>
                <a
                  href="http://127.0.0.1:8188"
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-transparent px-3 py-2 transition hover:border-[#4b4740] hover:bg-[#343330] hover:text-[#f1ede4]"
                >
                  ComfyUI
                </a>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[#252523]">
          {mode === "image" ? (
            <>
              <header className="sticky top-0 z-20 border-b border-[#3a3936] bg-[#2a2a28]/95 px-8 py-5 backdrop-blur">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-[#c9a87a]" />
                    <div>
                      <h1 className="text-base font-semibold text-[#edeae2]">Image Workspace</h1>
                      <p className="text-xs text-[#9f988c]">Prompt, enhance, generate, iterate.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[#45433f] bg-[#33322f] px-2.5 py-1 text-[11px] text-[#bcb6aa]">
                      Enter to generate
                    </span>
                    {gallery.length > 0 && (
                      <button
                        onClick={() => openConfirm("Clear Gallery", "This will delete all images from the server.", () => clearGallery())}
                        className="rounded-lg border border-[#5a4a3d] px-3 py-1.5 text-xs text-[#e1bfa0] transition hover:border-[#775e4b] hover:text-[#f2cdae]"
                      >
                        Clear Gallery
                      </button>
                    )}
                  </div>
                </div>
              </header>

              <section className="flex-1 overflow-y-auto px-8 py-8">
                <div className="mx-auto w-full max-w-6xl space-y-7">
                  <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <select
                          value={selectedModel}
                          onChange={(e) => switchModel(e.target.value)}
                          disabled={isEnhancing || isGenerating || availableModels.length === 0}
                          className="rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none"
                        >
                          {availableModels.length === 0 ? (
                            <option value="">No models available</option>
                          ) : (
                            availableModels.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))
                          )}
                        </select>
                        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9d988d]">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      <div className="relative">
                        <select
                          value={imageStyle}
                          onChange={(e) => setImageStyle(e.target.value)}
                          disabled={isGenerating}
                          className="rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none"
                        >
                          {IMAGE_STYLES.map((style) => (
                            <option key={style} value={style}>
                              {style.charAt(0).toUpperCase() + style.slice(1)}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9d988d]">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      <button
                        onClick={enhancePrompt}
                        disabled={isEnhancing || !prompt.trim() || !selectedModel || availableModels.length === 0}
                        className="rounded-lg border border-[#5a4f40] bg-[#3a352e] px-3 py-2 text-xs font-medium text-[#f2dbc0] transition hover:bg-[#4a433a] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isEnhancing ? "Enhancing..." : "Enhance Prompt"}
                      </button>
                    </div>

                    <div className="relative">
                      <textarea
                        ref={inputRef}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handlePromptKeyDown}
                        placeholder="Describe the scene, mood, lens, and details..."
                        rows={4}
                        className="w-full resize-none rounded-xl border border-[#494741] bg-[#262624] px-3 py-3 pr-24 text-sm text-[#ece8df] outline-none transition placeholder:text-[#8f8778] focus:border-[#b9986d]"
                        disabled={isGenerating}
                      />

                      <p className="mt-2 text-xs text-[#91897c]">Shift + Enter for a new line.</p>

                      <button
                        onClick={generateImage}
                        disabled={isGenerating || !prompt.trim()}
                        className="absolute bottom-10 right-2 rounded-lg bg-[#c9a87a] px-3 py-2 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isGenerating ? "Generating" : "Generate"}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg border border-[#7d463f] bg-[#3f2a27] px-3 py-2 text-sm text-[#ffbeb4]">
                      {error}
                    </p>
                  )}

                  {gallery.length > 0 && (
                    <div className="space-y-3 pb-4">
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
                        {filteredGallery.map((item, index) => (
                          <div
                            key={item.filename}
                            onClick={() => window.open(`/generated/${item.filename}`, "_blank")}
                            className="group relative overflow-hidden rounded-xl border border-[#3f3e3a] bg-[#32312e] cursor-pointer"
                          >
                            <img
                              src={`/generated/${item.filename}`}
                              alt={item.prompt}
                              className={`aspect-square w-full object-cover transition duration-500 group-hover:scale-105 ${item.hidden ? "blur-xl" : ""}`}
                              loading="lazy"
                            />
                            <div className="absolute inset-x-0 top-0 -translate-y-full p-2 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                              <div className="flex items-center justify-between">
                                <span className="rounded-lg bg-black/40 px-3 py-2 text-[12px] text-white/70 backdrop-blur-sm capitalize">
                                  {item.style}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleImageVisibility(gallery.findIndex((g) => g.filename === item.filename));
                                    }}
                                    className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                                  >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      {item.hidden ? (
                                        // Normal Eye
                                        <>
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                          />
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                          />
                                        </>
                                      ) : (
                                        // Eye Slash
                                        <>
                                          {/* Top curve of eye */}
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774"
                                          />
                                          {/* Bottom curve of eye */}
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395"
                                          />
                                          {/* Pupil top-left arc */}
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M9.75 9.75a3 3 0 000 4.5"
                                          />
                                          {/* Pupil bottom-right arc */}
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M14.25 14.25a3 3 0 000-4.5"
                                          />
                                          {/* Diagonal slash */}
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M3 3l18 18"
                                          />
                                        </>
                                      )}
                                    </svg>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(item.prompt); }}
                                    className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                                  >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); window.open(`/generated/${item.filename}`, "_blank"); }}
                                    className="rounded-lg bg-black/40 p-2 text-white/70 backdrop-blur-sm transition hover:bg-black/60 cursor-pointer"
                                  >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openConfirm("Delete Image", "This will delete the image from the server.", () => deleteImage(gallery.findIndex((g) => g.filename === item.filename)));
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
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                              <p className="line-clamp-3 text-[11px] text-[#e7e2d8]">{item.prompt}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <>
              <header className="sticky top-0 z-20 border-b border-[#3a3936] bg-[#2a2a28]/95 px-8 py-5 backdrop-blur">
                <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
                  <div>
                    <h1 className="text-base font-semibold text-[#edeae2]">{activeSession?.title || "Chat Workspace"}</h1>
                    <p className="text-xs text-[#9f988c]">Focused local chat with fast model switching.</p>
                  </div>

                  {activeSession && (
                    <div className="relative">
                      <select
                        value={activeSession.model}
                        onChange={(e) => switchChatModel(e.target.value)}
                        disabled={isChatLoading || availableModels.length === 0}
                        className="rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none"
                      >
                        {availableModels.length === 0 ? (
                          <option value="">No models</option>
                        ) : (
                          availableModels.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))
                        )}
                      </select>
                      <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9d988d]">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </header>

              {activeSession ? (
                <>
                  <div ref={chatMessagesRef} className="flex-1 overflow-y-auto px-8 py-7">
                    {activeSession.messages.length === 0 ? (
                      <div className="flex h-full items-center justify-center">
                        <p className="text-sm text-[#9f988c]">Start a new conversation.</p>
                      </div>
                    ) : (
                      <div className="mx-auto w-full max-w-5xl space-y-3 pb-4">
                        {activeSession.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition ${message.role === "user"
                                ? "bg-[#c9a87a] text-[#1f1f1d]"
                                : "border border-[#46443f] bg-[#30302e] text-[#ece8df]"
                                }`}
                            >
                              <MessageContent content={message.content} />
                              <p className={`mt-2 text-[11px] ${message.role === "user" ? "text-[#3b3327]" : "text-[#a39d91]"}`}>
                                {formatTime(message.timestamp)}
                              </p>
                            </div>
                          </div>
                        ))}

                        {isChatLoading && (
                          <div className="flex justify-start">
                            <div className="rounded-2xl border border-[#46443f] bg-[#30302e] px-4 py-3 text-sm text-[#b7b1a5]">
                              <span className="inline-flex gap-1">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d8bb92]" />
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c9a87a] [animation-delay:120ms]" />
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#b38f62] [animation-delay:240ms]" />
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="sticky bottom-0 border-t border-[#3a3936] bg-[#2a2a28] px-8 py-5">
                    <div className="mx-auto flex w-full max-w-5xl items-center justify-center gap-2 rounded-xl border border-[#46443f] bg-[#30302e] p-2">
                      <textarea
                        ref={chatInputRef}
                        value={chatInput}
                        onChange={(e) => { setChatInput(e.target.value); adjustChatHeight(); }}
                        onKeyDown={handleChatKeyDown}
                        placeholder="Ask anything..."
                        rows={1}
                        className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[#ece8df] outline-none placeholder:text-[#8f8778]"
                        disabled={isChatLoading}
                      />

                      <button
                        onClick={sendMessage}
                        disabled={isChatLoading || !chatInput.trim()}
                        className="mx-auto self-center rounded-lg bg-[#c9a87a] px-3 py-2 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                    <p className="mx-auto mt-2 w-full max-w-5xl text-xs text-[#8f8778]">Enter to send. Shift + Enter for a new line.</p>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <div className="space-y-3 text-center">
                    <p className="text-sm text-[#9f988c]">No chat selected.</p>
                    <button
                      onClick={createNewSession}
                      className="rounded-lg bg-[#c9a87a] px-3 py-2 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d]"
                    >
                      New Chat
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {confirmModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-[#4a4944] bg-[#2a2a28] p-5 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-[#edeae2]">{confirmModal.title}</h2>
            <p className="mb-5 text-sm text-[#a39d91]">{confirmModal.message}</p>
            <div className="flex gap-2">
              <button
                onClick={closeConfirm}
                className="flex-1 rounded-lg border border-[#4a4944] px-3 py-2 text-sm font-medium text-[#bcb6aa] transition hover:border-[#5a5955] hover:text-[#ece8df]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                }}
                className="flex-1 rounded-lg bg-[#c9a87a] px-3 py-2 text-sm font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
