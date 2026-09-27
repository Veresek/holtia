import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { AuthProvider } from "../auth/AuthProvider";
import { useNotes } from "../hooks/useNotes";
import { useTasks } from "../hooks/useTasks";
import {
  ada,
  emptyAppState,
  jsonResponse,
  stubApi,
  stubSignedIn,
} from "../test/api";
import { renderWithRouter } from "../test/render";
import type { AppState, Note, Task, TimeBlock } from "../types";
import { DataProvider, REVALIDATE_INTERVAL_MS, useData } from "./DataProvider";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DataProvider>{children}</DataProvider>
    </AuthProvider>
  );
}

function getCount(path: string) {
  return vi.mocked(fetch).mock.calls.filter(([input, init]) => {
    const method = ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase();
    return method === "GET" && String(input).endsWith(path);
  }).length;
}

const sampleTask: Task = {
  id: "22222222-2222-2222-2222-222222222222",
  title: "Plan today",
  description: "",
  done: false,
  priority: "medium",
  date: "2026-09-01",
  timeBlockId: null,
  order: 0,
  createdAt: "2026-09-01T08:00:00Z",
  completedAt: null,
};

const sampleNote: Note = {
  id: "33333333-3333-3333-3333-333333333333",
  title: "Launch notes",
  markdown: "",
  date: null,
  taskId: null,
  timeBlockId: null,
  updatedAt: "2026-09-01T10:00:00Z",
};

const sampleBlock: TimeBlock = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Deep work",
  description: "",
  date: "2026-09-01",
  start: "09:00:00",
  end: "11:00:00",
  recurrence: "none",
  recurrenceDays: [],
  color: "#3e513c",
};

