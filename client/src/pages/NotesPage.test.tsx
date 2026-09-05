import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { jsonResponse, stubSignedIn } from "../test/api";
import { stubPreviewOverflow } from "../test/preview";
import { renderPage } from "../test/render";
import type { Note, Task, TimeBlock } from "../types";
import { NotesPage } from "./NotesPage";

const note: Note = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Launch notes",
  markdown: "# Decisions\n\nKeep the first version small.",
  taskId: null,
  timeBlockId: null,
  updatedAt: "2026-09-01T10:00:00Z",
};

describe("NotesPage", () => {
  it("shows a loading state while notes are pending", () => {
    stubSignedIn({
      "GET /notes": () => new Promise<Response>(() => undefined),
    });

    renderPage(<NotesPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading notes");
  });

  it("shows an error and retries into the empty state", async () => {
    let attempts = 0;
    stubSignedIn({
      "GET /notes": () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ detail: "Notes are unavailable." }, 500)
          : jsonResponse([]);
      },
    });
    renderPage(<NotesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notes are unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("button", { name: /Add your first note/ }),
    ).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("creates a note from the empty-state action", async () => {
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      "GET /notes": () => jsonResponse([]),
      "POST /notes": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse(
          {
            ...note,
            title: submitted.title,
            markdown: submitted.markdown,
          },
          201,
        );
      },
    });
    renderPage(<NotesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Add your first note/ }),
    );
    expect(screen.getByRole("dialog", { name: "Add note" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Reading list" },
    });
    fireEvent.change(screen.getByLabelText("Markdown"), {
      target: { value: "- The Dispossessed\n- Parable of the Sower" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));

    expect(await screen.findByText("Reading list")).toBeInTheDocument();
    expect(screen.getByText("The Dispossessed")).toBeInTheDocument();
    expect(screen.getByText("Parable of the Sower")).toBeInTheDocument();
    expect(screen.queryByText(/^- The Dispossessed/)).not.toBeInTheDocument();
    expect(submitted).toEqual({
      title: "Reading list",
      markdown: "- The Dispossessed\n- Parable of the Sower",
      taskId: null,
      timeBlockId: null,
    });
  });

  it("renders stored markdown instead of raw syntax", async () => {
    stubSignedIn({
      "GET /notes": () => jsonResponse([note]),
    });
    renderPage(<NotesPage />);

    expect(
      await screen.findByRole("heading", { name: "Decisions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Keep the first version small."),
    ).toBeInTheDocument();
    expect(screen.queryByText("# Decisions")).not.toBeInTheDocument();
  });

  it("clips a tall note until the chevron expands it", async () => {
    const spy = stubPreviewOverflow();
    stubSignedIn({
      "GET /notes": () =>
        jsonResponse([
          {
            ...note,
            markdown: `${"Keep the first version small. ".repeat(20)}Then expand the rest.`,
          },
        ]),
    });
    renderPage(<NotesPage />);

    expect(await screen.findByText("Launch notes")).toBeInTheDocument();
    const toggle = screen.getByRole("button", {
      name: "Show more of Launch notes",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName("Show less of Launch notes");
    spy.mockRestore();
  });

  it("edits and deletes an existing note", async () => {
    let patchBody: Record<string, unknown> | undefined;
    stubSignedIn({
      "GET /notes": () => jsonResponse([note]),
      [`PATCH /notes/${note.id}`]: (init) => {
        patchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({
          ...note,
          ...patchBody,
          updatedAt: "2026-09-01T11:00:00Z",
        });
      },
      [`DELETE /notes/${note.id}`]: () => new Response(null, { status: 204 }),
    });
    renderPage(<NotesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for Launch notes" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit note" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Launch decisions" },
    });
    fireEvent.change(screen.getByLabelText("Markdown"), {
      target: { value: "Ship notes CRUD." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Launch decisions")).toBeInTheDocument();
    expect(patchBody).toEqual({
      title: "Launch decisions",
      markdown: "Ship notes CRUD.",
      taskId: null,
      timeBlockId: null,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Launch decisions" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByRole("dialog", { name: "Delete Launch decisions?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await waitFor(() =>
      expect(screen.queryByText("Launch decisions")).not.toBeInTheDocument(),
    );
  });

  it("opens the edit dialog when the note card is clicked", async () => {
    stubSignedIn({
      "GET /notes": () => jsonResponse([note]),
    });
    renderPage(<NotesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Launch notes" }),
    );
    expect(screen.getByRole("dialog", { name: "Edit note" })).toBeInTheDocument();
  });

  it("pins a note to a time block and shows the assignment", async () => {
    const block: TimeBlock = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "Deep work",
      description: "",
      date: "2026-09-01",
      start: "09:00:00",
      end: "11:00:00",
      recurrence: "none",
      recurrenceDays: [],
    };
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      "GET /notes": () => jsonResponse([]),
      "GET /blocks": () => jsonResponse([block]),
      "POST /notes": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse(
          {
            ...note,
            title: submitted.title,
            markdown: submitted.markdown,
            timeBlockId: submitted.timeBlockId,
          },
          201,
        );
      },
    });
    renderPage(<NotesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Add your first note/ }),
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Session notes" },
    });
    fireEvent.change(screen.getByLabelText("Time block"), {
      target: { value: block.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));

    expect(await screen.findByText("Session notes")).toBeInTheDocument();
    expect(submitted).toMatchObject({
      title: "Session notes",
      timeBlockId: block.id,
    });
    expect(screen.getByText("Deep work · 09:00–11:00")).toBeInTheDocument();
  });

  it("pins a note to a task and shows the assignment", async () => {
    const task: Task = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      title: "Write report",
      description: "",
      done: false,
      date: null,
      timeBlockId: null,
      order: 0,
      createdAt: "2026-08-31T18:00:00Z",
    };
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      "GET /notes": () => jsonResponse([]),
      "GET /tasks": () => jsonResponse([task]),
      "POST /notes": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse(
          {
            ...note,
            title: submitted.title,
            markdown: submitted.markdown,
            taskId: submitted.taskId,
          },
          201,
        );
      },
    });
    renderPage(<NotesPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Add your first note/ }),
    );
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Outline" },
    });
    fireEvent.change(screen.getByLabelText("Task"), {
      target: { value: task.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));

    expect(await screen.findByText("Outline")).toBeInTheDocument();
    expect(submitted).toMatchObject({
      title: "Outline",
      taskId: task.id,
    });
    expect(screen.getByText("Write report")).toBeInTheDocument();
  });
});
