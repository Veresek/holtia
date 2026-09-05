import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { jsonResponse, stubApi } from "../test/api";
import { renderWithRouter } from "../test/render";

describe("RegisterPage", () => {
  it("sends a duplicate signup to verify without saying the email exists", async () => {
    stubApi({
      "POST /auth/register": () =>
        jsonResponse({
          id: "22222222-2222-2222-2222-222222222222",
          email: "ada@example.com",
          verifiedAt: null,
        }),
    });
    renderWithRouter(<App />, { route: "/register" });
    await screen.findByRole("heading", { name: "Create your account" });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", { name: "Verify your account" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("An account with this email already exists."),
    ).not.toBeInTheDocument();
  });

  it("sends an unverified account to verify", async () => {
    stubApi({
      "POST /auth/register": () =>
        jsonResponse({
          id: "11111111-1111-1111-1111-111111111111",
          email: "ada@example.com",
          verifiedAt: null,
        }),
    });
    renderWithRouter(<App />, { route: "/register" });
    await screen.findByRole("heading", { name: "Create your account" });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", { name: "Verify your account" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("ada@example.com")).toBeInTheDocument();
  });

  it("does not create an account when the password has no number", async () => {
    stubApi();
    renderWithRouter(<App />, { route: "/register" });
    await screen.findByRole("heading", { name: "Create your account" });

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      screen.getByText("That password does not meet the requirements."),
    ).toBeInTheDocument();
    expect(screen.getByText("Includes a number")).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Password requirements" }),
    ).toHaveAttribute("aria-live", "polite");
    expect(
      vi.mocked(fetch).mock.calls.some((call) =>
        String(call[0]).includes("/auth/register"),
      ),
    ).toBe(false);
  });

  it("lists password rules under the field", async () => {
    stubApi();
    renderWithRouter(<App />, { route: "/register" });
    await screen.findByRole("heading", { name: "Create your account" });

    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("Includes a letter")).toBeInTheDocument();
    expect(screen.getByText("Includes a number")).toBeInTheDocument();
  });
});
