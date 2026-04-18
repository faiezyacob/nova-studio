'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Toaster, toast } from "sonner";
import VideoWorkspace from "@/components/VideoWorkspace";
import ChatWorkspace from "@/components/ChatWorkspace";
import ImageWorkspace from "@/components/ImageWorkspace";
import { AppMode, ChatMessage, ChatSession, GalleryItem, Lora, VideoGalleryItem } from "@/types";

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
    uploadedImage: null as string | null,
    uploadedImageName: "",
    videoSize: "480" as "480" | "720",
    matchImageSize: true,
    durationFrames: 81,
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
  const [selectedLora, setSelectedLora] = useState<Lora>({ name: "", strength_model: 1.0, strength_clip: 1.0 });
  const [galleryFilter, setGalleryFilter] = useState("all");
  const [galleryPage, setGalleryPage] = useState(1);
  
  // Chat States
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  const [isPurging, setIsPurging] = useState(false);
  const [vramStats, setVramStats] = useState<{ used: number; total: number; percent: number } | null>(null);
  const modeManuallySet = useRef(false);

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

  const fetchVramStats = async () => {
    try {
      const res = await fetch("/api/system/stats");
      if (res.ok) {
        const data = await res.json();
        setVramStats({
          used: data.used / (1024 ** 3), // B to GB
          total: data.total / (1024 ** 3),
          percent: data.percent
        });
      }
    } catch {
      // Ignore errors
    }
  };

  useEffect(() => {
    fetchVramStats();
    const interval = setInterval(fetchVramStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const purgeVRAM = async () => {
    setIsPurging(true);
    toast.loading("Purging VRAM...", { id: "vram-purge" });
    try {
      if (currentModel) {
        await fetch("/api/lmstudio/unload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: currentModel }),
        });
      }
      await fetch("/api/comfy/free", { method: "POST" });
      await new Promise(r => setTimeout(r, 800));
      await fetchVramStats();
      toast.success("VRAM Cleared", { id: "vram-purge" });
    } catch (err) {
      console.error("Purge failed:", err);
      toast.error("Cleanup failed", { id: "vram-purge" });
    } finally {
      setIsPurging(false);
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
    const saved = localStorage.getItem("app_mode");
    if (saved === "chat" || saved === "image" || saved === "video") {
      setMode(saved as AppMode);
    }
    setModeHydrated(true);
  }, []);

  useEffect(() => {
    if (modeManuallySet.current) {
      localStorage.setItem("app_mode", mode);
    }
  }, [mode]);

  useEffect(() => {
    const saved = localStorage.getItem("comfyui_gallery");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const migrated: GalleryItem[] = parsed.map((item: GalleryItem | string) => {
          if (typeof item === "string") {
            return {
              filename: item.split('/').pop() || "unknown",
              prompt: "Previous generation",
              timestamp: Date.now(),
              style: "realistic",
            };
          }
          return { ...item, style: item.style || "realistic" };
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
    const saved = localStorage.getItem("video_gallery");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) setVideoGallery(parsed);
    } catch (e) {
      console.error("Failed to load video gallery", e);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("video_workspace_state");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setVideoWorkspaceState(prev => ({ ...prev, ...parsed }));
    } catch (e) {
      console.error("Failed to load video workspace state", e);
    }
  }, []);

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
            <div className="border-b border-[#3a3936] px-3 py-5">
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
                <div className="grid grid-cols-3 rounded-xl border border-[#4a4944] bg-[#32312e] p-1">
                  {(["image", "chat", "video"] as AppMode[]).map((tab) => (
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
                {mode === "video" ? (
                  <>
                    <div className="mb-2 flex items-center justify-between px-1">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[#9f988c]">Recent Videos</p>
                      {videoGallery.length > 0 && <p className="text-[11px] text-[#9f988c]">{videoGallery.length}</p>}
                    </div>
                    {videoGallery.length === 0 ? (
                      <p className="px-3 py-8 text-center text-xs text-[#9f988c]">No videos yet</p>
                    ) : (
                      <div className="space-y-1">
                        {videoGallery.slice(0, 10).map((video, index) => (
                          <button
                            key={`${video.id}-${index}`}
                            onClick={() => {
                              setVideoResult(video);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-[#4b4740] hover:bg-[#343330]"
                          >
                            <video
                              src={`/generated/${video.filename}`}
                              className="h-9 w-9 rounded object-cover"
                            />
                            <span className="truncate text-xs text-[#cec8bb]">{video.prompt}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
                )}
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

                {vramStats && (
                  <div className="mt-4 px-3">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-[#6b6560]">
                      <span>VRAM Usage</span>
                      <span className={vramStats.percent > 85 ? "text-red-400" : "text-[#c9a87a]"}>
                        {vramStats.used.toFixed(1)} / {vramStats.total.toFixed(1)} GB
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1a1a18]">
                      <div
                        className={`h-full transition-all duration-500 ${vramStats.percent > 85 ? "bg-red-500" : "bg-[#c9a87a]"
                          }`}
                        style={{ width: `${vramStats.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={purgeVRAM}
                  disabled={isPurging}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#4a4944] bg-[#262624] px-3 py-2 text-[11px] font-medium text-[#c9a87a] transition hover:bg-[#2d2d2b] hover:text-[#d8bb92] disabled:opacity-50"
                >
                  <svg className={`h-3 w-3 ${isPurging ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {isPurging ? 'Clearing...' : 'Clean GPU VRAM'}
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[#252523]">
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
              selectedLora={selectedLora}
              setSelectedLora={setSelectedLora}
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
