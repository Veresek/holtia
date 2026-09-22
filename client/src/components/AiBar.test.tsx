import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";
import {
  ada,
  configuredAiSettings,
  enabledAiSettings,
  jsonResponse,
  stubApi,
  stubSignedIn,
} from "../test/api";
import { renderWithRouter } from "../test/render";
import type { AiPlanResponse } from "../types";

function stateCount() {
  return vi.mocked(fetch).mock.calls.filter(([input, init]) => {
    const method = ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase();
    return method === "GET" && String(input).endsWith("/state");
  }).length;
}

async function openAssistant() {
  const input = await screen.findByRole("textbox", { name: "AI assistant" });
  fireEvent.focus(input);
  expect(
    await screen.findByRole("heading", { name: "Assistant" }),
  ).toBeInTheDocument();
  return input;
}

async function ask(prompt: string) {
  const input = await openAssistant();
  fireEvent.change(input, { target: { value: prompt } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

const groceryPlan: AiPlanResponse = {
  reply: "I can add these for today.",
  items: [
    {
      kind: "task",
      title: "Buy milk",
      description: "",
      date: "2026-09-05",
    },
    {
      kind: "note",
      title: "Shopping list",
      markdown: "- milk",
    },
    {
      kind: "block",
      title: "Groceries",
      description: "",
      date: "2026-09-05",
      start: "18:00:00",
      end: "19:00:00",
    },
  ],
};

describe("AiBar", () => {
  it("keeps the placeholder disabled when AI is off", async () => {
    stubSignedIn();
    renderWithRouter(<App />);

    expect(
      await screen.findByRole("textbox", { name: "AI assistant (coming later)" }),
    ).toBeDisabled();
    expect(screen.getByText("Coming later")).toBeInTheDocument();
  });

  it("sends an unconfigured bar to Account", async () => {
    stubSignedIn({
      "GET /ai/settings": () => jsonResponse(enabledAiSettings),
    });
    renderWithRouter(<App />);

    fireEvent.click(
      await screen.findByRole("link", {
        name: "Set an API key on Account to use the assistant.",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Account" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add API key" })).toBeInTheDocument();
  });

  it("opens a clarifying reply without a create action", async () => {
    stubSignedIn({
      "GET /ai/settings": () => jsonResponse(configuredAiSettings),
      "POST /ai/plan": () =>
        jsonResponse({
          reply: "What time should this start?",
          items: [],
        }),
    });
    renderWithRouter(<App />);

    await ask("Block for deep work");

    expect(
      await screen.findByText("What time should this start?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create items" }),
    ).not.toBeInTheDocument();
  });

  it("discards a preview without creating anything", async () => {
    stubSignedIn({
      "GET /ai/settings": () => jsonResponse(configuredAiSettings),
      "POST /ai/plan": () => jsonResponse(groceryPlan),
    });
    renderWithRouter(<App />);

    await ask("Plan groceries");
    await screen.findByRole("button", { name: "Create items" });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(
      screen.queryByRole("button", { name: "Create items" }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates tasks, notes, and blocks after one confirmation", async () => {
    stubSignedIn({
      "GET /ai/settings": () => jsonResponse(configuredAiSettings),
      "POST /ai/plan": () => jsonResponse(groceryPlan),
      "POST /tasks": () =>
        jsonResponse({
          id: "22222222-2222-2222-2222-222222222222",
          title: "Buy milk",
          description: "",
          done: false,
          priority: "medium",
          date: "2026-09-05",
          timeBlockId: null,
          order: 0,
          createdAt: "2026-09-05T08:00:00Z",
          completedAt: null,
        }, 201),
      "POST /notes": () =>
        jsonResponse({
          id: "33333333-3333-3333-3333-333333333333",
          title: "Shopping list",
          markdown: "- milk",
          date: null,
          taskId: null,
          timeBlockId: null,
          updatedAt: "2026-09-05T08:00:00Z",
        }, 201),
      "POST /blocks": () =>
        jsonResponse({
          id: "44444444-4444-4444-4444-444444444444",
          title: "Groceries",
          description: "",
          date: "2026-09-05",
          start: "18:00:00",
          end: "19:00:00",
          recurrence: "none",
          recurrenceDays: [],
          color: "moss",
        }, 201),
    });
    renderWithRouter(<App />);

    await ask("Plan groceries");
    const statesBefore = stateCount();
    fireEvent.click(await screen.findByRole("button", { name: "Create items" }));

    expect(await screen.findByText(/Created Buy milk/)).toBeInTheDocument();
    await waitFor(() => expect(stateCount()).toBeGreaterThan(statesBefore));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({ method: "POST" }),
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/notes",
      expect.objectContaining({ method: "POST" }),
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/blocks",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps created items when a later create fails", async () => {
    stubSignedIn({
      "GET /ai/settings": () => jsonResponse(configuredAiSettings),
      "POST /ai/plan": () => jsonResponse(groceryPlan),
      "POST /tasks": () =>
        jsonResponse({
          id: "22222222-2222-2222-2222-222222222222",
          title: "Buy milk",
          description: "",
          done: false,
          priority: "medium",
          date: "2026-09-05",
          timeBlockId: null,
          order: 0,
          createdAt: "2026-09-05T08:00:00Z",
          completedAt: null,
        }, 201),
      "POST /notes": () =>
        jsonResponse({ detail: "Notes are unavailable." }, 503),
      "POST /blocks": () =>
        jsonResponse({
          id: "44444444-4444-4444-4444-444444444444",
          title: "Groceries",
          description: "",
          date: "2026-09-05",
          start: "18:00:00",
          end: "19:00:00",
          recurrence: "none",
          recurrenceDays: [],
          color: "moss",
        }, 201),
    });
    renderWithRouter(<App />);

    await ask("Plan groceries");
    fireEvent.click(await screen.findByRole("button", { name: "Create items" }));

    expect(await screen.findByText(/Created Buy milk/)).toBeInTheDocument();
    expect(
      await screen.findByText(/Could not create Shopping list/),
    ).toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/blocks",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the panel open while moving between panels", async () => {
    stubApi(
      {
        "GET /ai/settings": () => jsonResponse(configuredAiSettings),
      },
      { user: ada },
    );
    renderWithRouter(<App />);

    await openAssistant();
    fireEvent.click(screen.getAllByRole("link", { name: "Calendar" })[0]);

    expect(
      await screen.findByRole("heading", { name: "Calendar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Assistant" }),
    ).toBeInTheDocument();
  });
});
