import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";
import {
  ada,
  configuredAiSettings,
  enabledAiSettings,
  jsonResponse,
  openaiKeyId,
  stubApi,
} from "../test/api";
import { renderWithRouter } from "../test/render";

async function openDeleteConfirmation() {
  await screen.findByRole("heading", { name: "Account" });
  fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
}

async function openKeyForm() {
  fireEvent.click(await screen.findByRole("button", { name: "Add API key" }));
  expect(
    await screen.findByRole("dialog", { name: "Add API key" }),
  ).toBeInTheDocument();
}

describe("AccountPage", () => {
  it("keeps account, assistant, and delete as the page headings", async () => {
    stubApi({}, { user: ada });
    renderWithRouter(<App />, { route: "/account" });

    await screen.findByRole("heading", { name: "Account" });
    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Account", "AI assistant", "Delete account"]);
  });

  it("shows the signed-in email without verification copy", async () => {
    stubApi({}, { user: ada });
    renderWithRouter(<App />, { route: "/account" });

    await screen.findByRole("heading", { name: "Account" });
    expect(screen.getByText(ada.email)).toBeInTheDocument();
    expect(
      screen.queryByText("This account is verified."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/instance code/i)).not.toBeInTheDocument();
  });

  it("keeps account, assistant, then delete in document order", async () => {
    stubApi({}, { user: ada });
    renderWithRouter(<App />, { route: "/account" });

    await screen.findByRole("heading", { name: "AI assistant" });
    const headings = screen
      .getAllByRole("heading")
      .filter((heading) => heading.closest("main"))
      .map((heading) => heading.textContent);

    expect(headings).toEqual(["Account", "AI assistant", "Delete account"]);
  });

  it("cancels account deletion without sending a request", async () => {
    stubApi({}, { user: ada });
    renderWithRouter(<App />, { route: "/account" });

    await openDeleteConfirmation();
    expect(
      screen.getByRole("dialog", {
        name: "Delete your account permanently?",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("button", { name: "Yes, delete my account" }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
      "/api/users/me",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("keeps confirmation open and shows an API error", async () => {
    stubApi(
      {
        "DELETE /users/me": () =>
          jsonResponse({ detail: "Account deletion is unavailable." }, 503),
      },
      { user: ada },
    );
    renderWithRouter(<App />, { route: "/account" });

    await openDeleteConfirmation();
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, delete my account" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Account deletion is unavailable.",
    );
    expect(
      screen.getByRole("button", { name: "Yes, delete my account" }),
    ).toBeEnabled();
  });

  it("shows pending state and returns to login after deletion", async () => {
    let finishDelete: (() => void) | undefined;
    stubApi(
      {
        "DELETE /users/me": () =>
          new Promise<Response>((resolve) => {
            finishDelete = () => resolve(new Response(null, { status: 204 }));
          }),
      },
      { user: ada },
    );
    renderWithRouter(<App />, { route: "/account" });

    await openDeleteConfirmation();
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, delete my account" }),
    );

    expect(
      screen.getByRole("button", { name: "Deleting account…" }),
    ).toBeDisabled();
    finishDelete?.();

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
  });

  it("explains when the assistant is disabled", async () => {
    stubApi({}, { user: ada });
    renderWithRouter(<App />, { route: "/account" });

    await screen.findByRole("heading", { name: "AI assistant" });
    expect(
      await screen.findByText("The assistant is not enabled on this instance."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add API key" }),
    ).not.toBeInTheDocument();
  });

  it("saves a provider key", async () => {
    stubApi(
      {
        "GET /ai/settings": () => jsonResponse(enabledAiSettings),
        "POST /ai/keys": (init) => {
          const body = JSON.parse(String(init?.body)) as {
            provider: string;
            model: string;
            apiKey: string;
          };
          expect(body).toEqual({
            provider: "openai",
            model: "gpt-4o-mini",
            apiKey: "sk-test-openai-secret-key-value",
          });
          return jsonResponse(configuredAiSettings, 201);
        },
      },
      { user: ada },
    );
    renderWithRouter(<App />, { route: "/account" });

    await screen.findByRole("button", { name: "Add API key" });
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    expect(screen.getByText("No API key in use.")).toBeInTheDocument();

    await openKeyForm();
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-test-openai-secret-key-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));

    expect(
      await screen.findAllByText("Key ending in alue"),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("dialog", { name: "Add API key" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add API key" }),
    ).toBeInTheDocument();
  });

  it("replaces and removes a saved key", async () => {
    let current = configuredAiSettings;
    stubApi(
      {
        "GET /ai/settings": () => jsonResponse(current),
        [`PATCH /ai/keys/${openaiKeyId}`]: () => jsonResponse(configuredAiSettings),
        [`DELETE /ai/keys/${openaiKeyId}`]: () => {
          current = enabledAiSettings;
          return jsonResponse(enabledAiSettings);
        },
      },
      { user: ada },
    );
    renderWithRouter(<App />, { route: "/account" });

    await screen.findAllByText("Key ending in alue");
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Key ending in alue" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(
      await screen.findByRole("dialog", { name: "Edit API key" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-replacement-key-value-1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    expect(
      await screen.findAllByText("Key ending in alue"),
    ).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Key ending in alue" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove the key" }));

    expect(await screen.findByText("No API key in use.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add API key" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
  });
});
