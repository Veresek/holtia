import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TimeBlock } from "../types";
import { TaskComposer } from "./TaskComposer";

const morning: TimeBlock = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  title: "Morning block",
  description: "",
  date: "2026-09-01",
  start: "09:00:00",
  end: "11:00:00",
  recurrence: "none",
  recurrenceDays: [],
  color: "moss",
};

describe("TaskComposer", () => {
  it("expands into a form, submits, and stays open", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const onExpand = vi.fn();
    const onCollapse = vi.fn();
    const { rerender } = render(
      <TaskComposer
        blocks={[]}
        defaultDate="2026-09-19"
        expanded={false}
        onCollapse={onCollapse}
        onExpand={onExpand}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(onExpand).toHaveBeenCalledTimes(1);

    rerender(
      <TaskComposer
        blocks={[]}
        defaultDate="2026-09-19"
        expanded
        onCollapse={onCollapse}
        onExpand={onExpand}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-19");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Write the intro" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: "Write the intro",
        description: "",
        date: "2026-09-19",
        timeBlockId: null,
      }),
    );
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-19");
    expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
  });

  it("fills the date from a time block and clears both when the date is emptied", () => {
    render(
      <TaskComposer
        blocks={[morning]}
        defaultDate={null}
        expanded
        onCollapse={() => undefined}
        onExpand={() => undefined}
        onSubmit={async () => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("Time block"), {
      target: { value: morning.id },
    });
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-01");

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "" },
    });
    expect(screen.getByLabelText("Date")).toHaveValue("");
    expect(screen.getByLabelText("Time block")).toHaveValue("");
  });

  it("collapses on Escape and Cancel", () => {
    const onCollapse = vi.fn();
    render(
      <TaskComposer
        blocks={[]}
        defaultDate={null}
        expanded
        onCollapse={onCollapse}
        onExpand={() => undefined}
        onSubmit={async () => undefined}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCollapse).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCollapse).toHaveBeenCalledTimes(2);
  });
});
