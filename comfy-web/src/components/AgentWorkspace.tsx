'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { sceneAgent, type AgentStatus, type AgentEvent } from '@/lib/scene-agent/scene-agent';
import type { Task } from '@/lib/scene-agent/task-queue';
import type { ScenePlan } from '@/lib/scene-agent/scene-planner';
import type { AgentSession, Lora, VideoGalleryItem } from '@/types';
import VideoUpscaleDialog from './VideoUpscaleDialog';

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: 'Ready',
  clarifying: 'Clarifying Scene',
  planning: 'Planning Scene',
  running: 'Generating Scene',
  completed: 'Scene Complete',
  failed: 'Failed',
};

const STATUS_ICONS: Record<AgentStatus, string> = {
  idle: '○',
  clarifying: '?',
  planning: '◎',
  running: '◉',
  completed: '✓',
  failed: '✕',
};

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: 'bg-[#6b6560]',
  clarifying: 'bg-[#c9a87a]',
  planning: 'bg-[#c9a87a]',
  running: 'animate-pulse bg-[#c9a87a]',
  completed: 'bg-[#6bbf7a]',
  failed: 'bg-[#e87a7a]',
};

const TASK_LABELS: Record<string, string> = {
  plan: 'Planning Scene',
  cleanup: 'Cleaning Memory',
  enhance_prompt: 'Enhancing Prompt',
  generate_image: 'Generating Keyframe',
  generate_video: 'Generating Video Segment',
  extract_frame: 'Extracting Continuity Frame',
  merge_segments: 'Merging Final Video',
};

interface RatioPreset {
  label: string;
  imgWidth: number;
  imgHeight: number;
  videoWidth: number;
  videoHeight: number;
}

const RATIO_PRESETS: RatioPreset[] = [
  { label: '1:1',  imgWidth: 1024, imgHeight: 1024, videoWidth: 720,  videoHeight: 720 },
  { label: '9:16', imgWidth: 768,  imgHeight: 1360, videoWidth: 720,  videoHeight: 1280 },
  { label: '16:9', imgWidth: 1360, imgHeight: 768,  videoWidth: 1280, videoHeight: 720 },
  { label: '4:3',  imgWidth: 1152, imgHeight: 864,  videoWidth: 960,  videoHeight: 720 },
  { label: '3:2',  imgWidth: 1152, imgHeight: 768,  videoWidth: 1080, videoHeight: 720 },
];

const IMAGE_STYLES = ["realistic", "photography", "cinematic", "anime", "cgi"];

const AVAILABLE_LORAS = [
  "RealisticSnapshot-Zimage-Turbov5.safetensors",
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

function TaskRow({ task }: { task: Task }) {
  const isActive = task.status === 'running';
  const isDone = task.status === 'completed';
  const isFailed = task.status === 'failed';
  const isPending = task.status === 'pending';

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-all ${
        isActive
          ? 'border-[#c9a87a]/60 bg-[#c9a87a]/10'
          : isDone
            ? 'border-[#3a5540] bg-[#1a2f20]/40'
            : isFailed
              ? 'border-[#7d463f] bg-[#3f2a27]/40'
              : 'border-[#3a3936] bg-transparent'
      }`}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        {isActive ? (
          <svg className="h-4 w-4 animate-spin text-[#c9a87a]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : isDone ? (
          <svg className="h-4 w-4 text-[#6bbf7a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : isFailed ? (
          <svg className="h-4 w-4 text-[#e87a7a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <div className="h-2 w-2 rounded-full bg-[#4a4944]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              isActive ? 'text-[#edeae2]' : isDone ? 'text-[#9bbf9a]' : isFailed ? 'text-[#e87a7a]' : 'text-[#8f887b]'
            }`}
          >
            {task.label}
          </span>
          {isActive && task.total > 0 && (
            <span className="text-xs tabular-nums text-[#c9a87a]">
              {Math.round((task.progress / task.total) * 100)}%
            </span>
          )}
        </div>
        {isActive && task.total > 0 && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#3a3936]">
            <div
              className="h-full rounded-full bg-[#c9a87a] transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, (task.progress / task.total) * 100)}%` }}
            />
          </div>
        )}
        {isFailed && task.error && (
          <p className="mt-1 text-xs text-[#e87a7a] truncate">{task.error}</p>
        )}
      </div>
    </div>
  );
}

