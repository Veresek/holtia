import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { jsonResponse, stubApi } from "../test/api";
import { renderWithRouter } from "../test/render";

const noContent = () => new Response(null, { status: 204 });

function bodyFor(path: string) {
  const call = vi
    .mocked(fetch)
    .mock.calls.find((entry) => String(entry[0]).includes(path));
  return JSON.parse(String(call?.[1]?.body));
}

async function toCodeStep() {
  fireEvent.change(await screen.findByLabelText("Email"), {
    target: { value: "ada@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("Verification code");
}

describe("ResetPage", () => {
  it("sends an emailed code before asking for a new password", async () => {
    stubApi({ "POST /auth/send-code": noContent });
    renderWithRouter(<App />, { route: "/reset" });

    expect(
      await screen.findByRole("heading", { name: "Reset your password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send code" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/this server/i)).not.toBeInTheDocument();

    await toCodeStep();

    expect(bodyFor("/auth/send-code")).toEqual({
      email: "ada@example.com",
      purpose: "reset",
    });
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.queryByText(/this server/i)).not.toBeInTheDocument();

    const code = screen.getByLabelText("Verification code");
    expect(code).toHaveAttribute("name", "code");
    expect(code).toHaveAttribute("type", "text");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("maxlength", "6");
    expect(code).toHaveAttribute("pattern", "[0-9]{6}");
  });

  it("announces the step switch and moves focus to the code field", async () => {
    stubApi({ "POST /auth/send-code": noContent });
    renderWithRouter(<App />, { route: "/reset" });

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });

    // Mounted before the switch so the text change is announced.
    const statusRegion = screen.getByRole("status");
    expect(statusRegion).toHaveAttribute("aria-live", "polite");
    expect(statusRegion).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    const confirmation = await screen.findByText(
      "Check your email for the code.",
    );
    expect(confirmation).toBe(statusRegion);
    expect(confirmation).toHaveAttribute("aria-live", "polite");
    expect(confirmation).toHaveClass("mt-3");

    const code = screen.getByLabelText("Verification code");
    expect(code).toHaveFocus();
    expect(code).toHaveValue("");
  });

  it("resets with the emailed code and returns to login", async () => {
    stubApi({
      "POST /auth/send-code": noContent,
      "POST /auth/reset": noContent,
    });
    renderWithRouter(<App />, { route: "/reset" });

    await toCodeStep();

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(bodyFor("/auth/reset")).toEqual({
      email: "ada@example.com",
      code: "123456",
      newPassword: "new-password1",
    });
  });

  it("announces the server failure and links back to login", async () => {
    // The server's own copy (server/app/services/auth.py RESET_FAILED): the
    // client renders it verbatim and adds no code hint of its own.
    const resetFailed = "Reset failed. Check the code and try again.";
    stubApi({
      "POST /auth/send-code": noContent,
      "POST /auth/reset": () => jsonResponse({ detail: resetFailed }, 400),
    });
    renderWithRouter(<App />, { route: "/reset" });

    expect(
      await screen.findByRole("link", { name: "Back to login" }),
    ).toHaveAttribute("href", "/login");
    await toCodeStep();

    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "000000" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(resetFailed);
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("id", "reset-error");
    expect(screen.getByLabelText("Verification code")).toHaveAttribute(
      "aria-describedby",
      "reset-error",
    );
    // The “check your email” line would otherwise sit next to the failure,
    // still claiming a code is on its way.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("does not send a reset when the password is weak", async () => {
    stubApi({
      "POST /auth/send-code": noContent,
      "POST /auth/reset": noContent,
    });
    renderWithRouter(<App />, { route: "/reset" });

    await toCodeStep();

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(
      screen.getByText("That password does not meet the requirements."),
    ).toBeInTheDocument();
    expect(screen.getByText("Includes a number")).toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some((call) =>
        String(call[0]).includes("/auth/reset"),
      ),
    ).toBe(false);
  });

  it("keeps the email when going back to the first step", async () => {
    stubApi({ "POST /auth/send-code": noContent });
    renderWithRouter(<App />, { route: "/reset" });

    await toCodeStep();
    expect(
      await screen.findByText("Enter the 6-digit code from your email."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    // The swap unmounted the focused code field, so Back hands focus to the
    // field it just put back on the page.
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Send code" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).not.toHaveClass("mt-3");
  });

  it("shows a readable pending state", async () => {
    stubApi({
      "POST /auth/send-code": noContent,
      "POST /auth/reset": () => new Promise<Response>(() => undefined),
    });
    renderWithRouter(<App />, { route: "/reset" });

    await toCodeStep();

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    const button = screen.getByRole("button", {
      name: "Resetting password…",
    });
    expect(button).toBeDisabled();
    expect(button.closest("form")).toHaveAttribute("aria-busy", "true");
  });
});
