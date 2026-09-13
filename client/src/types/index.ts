export type Recurrence = "none" | "daily" | "weekly" | "weekdays";
export const DEFAULT_BLOCK_COLOR = "#3e513c";
export const BLOCK_COLOR_PRESETS = [
  { value: "#3e513c", label: "Moss" },
  { value: "#6a7d5c", label: "Lichen" },
  { value: "#8c4a3e", label: "Rust" },
  { value: "#2a3128", label: "Ink" },
  { value: "#4d5f6b", label: "Slate" },
] as const;
export type BlockColor = string;

export interface User {
  id: string;
  email: string;
  verifiedAt: string | null;
  timezone: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  done: boolean;
  date: string | null;
  timeBlockId: string | null;
  order: number;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskCreate {
  title: string;
  description?: string;
  done?: boolean;
  date?: string | null;
  timeBlockId?: string | null;
  order?: number;
}

export type TaskUpdate = Partial<TaskCreate>;

export interface TimeBlock {
  id: string;
  title: string;
  description: string;
  date: string;
  start: string;
  end: string;
  recurrence: Recurrence;
  recurrenceDays: number[];
  color: BlockColor;
}

export interface TimeBlockCreate {
  title: string;
  description?: string;
  date: string;
  start: string;
  end: string;
  recurrence?: Recurrence;
  recurrenceDays?: number[];
    color?: string;
}

export type TimeBlockUpdate = Partial<TimeBlockCreate>;

export interface Note {
  id: string;
  title: string;
  markdown: string;
  updatedAt: string;
  taskId: string | null;
  timeBlockId: string | null;
}

export interface NoteCreate {
  title: string;
  markdown?: string;
  taskId?: string | null;
  timeBlockId?: string | null;
}

export type NoteUpdate = Partial<NoteCreate>;

export interface CollectionFingerprint {
  count: number;
  updatedAt: string | null;
}

export interface AppState {
  tasks: CollectionFingerprint;
  notes: CollectionFingerprint;
  blocks: CollectionFingerprint;
}

export type AiProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "xai";

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiKey {
  id: string;
  provider: AiProvider;
  model: string;
  keyHint: string;
}

export interface AiSettings {
  enabled: boolean;
  configured: boolean;
  provider: AiProvider | null;
  model: string | null;
  keyHint: string | null;
  activeKeyId: string | null;
  keys: AiKey[];
  models: Record<AiProvider, AiModelOption[]>;
}

export interface AiKeyCreate {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface AiKeyUpdate {
  provider?: AiProvider;
  model?: string;
  apiKey?: string;
}

export type AiProposal =
  | {
      kind: "task";
      title: string;
      description: string;
      date: string | null;
    }
  | {
      kind: "note";
      title: string;
      markdown: string;
    }
  | {
      kind: "block";
      title: string;
      description: string;
      date: string;
      start: string;
      end: string;
    };

export interface AiPlanResponse {
  reply: string;
  items: AiProposal[];
}
