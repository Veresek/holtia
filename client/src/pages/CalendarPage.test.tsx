import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, stubSignedIn } from "../test/api";
import { renderPage } from "../test/render";
import {
  addCalendarDays,
  addCalendarMonths,
  formatDayHeading,
  formatMonthHeading,
  formatWeekHeading,
  startOfWeek,
  dateValue,
  weekDates,
} from "../time";
import type { TimeBlock } from "../types";
import { CalendarPage } from "./CalendarPage";

function todayValue() {
  return dateValue(new Date());
}

function thisWeek() {
  return weekDates(startOfWeek(todayValue()));
}

function sampleBlock(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Deep work",
    description: "",
    date: todayValue(),
    start: "09:00:00",
    end: "11:00:00",
    recurrence: "none",
    recurrenceDays: [],
    color: "moss",
    ...overrides,
  };
}

function stubBlocks(blocks: TimeBlock[] = []) {
  return {
    "GET /blocks": () => jsonResponse(blocks),
  };
}

async function weekBlockButton(name: string) {
  const grid = await screen.findByRole("group", { name: /Week of/ });
  return within(grid).getByRole("button", { name });
}

describe("CalendarPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state while the week is pending", () => {
    stubSignedIn({
      "GET /blocks": () => new Promise<Response>(() => undefined),
    });
    renderPage(<CalendarPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading the week");
  });

  it("shows an error and retries into an empty week", async () => {
    let attempts = 0;
    stubSignedIn({
      "GET /blocks": () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ detail: "The day could not be loaded." }, 500)
          : jsonResponse([]);
      },
    });
    renderPage(<CalendarPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The day could not be loaded.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("group", { name: /Week of/ }),
    ).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("renders an empty week with seven days and no fake events", async () => {
    stubSignedIn(stubBlocks());
    renderPage(<CalendarPage />);

    const grid = await screen.findByRole("group", {
      name: `Week of ${formatWeekHeading(startOfWeek(todayValue()))}`,
    });
    for (const date of thisWeek()) {
      expect(
        within(grid).getByRole("button", { name: formatDayHeading(date) }),
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: /Deep work/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the next week without fetching again", async () => {
    const nextWeekStart = addCalendarDays(startOfWeek(todayValue()), 7);
    stubSignedIn();
    renderPage(<CalendarPage />);
    await screen.findByRole("group", { name: /Week of/ });
    const blockLoads = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).endsWith("/blocks")).length;

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));

    expect(
      screen.getByText(formatWeekHeading(nextWeekStart)),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).endsWith("/blocks")),
    ).toHaveLength(blockLoads);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).includes("/blocks?date=")),
    ).toBe(false);
  });

  it("creates a block from a day heading", async () => {
    const monday = startOfWeek(todayValue());
    const created = sampleBlock({ title: "Writing", date: monday });
    let stored: TimeBlock[] = [];
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      ...stubBlocks(),
      "POST /blocks": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        stored = [{ ...created, title: String(submitted.title) }];
        return jsonResponse(stored[0], 201);
      },
    });
    renderPage(<CalendarPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: formatDayHeading(monday) }),
    );
    expect(screen.getByRole("dialog", { name: "Add event" })).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue(monday);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Writing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    expect(await weekBlockButton("Writing, 09:00–11:00")).toBeInTheDocument();
    expect(submitted).toMatchObject({
      title: "Writing",
      date: monday,
      start: "09:00:00",
      end: "10:00:00",
      recurrence: "none",
      recurrenceDays: [],
    });
  });

  it("creates a block from the header action", async () => {
    const created = sampleBlock({ title: "Writing" });
    let stored: TimeBlock[] = [];
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      ...stubBlocks(),
      "POST /blocks": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        stored = [{ ...created, title: String(submitted.title) }];
        return jsonResponse(stored[0], 201);
      },
    });
    renderPage(<CalendarPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add event" }));
    expect(screen.getByRole("dialog", { name: "Add event" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Writing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    expect(await weekBlockButton("Writing, 09:00–11:00")).toBeInTheDocument();
    expect(submitted).toMatchObject({
      title: "Writing",
      date: todayValue(),
      start: "09:00:00",
      end: "10:00:00",
      recurrence: "none",
      recurrenceDays: [],
    });
  });

  it("creates a block with a color", async () => {
    const created = sampleBlock({ title: "Reading", color: "#6a7d5c" });
    let stored: TimeBlock[] = [];
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      ...stubBlocks(),
      "POST /blocks": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        stored = [
          {
            ...created,
            title: String(submitted.title),
            color: submitted.color as TimeBlock["color"],
          },
        ];
        return jsonResponse(stored[0], 201);
      },
    });
    renderPage(<CalendarPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add event" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Reading" },
    });
    expect(screen.getByRole("group", { name: "Color" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Color" })).getAllByRole("radio"),
    ).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "Lichen" }));
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    expect(submitted).toMatchObject({
      title: "Reading",
      color: "#6a7d5c",
    });
    const tile = (await weekBlockButton("Reading, 09:00–11:00")).closest(
      "article",
    );
    expect(tile).toHaveStyle({
      borderLeftColor: "rgb(106, 125, 92)",
    });
  });

  it("creates a block with a custom color", async () => {
    const created = sampleBlock({ title: "Studio", color: "#1a3344" });
    let stored: TimeBlock[] = [];
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      ...stubBlocks(),
      "POST /blocks": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        stored = [
          {
            ...created,
            title: String(submitted.title),
            color: submitted.color as TimeBlock["color"],
          },
        ];
        return jsonResponse(stored[0], 201);
      },
    });
    renderPage(<CalendarPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add event" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Studio" },
    });
    fireEvent.change(screen.getByLabelText("Custom color"), {
      target: { value: "#1a3344" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    expect(submitted).toMatchObject({
      title: "Studio",
      color: "#1a3344",
    });
  });

  it("submits selected weekdays from the form", async () => {
    const created = sampleBlock({
      title: "Studio",
      recurrence: "weekdays",
      recurrenceDays: [0, 2],
    });
    let submitted: Record<string, unknown> | undefined;
    stubSignedIn({
      ...stubBlocks(),
      "POST /blocks": (init) => {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse(created, 201);
      },
    });
    renderPage(<CalendarPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add event" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Studio" },
    });
    fireEvent.change(screen.getByLabelText("Repeat"), {
      target: { value: "weekdays" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Wednesday" }));
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() =>
      expect(submitted).toMatchObject({
        title: "Studio",
        recurrence: "weekdays",
        recurrenceDays: [0, 2],
      }),
    );
  });

  it("edits a repeating block with a single patch and refreshes the week", async () => {
    const block = sampleBlock({
      title: "Weekly review",
      recurrence: "weekly",
    });
    let stored = [block];
    let patched: Record<string, unknown> | undefined;
    stubSignedIn({
      ...stubBlocks(stored),
      [`PATCH /blocks/${block.id}`]: (init) => {
        patched = JSON.parse(String(init?.body)) as Record<string, unknown>;
        stored = [{ ...block, title: String(patched.title) }];
        return jsonResponse(stored[0]);
      },
    });
    renderPage(<CalendarPage />);
    fireEvent.click(await weekBlockButton("Weekly review, 09:00–11:00"));
    expect(screen.getByRole("dialog", { name: "Edit event" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Monday review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const grid = await screen.findByRole("group", { name: /Week of/ });
    expect(
      within(grid).getByRole("button", {
        name: "Monday review, 09:00–11:00",
      }),
    ).toBeInTheDocument();
    expect(patched).toMatchObject({ title: "Monday review" });
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input, init]) =>
          String(input).endsWith(`/blocks/${block.id}`) &&
          (init as RequestInit | undefined)?.method === "PATCH",
        ),
    ).toHaveLength(1);
  });

  it("deletes a block after confirmation", async () => {
    const block = sampleBlock();
    let stored = [block];
    stubSignedIn({
      ...stubBlocks(stored),
      [`DELETE /blocks/${block.id}`]: () => {
        stored = [];
        return new Response(null, { status: 204 });
      },
    });
    renderPage(<CalendarPage />);
    const grid = await screen.findByRole("group", { name: /Week of/ });
    fireEvent.click(
      within(grid).getByRole("button", { name: "Deep work, 09:00–11:00" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.getByRole("dialog", { name: "Delete this event?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit event" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Deep work, 09:00–11:00" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("renders an overnight block on both days and edits it from the continuation", async () => {
    const monday = startOfWeek(todayValue());
    const tuesday = addCalendarDays(monday, 1);
    stubSignedIn(
      stubBlocks([
        sampleBlock({
          date: monday,
          start: "22:00:00",
          end: "06:00:00",
          title: "Night shift",
        }),
      ]),
    );
    renderPage(<CalendarPage />);

    const grid = await screen.findByRole("group", { name: /Week of/ });
    const mondayColumn = within(grid).getByRole("group", {
      name: formatDayHeading(monday),
    });
    const tuesdayColumn = within(grid).getByRole("group", {
      name: formatDayHeading(tuesday),
    });
    expect(
      within(mondayColumn).getByRole("button", {
        name: "Night shift, 22:00–06:00",
      }),
    ).toBeInTheDocument();
    expect(
      within(tuesdayColumn).getByRole("button", {
        name: "Night shift, 22:00–06:00",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(tuesdayColumn).getByRole("button", {
        name: "Night shift, 22:00–06:00",
      }),
    );
    expect(screen.getByRole("dialog", { name: "Edit event" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Night shift");
    expect(screen.getByLabelText("Start")).toHaveValue("22:00");
    expect(screen.getByLabelText("End")).toHaveValue("06:00");
    expect(
      screen.getByText("This block continues into the next day."),
    ).toBeInTheDocument();
  });

  it("renders overlapping blocks together", async () => {
    stubSignedIn(
      stubBlocks([
        sampleBlock(),
        sampleBlock({
          id: "22222222-2222-2222-2222-222222222222",
          title: "Call",
          start: "10:00:00",
          end: "12:00:00",
        }),
      ]),
    );
    renderPage(<CalendarPage />);

    const grid = await screen.findByRole("group", {
      name: /Week of/,
    });
    expect(
      within(grid).getByRole("button", { name: "Deep work, 09:00–11:00" }),
    ).toBeInTheDocument();
    expect(
      within(grid).getByRole("button", { name: "Call, 10:00–12:00" }),
    ).toBeInTheDocument();
  });

  it("shows a repeating block on each day it occurs", async () => {
    const daily = sampleBlock({
      date: thisWeek()[0],
      recurrence: "daily",
    });
    stubSignedIn(stubBlocks([daily]));
    renderPage(<CalendarPage />);

    const grid = await screen.findByRole("group", { name: /Week of/ });
    expect(
      within(grid).getAllByRole("button", { name: "Deep work, 09:00–11:00" }),
    ).toHaveLength(7);
  });

  it("renders block description markdown on the week grid", async () => {
    stubSignedIn(
      stubBlocks([
        sampleBlock({
          description: "Protect the **morning**.",
        }),
      ]),
    );
    renderPage(<CalendarPage />);

    const grid = await screen.findByRole("group", { name: /Week of/ });
    expect(within(grid).getByText("morning")).toBeInTheDocument();
    expect(within(grid).getByText("morning").tagName).toBe("STRONG");
    expect(
      within(grid).queryByText("Protect the **morning**."),
    ).not.toBeInTheDocument();
  });

  it("shows pinned tasks and notes inside a block", async () => {
    const block = sampleBlock();
    stubSignedIn({
      "GET /blocks": () => jsonResponse([block]),
      "GET /tasks": () =>
        jsonResponse([
          {
            id: "22222222-2222-2222-2222-222222222222",
            title: "Write the intro",
            description: "",
            done: false,
            priority: "medium",
            date: todayValue(),
            timeBlockId: block.id,
            order: 0,
            createdAt: "2026-09-01T08:00:00Z",
            completedAt: null,
          },
        ]),
      "GET /notes": () =>
        jsonResponse([
          {
            id: "33333333-3333-3333-3333-333333333333",
            title: "Session notes",
            markdown: "",
            date: null,
            taskId: null,
            timeBlockId: block.id,
            updatedAt: "2026-09-01T10:00:00Z",
          },
        ]),
    });
    renderPage(<CalendarPage />);

    const grid = await screen.findByRole("group", { name: /Week of/ });
    expect(within(grid).getByText("Write the intro")).toBeInTheDocument();
    expect(within(grid).getByText("Session notes")).toBeInTheDocument();

    fireEvent.click(
      within(grid).getByRole("button", { name: "Write the intro" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Write the intro" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Edit task" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit task" })).toBeInTheDocument();
  });

  it("opens the leftover pins in a reading list, not the block form", async () => {
    const block = sampleBlock();
    stubSignedIn({
      "GET /blocks": () => jsonResponse([block]),
      "GET /tasks": () =>
        jsonResponse(
          [1, 2, 3].map((index) => ({
            id: `22222222-2222-2222-2222-22222222222${index}`,
            title: `Task ${index}`,
            description: "",
            done: false,
            priority: "medium",
            date: todayValue(),
            timeBlockId: block.id,
            order: index,
            createdAt: "2026-09-01T08:00:00Z",
            completedAt: null,
          })),
        ),
      "GET /notes": () =>
        jsonResponse([
          {
            id: "33333333-3333-3333-3333-333333333333",
            title: "Session notes",
            markdown: "",
            date: null,
            taskId: null,
            timeBlockId: block.id,
            updatedAt: "2026-09-01T10:00:00Z",
          },
        ]),
    });
    renderPage(<CalendarPage />);

    const grid = await screen.findByRole("group", { name: /Week of/ });
    fireEvent.click(within(grid).getByRole("button", { name: "+1 more" }));
    expect(screen.getByRole("dialog", { name: "Deep work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New task" })).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Edit event" }),
    ).not.toBeInTheDocument();
  });

  it("shows a note pinned to a day on the week grid", async () => {
    stubSignedIn({
      "GET /notes": () =>
        jsonResponse([
          {
            id: "33333333-3333-3333-3333-333333333333",
            title: "Morning pages",
            markdown: "Write three pages.",
            date: todayValue(),
            taskId: null,
            timeBlockId: null,
            updatedAt: "2026-09-01T10:00:00Z",
          },
        ]),
    });
    renderPage(<CalendarPage />);

    const grid = await screen.findByRole("group", { name: /Week of/ });
    fireEvent.click(within(grid).getByRole("button", { name: "Morning pages" }));
    expect(
      screen.getByRole("dialog", { name: "Morning pages" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Write three pages.")).toBeInTheDocument();
  });

  it("lets a phone-sized layout pick one day from the week strip", async () => {
    stubSignedIn(stubBlocks());
    renderPage(<CalendarPage />);

    expect(
      await screen.findByRole("group", { name: "Choose a day" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Show ${formatDayHeading(todayValue())}`,
      }),
    ).toHaveAttribute("aria-current", "date");
  });

  it("shows one day and opens add event from an empty hour", async () => {
    stubSignedIn(stubBlocks([sampleBlock()]));
    renderPage(<CalendarPage />);
    await screen.findByRole("group", { name: /Week of/ });

    fireEvent.click(screen.getByRole("radio", { name: "Day" }));

    expect(screen.queryByRole("group", { name: /Week of/ })).not.toBeInTheDocument();
    const day = screen.getByRole("group", { name: formatDayHeading(todayValue()) });
    expect(
      within(day).getByRole("button", { name: "Deep work, 09:00–11:00" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(
      screen.getByRole("group", {
        name: formatDayHeading(addCalendarDays(todayValue(), 1)),
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: `Add event, ${formatDayHeading(todayValue())}`,
      }),
    );
    expect(screen.getByRole("dialog", { name: "Add event" })).toBeInTheDocument();
  });

  it("shows the month, edits an event, and opens a day from the grid", async () => {
    stubSignedIn(stubBlocks([sampleBlock()]));
    renderPage(<CalendarPage />);
    await screen.findByRole("group", { name: /Week of/ });

    fireEvent.click(screen.getByRole("radio", { name: "Month" }));

    const month = screen.getByRole("group", {
      name: `Month of ${formatMonthHeading(todayValue())}`,
    });
    fireEvent.click(
      within(month).getByRole("button", { name: "Deep work, 09:00" }),
    );
    expect(screen.getByRole("dialog", { name: "Edit event" })).toBeInTheDocument();

    fireEvent.click(
      within(month).getByRole("button", { name: formatDayHeading(todayValue()) }),
    );
    expect(screen.getByRole("radio", { name: "Day" })).toBeChecked();
    expect(
      screen.getByRole("group", { name: formatDayHeading(todayValue()) }),
    ).toBeInTheDocument();
  });

  it("hides events past the third and opens that day", async () => {
    stubSignedIn(
      stubBlocks(
        [0, 1, 2, 3].map((index) =>
          sampleBlock({
            id: `11111111-1111-1111-1111-11111111111${index}`,
            title: `Block ${index}`,
            start: `${String(9 + index).padStart(2, "0")}:00:00`,
            end: `${String(10 + index).padStart(2, "0")}:00:00`,
          }),
        ),
      ),
    );
    renderPage(<CalendarPage />);
    await screen.findByRole("group", { name: /Week of/ });
    fireEvent.click(screen.getByRole("radio", { name: "Month" }));

    const month = screen.getByRole("group", { name: /Month of/ });
    expect(
      within(month).getByRole("button", { name: "Block 0, 09:00" }),
    ).toBeInTheDocument();
    expect(
      within(month).queryByRole("button", { name: "Block 3, 12:00" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(month).getByRole("button", { name: "+1 more" }));

    expect(screen.getByRole("radio", { name: "Day" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Block 3, 12:00–13:00" }),
    ).toBeInTheDocument();
  });

  it("moves the month without fetching blocks again", async () => {
    const nextMonth = addCalendarMonths(todayValue(), 1);
    stubSignedIn(stubBlocks());
    renderPage(<CalendarPage />);
    await screen.findByRole("group", { name: /Week of/ });
    const blockLoads = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).endsWith("/blocks")).length;

    fireEvent.click(screen.getByRole("radio", { name: "Month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));

    expect(screen.getByText(formatMonthHeading(nextMonth))).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).endsWith("/blocks")),
    ).toHaveLength(blockLoads);
  });

  it("shows field errors when an event is incomplete", async () => {
    stubSignedIn(stubBlocks());
    renderPage(<CalendarPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add event" }));

    fireEvent.change(screen.getByLabelText("End"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    expect(screen.getByText("Enter a title.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Title")).toHaveClass("border-rust");
    expect(screen.getByLabelText("End")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("End cannot be the same as start.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Writing" },
    });
    fireEvent.change(screen.getByLabelText("Repeat"), {
      target: { value: "weekdays" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));

    expect(screen.getByText("Choose at least one day.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Days" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
