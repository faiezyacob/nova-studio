import { TaskQueue } from './task-queue';
import { createInitialContinuity, setContinuityOn, setLastFrameOn, advanceSegmentOn, addContinuityNoteOn, type ContinuityState } from './continuity-manager';
import { fullCleanup } from './resource-manager';
import { generateScenePlan, askClarification, type ScenePlan } from './scene-planner';
import { generateImage, generateVideoSegment, extractLastFrameFromVideo, mergeVideoSegments } from './workflow-executor';
import type { Lora } from '@/types';

export type AgentStatus = 'idle' | 'clarifying' | 'planning' | 'running' | 'completed' | 'failed';

export type AgentEventType =
  | 'status'
  | 'clarification'
  | 'plan'
  | 'progress'
  | 'task_update'
  | 'output'
  | 'error'
  | 'image_generated'
  | 'complete';

export interface AgentEvent {
  type: AgentEventType;
  data: any;
}

export type AgentListener = (event: AgentEvent) => void;

const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;
const VIDEO_FRAMES = 81;
const VIDEO_WORKFLOW = 'wan' as const;

export class SceneAgent {
  private queue = new TaskQueue();
  private listeners: Set<AgentListener> = new Set();
  private _status: AgentStatus = 'idle';
  private _model = '';
  private _scenePlan: ScenePlan | null = null;
  private _imageConfirmResolve: ((value: 'confirm' | 'regenerate' | 'abort') => void) | null = null;
  private _currentImagePrompt: string = '';

  private _generationLock = false;
  private _continuity: ContinuityState = createInitialContinuity();
  private _modelToUnload: string | null = null;

  get status(): AgentStatus {
    return this._status;
  }

  get queueTasks() {
    return this.queue.allTasks;
  }

  get currentTask() {
    return this.queue.currentTask;
  }

  get running(): boolean {
    return this.queue.running || this._status === 'running';
  }

  get isLocked(): boolean {
    return this._generationLock;
  }

  private acquireLock(): boolean {
    if (this._generationLock) return false;
    this._generationLock = true;
    return true;
  }

  private releaseLock(): void {
    this._generationLock = false;
  }

