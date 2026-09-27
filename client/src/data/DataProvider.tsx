import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Outlet } from "react-router-dom";

import { blocksApi, notesApi, stateApi, tasksApi } from "../api/resources";
import { useAuth } from "../auth/AuthProvider";
import type {
  AppState,
  CollectionFingerprint,
  Note,
  NoteCreate,
  NoteUpdate,
  Task,
  TaskCreate,
  TaskUpdate,
  TimeBlock,
  TimeBlockCreate,
  TimeBlockUpdate,
} from "../types";

export const REVALIDATE_INTERVAL_MS = 60_000;

const TASKS_LOAD_ERROR = "Tasks could not be loaded.";
const NOTES_LOAD_ERROR = "Notes could not be loaded.";
const BLOCKS_LOAD_ERROR = "Time blocks could not be loaded.";

interface CollectionSlice<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  fingerprint: CollectionFingerprint | null;
}

function emptySlice<T>(): CollectionSlice<T> {
  return {
    items: [],
    loading: true,
    error: null,
    loaded: false,
    fingerprint: null,
  };
}

function fingerprintsEqual(
  left: CollectionFingerprint | null,
  right: CollectionFingerprint,
) {
  return (
    left !== null &&
    left.count === right.count &&
    left.updatedAt === right.updatedAt &&
    left.pinned === right.pinned
  );
}

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

