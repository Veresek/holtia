import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { jsonResponse, stubSignedIn } from "../test/api";
import { stubPreviewOverflow } from "../test/preview";
import { renderPage } from "../test/render";
import { addCalendarDays, dateValue } from "../time";
import type { Task, TimeBlock } from "../types";
import { TasksPage } from "./TasksPage";

function todayValue() {
  return dateValue(new Date());
}

function section(name: string) {
  return screen.getByRole("region", { name });
}

function openComposer(name: string) {
  fireEvent.click(within(section(name)).getByRole("button", { name: "Add task" }));
}

const task: Task = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Write report",
  description: "Draft the opening.",
  done: false,
  date: null,
  timeBlockId: null,
  order: 0,
  createdAt: "2026-08-31T18:00:00Z",
  completedAt: null,
};

function applyTaskPatch(current: Task, body: Record<string, unknown>): Task {
  const next = { ...current, ...body } as Task;
  if (typeof body.done === "boolean") {
    next.completedAt = body.done ? new Date().toISOString() : null;
  }
  return next;
}

describe("TasksPage", () => {
  it("shows a loading state while tasks are pending", () => {
    stubSignedIn({
      "GET /tasks": () => new Promise<Response>(() => undefined),
    });

    renderPage(<TasksPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading tasks");
  });

  it("shows an error and retries into the empty state", async () => {
    let attempts = 0;
    stubSignedIn({
      "GET /tasks": () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ detail: "Tasks are unavailable." }, 500)
          : jsonResponse([]);
      },
    });
    renderPage(<TasksPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tasks are unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      within(await screen.findByRole("region", { name: "Today" })).getByRole(
        "button",
        { name: "Add task" },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "No date" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Overdue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Upcoming" })).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("creates a task from the real empty-state action", async () => {
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      "GET /tasks": () => jsonResponse([]),
      "POST /tasks": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse(
          {
            ...task,
            title: submitted.title,
            description: submitted.description,
            date: submitted.date,
          },
          201,
        );
      },
    });
    renderPage(<TasksPage />);

    await screen.findByRole("region", { name: "Today" });
    openComposer("Today");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue(todayValue());
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Read a chapter" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Start with chapter four." },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Read a chapter")).toBeInTheDocument();
    expect(submitted).toMatchObject({
      title: "Read a chapter",
      description: "Start with chapter four.",
      date: "2026-09-01",
    });
    expect(screen.getByRole("region", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("toggles, edits, and deletes an existing task", async () => {
    const patchBodies: Record<string, unknown>[] = [];
    stubSignedIn({
      "GET /tasks": () => jsonResponse([task]),
      [`PATCH /tasks/${task.id}`]: (init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        patchBodies.push(body);
        return jsonResponse(applyTaskPatch(task, body));
      },
      [`DELETE /tasks/${task.id}`]: () => new Response(null, { status: 204 }),
    });
    renderPage(<TasksPage />);

    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Mark Write report as done",
      }),
    );
    await waitFor(() => expect(patchBodies[0]).toEqual({ done: true }));

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Write report" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Write final report" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Write final report")).toBeInTheDocument();
    expect(patchBodies[1]).toMatchObject({
      title: "Write final report",
      date: "2026-09-02",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Write final report" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByRole("dialog", { name: "Delete Write final report?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    await waitFor(() =>
      expect(screen.queryByText("Write final report")).not.toBeInTheDocument(),
    );
  });

  it("shows open tasks above completed ones", async () => {
    stubSignedIn({
      "GET /tasks": () =>
        jsonResponse([
          {
            ...task,
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            title: "Done first from the API",
            done: true,
            completedAt: new Date().toISOString(),
            order: 0,
          },
          {
            ...task,
            id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            title: "Still open",
            done: false,
            order: 1,
          },
        ]),
    });
    renderPage(<TasksPage />);

    const titles = (await screen.findAllByRole("heading", { level: 3 })).map(
      (heading) => heading.textContent,
    );
    expect(titles).toEqual(["Still open", "Done first from the API"]);
  });

  it("moves yesterday’s completed tasks into Archive", async () => {
    const yesterday = addCalendarDays(dateValue(new Date()), -1);
    stubSignedIn({
      "GET /tasks": () =>
        jsonResponse([
          {
            ...task,
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            title: "Still open",
            done: false,
            order: 0,
          },
          {
            ...task,
            id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            title: "Done today",
            done: true,
            completedAt: new Date().toISOString(),
            order: 1,
          },
          {
            ...task,
            id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            title: "Done yesterday",
            done: true,
            completedAt: `${yesterday}T12:00:00+02:00`,
            order: 2,
          },
        ]),
    });
    renderPage(<TasksPage />);

    expect(await screen.findByText("Still open")).toBeInTheDocument();
    expect(screen.getByText("Done today")).toBeInTheDocument();
    expect(within(section("No date")).getByText("2 tasks")).toBeInTheDocument();
    expect(screen.getByText("Archive (1)")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Done yesterday" }).closest("details"),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Still open" }).closest("details"),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Done today" }).closest("details"),
    ).toBeNull();
  });

  it("still renders when a completed task has a messy timestamp", async () => {
    const yesterday = addCalendarDays(dateValue(new Date()), -1);
    stubSignedIn({
      "GET /tasks": () =>
        jsonResponse([
          {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            title: "Legacy done",
            description: "",
            done: true,
            date: null,
            timeBlockId: null,
            order: 0,
          },
          {
            ...task,
            id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            title: "Python microseconds",
            done: true,
            completedAt: `${yesterday}T12:00:00.123456+02:00`,
          },
          {
            ...task,
            id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            title: "Bogus completedAt",
            done: true,
            completedAt: "not-a-date",
          },
          {
            ...task,
            id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
            title: "Datetime date",
            date: "2026-09-01T00:00:00Z",
          },
        ]),
    });
    renderPage(<TasksPage />);

    expect(await screen.findByText("Datetime date")).toBeInTheDocument();
    expect(screen.getByText(/Sep 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Archive (2)")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Legacy done" }).closest("details"),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("heading", { name: "Python microseconds" })
        .closest("details"),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("heading", { name: "Bogus completedAt" })
        .closest("details"),
    ).toBeNull();
  });

  it("keeps a Python timestamp from today on the active list", async () => {
    const today = dateValue(new Date());
    stubSignedIn({
      "GET /tasks": () =>
        jsonResponse([
          {
            ...task,
            title: "Done just now",
            done: true,
            completedAt: `${today}T12:00:00.123456+02:00`,
          },
        ]),
    });
    renderPage(<TasksPage />);

    expect(await screen.findByText("Done just now")).toBeInTheDocument();
    expect(screen.getByText("1 task")).toBeInTheDocument();
    expect(screen.queryByText(/Archive \(/)).not.toBeInTheDocument();
  });

  it("moves a task below open ones after it is marked done", async () => {
    const open = { ...task, title: "Write report", order: 0 };
    const later = {
      ...task,
      id: "22222222-2222-2222-2222-222222222222",
      title: "Read a chapter",
      order: 1,
    };
    stubSignedIn({
      "GET /tasks": () => jsonResponse([open, later]),
      [`PATCH /tasks/${open.id}`]: (init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse(applyTaskPatch(open, body));
      },
    });
    renderPage(<TasksPage />);

    expect(
      (await screen.findAllByRole("heading", { level: 3 })).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["Write report", "Read a chapter"]);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Mark Write report as done" }),
    );

    await waitFor(() =>
      expect(
        screen.getAllByRole("heading", { level: 3 }).map(
          (heading) => heading.textContent,
        ),
      ).toEqual(["Read a chapter", "Write report"]),
    );
    expect(screen.queryByText(/Archive \(/)).not.toBeInTheDocument();
  });

  it("renders task description markdown", async () => {
    stubSignedIn({
      "GET /tasks": () =>
        jsonResponse([
          {
            ...task,
            description: "Draft the **opening**.",
          },
        ]),
    });
    renderPage(<TasksPage />);

    expect(await screen.findByText("opening")).toBeInTheDocument();
    expect(screen.getByText("opening").tagName).toBe("STRONG");
    expect(screen.queryByText("Draft the **opening**.")).not.toBeInTheDocument();
  });

  it("clips a tall description until the chevron expands it", async () => {
    const spy = stubPreviewOverflow();
    stubSignedIn({
      "GET /tasks": () =>
        jsonResponse([
          {
            ...task,
            description: `${"Draft the opening. ".repeat(20)}Then rewrite the close.`,
          },
        ]),
    });
    renderPage(<TasksPage />);

    expect(await screen.findByText("Write report")).toBeInTheDocument();
    const toggle = screen.getByRole("button", {
      name: "Show more of Write report",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName("Show less of Write report");
    expect(
      screen.queryByRole("dialog", { name: "Edit task" }),
    ).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("opens the edit dialog when the task card is clicked", async () => {
    stubSignedIn({
      "GET /tasks": () => jsonResponse([task]),
    });
    renderPage(<TasksPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Write report" }),
    );
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeInTheDocument();
  });

  it("opens the edit dialog when the description or date is clicked", async () => {
    stubSignedIn({
      "GET /tasks": () => jsonResponse([task]),
    });
    renderPage(<TasksPage />);

    fireEvent.click(await screen.findByText("Draft the opening."));
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByText("Write report"));
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeInTheDocument();
  });

  it("toggles a task from the checkbox without opening the editor", async () => {
    const patchBodies: Record<string, unknown>[] = [];
    stubSignedIn({
      "GET /tasks": () => jsonResponse([task]),
      [`PATCH /tasks/${task.id}`]: (init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        patchBodies.push(body);
        return jsonResponse(applyTaskPatch(task, body));
      },
    });
    renderPage(<TasksPage />);

    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Mark Write report as done",
      }),
    );

    await waitFor(() => expect(patchBodies[0]).toEqual({ done: true }));
    expect(
      screen.queryByRole("dialog", { name: "Edit task" }),
    ).not.toBeInTheDocument();
  });

  it("pins a task to a time block and shows the assignment", async () => {
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
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      "GET /tasks": () => jsonResponse([]),
      "GET /blocks": () => jsonResponse([morning]),
      "POST /tasks": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse(
          {
            ...task,
            title: submitted.title,
            date: submitted.date,
            timeBlockId: submitted.timeBlockId,
          },
          201,
        );
      },
    });
    renderPage(<TasksPage />);

    await screen.findByRole("region", { name: "No date" });
    openComposer("No date");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Write the intro" },
    });
    fireEvent.change(screen.getByLabelText("Time block"), {
      target: { value: morning.id },
    });
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-01");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Write the intro")).toBeInTheDocument();
    expect(submitted).toMatchObject({
      title: "Write the intro",
      date: "2026-09-01",
      timeBlockId: morning.id,
    });
    expect(screen.getByRole("button", { name: "Pinned to Morning block · 09:00–11:00" })).toBeInTheDocument();
  });

  it("clears the date and pin when the date field is emptied", async () => {
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
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      "GET /tasks": () => jsonResponse([]),
      "GET /blocks": () => jsonResponse([morning]),
      "POST /tasks": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse(
          {
            ...task,
            title: submitted.title,
            date: submitted.date,
            timeBlockId: submitted.timeBlockId,
          },
          201,
        );
      },
    });
    renderPage(<TasksPage />);

    await screen.findByRole("region", { name: "No date" });
    openComposer("No date");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Inbox later" },
    });
    fireEvent.change(screen.getByLabelText("Time block"), {
      target: { value: morning.id },
    });
    expect(screen.getByLabelText("Date")).toHaveValue("2026-09-01");
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "" },
    });
    expect(screen.getByLabelText("Date")).toHaveValue("");
    expect(screen.getByLabelText("Time block")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Inbox later")).toBeInTheDocument();
    expect(submitted).toMatchObject({
      title: "Inbox later",
      date: null,
      timeBlockId: null,
    });
  });

  it("narrows time blocks to those that occur on the chosen date", async () => {
    const monday: TimeBlock = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "Monday deep work",
      description: "",
      date: "2026-08-31",
      start: "09:00:00",
      end: "11:00:00",
      recurrence: "none",
      recurrenceDays: [],
      color: "moss",
    };
    const tuesday: TimeBlock = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      title: "Tuesday review",
      description: "",
      date: "2026-09-01",
      start: "14:00:00",
      end: "15:00:00",
      recurrence: "none",
      recurrenceDays: [],
      color: "moss",
    };
    stubSignedIn({
      "GET /tasks": () => jsonResponse([]),
      "GET /blocks": () => jsonResponse([monday, tuesday]),
    });
    renderPage(<TasksPage />);

    await screen.findByRole("region", { name: "No date" });
    openComposer("No date");
    const select = screen.getByLabelText("Time block");
    expect(select).toHaveTextContent("Monday deep work");
    expect(select).toHaveTextContent("Tuesday review");

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-09-01" },
    });
    expect(select).not.toHaveTextContent("Monday deep work");
    expect(select).toHaveTextContent("Tuesday review");
  });

  it("groups active tasks by overdue, today, upcoming, and no date", async () => {
    const today = todayValue();
    const yesterday = addCalendarDays(today, -1);
    const tomorrow = addCalendarDays(today, 1);
    stubSignedIn({
      "GET /tasks": () =>
        jsonResponse([
          {
            ...task,
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            title: "Past due",
            date: yesterday,
            order: 0,
          },
          {
            ...task,
            id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            title: "Due today",
            date: today,
            order: 1,
          },
          {
            ...task,
            id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            title: "Due tomorrow",
            date: tomorrow,
            order: 2,
          },
          {
            ...task,
            id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
            title: "Inbox item",
            date: null,
            order: 3,
          },
          {
            ...task,
            id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            title: "Finished yesterday’s leftover",
            date: yesterday,
            done: true,
            completedAt: new Date().toISOString(),
            order: 4,
          },
        ]),
    });
    renderPage(<TasksPage />);

    expect(await screen.findByText("Past due")).toBeInTheDocument();
    expect(within(section("Overdue")).getByText("Past due")).toBeInTheDocument();
    expect(within(section("Overdue")).getByText("Yesterday")).toBeInTheDocument();
    expect(within(section("Today")).getByText("Due today")).toBeInTheDocument();
    expect(
      within(section("Today")).getByText("Finished yesterday’s leftover"),
    ).toBeInTheDocument();
    expect(within(section("Upcoming")).getByText("Due tomorrow")).toBeInTheDocument();
    expect(within(section("Upcoming")).getByText("Tomorrow")).toBeInTheDocument();
    expect(within(section("No date")).getByText("Inbox item")).toBeInTheDocument();

    openComposer("Upcoming");
    expect(screen.getByLabelText("Date")).toHaveValue(tomorrow);
    expect(within(section("Today")).queryByLabelText("Title")).not.toBeInTheDocument();
  });
});