describe("DataProvider", () => {
  let visibility: DocumentVisibilityState = "visible";

  beforeEach(() => {
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    visibility = "visible";
  });

  async function settled(result: { current: { loading?: boolean; tasksLoading?: boolean } }) {
    await waitFor(() =>
      expect(
        result.current.loading ?? result.current.tasksLoading,
      ).toBe(false),
    );
    await waitFor(() => expect(getCount("/state")).toBeGreaterThan(0));
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("loads the three collections once after sign-in", async () => {
    stubSignedIn();
    const { result } = renderHook(() => useData(), { wrapper });

    await settled(result);
    expect(result.current.notesLoading).toBe(false);
    expect(result.current.blocksLoading).toBe(false);
    expect(getCount("/tasks")).toBe(1);
    expect(getCount("/notes")).toBe(1);
    expect(getCount("/blocks")).toBe(1);
    expect(getCount("/state")).toBe(1);
  });

  it("does not refetch collections when the fingerprint is unchanged", async () => {
    stubSignedIn();
    const { result } = renderHook(() => useTasks(), { wrapper });
    await settled(result);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(getCount("/state")).toBe(2));
    expect(getCount("/tasks")).toBe(1);
    expect(getCount("/notes")).toBe(1);
    expect(getCount("/blocks")).toBe(1);
  });

  it("refetches only the collection whose fingerprint changed", async () => {
    let state: AppState = emptyAppState;
    stubSignedIn({
      "GET /state": () => jsonResponse(state),
      "GET /tasks": () =>
        jsonResponse(state.tasks.count === 0 ? [] : [sampleTask]),
    });
    const { result } = renderHook(() => useTasks(), { wrapper });
    await settled(result);
    expect(result.current.tasks).toEqual([]);

    state = {
      ...emptyAppState,
      tasks: { count: 1, updatedAt: "2026-09-02T21:14:03Z", pinned: 0 },
    };
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(result.current.tasks).toEqual([sampleTask]));
    expect(getCount("/tasks")).toBe(2);
    expect(getCount("/notes")).toBe(1);
    expect(getCount("/blocks")).toBe(1);
  });

  it("revalidates on reconnect and on the visible-tab interval", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    stubSignedIn();
    const { result } = renderHook(() => useNotes(), { wrapper });
    await settled(result);
    expect(getCount("/state")).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(getCount("/state")).toBe(2));

    const ticks = setIntervalSpy.mock.calls
      .filter(([, ms]) => ms === REVALIDATE_INTERVAL_MS)
      .map(([callback]) => callback as () => void);
    expect(ticks.length).toBeGreaterThan(0);
    await act(async () => {
      for (const tick of ticks) {
        tick();
      }
    });
    await waitFor(() => expect(getCount("/state")).toBe(3));
    setIntervalSpy.mockRestore();
  });

  it("does not poll while the tab is hidden", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    stubSignedIn();
    const { result } = renderHook(() => useData(), { wrapper });
    await settled(result);
    visibility = "hidden";

    const ticks = setIntervalSpy.mock.calls
      .filter(([, ms]) => ms === REVALIDATE_INTERVAL_MS)
      .map(([callback]) => callback as () => void);
    await act(async () => {
      for (const tick of ticks) {
        tick();
      }
    });
    expect(getCount("/state")).toBe(1);
    setIntervalSpy.mockRestore();
  });

  it("keeps collections when moving between panels", async () => {
    stubApi(
      {
        "GET /notes": () => jsonResponse([sampleNote]),
      },
      { user: ada },
    );
    renderWithRouter(<App />);
    await screen.findByRole("heading", {
      name: /Good (morning|afternoon|evening|night)\./,
    });
    expect(await screen.findByText("Launch notes")).toBeInTheDocument();

    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Primary navigation" }),
      ).getByRole("link", { name: "Notes" }),
    );

    expect(screen.queryByText("Loading notes…")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Notes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Launch notes")).toBeInTheDocument();
    expect(getCount("/notes")).toBe(1);
  });

  it("clears local pins when a block or task is deleted", async () => {
    const task: Task = { ...sampleTask, timeBlockId: sampleBlock.id };
    const note: Note = {
      ...sampleNote,
      taskId: task.id,
      timeBlockId: sampleBlock.id,
    };
    stubSignedIn({
      "GET /tasks": () => jsonResponse([task]),
      "GET /notes": () => jsonResponse([note]),
      "GET /blocks": () => jsonResponse([sampleBlock]),
      [`DELETE /blocks/${sampleBlock.id}`]: () =>
        new Response(null, { status: 204 }),
      [`DELETE /tasks/${task.id}`]: () => new Response(null, { status: 204 }),
    });
    const { result } = renderHook(() => useData(), { wrapper });
    await settled(result);

    await act(async () => {
      await result.current.deleteBlock(sampleBlock.id);
    });
    expect(result.current.blocks).toEqual([]);
    expect(result.current.tasks[0]?.timeBlockId).toBeNull();
    expect(result.current.notes[0]?.timeBlockId).toBeNull();
    expect(result.current.notes[0]?.taskId).toBe(task.id);

    await act(async () => {
      await result.current.deleteTask(task.id);
    });
    expect(result.current.tasks).toEqual([]);
    expect(result.current.notes[0]?.taskId).toBeNull();
  });

  it("keeps a mutation when an older list arrives later", async () => {
    let state: AppState = emptyAppState;
    let releaseList: ((response: Response) => void) | undefined;
    let taskLoads = 0;
    stubSignedIn({
      "GET /state": () => jsonResponse(state),
      "GET /tasks": () => {
        taskLoads += 1;
        if (taskLoads === 1) {
          return jsonResponse([]);
        }
        return new Promise((resolve) => {
          releaseList = resolve;
        });
      },
      "POST /tasks": () => jsonResponse(sampleTask, 201),
    });
    const { result } = renderHook(() => useData(), { wrapper });
    await settled(result);

    state = {
      ...emptyAppState,
      tasks: { count: 1, updatedAt: "2026-09-02T21:14:03Z", pinned: 0 },
    };
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(taskLoads).toBe(2));

    await act(async () => {
      await result.current.createTask({ title: "Plan today" });
    });
    expect(result.current.tasks).toEqual([sampleTask]);

    await act(async () => {
      releaseList?.(jsonResponse([]));
      await Promise.resolve();
    });
    expect(result.current.tasks).toEqual([sampleTask]);
  });
});
