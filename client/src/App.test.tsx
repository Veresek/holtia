import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { ada, stubApi } from "./test/api";
import { renderWithRouter } from "./test/render";

describe("App routes", () => {
  it("sends visitors to login when they are not signed in", async () => {
    stubApi();
    renderWithRouter(<App />);

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
  });

  it("renders the home morning review when signed in", async () => {
    stubApi({}, { user: ada });
    renderWithRouter(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /Good (morning|afternoon|evening|night)\./,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Around now" })).toBeInTheDocument();
    expect(screen.queryByText("- 1h")).not.toBeInTheDocument();
    expect(screen.queryByText("Now − 1h")).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
  });

  it("renders login", async () => {
    stubApi();
    renderWithRouter(<App />, { route: "/login" });

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("renders registration", async () => {
    stubApi();
    renderWithRouter(<App />, { route: "/register" });

    expect(
      await screen.findByRole("heading", { name: "Create your account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
  });

  it("renders password reset", async () => {
    stubApi();
    renderWithRouter(<App />, { route: "/reset" });

    expect(
      await screen.findByRole("heading", { name: "Reset your password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset password" }),
    ).toBeInTheDocument();
  });

  it("shows account email and logs out", async () => {
    stubApi({}, { user: ada });
    renderWithRouter(<App />, { route: "/account" });

    expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
  });

  it("keeps the account open and reports a logout failure", async () => {
    stubApi(
      {
        "POST /auth/logout": () =>
          new Response(
            JSON.stringify({ detail: "Logout could not be completed." }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          ),
      },
      { user: ada },
    );
    renderWithRouter(<App />, { route: "/account" });

    await screen.findByText("ada@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Logout could not be completed.",
    );
    expect(
      screen.getByRole("heading", { name: "Account" }),
    ).toBeInTheDocument();
  });

  it("renders calendar", async () => {
    stubApi({}, { user: ada });
    renderWithRouter(<App />, { route: "/calendar" });

    expect(
      await screen.findByRole("heading", { name: "Calendar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add event" })).toBeInTheDocument();
  });
});
