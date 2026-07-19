'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Toaster, toast } from "sonner";
import VideoWorkspace from "@/components/VideoWorkspace";
import ChatWorkspace from "@/components/ChatWorkspace";
import ImageWorkspace from "@/components/ImageWorkspace";
import AgentWorkspace from "@/components/AgentWorkspace";
import { AppMode, AgentSession, ChatMessage, ChatSession, GalleryItem, Lora, VideoGalleryItem } from "@/types";
import { sceneAgent } from "@/lib/scene-agent/scene-agent";
import { fullCleanup } from "@/lib/scene-agent/resource-manager";
import { db, migrateFromLocalStorage } from "@/utils/db";

export default function App() {
  const [mode, setMode] = useState<AppMode>("image");
  const [modeHydrated, setModeHydrated] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [videoGallery, setVideoGallery] = useState<VideoGalleryItem[]>([]);
  const [videoResult, setVideoResult] = useState<VideoGalleryItem | null>(null);
  const [videoWorkspaceState, setVideoWorkspaceState] = useState({
    prompt: "",
    negative_prompt: "",
    uploadedImage: null as string | null,
    uploadedImageName: "",
    videoSize: "480" as "480" | "540" | "720",
    matchImageSize: true,
    durationFrames: 81,
    activeWorkflow: "wan-2.2-i2v",
  });
  const [videoSelectedModel, setVideoSelectedModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [currentModel, setCurrentModel] = useState("");

  // Image Generation States
  const [imageStyle, setImageStyle] = useState("realistic");
  const [imageWidth, setImageWidth] = useState(1024);
  const [imageHeight, setImageHeight] = useState(1024);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [selectedLoras, setSelectedLoras] = useState<Lora[]>([]);
  const [imageWorkflow, setImageWorkflow] = useState("z-image-turbo");
  const [galleryFilter, setGalleryFilter] = useState("all");
  const [galleryPage, setGalleryPage] = useState(1);

  // Chat States
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Agent Session States
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);
  const [activeAgentSessionId, setActiveAgentSessionId] = useState<string | null>(null);

  const [isPurging, setIsPurging] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [vramStats, setVramStats] = useState<{ used: number; total: number; percent: number, ram?: { used: number; total: number; percent: number } } | null>(null);
  const modeManuallySet = useRef(false);
  const chatSessionsLoaded = useRef(false);
  const agentSessionsLoaded = useRef(false);

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

  // Migrate existing localStorage data to IndexedDB on first mount
  useEffect(() => {
    migrateFromLocalStorage();
  }, []);

  // Hydrate image dimensions from IndexedDB
  useEffect(() => {
    db.get<{ width: number; height: number }>("image_dimensions").then(saved => {
      if (saved) {
        if (saved.width) setImageWidth(saved.width);
        if (saved.height) setImageHeight(saved.height);
      }
    });
  }, []);

  // Hydrate image workflow from IndexedDB
  useEffect(() => {
    db.get<string>("image_workflow").then(saved => {
      if (saved) setImageWorkflow(saved);
    });
  }, []);

  // Hydrate selected lorae from IndexedDB
  useEffect(() => {
    db.get<Lora[]>("image_loras").then(saved => {
      if (saved && Array.isArray(saved)) setSelectedLoras(saved);
    });
  }, []);

  const fetchVramStats = async () => {
    try {
      const res = await fetch("/api/system/stats");
      if (res.ok) {
        const data = await res.json();
        setVramStats({
          used: data.used / (1024 ** 3),
          total: data.total / (1024 ** 3),
          percent: data.percent,
          ram: data.ram ? {
            used: data.ram.used / (1024 ** 3),
            total: data.ram.total / (1024 ** 3),
            percent: data.ram.percent
          } : undefined
        });
      }
    } catch {
    }
  };

  useEffect(() => {
    fetchVramStats();
    let timeoutIds: NodeJS.Timeout[] = [];

    const handleVramStatsRequest = () => {
      fetchVramStats();
      timeoutIds.forEach(clearTimeout);
      timeoutIds = [
        setTimeout(fetchVramStats, 2000),
        setTimeout(fetchVramStats, 5000)
      ];
    };

    window.addEventListener('vram-stats-request', handleVramStatsRequest);
    return () => {
      window.removeEventListener('vram-stats-request', handleVramStatsRequest);
      timeoutIds.forEach(clearTimeout);
    };
  }, []);

  const purgeVRAM = async () => {
    setIsPurging(true);
    toast.loading("Purging VRAM & System RAM...", { id: "vram-purge" });
    try {
      const loadedModel = await db.get<string>('loaded_model');
      if (loadedModel) {
        await fetch("/api/lmstudio/unload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: loadedModel }),
        });
        await db.remove("loaded_model");
        setCurrentModel("");
      }
      await fetch("/api/comfy/free", { method: "POST" });
      await fetch("/api/system/free", { method: "POST" });
      await new Promise(r => setTimeout(r, 800));
      await fetchVramStats();
      toast.success("VRAM & RAM Cleared", { id: "vram-purge" });
    } catch (err) {
      console.error("Purge failed:", err);
      toast.error("Cleanup failed", { id: "vram-purge" });
    } finally {
      setIsPurging(false);
    }
  };

  const restartComfy = async () => {
    setIsRestarting(true);
    toast.loading("Restarting ComfyUI...", { id: "comfy-restart" });
    try {
      const res = await fetch("/api/comfy/restart", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to restart");
      }
      toast.success("ComfyUI Restarted", { id: "comfy-restart" });
    } catch (err) {
      console.error("Restart failed:", err);
      toast.error("Restart failed", { id: "comfy-restart" });
    } finally {
      setIsRestarting(false);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/lmstudio/models");
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map((model: { id: string }) => model.id);
        setAvailableModels(models);
        const savedModel = await db.get<string>("loaded_model");
        if (models.length > 0 && !selectedModel) {
          if (savedModel && models.includes(savedModel)) {
            setSelectedModel(savedModel);
            setCurrentModel(savedModel);
          } else {
            setSelectedModel(models[0]);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch models:", err);
    }
  };

  const switchModel = async (newModel: string) => {
    if (newModel && newModel !== currentModel) {
      if (currentModel) {
        try {
          await fetch("/api/lmstudio/unload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: currentModel }),
          });
        } catch (err) {
          console.error("Failed to unload model:", err);
        }
      }
      setCurrentModel(newModel);
    }
    setSelectedModel(newModel);
    await db.set("loaded_model", newModel);
  };

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    db.get<string>("loaded_model").then(savedModel => {
      if (savedModel && availableModels.includes(savedModel)) {
        setCurrentModel(savedModel);
        setSelectedModel(savedModel);
      }
    });
  }, [availableModels]);

  useEffect(() => {
    db.get<ChatSession[]>("chat_sessions").then(savedSessions => {
      if (savedSessions && Array.isArray(savedSessions) && savedSessions.length > 0) {
        setChatSessions(savedSessions);
        setActiveSessionId(savedSessions[0].id);
      }
      chatSessionsLoaded.current = true;
    }).catch(e => {
      console.error("Failed to load chat sessions", e);
      chatSessionsLoaded.current = true;
    });
  }, []);

  useEffect(() => {
    db.get<AgentSession[]>("agent_sessions").then(saved => {
      if (saved && Array.isArray(saved) && saved.length > 0) {
        setAgentSessions(saved);
        setActiveAgentSessionId(saved[0].id);
      }
      agentSessionsLoaded.current = true;
    }).catch(e => {
      console.error("Failed to load agent sessions", e);
      agentSessionsLoaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!agentSessionsLoaded.current) return;
    if (agentSessions.length > 0) {
      db.set("agent_sessions", agentSessions);
    } else {
      db.remove("agent_sessions");
    }
  }, [agentSessions]);

  useEffect(() => {
    if (!chatSessionsLoaded.current) return;
    if (chatSessions.length > 0) {
      db.set("chat_sessions", chatSessions);
    } else {
      db.remove("chat_sessions");
    }
  }, [chatSessions]);

  useEffect(() => {
    db.get<AppMode>("app_mode").then(saved => {
      if (saved === "chat" || saved === "image" || saved === "video" || saved === "agent") {
        setMode(saved as AppMode);
      }
      setModeHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (modeManuallySet.current) {
      db.set("app_mode", mode);
    }
  }, [mode]);

  useEffect(() => {
    db.get<GalleryItem[] | string[]>("comfyui_gallery").then(saved => {
      if (!saved) return;
      if (Array.isArray(saved) && saved.length > 0) {
        if (typeof saved[0] === "string") {
          const migrated: GalleryItem[] = (saved as string[]).map(item => ({
            filename: item.split('/').pop() || "unknown",
            prompt: "Previous generation",
            timestamp: Date.now(),
            style: "realistic",
          }));
          setGallery(migrated);
          db.set("comfyui_gallery", migrated);
        } else {
          const items = saved as GalleryItem[];
          const withStyle = items.map(item => ({ ...item, style: item.style || "realistic" }));
          setGallery(withStyle);
          db.set("comfyui_gallery", withStyle);
        }
      }
    }).catch(e => console.error("Failed to load gallery", e));
  }, []);

  useEffect(() => {
    db.set("image_dimensions", { width: imageWidth, height: imageHeight });
  }, [imageWidth, imageHeight]);

  useEffect(() => {
    db.set("image_workflow", imageWorkflow);
  }, [imageWorkflow]);

  useEffect(() => {
    db.set("image_loras", selectedLoras);
  }, [selectedLoras]);

  useEffect(() => {
    db.get<VideoGalleryItem[]>("video_gallery").then(saved => {
      if (!saved) return;
      if (Array.isArray(saved)) setVideoGallery(saved);
    }).catch(e => console.error("Failed to load video gallery", e));
  }, []);

  useEffect(() => {
    db.get("video_workspace_state").then(saved => {
      if (!saved) return;
      setVideoWorkspaceState(prev => ({ ...prev, ...saved }));
    }).catch(e => console.error("Failed to load video workspace state", e));
  }, []);

  useEffect(() => {
    const { uploadedImage, uploadedImageName, ...rest } = videoWorkspaceState;
    try {
      db.set("video_workspace_state", JSON.parse(JSON.stringify(rest)));
    } catch {
    }
  }, [videoWorkspaceState]);

  const handleSetMode = (newMode: AppMode) => {
    modeManuallySet.current = true;
    setMode(newMode);
  };

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

  const createAgentSession = () => {
    const newSession: AgentSession = {
      id: `agent_${Date.now()}`,
      title: `Scene ${agentSessions.length + 1}`,
      description: "",
      duration: 10,
      status: "idle",
      scenePlan: null,
      tasks: [],
      logs: [],
      outputVideo: null,
      generatedFiles: [],
      createdAt: Date.now(),
      model: selectedModel || availableModels[0] || "",
    };
    setAgentSessions((prev) => [newSession, ...prev]);
    setActiveAgentSessionId(newSession.id);
  };

  const deleteAgentSession = (sessionId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const session = agentSessions.find((s) => s.id === sessionId);

    if (activeAgentSessionId === sessionId) {
      sceneAgent.abort();
      fullCleanup().catch(() => {});
    }

    const updated = agentSessions.filter((s) => s.id !== sessionId);
    setAgentSessions(updated);
    if (activeAgentSessionId === sessionId) {
      setActiveAgentSessionId(updated.length > 0 ? updated[0].id : null);
    }

    const files = [
      ...(session?.generatedFiles || []),
      ...(session?.outputVideo ? [session.outputVideo] : []),
    ];
    const uniqueFiles = [...new Set(files)];
    for (const file of uniqueFiles) {
      const ext = file.split('.').pop()?.toLowerCase();
      const isVideo = ['mp4', 'webm', 'mov'].includes(ext || '');
      const params = new URLSearchParams({ filename: file });
      if (isVideo) params.set('subfolder', 'video');
      fetch(`/api/comfy/images?${params}`, { method: 'DELETE' }).catch(() => {});
    }
    toast.success("Scene session deleted");
  };

  const useImageForVideo = (item: GalleryItem) => {
    const imageUrl = `/generated/${item.filename}`;
    setVideoWorkspaceState(prev => ({
      ...prev,
      uploadedImage: imageUrl,
      uploadedImageName: item.filename,
      prompt: item.prompt
    }));
    setMode("video");
    toast.success("Image sent to Video Workspace");
  };

  const activeSessionTab = useMemo(
    () => chatSessions.find((session) => session.id === activeSessionId),
    [chatSessions, activeSessionId],
  );

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <Toaster
        theme="dark"
        position="top-right"
        visibleToasts={1}
        toastOptions={{
          style: {
            background: '#222220',
            border: '1px solid #3a3936',
            color: '#edeae2',
            borderRadius: '10px',
            boxShadow: '0 14px 34px rgba(0,0,0,.35)',
          },
        }}
      />

      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 h-screen w-72 border-r border-border-subtle bg-sidebar">
          <div className="flex h-full flex-col">
            <div className="border-b border-border-subtle px-3 py-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hover shadow-[var(--shadow-card)]">
                  <div className="h-4 w-4 rounded-full border-2 border-gold" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Nova Studio</p>
                  <p className="text-sm font-semibold text-text-primary">Local AI Workspace</p>
                </div>
              </div>

              {modeHydrated && (
                <div className="grid grid-cols-4 rounded-[10px] border border-border-strong bg-hover p-0.5">
                  {(["chat", "image", "video", "agent"] as AppMode[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => handleSetMode(tab)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition duration-150 ${mode === tab
                        ? "bg-gold text-[#1f1f1d] shadow-sm"
                        : "text-text-secondary hover:text-text-primary"
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
                    className="btn-primary w-full"
                  >
                    New Chat
                  </button>
                </div>

                <div className="p-3 flex-1 space-y-1 overflow-y-auto pb-3">
                  {chatSessions.length === 0 && (
                    <p className="px-3 py-8 text-center text-xs text-text-muted">No chats yet</p>
                  )}

                  {chatSessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => setActiveSessionId(session.id)}
                      className={`group flex cursor-pointer items-center gap-2 rounded-[10px] mb-2 border px-3 py-2 transition duration-150 ${activeSessionId === session.id
                        ? "border-gold/60 bg-gold/[0.08] text-text-primary"
                        : "border-transparent text-text-secondary hover:border-border-strong hover:bg-hover hover:text-text-primary"
                        }`}
                    >
                      <span className="truncate text-xs font-medium">{session.title}</span>
                      <span className="ml-auto" />
                      <button
                        onClick={(e) => deleteSession(session.id, e)}
                        className="rounded-md p-1 text-text-subtle opacity-0 transition duration-150 group-hover:opacity-100 hover:bg-active hover:text-gold"
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
                {mode === "video" ? (
                  <>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Recent Videos</p>
                      {videoGallery.length > 0 && <p className="text-[11px] text-text-muted">{videoGallery.length}</p>}
                    </div>
                    {videoGallery.length === 0 ? (
                      <p className="px-3 py-8 text-center text-xs text-text-muted">No videos yet</p>
                    ) : (
                      <div className="space-y-1">
                        {videoGallery.slice(0, 10).map((video, index) => (
                          <button
                            key={`${video.id}-${index}`}
                            onClick={() => {
                              setVideoResult(video);
                            }}
                            className="flex w-full items-center gap-2 rounded-[10px] border border-transparent px-2 py-1.5 text-left transition duration-150 hover:border-border-strong hover:bg-hover"
                          >
                            {video.thumbnail ? (
                              <img
                                src={video.thumbnail}
                                alt=""
                                className="h-9 w-9 aspect-square rounded-lg object-cover"
                              />
                            ) : (
                              <video
                                src={`/generated/${video.filename}`}
                                className="h-9 w-9 aspect-square rounded-lg object-cover"
                                preload="none"
                              />
                            )}
                            <span className="truncate text-xs text-text-secondary">{video.prompt}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : mode === "agent" ? (
                  <>
                    <div className="mb-3">
                      <button
                        onClick={createAgentSession}
                        className="btn-primary w-full"
                      >
                        New Scene
                      </button>
                    </div>
                    <div className="pt-3 flex-1 space-y-1 overflow-y-auto pb-3">
                      {agentSessions.length === 0 && (
                        <p className="px-3 py-8 text-center text-xs text-text-muted">No scenes yet</p>
                      )}
                      {agentSessions.map((session) => {
                        const statusIcon =
                          session.status === "running" ? "◉" :
                          session.status === "completed" ? "✓" :
                          session.status === "failed" ? "✕" : "○";
                        return (
                          <div
                            key={session.id}
                            onClick={() => setActiveAgentSessionId(session.id)}
                            className={`group flex cursor-pointer items-center gap-2 rounded-[10px] mb-2 border px-3 py-2 transition duration-150 ${
                              activeAgentSessionId === session.id
                                ? "border-gold/60 bg-gold/[0.08] text-text-primary"
                                : "border-transparent text-text-secondary hover:border-border-strong hover:bg-hover hover:text-text-primary"
                            }`}
                          >
                            <span className="text-[10px] w-4 text-center shrink-0">{statusIcon}</span>
                            <span className="truncate text-xs font-medium flex-1">{session.title}</span>
                            <button
                              onClick={(e) => deleteAgentSession(session.id, e)}
                              className="rounded-md p-1 text-text-subtle opacity-0 transition duration-150 group-hover:opacity-100 hover:bg-active hover:text-gold"
                              type="button"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between px-1">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Recent Images</p>
                      {gallery.length > 0 && <p className="text-[11px] text-text-muted">{gallery.length}</p>}
                    </div>
                    <div className="space-y-1">
                      {gallery.length === 0 && (
                        <p className="px-3 py-8 text-center text-xs text-text-muted">No images yet</p>
                      )}
                      {gallery.slice(0, 10).map((item, index) => (
                        <button
                          key={`${item.filename}-${index}`}
                          onClick={() => window.open(`/generated/${item.filename}`, "_blank")}
                          className="flex w-full items-center gap-2 rounded-[10px] border border-transparent px-2 py-1.5 text-left transition duration-150 hover:border-border-strong hover:bg-hover"
                        >
                          <img src={`/generated/${item.filename}`} alt={item.prompt} className={`aspect-square h-9 w-9 rounded-lg transition duration-500 object-cover ${item.hidden ? "blur-[4px]" : ""}`} />
                          <span className="truncate text-xs text-text-secondary">{item.prompt}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="border-t border-border-subtle p-3">
              <div className="space-y-1 text-xs text-text-secondary">
                <a
                  href="http://127.0.0.1:1234"
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-[10px] border border-transparent px-3 py-2 transition duration-150 hover:border-border-strong hover:bg-hover hover:text-text-primary"
                >
                  LM Studio
                </a>
                <a
                  href="http://127.0.0.1:8188"
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-[10px] border border-transparent px-3 py-2 transition duration-150 hover:border-border-strong hover:bg-hover hover:text-text-primary"
                >
                  ComfyUI
                </a>

                {vramStats && (
                  <div className="mt-4 px-3 space-y-3">
                    {vramStats.ram && (
                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-text-subtle">
                          <span>RAM Usage</span>
                          <span className={vramStats.ram.percent > 85 ? "text-error" : "text-gold"}>
                            {vramStats.ram.used.toFixed(1)} / {vramStats.ram.total.toFixed(1)} GB
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-1">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${vramStats.ram.percent > 85 ? "bg-error" : "bg-gold"}`}
                            style={{ width: `${vramStats.ram.percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-text-subtle">
                        <span>VRAM Usage</span>
                        <span className={vramStats.percent > 85 ? "text-error" : "text-gold"}>
                          {vramStats.used.toFixed(1)} / {vramStats.total.toFixed(1)} GB
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-1">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${vramStats.percent > 85 ? "bg-error" : "bg-gold"}`}
                          style={{ width: `${vramStats.percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={restartComfy}
                  disabled={isRestarting}
                  className="btn-secondary w-full mt-4"
                >
                  <svg className={`h-3 w-3 ${isRestarting ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {isRestarting ? 'Restarting...' : 'Restart ComfyUI'}
                </button>

                <button
                  onClick={purgeVRAM}
                  disabled={isPurging}
                  className="btn-secondary w-full mt-2"
                >
                  <svg className={`h-3 w-3 ${isPurging ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {isPurging ? 'Clearing...' : 'Clean VRAM'}
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-background">
          {mode === "image" ? (
            <ImageWorkspace
              gallery={gallery}
              setGallery={setGallery}
              prompt={prompt}
              setPrompt={setPrompt}
              isGenerating={isGenerating}
              setIsGenerating={setIsGenerating}
              isEnhancing={isEnhancing}
              setIsEnhancing={setIsEnhancing}
              imageStyle={imageStyle}
              setImageStyle={setImageStyle}
              imageWidth={imageWidth}
              setImageWidth={setImageWidth}
              imageHeight={imageHeight}
              setImageHeight={setImageHeight}
              lockAspectRatio={lockAspectRatio}
              setLockAspectRatio={setLockAspectRatio}
              selectedLoras={selectedLoras}
              setSelectedLoras={setSelectedLoras}
              imageWorkflow={imageWorkflow}
              setImageWorkflow={setImageWorkflow}
              galleryFilter={galleryFilter}
              setGalleryFilter={setGalleryFilter}
              galleryPage={galleryPage}
              setGalleryPage={setGalleryPage}
              availableModels={availableModels}
              selectedModel={selectedModel}
              switchModel={switchModel}
              currentModel={currentModel}
              openConfirm={openConfirm}
              closeConfirm={closeConfirm}
              useImageForVideo={useImageForVideo}
            />
          ) : mode === "video" ? (
            <VideoWorkspace
              videoGallery={videoGallery}
              setVideoGallery={setVideoGallery}
              videoResult={videoResult}
              setVideoResult={setVideoResult}
              workspaceState={videoWorkspaceState}
              setWorkspaceState={setVideoWorkspaceState}
              selectedModel={videoSelectedModel}
              setSelectedModel={setVideoSelectedModel}
              availableModels={availableModels}
              openConfirm={openConfirm}
              closeConfirm={closeConfirm}
            />
          ) : mode === "agent" ? (
            <AgentWorkspace
              agentSessions={agentSessions}
              setAgentSessions={setAgentSessions}
              activeSessionId={activeAgentSessionId}
              setActiveSessionId={setActiveAgentSessionId}
              availableModels={availableModels}
              selectedModel={selectedModel}
              switchModel={switchModel}
            />
          ) : (
            <ChatWorkspace
              chatSessions={chatSessions}
              setChatSessions={setChatSessions}
              activeSessionId={activeSessionId}
              availableModels={availableModels}
              currentModel={currentModel}
              setCurrentModel={setCurrentModel}
              selectedModel={selectedModel}
              isChatLoading={isChatLoading}
              setIsChatLoading={setIsChatLoading}
              chatInput={chatInput}
              setChatInput={setChatInput}
            />
          )}
        </main>
      </div>

      {confirmModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-[20px] border border-border-strong bg-surface-3 p-6 shadow-[var(--shadow-dialog)]">
            <h2 className="mb-2 text-base font-semibold text-text-primary">{confirmModal.title}</h2>
            <p className="mb-6 text-sm text-text-muted">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button
                onClick={closeConfirm}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                }}
                className="btn-primary flex-1"
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
