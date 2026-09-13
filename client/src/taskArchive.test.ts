import { describe, expect, it } from "vitest";

import { isArchivedTask } from "./taskArchive";
import type { Task } from "./types";

const today = "2026-09-13";
const zone = "Europe/Warsaw";

function sample(overrides: Partial<Task> = {}): Task {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Write",
    description: "",
    done: true,
    date: null,
    timeBlockId: null,
    order: 0,
    createdAt: "2026-09-13T08:00:00Z",
    completedAt: "2026-09-13T12:00:00+02:00",
    ...overrides,
  };
}

describe("isArchivedTask", () => {
  it("keeps open tasks on the active list", () => {
    expect(
      isArchivedTask(sample({ done: false, completedAt: null }), today, zone),
    ).toBe(false);
  });

  it("keeps a Python timestamp from today on the active list", () => {
    expect(
      isArchivedTask(
        sample({ completedAt: "2026-09-13T12:00:00.123456+02:00" }),
        today,
        zone,
      ),
    ).toBe(false);
  });

  it("keeps a UTC timestamp that is still today in Warsaw", () => {
    expect(
      isArchivedTask(
        sample({ completedAt: "2026-09-13T10:00:00.123456Z" }),
        today,
        zone,
      ),
    ).toBe(false);
  });

  it("archives yesterday in the account timezone", () => {
    expect(
      isArchivedTask(
        sample({ completedAt: "2026-09-12T12:00:00+02:00" }),
        today,
        zone,
      ),
    ).toBe(true);
  });

  it("archives legacy done tasks without completedAt", () => {
    expect(isArchivedTask(sample({ completedAt: null }), today, zone)).toBe(
      true,
    );
  });

  it("keeps an unparseable completedAt on the active list", () => {
    expect(
      isArchivedTask(sample({ completedAt: "not-a-date" }), today, zone),
    ).toBe(false);
  });

  it("uses the account timezone, not Warsaw", () => {
    expect(
      isArchivedTask(
        sample({ completedAt: "2026-09-13T12:00:00Z" }),
        "2026-09-14",
        "Pacific/Auckland",
      ),
    ).toBe(false);
    expect(
      isArchivedTask(
        sample({ completedAt: "2026-09-13T12:00:00Z" }),
        "2026-09-14",
        "Europe/Warsaw",
      ),
    ).toBe(true);
  });
});
