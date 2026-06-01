export { sceneAgent, SceneAgent } from './scene-agent';
export type { AgentStatus, AgentEvent, AgentEventType, AgentListener } from './scene-agent';

export { TaskQueue, acquireGenerationLock, releaseGenerationLock, isGenerationLocked } from './task-queue';
export type { Task, TaskType, TaskStatus, TaskListener } from './task-queue';

export { fullCleanup, cleanupMemory, waitForMemoryStable, setModelToUnload } from './resource-manager';

export { resetContinuity, getContinuity, setContinuity, setLastFrame, advanceSegment, addContinuityNote } from './continuity-manager';
export type { ContinuityState } from './continuity-manager';

export { generateScenePlan, askClarification } from './scene-planner';
export type { ScenePlan } from './scene-planner';

export { generateImage, generateVideoSegment, extractLastFrameFromVideo, mergeVideoSegments } from './workflow-executor';
