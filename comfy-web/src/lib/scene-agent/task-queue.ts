import { nanoid } from 'nanoid';

export type TaskType =
  | 'plan'
  | 'cleanup'
  | 'enhance_prompt'
  | 'generate_image'
  | 'generate_video'
  | 'extract_frame'
  | 'merge_segments';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface Task {
  id: string;
  type: TaskType;
  label: string;
  status: TaskStatus;
  progress: number;
  total: number;
  startTime: number | null;
  endTime: number | null;
  error: string | null;
  data?: Record<string, unknown>;
}

export type TaskListener = (task: Task) => void;

export class TaskQueue {
  private tasks: Task[] = [];
  private currentIndex = -1;
  private listeners: Set<TaskListener> = new Set();
  private _running = false;
  private _aborted = false;

  get running(): boolean {
    return this._running;
  }

  get currentTask(): Task | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.tasks.length) {
      return this.tasks[this.currentIndex];
    }
    return null;
  }

  get allTasks(): Task[] {
    return this.tasks;
  }

  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addTask(type: TaskType, label: string, data?: Record<string, unknown>): Task {
    const task: Task = {
      id: nanoid(),
      type,
      label,
      status: 'pending',
      progress: 0,
      total: 100,
      startTime: null,
      endTime: null,
      error: null,
      data,
    };
    this.tasks.push(task);
    this.notify(task);
    return task;
  }

  addTasks(tasks: { type: TaskType; label: string; data?: Record<string, unknown> }[]): Task[] {
    return tasks.map(t => this.addTask(t.type, t.label, t.data));
  }

  private notify(task: Task): void {
    for (const listener of this.listeners) {
      try { listener(task); } catch { }
    }
  }

  private updateTask(id: string, updates: Partial<Task>): void {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      Object.assign(task, updates);
      this.notify(task);
    }
  }

  async runTask<T>(handler: (task: Task) => Promise<T>): Promise<T | null> {
    if (this._aborted) return null;

    this.currentIndex++;
    if (this.currentIndex >= this.tasks.length) {
      this.currentIndex--;
      return null;
    }

    const task = this.tasks[this.currentIndex];
    task.status = 'running';
    task.startTime = Date.now();
    this.notify(task);

    try {
      const result = await handler(task);
      task.status = 'completed';
      task.progress = task.total;
      task.endTime = Date.now();
      this.notify(task);
      return result;
    } catch (err) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.endTime = Date.now();
      this.notify(task);
      return null;
    }
  }

  updateProgress(id: string, progress: number, total: number): void {
    this.updateTask(id, { progress, total });
  }

  async rerunTask<T>(type: TaskType, handler: (task: Task) => Promise<T>): Promise<T> {
    const task = this.tasks.find(t => t.type === type);
    if (!task) throw new Error(`Task "${type}" not found for rerun`);

    task.status = 'running';
    task.progress = 0;
    task.total = 100;
    task.startTime = Date.now();
    task.endTime = null;
    task.error = null;
    this.notify(task);

    try {
      const result = await handler(task);
      task.status = 'completed';
      task.progress = task.total;
      task.endTime = Date.now();
      this.notify(task);
      return result;
    } catch (err) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.endTime = Date.now();
      this.notify(task);
      throw err;
    }
  }

  abort(): void {
    this._aborted = true;
  }

  get isAborted(): boolean {
    return this._aborted;
  }

  reset(): void {
    this.tasks = [];
    this.currentIndex = -1;
    this._running = false;
    this._aborted = false;
  }
}