function ScenePreview({ plan }: { plan: ScenePlan | null }) {
  if (!plan) return null;

  return (
    <div className="rounded-xl border border-[#3f3e3a] bg-[#2f2f2d] p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-[#6b6560]">Scene Plan</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#9f988c]">Duration</span>
          <span className="text-[#edeae2] font-medium">{plan.scene.duration}s ({plan.scene.segments} segments)</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#9f988c]">Style</span>
          <span className="text-[#edeae2] font-medium">{plan.scene.style}</span>
        </div>
        <div className="border-t border-[#3a3936] pt-2 mt-2">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-[#6b6560]">Continuity</p>
          <div className="space-y-1">
            <p className="text-xs text-[#bcb6aa]"><span className="text-[#9f988c]">Lighting:</span> {plan.scene.continuity.lighting}</p>
            <p className="text-xs text-[#bcb6aa]"><span className="text-[#9f988c]">Camera:</span> {plan.scene.continuity.camera_motion}</p>
            <p className="text-xs text-[#bcb6aa]"><span className="text-[#9f988c]">Subject:</span> {plan.scene.continuity.subject}</p>
          </div>
        </div>
        {plan.continuity_notes.length > 0 && (
          <div className="border-t border-[#3a3936] pt-2 mt-2">
            <p className="mb-1 text-[10px] uppercase tracking-widest text-[#6b6560]">Notes</p>
            {plan.continuity_notes.map((note, i) => (
              <p key={i} className="text-xs text-[#bcb6aa]">• {note}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AgentWorkspaceProps {
  agentSessions: AgentSession[];
  setAgentSessions: React.Dispatch<React.SetStateAction<AgentSession[]>>;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  availableModels: string[];
  selectedModel: string;
  switchModel: (model: string) => void;
}

export default function AgentWorkspace({
  agentSessions,
  setAgentSessions,
  activeSessionId,
  setActiveSessionId,
  availableModels,
  selectedModel,
  switchModel,
}: AgentWorkspaceProps) {
  const logsRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(
    () => agentSessions.find((s) => s.id === activeSessionId),
    [agentSessions, activeSessionId],
  );

  const [userInput, setUserInput] = useState('');
  const [duration, setDuration] = useState(10);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [imageStyle, setImageStyle] = useState('realistic');
  const [selectedLora, setSelectedLora] = useState<Lora>({ name: '', strength_model: 1.0, strength_clip: 1.0 });
  const [isRunning, setIsRunning] = useState(false);
  const [isUpscaleOpen, setIsUpscaleOpen] = useState(false);
  const [videoToUpscale, setVideoToUpscale] = useState<VideoGalleryItem | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [editableImagePrompt, setEditableImagePrompt] = useState('');
  const [isAwaitingImageConfirm, setIsAwaitingImageConfirm] = useState(false);

  useEffect(() => {
    setSelectedImagePreview(null);
    setEditableImagePrompt('');
    setIsAwaitingImageConfirm(false);
  }, [activeSessionId]);

  const status = (activeSession?.status || 'idle') as AgentStatus;

  useEffect(() => {
    const unsub = sceneAgent.subscribe((event: AgentEvent) => {
      if (!activeSessionId) return;

      switch (event.type) {
        case 'status':
          if (event.data === 'idle' || event.data === 'completed' || event.data === 'failed') {
            setIsAwaitingImageConfirm(false);
            setSelectedImagePreview(null);
          }
          setAgentSessions((prev) =>
            prev.map((s) => (s.id === activeSessionId ? { ...s, status: event.data } : s)),
          );
          break;
        case 'plan':
          if (event.data && event.data.video_prompts) {
            setAgentSessions((prev) =>
              prev.map((s) => (s.id === activeSessionId ? { ...s, scenePlan: event.data } : s)),
            );
          }
          break;
        case 'task_update':
          setAgentSessions((prev) =>
            prev.map((s) => (s.id === activeSessionId ? { ...s, tasks: [...sceneAgent.queueTasks] } : s)),
          );
          break;
        case 'clarification':
          setAgentSessions((prev) =>
            prev.map((s) => (s.id === activeSessionId ? { ...s, logs: [...s.logs, `[Agent] ${event.data}`] } : s)),
          );
          break;
        case 'output':
          if (event.data?.video_path) {
            setAgentSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId
                  ? {
                      ...s,
                      outputVideo: event.data.video_path,
                      generatedFiles: [...new Set([...s.generatedFiles, event.data.video_path])],
                      logs: [...s.logs, `[Output] Video ready: ${event.data.video_path}`],
                    }
                  : s,
              ),
            );
          }
          break;
        case 'image_generated':
          if (event.data?.url) {
            setSelectedImagePreview(event.data.url);
            setEditableImagePrompt(event.data.prompt || '');
            setIsAwaitingImageConfirm(true);
            if (event.data?.filename) {
              setAgentSessions((prev) =>
                prev.map((s) =>
                  s.id === activeSessionId
                    ? { ...s, generatedFiles: [...new Set([...s.generatedFiles, event.data.filename])] }
                    : s,
                ),
              );
            }
          }
          break;
        case 'error':
          setAgentSessions((prev) =>
            prev.map((s) =>
              s.id === activeSessionId ? { ...s, logs: [...s.logs, `[Error] ${event.data}`] } : s,
            ),
          );
          toast.error(event.data);
          setIsAwaitingImageConfirm(false);
          setSelectedImagePreview(null);
          break;
        case 'complete':
          setAgentSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSessionId) return s;
              const segmentFiles: string[] = (event.data?.videoSegments || []).map(
                (seg: { filename: string }) => seg.filename,
              );
              const imageFile = event.data?.imageFilename;
              const allFiles = imageFile
                ? [...segmentFiles, imageFile]
                : segmentFiles;
              return {
                ...s,
                logs: [...s.logs, '[Complete] Scene generation finished'],
                generatedFiles: [...new Set([...s.generatedFiles, ...allFiles])],
              };
            }),
          );
          setIsRunning(false);
          setIsAwaitingImageConfirm(false);
          setSelectedImagePreview(null);
          toast.success('Scene generation complete!');
          break;
      }
    });

    return unsub;
  }, [activeSessionId, setAgentSessions]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [activeSession?.logs]);

  const parseRatioFromSession = (session: typeof activeSession): string => {
    if (!session) return '9:16';
    const log = session.logs.find((l) => l.startsWith('[Agent] Aspect Ratio:'));
    if (log) {
      const match = log.match(/\[Agent\] Aspect Ratio: ([\d:]+)/);
      if (match) return match[1];
    }
    return '9:16';
  };

  useEffect(() => {
    if (activeSession && activeSession.status !== 'running' && activeSession.status !== 'planning' && activeSession.status !== 'clarifying') {
      setUserInput(activeSession.description);
      setDuration(activeSession.duration);
      setAspectRatio(parseRatioFromSession(activeSession));
    }
  }, [activeSession?.id]);

  const isGenerating = status === 'running' || status === 'planning' || status === 'clarifying';

  useEffect(() => {
    setIsRunning(isGenerating);
  }, [isGenerating]);

  const activeRatio = RATIO_PRESETS.find((r) => r.label === aspectRatio) || RATIO_PRESETS[0];

  const handleStartOrRestart = async () => {
    if (!userInput.trim() || !selectedModel || isRunning) return;

    const sessionId = activeSessionId;
    if (!sessionId) return;

    setAgentSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              status: 'idle',
              description: userInput.trim(),
              duration,
              tasks: [],
              logs: [
                `[Agent] Starting scene: "${userInput.trim()}"`,
                `[Agent] Duration: ${duration}s`,
                `[Agent] Aspect Ratio: ${activeRatio.label} (${activeRatio.videoWidth}x${activeRatio.videoHeight})`,
                `[Agent] Style: ${imageStyle}`,
                ...(selectedLora.name ? [`[Agent] LoRA: ${selectedLora.name} (strength_model: ${selectedLora.strength_model})`] : []),
                `[Agent] Model: ${selectedModel}`,
              ],
              outputVideo: null,
              scenePlan: null,
              generatedFiles: [],
            }
          : s,
      ),
    );

    setIsRunning(true);

    try {
      await sceneAgent.startScene(userInput.trim(), duration, selectedModel, {
        imageWidth: activeRatio.imgWidth,
        imageHeight: activeRatio.imgHeight,
        videoWidth: activeRatio.videoWidth,
        videoHeight: activeRatio.videoHeight,
        videoFrames: 81,
        workflow: 'wan',
        imageStyle,
        styleDescription: STYLE_DESCRIPTIONS[imageStyle] || '',
        lora: selectedLora.name ? { name: selectedLora.name, strength_model: selectedLora.strength_model, strength_clip: selectedLora.strength_clip } : null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Agent failed';
      setAgentSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, status: 'failed', logs: [...s.logs, `[Error] ${msg}`] } : s,
        ),
      );
      toast.error(msg);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRestart = () => {
    if (!activeSession) return;
    setUserInput(activeSession.description);
    setDuration(activeSession.duration);
    setAspectRatio(parseRatioFromSession(activeSession));
      setAgentSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, status: 'idle', tasks: [], logs: [], outputVideo: null, scenePlan: null, generatedFiles: [] }
            : s,
        ),
      );
    };

  const openUpscale = () => {
    if (!activeSession?.outputVideo) return;
    setVideoToUpscale({
      id: `upscale_${Date.now()}`,
      filename: activeSession.outputVideo,
      subfolder: 'video',
      prompt: activeSession.description || 'Agent scene',
      width: activeRatio.videoWidth,
      height: activeRatio.videoHeight,
    });
    setIsUpscaleOpen(true);
  };

  const handleUpscaleSuccess = (newVideo: VideoGalleryItem) => {
    setAgentSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              outputVideo: newVideo.filename,
              generatedFiles: [...new Set([...s.generatedFiles, newVideo.filename])],
              logs: [...s.logs, `[Output] Video upscaled: ${newVideo.filename}`],
            }
          : s,
      ),
    );
    toast.success('Video upscaled successfully');
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[#3a3936] bg-[#2a2a28]/95 px-8 py-5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} />
            <div>
              <h1 className="text-base font-semibold text-[#edeae2]">{activeSession?.title || 'AI Scene Agent'}</h1>
              <p className="text-xs text-[#9f988c]">{STATUS_LABELS[status]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                onClick={() => { sceneAgent.abort(); setIsRunning(false); }}
                className="rounded-lg border border-[#7d463f] bg-[#3f2a27] px-3 py-1.5 text-xs text-[#ffbeb4] transition hover:bg-[#5a3430]"
              >
                Abort
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto w-full max-w-4xl space-y-6">

          {activeSession && !isRunning && (
            <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
              <p className="mb-3 text-[10px] uppercase tracking-widest text-[#6b6560]">Describe Your Scene</p>

              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Describe the scene naturally...&#10;&#10;Example: 'Create a 10 second cinematic cyberpunk alley scene with neon rain reflections and a mysterious figure walking through mist.'"
                rows={5}
                className="w-full resize-none rounded-xl border border-[#494741] bg-[#262624] px-3 py-3 text-sm text-[#ece8df] outline-none transition placeholder:text-[#6b6560] focus:border-[#b9986d]"
              />

              <div className="mt-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Model</span>
                    <div className="relative">
                      <select
                        value={selectedModel}
                        onChange={(e) => switchModel(e.target.value)}
                        disabled={availableModels.length === 0}
                        className="rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none truncate"
                      >
                        {availableModels.length === 0 ? (
                          <option value="">No models</option>
                        ) : (
                          availableModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))
                        )}
                      </select>
                      <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b6560]">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Style</span>
                    <div className="relative">
                      <select
                        value={imageStyle}
                        onChange={(e) => setImageStyle(e.target.value)}
                        className="rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none"
                      >
                        {IMAGE_STYLES.map((style) => (
                          <option key={style} value={style}>
                            {style.charAt(0).toUpperCase() + style.slice(1)}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b6560]">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleStartOrRestart}
                    disabled={!userInput.trim() || !selectedModel || isRunning}
                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#c9a87a] px-5 py-2.5 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d] disabled:opacity-40 self-end"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    </svg>
                    Generate Scene
                  </button>
                </div>

                <div className="mt-3 h-px bg-[#3a3835]" />

                <div className="mt-3 flex flex-wrap items-end gap-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Duration</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={3}
                        max={60}
                        step={1}
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value))}
                        className="w-36 appearance-none rounded-full bg-[#494741] py-1 cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none
                          [&::-webkit-slider-thumb]:h-4
                          [&::-webkit-slider-thumb]:w-4
                          [&::-webkit-slider-thumb]:rounded-full
                          [&::-webkit-slider-thumb]:bg-[#c9a87a]
                          [&::-webkit-slider-thumb]:cursor-pointer"
                      />
                      <span className="w-8 text-center text-sm tabular-nums text-[#c9a87a]">{duration}s</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">Aspect Ratio</span>
                    <div className="flex gap-1.5">
                      {RATIO_PRESETS.map((r) => (
                        <button
                          key={r.label}
                          onClick={() => setAspectRatio(r.label)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            aspectRatio === r.label
                              ? 'border-[#c9a87a] bg-[#c9a87a]/15 text-[#edeae2]'
                              : 'border-[#494741] bg-[#262624] text-[#9f988c] hover:border-[#5a4f40] hover:text-[#edeae2]'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {AVAILABLE_LORAS.length > 0 && (
                  <>
                    <div className="mt-3 h-px bg-[#3a3835]" />
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-widest text-[#6b6560]">LoRA (Image Only)</span>
                        <div className="relative max-w-[280px]">
                          <select
                            value={selectedLora.name}
                            onChange={(e) => setSelectedLora({ ...selectedLora, name: e.target.value })}
                            className="w-full rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 pr-8 text-xs text-[#edeae2] outline-none transition focus:border-[#b9986d] appearance-none"
                          >
                            <option value="">None</option>
                            {AVAILABLE_LORAS.map((loraName) => (
                              <option key={loraName} value={loraName}>
                                {loraName.replace('.safetensors', '')}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b6560]">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>
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
                            className="
                              flex-1 h-1.5 appearance-none rounded-full outline-none
                              bg-[#494741] cursor-pointer
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
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeSession && !!activeSession.scenePlan && (
            <ScenePreview plan={activeSession.scenePlan as unknown as ScenePlan} />
          )}

          {activeSession && activeSession.tasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-[#6b6560]">Progress</p>
              {(activeSession.tasks as Task[]).map((task) => (
                <div key={task.id}>
                  <TaskRow task={task} />
                  {task.type === 'generate_image' && isAwaitingImageConfirm && selectedImagePreview && (
                    <div className="mb-2 mt-3 rounded-xl border border-[#c9a87a]/30 bg-[#2a2a28] p-4">
                      <p className="mb-2 text-[10px] uppercase tracking-widest text-[#c9a87a]">Keyframe Preview</p>
                      <p className="mb-3 text-xs text-[#9f988c]">Review the generated keyframe. Edit the prompt and regenerate if needed, then confirm to continue with video generation.</p>
                      <div className="overflow-hidden rounded-lg bg-[#1a1a18] mb-3">
                        <img
                          src={selectedImagePreview}
                          alt="Generated keyframe"
                          className="w-full max-h-[500px] object-contain"
                        />
                      </div>
                      <textarea
                        value={editableImagePrompt}
                        onChange={(e) => setEditableImagePrompt(e.target.value)}
                        placeholder="Enter image prompt..."
                        rows={3}
                        className="w-full resize-none rounded-xl border border-[#494741] bg-[#262624] px-3 py-3 text-sm text-[#ece8df] outline-none transition placeholder:text-[#6b6560] focus:border-[#b9986d] mb-3"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => sceneAgent.regenerateImage(editableImagePrompt)}
                          className="rounded-lg border border-[#c9a87a]/40 bg-[#3a352e] px-4 py-2 text-xs text-[#f2dbc0] transition hover:bg-[#4a433a] hover:border-[#c9a87a]"
                        >
                          Regenerate
                        </button>
                        <button
                          onClick={() => {
                            sceneAgent.confirmImage();
                            setIsAwaitingImageConfirm(false);
                            setSelectedImagePreview(null);
                          }}
                          className="rounded-lg bg-[#c9a87a] px-4 py-2 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d]"
                        >
                          Confirm & Continue
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeSession && activeSession.logs.length > 0 && (
            <div className="rounded-xl border border-[#3f3e3a] bg-[#1f1f1d] p-4">
              <p className="mb-2 text-[10px] uppercase tracking-widest text-[#6b6560]">Agent Log</p>
              <div ref={logsRef} className="max-h-48 overflow-y-auto space-y-1">
                {activeSession.logs.map((log, i) => (
                  <p key={i} className="text-xs font-mono text-[#8f887b]">{log}</p>
                ))}
              </div>
            </div>
          )}

          {activeSession && activeSession.outputVideo && (
            <div className="rounded-2xl border border-[#3f3e3a] bg-[#2f2f2d] p-5 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
              <p className="mb-3 text-[10px] uppercase tracking-widest text-[#6b6560]">Scene Output</p>
              <div className="overflow-hidden rounded-xl bg-[#1a1a18]">
                <video
                  src={`/generated/${activeSession.outputVideo}`}
                  controls
                  className="w-full max-h-[500px]"
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => window.open(`/generated/${activeSession.outputVideo}`, '_blank')}
                  className="rounded-lg border border-[#5a4f40] bg-[#3a352e] px-3 py-2 text-xs text-[#f2dbc0] transition hover:bg-[#4a433a]"
                >
                  Open in New Tab
                </button>
                <button
                  onClick={openUpscale}
                  className="rounded-lg border border-[#c9a87a]/40 bg-[#3a352e] px-3 py-2 text-xs text-[#f2dbc0] transition hover:bg-[#4a433a] hover:border-[#c9a87a]"
                >
                  Upscale
                </button>
              </div>
            </div>
          )}

          {(status === 'completed' || status === 'failed') && activeSession && (
            <div className="flex items-center gap-3">
              {status === 'failed' && (
                <p className="text-xs text-[#e87a7a]">Generation failed. You can try again or create a new scene.</p>
              )}
              {status === 'completed' && (
                <p className="text-xs text-[#9bbf9a]">Scene complete. Generate a new scene or restart?</p>
              )}
              <button
                onClick={handleRestart}
                className="rounded-lg border border-[#5a4f40] bg-[#3a352e] px-3 py-2 text-xs text-[#f2dbc0] transition hover:bg-[#4a433a]"
              >
                Restart
              </button>
              <button
                onClick={() => {
                  setUserInput('');
                  setDuration(10);
                  const newSession: AgentSession = {
                    id: `agent_${Date.now()}`,
                    title: `Scene ${agentSessions.length + 1}`,
                    description: '',
                    duration: 10,
                    status: 'idle',
                    scenePlan: null,
                    tasks: [],
                    logs: [],
                    outputVideo: null,
                    generatedFiles: [],
                    createdAt: Date.now(),
                    model: selectedModel || availableModels[0] || '',
                  };
                  setAgentSessions((prev) => [newSession, ...prev]);
                  setActiveSessionId(newSession.id);
                }}
                className="rounded-lg border border-[#494741] bg-[#262624] px-3 py-2 text-xs text-[#bcb6aa] transition hover:border-[#5a4f40] hover:text-[#edeae2]"
              >
                New Scene
              </button>
            </div>
          )}

          {!activeSession && (
            <div className="flex flex-1 items-center justify-center py-20">
              <div className="space-y-3 text-center">
                <p className="text-sm text-[#9f988c]">No scene selected.</p>
                <button
                  onClick={() => {
                    const newSession: AgentSession = {
                      id: `agent_${Date.now()}`,
                      title: `Scene ${agentSessions.length + 1}`,
                      description: '',
                      duration: 10,
                      status: 'idle',
                      scenePlan: null,
                      tasks: [],
                      logs: [],
                      outputVideo: null,
                      generatedFiles: [],
                      createdAt: Date.now(),
                      model: selectedModel || availableModels[0] || '',
                    };
                    setAgentSessions((prev) => [newSession, ...prev]);
                    setActiveSessionId(newSession.id);
                  }}
                  className="rounded-lg bg-[#c9a87a] px-3 py-2 text-xs font-semibold text-[#1f1f1d] transition hover:bg-[#d8b88d]"
                >
                  New Scene
                </button>
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
          selectedModel={selectedModel}
          onSuccess={handleUpscaleSuccess}
        />
      )}
    </>
  );
}
