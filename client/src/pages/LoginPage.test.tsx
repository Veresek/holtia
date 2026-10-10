import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import { ada, jsonResponse, stubApi } from "../test/api";
import { renderWithRouter } from "../test/render";

describe("LoginPage", () => {
  it("shows an error when credentials are rejected", async () => {
    stubApi({
      "POST /auth/login": () =>
        jsonResponse({ detail: "Invalid email or password." }, 401),
    });
    renderWithRouter(<App />, { route: "/login" });
    await screen.findByRole("heading", { name: "Welcome back" });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Invalid email or password.");
  });

  it("sends an unverified account to verification with its email", async () => {
    stubApi({
      "POST /auth/login": () =>
        jsonResponse(
          { detail: "Verify your account with the code sent to your email." },
          403,
        ),
    });
    renderWithRouter(<App />, { route: "/login" });
    await screen.findByRole("heading", { name: "Welcome back" });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada+private@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByRole("heading", { name: "Verify your account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("ada+private@example.com"),
    ).toBeInTheDocument();
    expect(window.location.search).not.toContain("ada");
  });

  it("exposes pending state and form autocomplete", async () => {
    stubApi({
      "POST /auth/login": () => new Promise<Response>(() => undefined),
    });
    renderWithRouter(<App />, { route: "/login" });
    await screen.findByRole("heading", { name: "Welcome back" });

    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    const pendingButton = screen.getByRole("button", { name: "Logging in…" });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton.closest("form")).toHaveAttribute("aria-busy", "true");
  });

  it("opens home after a successful login", async () => {
    stubApi({
      "POST /auth/login": () => jsonResponse(ada),
    });
    renderWithRouter(<App />, { route: "/login" });
    await screen.findByRole("heading", { name: "Welcome back" });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByRole("heading", {
        name: /Good (morning|afternoon|evening|night)\./,
      }),
    ).toBeInTheDocument();
  });
});
