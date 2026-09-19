import { describe, expect, it } from "vitest";

import { mixPins, pinCountLabel } from "./assignments";

describe("pin helpers", () => {
  it("interleaves tasks and notes up to the limit", () => {
    const tasks = [
      { id: "t1", title: "One", kind: "task" as const },
      { id: "t2", title: "Two", kind: "task" as const },
      { id: "t3", title: "Three", kind: "task" as const },
    ];
    const notes = [
      { id: "n1", title: "Note", kind: "note" as const },
      { id: "n2", title: "Other", kind: "note" as const },
    ];

    expect(mixPins(tasks, notes, 3)).toEqual({
      shown: [tasks[0], notes[0], tasks[1]],
      extra: 2,
    });
  });

  it("names leftover counts in sentence case", () => {
    expect(pinCountLabel(2, 1)).toBe("2 tasks · 1 note");
    expect(pinCountLabel(1, 0)).toBe("1 task");
  });
});
