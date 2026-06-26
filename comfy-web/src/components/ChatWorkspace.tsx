'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { ChatMessage, ChatSession } from "@/types";
import { db } from "@/utils/db";

interface ChatWorkspaceProps {
  chatSessions: ChatSession[];
  setChatSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeSessionId: string | null;
  availableModels: string[];
  currentModel: string;
  setCurrentModel: (model: string) => void;
  selectedModel: string;
  isChatLoading: boolean;
  setIsChatLoading: (loading: boolean) => void;
  chatInput: string;
  setChatInput: (input: string) => void;
}

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
        return <code key={i} className="rounded bg-surface-1 px-1.5 py-0.5 text-gold-hover font-mono text-xs">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("~~") && part.endsWith("~~")) {
        return <del key={i} className="text-text-muted">{part.slice(2, -2)}</del>;
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
          <pre key={`code-${itemKey++}`} className="group relative my-2 rounded-lg bg-surface-1 p-3 text-xs text-gold-hover font-mono overflow-x-auto">
            <button
              onClick={() => { navigator.clipboard.writeText(codeText); toast.success("Copied"); }}
              className="absolute right-2 top-2 rounded bg-hover px-2 py-1 text-[10px] text-text-secondary opacity-0 transition duration-150 ease-out group-hover:opacity-100 hover:bg-active hover:text-gold-dim"
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
          <div key={`bq-${i}`} className="group relative my-2 rounded-r-lg border-l-2 border-gold bg-surface-1/50 pl-3 pr-8 py-2">
            <button
              onClick={() => { navigator.clipboard.writeText(bqText); toast.success("Copied"); }}
              className="absolute right-2 top-2 rounded bg-hover px-2 py-1 text-[10px] text-text-secondary opacity-0 transition duration-150 ease-out group-hover:opacity-100 hover:bg-active hover:text-gold-dim"
            >
              Copy
            </button>
            <span className="text-text-secondary italic">{formatInline(bqText)}</span>
          </div>
        );
      } else if (trimmed.startsWith("### ")) {
        flushLiGroup();
        elements.push(<h3 key={`h3-${i}`} className="mt-3 mb-1 text-sm font-semibold text-gold">{trimmed.slice(4)}</h3>);
      } else if (trimmed.startsWith("## ")) {
        flushLiGroup();
        elements.push(<h3 key={`h3-${i}`} className="mt-3 mb-1 text-base font-bold text-gold">{trimmed.slice(3)}</h3>);
      } else if (trimmed === "---") {
        flushLiGroup();
        elements.push(<hr key={`hr-${i}`} className="my-3 border-border-subtle" />);
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

export default function ChatWorkspace({
  chatSessions,
  setChatSessions,
  activeSessionId,
  availableModels,
  currentModel,
  setCurrentModel,
  selectedModel,
  isChatLoading,
  setIsChatLoading,
  chatInput,
  setChatInput,
}: ChatWorkspaceProps) {
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  const activeSession = useMemo(
    () => chatSessions.find((session) => session.id === activeSessionId),
    [chatSessions, activeSessionId],
  );

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const adjustChatHeight = () => {
    const el = chatInputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  };

  const handleChatKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setSelectedImages((prev) => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setSelectedImages((prev) => [...prev, reader.result as string]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files) {
      Array.from(files).forEach((file) => {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setSelectedImages((prev) => [...prev, reader.result as string]);
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
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
      // localStorage.setItem("loaded_model", newModel);
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !activeSession || isChatLoading) return;

    window.dispatchEvent(new Event('vram-stats-request'));

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: chatInput.trim(),
      images: selectedImages.length > 0 ? [...selectedImages] : undefined,
      timestamp: Date.now(),
    };

    setChatSessions((prev) =>
      prev.map((session) =>
        session.id === activeSessionId
          ? { ...session, messages: [...session.messages, userMessage] }
          : session,
      ),
    );

    const capturedSessionId = activeSessionId;
    const capturedChatInput = chatInput;

    setChatInput("");
    setSelectedImages([]);
    setIsChatLoading(true);

    try {
      const currentSession = chatSessions.find((session) => session.id === capturedSessionId);
      const modelToUse = currentSession?.model || selectedModel || availableModels[0];

      if (modelToUse && currentModel !== modelToUse) {
        if (currentModel) {
          try {
            await fetch("/api/lmstudio/unload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: currentModel }),
            });
          } catch {
            // Intentionally swallow unload failures so chat can still continue.
          }
        }
        setCurrentModel(modelToUse);
        db.set("loaded_model", modelToUse);
      }

      const messages = [
        ...(currentSession?.messages || []).map((m) => {
          if (m.images && m.images.length > 0) {
            const contentArray: any[] = [{ type: "text", text: m.content }];
            m.images.forEach(img => {
              contentArray.push({ type: "image_url", image_url: { url: img } });
            });
            return { role: m.role, content: contentArray };
          }
          return { role: m.role, content: m.content };
        }),
        userMessage.images && userMessage.images.length > 0
          ? {
            role: "user",
            content: [
              { type: "text", text: userMessage.content },
              ...userMessage.images.map(img => ({ type: "image_url", image_url: { url: img } }))
            ]
          }
          : { role: "user", content: userMessage.content },
      ];

      const assistantMsgId = `msg_${Date.now()}_assistant`;

      setChatSessions((prev) =>
        prev.map((session) =>
          session.id === capturedSessionId
            ? {
              ...session,
              messages: [
                ...session.messages,
                { id: assistantMsgId, role: "assistant", content: "", timestamp: Date.now() },
              ],
            }
            : session,
        ),
      );

      const response = await fetch("/api/lmstudio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelToUse, messages, stream: true, temperature: 0.7 }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta;
            const chunk = delta?.content || delta?.reasoning_content || "";
            if (chunk) {
              accumulatedContent += chunk;
              setChatSessions((prev) =>
                prev.map((session) =>
                  session.id === capturedSessionId
                    ? {
                      ...session,
                      messages: session.messages.map((msg) =>
                        msg.id === assistantMsgId
                          ? { ...msg, content: accumulatedContent }
                          : msg,
                      ),
                    }
                    : session,
                ),
              );
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }

      const firstUserMsg = [...(currentSession?.messages || []), userMessage].find(
        (m) => m.role === "user",
      );

      if (firstUserMsg && currentSession) {
        const title =
          firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "");
        setChatSessions((prev) =>
          prev.map((session) => (session.id === capturedSessionId ? { ...session, title } : session)),
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      toast.error(message);

      setChatSessions((prev) =>
        prev.map((session) =>
          session.id === capturedSessionId
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
      window.dispatchEvent(new Event('vram-stats-request'));
    }
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
  };

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-surface-3/95 px-8 py-5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-text-primary">{activeSession?.title || "Chat Workspace"}</h1>
            <p className="text-xs text-text-muted">Focused local chat with fast model switching.</p>
          </div>

          {activeSession && (
            <div className="relative">
              <select
                value={activeSession.model}
                onChange={(e) => switchChatModel(e.target.value)}
                disabled={isChatLoading || availableModels.length === 0}
                className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 pr-8 text-xs text-text-primary outline-none transition duration-150 ease-out focus:border-gold-focus appearance-none max-w-[250px] truncate"
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
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted">
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
          <div
            ref={chatMessagesRef}
            className="flex-1 overflow-y-auto px-8 py-7"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {activeSession.messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-text-muted">Start a new conversation.</p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-5xl space-y-3 pb-4">
                {activeSession.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition duration-150 ease-out ${message.role === "user"
                        ? "bg-gold text-[#1f1f1d]"
                        : "border border-border-subtle bg-surface-3 text-text-primary"
                        }`}
                    >
                      {message.images && message.images.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {message.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={img}
                              alt="Upload"
                              className="max-h-48 max-w-full rounded-lg border border-border-subtle object-contain shadow-[var(--shadow-card)]"
                            />
                          ))}
                        </div>
                      )}
                      <MessageContent content={message.content} />
                      <p className={`mt-2 text-[11px] ${message.role === "user" ? "text-[#1f1f1d]" : "text-text-muted"}`}>
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}

                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-border-subtle bg-surface-3 px-4 py-3 text-sm text-text-secondary">
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-hover" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold/70 [animation-delay:240ms]" />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-border-subtle bg-surface-3 px-8 py-5">
            <div className="mx-auto w-full max-w-5xl">
              {selectedImages.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2 rounded-xl border border-border-subtle bg-surface-3 p-2">
                  {selectedImages.map((img, idx) => (
                    <div key={idx} className="group relative h-20 w-20">
                      <img
                        src={img}
                        alt="Preview"
                        className="h-full w-full rounded-lg border border-border-subtle object-cover"
                      />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute -right-1 -top-1 rounded-full bg-red-500/80 p-0.5 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-3 p-2 focus-within:border-gold transition-colors duration-150 ease-out">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition duration-150 ease-out hover:bg-hover hover:text-text-primary"
                  title="Upload Image"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => { setChatInput(e.target.value); adjustChatHeight(); }}
                  onKeyDown={handleChatKeyDown}
                  onPaste={handlePaste}
                  placeholder="Ask anything..."
                  rows={1}
                  className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
                  disabled={isChatLoading}
                />

                <button
                  onClick={sendMessage}
                  disabled={isChatLoading || (!chatInput.trim() && selectedImages.length === 0)}
                  className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-[#1f1f1d] transition duration-150 ease-out hover:bg-gold-hover hover:translate-y-[-1px] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
            <p className="mx-auto mt-2 w-full max-w-5xl text-xs text-text-muted">Enter to send. Shift + Enter for a new line.</p>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="space-y-3 text-center">
            <p className="text-sm text-text-muted">No chat selected.</p>
            <button
              onClick={() => {
                const newSession: ChatSession = {
                  id: `session_${Date.now()}`,
                  title: `New Chat ${chatSessions.length + 1}`,
                  messages: [],
                  model: selectedModel || availableModels[0] || "",
                  createdAt: Date.now(),
                };
                setChatSessions((prev) => [newSession, ...prev]);
              }}
              className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-[#1f1f1d] transition duration-150 ease-out hover:bg-gold-hover"
            >
              New Chat
            </button>
          </div>
        </div>
      )}
    </>
  );
}