  subscribe(listener: AgentListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch {}
    }
  }

  private setStatus(status: AgentStatus): void {
    this._status = status;
    this.emit({ type: 'status', data: status });
  }

  async clarifyScene(userInput: string, model: string): Promise<string> {
    this._model = model;
    this.setStatus('clarifying');
    const response = await askClarification(userInput, model);
    this.emit({ type: 'clarification', data: response });
    return response;
  }

  async startScene(
    userDescription: string,
    durationSeconds: number,
    model: string,
    options?: {
      imageWidth?: number;
      imageHeight?: number;
      videoWidth?: number;
      videoHeight?: number;
      videoFrames?: number;
      workflow?: 'wan' | 'ltx';
      imageStyle?: string;
      styleDescription?: string;
      lora?: Lora | null;
    },
  ): Promise<void> {
    if (!this.acquireLock()) {
      this.emit({ type: 'error', data: 'Generation already in progress' });
      return;
    }

    this._model = model;
    this._modelToUnload = model;
    this.queue.reset();
    this._continuity = createInitialContinuity();

    const imageWidth = options?.imageWidth || DEFAULT_WIDTH;
    const imageHeight = options?.imageHeight || DEFAULT_HEIGHT;
    const videoWidth = options?.videoWidth ?? imageWidth;
    const videoHeight = options?.videoHeight ?? imageHeight;
    const videoFrames = options?.videoFrames || VIDEO_FRAMES;
    const workflow = options?.workflow || VIDEO_WORKFLOW;

    try {
      this.setStatus('planning');
      this.emit({ type: 'plan', data: { phase: 'generating' } });

      const plan = await generateScenePlan(userDescription, durationSeconds, model, options?.imageStyle, options?.styleDescription);
      this._scenePlan = plan;
      this._continuity = setContinuityOn(this._continuity, {
        totalSegments: plan.scene.segments,
        sceneDescription: plan.scene.continuity.subject,
        continuityNotes: plan.continuity_notes,
      });

      this.emit({ type: 'plan', data: plan });

      this.setStatus('running');

      this.queue.addTask('cleanup', 'Cleaning VRAM & RAM');
      this.queue.addTask('generate_image', 'Generating Keyframe', { prompt: plan.image_prompt });
      for (let i = 0; i < plan.scene.segments; i++) {
        this.queue.addTask('cleanup', `Cleaning memory for segment ${i + 1}`);
        this.queue.addTask('generate_video', `Generating Segment ${i + 1}/${plan.scene.segments}`, { prompt: plan.video_prompts[i] });
        if (i < plan.scene.segments - 1) {
          this.queue.addTask('extract_frame', `Extracting continuity frame ${i + 1}`);
        }
      }
      this.queue.addTask('merge_segments', 'Merging Final Video');

      this.queue.subscribe((task) => {
        this.emit({ type: 'task_update', data: task });
      });

      let imageFilename: string | null = null;
      const videoSegments: { filename: string; subfolder?: string }[] = [];
      const frameFiles: { filename: string; subfolder: string }[] = [];
      const segmentPrompts = [...plan.video_prompts];

      await this.queue.runTask(async () => {
        await fullCleanup(this._modelToUnload);
      });

      imageFilename = await this.queue.runTask(async (task) => {
        const finalPrompt = plan.image_prompt;
        const result = await generateImage(finalPrompt, imageWidth, imageHeight, options?.lora || null, this.queue, task.id);
        if (!result) throw new Error('Image generation failed');
        return result;
      });

      if (!imageFilename) throw new Error('Failed to generate keyframe');

      this._currentImagePrompt = plan.image_prompt;
      let imageConfirmed = false;
      let imageDataUrl = '';

      while (!imageConfirmed) {
        imageDataUrl = `/generated/${imageFilename}`;

        this.emit({
          type: 'image_generated',
          data: {
            filename: imageFilename,
            url: imageDataUrl,
            prompt: this._currentImagePrompt,
          },
        });

        const action = await new Promise<'confirm' | 'regenerate' | 'abort'>((resolve) => {
          this._imageConfirmResolve = resolve;
        });

        if (action === 'abort') {
          this.setStatus('idle');
          return;
        }

        if (action === 'regenerate') {
          if (imageFilename) {
            try {
              await fetch(`/api/comfy/images?filename=${encodeURIComponent(imageFilename)}&type=image`, { method: 'DELETE' });
            } catch {}
          }
          imageFilename = await this.queue.rerunTask('generate_image', async (task) => {
            const finalPrompt = this._currentImagePrompt;
            const result = await generateImage(finalPrompt, imageWidth, imageHeight, options?.lora || null, this.queue, task.id);
            if (!result) throw new Error('Image regeneration failed');
            return result;
          });
          continue;
        }

        imageConfirmed = true;
      }

      for (let segIdx = 0; segIdx < segmentPrompts.length; segIdx++) {
        if (this.queue.isAborted) break;

        await this.queue.runTask(async () => {
          await fullCleanup(this._modelToUnload);
        });

        const videoPrompt = segmentPrompts[segIdx];
        const continuity = this._continuity;
        const enhancedPrompt = continuity.continuityNotes.length > 0
          ? `${videoPrompt}\n\nContinuity: ${continuity.continuityNotes.join('; ')}`
          : videoPrompt;

        const videoResult = await this.queue.runTask(async (task) => {
          const currentImage = continuity.lastFrameDataUrl || imageDataUrl;
          const currentImageName = continuity.lastFrameFilename || imageFilename!;

          const result = await generateVideoSegment(
            currentImage,
            currentImageName,
            enhancedPrompt,
            videoWidth,
            videoHeight,
            videoFrames,
            workflow,
            this.queue,
            task.id,
            imageWidth,
            imageHeight,
          );
          if (!result) throw new Error('Video generation failed');
          return result;
        });

        if (!videoResult) throw new Error('Video segment generation failed');

        videoSegments.push({
          filename: videoResult.video_path,
          subfolder: videoResult.subfolder,
        });

        if (videoResult.frame_path) {
          frameFiles.push({
            filename: videoResult.frame_path,
            subfolder: videoResult.frame_subfolder || 'frame',
          });
        }

        if (segIdx < segmentPrompts.length - 1) {
          await this.queue.runTask(async (task) => {
            if (videoResult.frame_path) {
              const frameUrl = `/generated/${videoResult.frame_path}`;
              this._continuity = setLastFrameOn(this._continuity, frameUrl, videoResult.frame_path);
              this._continuity = addContinuityNoteOn(this._continuity, `Segment ${segIdx + 1} completed. Continuity maintained.`);
            } else {
              const frame = await extractLastFrameFromVideo(videoResult.video_path);
              if (frame) {
                frameFiles.push({
                  filename: frame.filename,
                  subfolder: '',
                });
                this._continuity = setLastFrameOn(this._continuity, frame.dataUrl, frame.filename);
                this._continuity = addContinuityNoteOn(this._continuity, `Segment ${segIdx + 1} completed. Continuity maintained.`);
              }
            }
            this._continuity = advanceSegmentOn(this._continuity);
          });
        } else {
          this._continuity = advanceSegmentOn(this._continuity);
        }
      }

      if (!this.queue.isAborted) {
        if (videoSegments.length <= 1) {
          const single = videoSegments[0];
          if (single) {
            this.emit({ type: 'output', data: { video_path: single.filename } });
          }
        } else {
          await this.queue.runTask(async (task) => {
            this.emit({ type: 'progress', data: { label: 'Merging video segments...', progress: 0, total: 1 } });
            const merged = await mergeVideoSegments(videoSegments);
            if (merged) {
              this.emit({ type: 'output', data: merged });
            }
          });
        }
      }

      this.setStatus('completed');
      this.emit({ type: 'complete', data: { videoSegments, scenePlan: plan, imageFilename, frameFiles } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus('failed');
      this.emit({ type: 'error', data: msg });
    } finally {
      this.releaseLock();
      this._modelToUnload = null;
    }
  }

  async confirmImage(): Promise<void> {
    if (this._imageConfirmResolve) {
      this._imageConfirmResolve('confirm');
      this._imageConfirmResolve = null;
    }
  }

  async regenerateImage(prompt: string): Promise<void> {
    this._currentImagePrompt = prompt;
    if (this._imageConfirmResolve) {
      this._imageConfirmResolve('regenerate');
      this._imageConfirmResolve = null;
    }
  }

  abort(): void {
    this.queue.abort();
    this.setStatus('idle');
    if (this._imageConfirmResolve) {
      this._imageConfirmResolve('abort');
      this._imageConfirmResolve = null;
    }
    this.releaseLock();
    this._modelToUnload = null;
  }
}

export const sceneAgent = new SceneAgent();
