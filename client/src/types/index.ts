export type Recurrence = "none" | "daily" | "weekly" | "weekdays";
export const BLOCK_COLORS = ["moss", "lichen", "rust", "ink"] as const;
export type BlockColor = (typeof BLOCK_COLORS)[number];

export interface User {
  id: string;
  email: string;
  verifiedAt: string | null;
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
  color?: BlockColor;
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
