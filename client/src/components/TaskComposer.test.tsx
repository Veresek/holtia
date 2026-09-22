import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stubSignedIn } from "../test/api";
import { renderPage } from "../test/render";
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
  color: "#3e513c",
};

describe("TaskComposer", () => {
  it("expands into a form, submits, and stays open", async () => {
    stubSignedIn();
    const onSubmit = vi.fn(async () => undefined);
    const onExpand = vi.fn();
    const onCollapse = vi.fn();
    const { rerender } = renderPage(
      <TaskComposer
        blocks={[]}
        defaultDate="2026-09-19"
        expanded={false}
        onCollapse={onCollapse}
        onExpand={onExpand}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add task" }));
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
        priority: "medium",
      }),
    );
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-19");
    expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
  });

  it("fills the date from a time block and clears both when the date is emptied", async () => {
    stubSignedIn();
    renderPage(
      <TaskComposer
        blocks={[morning]}
        defaultDate={null}
        expanded
        onCollapse={() => undefined}
        onExpand={() => undefined}
        onSubmit={async () => undefined}
      />,
    );

    await screen.findByLabelText("Title");
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

  it("collapses on Escape and Cancel", async () => {
    stubSignedIn();
    const onCollapse = vi.fn();
    renderPage(
      <TaskComposer
        blocks={[]}
        defaultDate={null}
        expanded
        onCollapse={onCollapse}
        onExpand={() => undefined}
        onSubmit={async () => undefined}
      />,
    );

    await screen.findByLabelText("Title");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCollapse).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCollapse).toHaveBeenCalledTimes(2);
  });

  it("marks an empty title instead of submitting", async () => {
    stubSignedIn();
    const onSubmit = vi.fn(async () => undefined);
    renderPage(
      <TaskComposer
        blocks={[]}
        defaultDate="2026-09-19"
        expanded
        onCollapse={() => undefined}
        onExpand={() => undefined}
        onSubmit={onSubmit}
      />,
    );

    const title = await screen.findByLabelText("Title");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a title.");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveClass("border-rust");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
