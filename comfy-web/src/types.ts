export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // base64 strings or URLs
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
}

export interface GalleryItem {
  filename: string;
  prompt: string;
  timestamp: number;
  style: string;
  seed?: number;
  hidden?: boolean;
  width?: number;
  height?: number;
}

export interface VideoGalleryItem {
  id: string;
  filename: string;
  prompt: string;
  timestamp: number;
  subfolder?: string;
  resolution?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
}

export interface HistoryEntry {
  outputs: {
    [nodeId: string]: {
      images?: { filename: string; subfolder: string; type: string }[];
    };
  };
}

export interface Lora {
  name: string;
  strength_model: number;
  strength_clip: number;
}

export interface AgentSession {
  id: string;
  title: string;
  description: string;
  duration: number;
  status: string;
  scenePlan: unknown | null;
  tasks: unknown[];
  logs: string[];
  outputVideo: string | null;
  generatedFiles: string[];
  createdAt: number;
  model: string;
}

export type AppMode = "chat" | "image" | "video" | "agent";