export interface DataContextValue {
  tasks: Task[];
  notes: Note[];
  blocks: TimeBlock[];
  tasksLoading: boolean;
  notesLoading: boolean;
  blocksLoading: boolean;
  tasksError: string | null;
  notesError: string | null;
  blocksError: string | null;
  retryTasks: () => Promise<void>;
  retryNotes: () => Promise<void>;
  retryBlocks: () => Promise<void>;
  createTask: (payload: TaskCreate) => Promise<Task>;
  updateTask: (id: string, payload: TaskUpdate) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  createNote: (payload: NoteCreate) => Promise<Note>;
  updateNote: (id: string, payload: NoteUpdate) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;
  createBlock: (payload: TimeBlockCreate) => Promise<TimeBlock>;
  updateBlock: (id: string, payload: TimeBlockUpdate) => Promise<TimeBlock>;
  deleteBlock: (id: string) => Promise<void>;
  revalidate: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

interface DataProviderProps {
  children?: ReactNode;
}

export function DataProvider({ children }: DataProviderProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [tasks, setTasks] = useState<CollectionSlice<Task>>(emptySlice);
  const [notes, setNotes] = useState<CollectionSlice<Note>>(emptySlice);
  const [blocks, setBlocks] = useState<CollectionSlice<TimeBlock>>(emptySlice);
  const tasksRef = useRef(tasks);
  const notesRef = useRef(notes);
  const blocksRef = useRef(blocks);
  tasksRef.current = tasks;
  notesRef.current = notes;
  blocksRef.current = blocks;
  const generation = useRef(0);
  const mutations = useRef({ tasks: 0, notes: 0, blocks: 0 });
  const revalidateInFlight = useRef<Promise<void> | null>(null);

  const markMutated = useCallback((name: "tasks" | "notes" | "blocks") => {
    mutations.current[name] += 1;
  }, []);

  useEffect(() => {
    const current = ++generation.current;
    if (!userId) {
      setTasks(emptySlice());
      setNotes(emptySlice());
      setBlocks(emptySlice());
      return;
    }
    let cancelled = false;
    function stillCurrent() {
      return !cancelled && generation.current === current;
    }

    const tasksPromise = tasksApi
      .list()
      .then((items) => {
        if (stillCurrent()) {
          setTasks({
            items,
            loading: false,
            error: null,
            loaded: true,
            fingerprint: null,
          });
        }
        return true;
      })
      .catch((caught: unknown) => {
        if (stillCurrent()) {
          setTasks({
            items: [],
            loading: false,
            error: errorMessage(caught, TASKS_LOAD_ERROR),
            loaded: false,
            fingerprint: null,
          });
        }
        return false;
      });
    const notesPromise = notesApi
      .list()
      .then((items) => {
        if (stillCurrent()) {
          setNotes({
            items,
            loading: false,
            error: null,
            loaded: true,
            fingerprint: null,
          });
        }
        return true;
      })
      .catch((caught: unknown) => {
        if (stillCurrent()) {
          setNotes({
            items: [],
            loading: false,
            error: errorMessage(caught, NOTES_LOAD_ERROR),
            loaded: false,
            fingerprint: null,
          });
        }
        return false;
      });
    const blocksPromise = blocksApi
      .list()
      .then((items) => {
        if (stillCurrent()) {
          setBlocks({
            items,
            loading: false,
            error: null,
            loaded: true,
            fingerprint: null,
          });
        }
        return true;
      })
      .catch((caught: unknown) => {
        if (stillCurrent()) {
          setBlocks({
            items: [],
            loading: false,
            error: errorMessage(caught, BLOCKS_LOAD_ERROR),
            loaded: false,
            fingerprint: null,
          });
        }
        return false;
      });
    const statePromise = stateApi.get().catch(() => null);

    void Promise.all([tasksPromise, statePromise]).then(([ok, state]) => {
      if (stillCurrent() && ok && state) {
        setTasks((slice) => ({ ...slice, fingerprint: state.tasks }));
      }
    });
    void Promise.all([notesPromise, statePromise]).then(([ok, state]) => {
      if (stillCurrent() && ok && state) {
        setNotes((slice) => ({ ...slice, fingerprint: state.notes }));
      }
    });
    void Promise.all([blocksPromise, statePromise]).then(([ok, state]) => {
      if (stillCurrent() && ok && state) {
        setBlocks((slice) => ({ ...slice, fingerprint: state.blocks }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadTasks = useCallback(async (userVisible: boolean) => {
    if (userVisible) {
      setTasks((current) => ({
        ...current,
        loading: !current.loaded,
        error: null,
      }));
    }
    const seen = mutations.current.tasks;
    try {
      const items = await tasksApi.list();
      if (mutations.current.tasks !== seen) {
        setTasks((current) => ({ ...current, loading: false }));
        return false;
      }
      setTasks((current) => ({
        ...current,
        items,
        loading: false,
        error: null,
        loaded: true,
      }));
      return true;
    } catch (caught) {
      const message = errorMessage(caught, TASKS_LOAD_ERROR);
      setTasks((current) => ({
        ...current,
        items: current.loaded ? current.items : [],
        loading: false,
        error: userVisible || !current.loaded ? message : current.error,
      }));
      return false;
    }
  }, []);

  const loadNotes = useCallback(async (userVisible: boolean) => {
    if (userVisible) {
      setNotes((current) => ({
        ...current,
        loading: !current.loaded,
        error: null,
      }));
    }
    const seen = mutations.current.notes;
    try {
      const items = await notesApi.list();
      if (mutations.current.notes !== seen) {
        setNotes((current) => ({ ...current, loading: false }));
        return false;
      }
      setNotes((current) => ({
        ...current,
        items,
        loading: false,
        error: null,
        loaded: true,
      }));
      return true;
    } catch (caught) {
      const message = errorMessage(caught, NOTES_LOAD_ERROR);
      setNotes((current) => ({
        ...current,
        items: current.loaded ? current.items : [],
        loading: false,
        error: userVisible || !current.loaded ? message : current.error,
      }));
      return false;
    }
  }, []);

  const loadBlocks = useCallback(async (userVisible: boolean) => {
    if (userVisible) {
      setBlocks((current) => ({
        ...current,
        loading: !current.loaded,
        error: null,
      }));
    }
    const seen = mutations.current.blocks;
    try {
      const items = await blocksApi.list();
      if (mutations.current.blocks !== seen) {
        setBlocks((current) => ({ ...current, loading: false }));
        return false;
      }
      setBlocks((current) => ({
        ...current,
        items,
        loading: false,
        error: null,
        loaded: true,
      }));
      return true;
    } catch (caught) {
      const message = errorMessage(caught, BLOCKS_LOAD_ERROR);
      setBlocks((current) => ({
        ...current,
        items: current.loaded ? current.items : [],
        loading: false,
        error: userVisible || !current.loaded ? message : current.error,
      }));
      return false;
    }
  }, []);

  const rememberFingerprint = useCallback(
    async (key: keyof AppState) => {
      try {
        const state = await stateApi.get();
        const fingerprint = state[key];
        if (key === "tasks") {
          setTasks((current) => ({ ...current, fingerprint }));
        } else if (key === "notes") {
          setNotes((current) => ({ ...current, fingerprint }));
        } else {
          setBlocks((current) => ({ ...current, fingerprint }));
        }
      } catch {
        // Next revalidate will refill the fingerprint.
      }
    },
    [],
  );

  const retryTasks = useCallback(async () => {
    if (await loadTasks(true)) {
      await rememberFingerprint("tasks");
    }
  }, [loadTasks, rememberFingerprint]);

  const retryNotes = useCallback(async () => {
    if (await loadNotes(true)) {
      await rememberFingerprint("notes");
    }
  }, [loadNotes, rememberFingerprint]);

  const retryBlocks = useCallback(async () => {
    if (await loadBlocks(true)) {
      await rememberFingerprint("blocks");
    }
  }, [loadBlocks, rememberFingerprint]);

  const revalidate = useCallback(async () => {
    if (!userId) {
      return;
    }
    if (revalidateInFlight.current) {
      return revalidateInFlight.current;
    }
    const current = generation.current;
    const run = (async () => {
      let state: AppState;
      try {
        state = await stateApi.get();
      } catch {
        return;
      }
      if (generation.current !== current) {
        return;
      }
      const jobs: Promise<void>[] = [];
      if (
        !tasksRef.current.loaded ||
        !fingerprintsEqual(tasksRef.current.fingerprint, state.tasks)
      ) {
        jobs.push(
          loadTasks(false).then((ok) => {
            if (ok && generation.current === current) {
              setTasks((slice) => ({ ...slice, fingerprint: state.tasks }));
            }
          }),
        );
      }
      if (
        !notesRef.current.loaded ||
        !fingerprintsEqual(notesRef.current.fingerprint, state.notes)
      ) {
        jobs.push(
          loadNotes(false).then((ok) => {
            if (ok && generation.current === current) {
              setNotes((slice) => ({ ...slice, fingerprint: state.notes }));
            }
          }),
        );
      }
      if (
        !blocksRef.current.loaded ||
        !fingerprintsEqual(blocksRef.current.fingerprint, state.blocks)
      ) {
        jobs.push(
          loadBlocks(false).then((ok) => {
            if (ok && generation.current === current) {
              setBlocks((slice) => ({ ...slice, fingerprint: state.blocks }));
            }
          }),
        );
      }
      await Promise.all(jobs);
    })();
    revalidateInFlight.current = run;
    try {
      await run;
    } finally {
      if (revalidateInFlight.current === run) {
        revalidateInFlight.current = null;
      }
    }
  }, [loadBlocks, loadNotes, loadTasks, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void revalidate();
      }
    }
    function onOnline() {
      void revalidate();
    }
    function onInterval() {
      if (document.visibilityState === "visible") {
        void revalidate();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(onInterval, REVALIDATE_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [revalidate, userId]);

  const createTask = useCallback(async (payload: TaskCreate) => {
    setTasks((current) => ({ ...current, error: null }));
    markMutated("tasks");
    try {
      const created = await tasksApi.create(payload);
      markMutated("tasks");
      setTasks((current) => ({
        ...current,
        items: [...current.items, created],
      }));
      return created;
    } catch (caught) {
      setTasks((current) => ({
        ...current,
        error: errorMessage(caught, "The task could not be created."),
      }));
      throw caught;
    }
  }, [markMutated]);

  const updateTask = useCallback(async (id: string, payload: TaskUpdate) => {
    setTasks((current) => ({ ...current, error: null }));
    markMutated("tasks");
    try {
      const updated = await tasksApi.update(id, payload);
      markMutated("tasks");
      setTasks((current) => ({
        ...current,
        items: current.items.map((task) => (task.id === id ? updated : task)),
      }));
      return updated;
    } catch (caught) {
      setTasks((current) => ({
        ...current,
        error: errorMessage(caught, "The task could not be updated."),
      }));
      throw caught;
    }
  }, [markMutated]);

  const deleteTask = useCallback(async (id: string) => {
    setTasks((current) => ({ ...current, error: null }));
    markMutated("tasks");
    markMutated("notes");
    try {
      await tasksApi.remove(id);
      markMutated("tasks");
      markMutated("notes");
      setTasks((current) => ({
        ...current,
        items: current.items.filter((task) => task.id !== id),
      }));
      setNotes((current) => ({
        ...current,
        items: current.items.map((note) =>
          note.taskId === id ? { ...note, taskId: null } : note,
        ),
      }));
    } catch (caught) {
      setTasks((current) => ({
        ...current,
        error: errorMessage(caught, "The task could not be deleted."),
      }));
      throw caught;
    }
  }, [markMutated]);

  const createNote = useCallback(async (payload: NoteCreate) => {
    setNotes((current) => ({ ...current, error: null }));
    markMutated("notes");
    try {
      const created = await notesApi.create(payload);
      markMutated("notes");
      setNotes((current) => ({
        ...current,
        items: [...current.items, created],
      }));
      return created;
    } catch (caught) {
      setNotes((current) => ({
        ...current,
        error: errorMessage(caught, "The note could not be created."),
      }));
      throw caught;
    }
  }, [markMutated]);

  const updateNote = useCallback(async (id: string, payload: NoteUpdate) => {
    setNotes((current) => ({ ...current, error: null }));
    markMutated("notes");
    try {
      const updated = await notesApi.update(id, payload);
      markMutated("notes");
      setNotes((current) => ({
        ...current,
        items: current.items.map((note) => (note.id === id ? updated : note)),
      }));
      return updated;
    } catch (caught) {
      setNotes((current) => ({
        ...current,
        error: errorMessage(caught, "The note could not be updated."),
      }));
      throw caught;
    }
  }, [markMutated]);

  const deleteNote = useCallback(async (id: string) => {
    setNotes((current) => ({ ...current, error: null }));
    markMutated("notes");
    try {
      await notesApi.remove(id);
      markMutated("notes");
      setNotes((current) => ({
        ...current,
        items: current.items.filter((note) => note.id !== id),
      }));
    } catch (caught) {
      setNotes((current) => ({
        ...current,
        error: errorMessage(caught, "The note could not be deleted."),
      }));
      throw caught;
    }
  }, [markMutated]);

  const createBlock = useCallback(async (payload: TimeBlockCreate) => {
    setBlocks((current) => ({ ...current, error: null }));
    markMutated("blocks");
    try {
      const created = await blocksApi.create(payload);
      markMutated("blocks");
      setBlocks((current) => ({
        ...current,
        items: [...current.items, created],
      }));
      return created;
    } catch (caught) {
      setBlocks((current) => ({
        ...current,
        error: errorMessage(caught, "The time block could not be created."),
      }));
      throw caught;
    }
  }, [markMutated]);

  const updateBlock = useCallback(
    async (id: string, payload: TimeBlockUpdate) => {
      setBlocks((current) => ({ ...current, error: null }));
      markMutated("blocks");
      markMutated("tasks");
      try {
        const updated = await blocksApi.update(id, payload);
        markMutated("blocks");
        markMutated("tasks");
        setBlocks((current) => {
          const next = current.items.map((block) =>
            block.id === id ? updated : block,
          );
          if (!next.some((block) => block.id === id)) {
            next.push(updated);
          }
          return { ...current, items: next };
        });
        await revalidate();
        return updated;
      } catch (caught) {
        setBlocks((current) => ({
          ...current,
          error: errorMessage(caught, "The time block could not be updated."),
        }));
        throw caught;
      }
    },
    [markMutated, revalidate],
  );

  const deleteBlock = useCallback(async (id: string) => {
    setBlocks((current) => ({ ...current, error: null }));
    markMutated("blocks");
    markMutated("tasks");
    markMutated("notes");
    try {
      await blocksApi.remove(id);
      markMutated("blocks");
      markMutated("tasks");
      markMutated("notes");
      setBlocks((current) => ({
        ...current,
        items: current.items.filter((block) => block.id !== id),
      }));
      setTasks((current) => ({
        ...current,
        items: current.items.map((task) =>
          task.timeBlockId === id ? { ...task, timeBlockId: null } : task,
        ),
      }));
      setNotes((current) => ({
        ...current,
        items: current.items.map((note) =>
          note.timeBlockId === id ? { ...note, timeBlockId: null } : note,
        ),
      }));
    } catch (caught) {
      setBlocks((current) => ({
        ...current,
        error: errorMessage(caught, "The time block could not be deleted."),
      }));
      throw caught;
    }
  }, [markMutated]);

  const value = useMemo<DataContextValue>(
    () => ({
      tasks: tasks.items,
      notes: notes.items,
      blocks: blocks.items,
      tasksLoading: tasks.loading,
      notesLoading: notes.loading,
      blocksLoading: blocks.loading,
      tasksError: tasks.error,
      notesError: notes.error,
      blocksError: blocks.error,
      retryTasks,
      retryNotes,
      retryBlocks,
      createTask,
      updateTask,
      deleteTask,
      createNote,
      updateNote,
      deleteNote,
      createBlock,
      updateBlock,
      deleteBlock,
      revalidate,
    }),
    [
      blocks.error,
      blocks.items,
      blocks.loading,
      createBlock,
      createNote,
      createTask,
      deleteBlock,
      deleteNote,
      deleteTask,
      notes.error,
      notes.items,
      notes.loading,
      retryBlocks,
      retryNotes,
      retryTasks,
      revalidate,
      tasks.error,
      tasks.items,
      tasks.loading,
      updateBlock,
      updateNote,
      updateTask,
    ],
  );

  return (
    <DataContext.Provider value={value}>
      {children ?? <Outlet />}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within DataProvider.");
  }
  return context;
}
