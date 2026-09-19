import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { jsonResponse, stubSignedIn } from "../test/api";
import { renderPage } from "../test/render";
import type { Note, Task } from "../types";
import { ItemSheet } from "./ItemSheet";

const task: Task = {
  id: "22222222-2222-2222-2222-222222222222",
  title: "Write the intro",
  description: "Draft **one** paragraph.",
  done: false,
  date: "2026-09-15",
  timeBlockId: null,
  order: 0,
  createdAt: "2026-09-01T08:00:00Z",
  completedAt: null,
};

const note: Note = {
  id: "33333333-3333-3333-3333-333333333333",
  title: "Session notes",
  markdown: "Keep the **scope** small.",
  date: null,
  taskId: null,
  timeBlockId: null,
  updatedAt: "2026-09-01T10:00:00Z",
};

describe("ItemSheet", () => {
  it("renders note markdown and switches to the edit form", async () => {
    stubSignedIn({
      "GET /notes": () => jsonResponse([note]),
    });

    function Harness() {
      const [mode, setMode] = useState<"read" | "edit">("read");
      return (
        <ItemSheet
          id={note.id}
          kind="note"
          mode={mode}
          onClose={() => undefined}
          onModeChange={setMode}
        />
      );
    }

    renderPage(<Harness />);

    expect(
      await screen.findByRole("dialog", { name: "Session notes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("scope")).toHaveProperty("tagName", "STRONG");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit note" })).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown")).toBeInTheDocument();
  });

  it("marks a task done from the reading sheet", async () => {
    let patchBody: Record<string, unknown> | undefined;
    stubSignedIn({
      "GET /tasks": () => jsonResponse([task]),
      [`PATCH /tasks/${task.id}`]: (init) => {
        patchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({
          ...task,
          ...patchBody,
          completedAt: "2026-09-15T08:00:00Z",
        });
      },
    });

    renderPage(
      <ItemSheet
        id={task.id}
        kind="task"
        mode="read"
        onClose={() => undefined}
        onModeChange={() => undefined}
      />,
    );

    expect(
      await screen.findByRole("dialog", { name: "Write the intro" }),
    ).toBeInTheDocument();
    expect(screen.getByText("one")).toHaveProperty("tagName", "STRONG");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Mark Write the intro as done" }),
    );
    await waitFor(() => expect(patchBody).toEqual({ done: true }));
  });
});
