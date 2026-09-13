import type {
  AppState,
  Note,
  NoteCreate,
  NoteUpdate,
  Task,
  TaskCreate,
  TaskUpdate,
  TimeBlock,
  TimeBlockCreate,
  TimeBlockUpdate,
  User,
} from "../types";
import { apiRequest } from "./client";

function collectionApi<T, Create, Update>(path: string) {
  return {
    list: () => apiRequest<T[]>(path),
    get: (id: string) => apiRequest<T>(`${path}/${id}`),
    create: (payload: Create) =>
      apiRequest<T>(path, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Update) =>
      apiRequest<T>(`${path}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      apiRequest<void>(`${path}/${id}`, { method: "DELETE" }),
  };
}

const taskCollection = collectionApi<Task, TaskCreate, TaskUpdate>("/tasks");

export const tasksApi = {
  ...taskCollection,
  list: (filter?: { date?: string | "undated" }) => {
    const query = filter?.date
      ? `?${new URLSearchParams({ date: filter.date })}`
      : "";
    return apiRequest<Task[]>(`/tasks${query}`);
  },
};
const blockCollection = collectionApi<
  TimeBlock,
  TimeBlockCreate,
  TimeBlockUpdate
>("/blocks");

export const blocksApi = {
  ...blockCollection,
  list: (filter?: { date?: string }) => {
    const query = filter?.date
      ? `?${new URLSearchParams({ date: filter.date })}`
      : "";
    return apiRequest<TimeBlock[]>(`/blocks${query}`);
  },
};
export const notesApi = collectionApi<Note, NoteCreate, NoteUpdate>("/notes");

export const stateApi = {
  get: () => apiRequest<AppState>("/state"),
};

export const userApi = {
  me: () => apiRequest<User>("/users/me"),
  update: (payload: Partial<Pick<User, "timezone">>) =>
    apiRequest<User>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  remove: () => apiRequest<void>("/users/me", { method: "DELETE" }),
};

export const systemApi = {
  health: () => apiRequest<{ status: "ok" }>("/health"),
};
