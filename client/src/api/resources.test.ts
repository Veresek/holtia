import { describe, expect, it, vi } from "vitest";

import { blocksApi, stateApi, tasksApi } from "./resources";

describe("tasksApi", () => {
  it("adds an encoded date filter to task queries", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await tasksApi.list({ date: "2026-08-31" });
    await tasksApi.list({ date: "undated" });
    await tasksApi.list();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/tasks?date=2026-08-31",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "/api/tasks?date=undated",
    );
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("/api/tasks");
  });
});

describe("blocksApi", () => {
  it("adds an encoded date filter to block queries", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await blocksApi.list({ date: "2026-08-31" });
    await blocksApi.list();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/blocks?date=2026-08-31",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("/api/blocks");
  });
});

describe("stateApi", () => {
  it("reads the collection fingerprints", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            tasks: { count: 0, updatedAt: null, pinned: 0 },
            notes: { count: 1, updatedAt: "2026-09-01T08:02:11Z", pinned: 0 },
            blocks: { count: 31, updatedAt: "2026-09-02T19:40:00Z", pinned: 0 },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(stateApi.get()).resolves.toEqual({
      tasks: { count: 0, updatedAt: null, pinned: 0 },
      notes: { count: 1, updatedAt: "2026-09-01T08:02:11Z", pinned: 0 },
      blocks: { count: 31, updatedAt: "2026-09-02T19:40:00Z", pinned: 0 },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/state");
  });
});
