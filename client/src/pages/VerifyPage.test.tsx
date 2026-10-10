import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { ada, jsonResponse, stubApi } from "../test/api";
import { renderWithRouter } from "../test/render";

const noContent = () => new Response(null, { status: 204 });

function bodyFor(path: string) {
  const call = vi
    .mocked(fetch)
    .mock.calls.find((entry) => String(entry[0]).includes(path));
  return JSON.parse(String(call?.[1]?.body));
}

describe("VerifyPage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for the emailed code, never an instance code", async () => {
    stubApi();
    renderWithRouter(<App />, { route: "/verify" });

    expect(
      await screen.findByText("Enter the 6-digit code we emailed you."),
    ).toBeInTheDocument();
    const code = screen.getByLabelText("Verification code");
    expect(code).toHaveAttribute("name", "code");
    expect(code).toHaveAttribute("type", "text");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("maxlength", "6");
    expect(code).toHaveAttribute("pattern", "[0-9]{6}");
    expect(screen.queryByText(/instance code/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resend code" }),
    ).toBeDisabled();
  });

  it("verifies with the code and opens home", async () => {
    stubApi({
      "POST /auth/verify": () => jsonResponse(ada),
    });
    renderWithRouter(<App />, { route: "/verify" });

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify account" }));

    expect(
      await screen.findByRole("heading", {
        name: /Good (morning|afternoon|evening|night)\./,
      }),
    ).toBeInTheDocument();
    expect(bodyFor("/auth/verify")).toEqual({
      email: "ada@example.com",
      code: "123456",
    });
  });

  it("resends the code and confirms it was sent", async () => {
    stubApi({ "POST /auth/send-code": noContent });
    const { container } = renderWithRouter(<App />, { route: "/verify" });

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });

    // Mounted before the click so the text change is announced.
    const statusRegion = container.querySelector('[aria-live="polite"]');
    expect(statusRegion).toBeInTheDocument();
    expect(statusRegion).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    const confirmation = await screen.findByText(
      "Code sent. Check your email.",
    );
    expect(confirmation).toHaveAttribute("aria-live", "polite");
    expect(bodyFor("/auth/send-code")).toEqual({
      email: "ada@example.com",
      purpose: "verify",
    });
    expect(
      screen.getByRole("button", { name: /^Resend code in \d+s$/ }),
    ).toBeDisabled();
  });

  it("holds resend in a cooldown, then offers it again", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    stubApi({ "POST /auth/send-code": noContent });
    renderWithRouter(<App />, { route: "/verify" });

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await screen.findByText("Code sent. Check your email.");
    expect(
      screen.getByRole("button", { name: "Resend code in 60s" }),
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole("button", { name: "Resend code in 59s" }),
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    const resend = screen.getByRole("button", { name: "Resend code" });
    expect(resend).toBeEnabled();

    fireEvent.click(resend);
    expect(
      vi.mocked(fetch).mock.calls.filter((call) =>
        String(call[0]).includes("/auth/send-code"),
      ),
    ).toHaveLength(2);
  });

  it("keeps resend available when sending the code fails", async () => {
    stubApi({
      "POST /auth/send-code": () =>
        jsonResponse({ detail: "Too many requests. Try again later." }, 429),
    });
    renderWithRouter(<App />, { route: "/verify" });

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Try again later.",
    );
    expect(screen.queryByText(/code sent/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled();
  });

  it("announces errors and links back to login", async () => {
    stubApi({
      "POST /auth/verify": () =>
        jsonResponse(
          { detail: "Verification failed. Check the code and try again." },
          400,
        ),
    });
    renderWithRouter(<App />, { route: "/verify" });

    expect(
      await screen.findByRole("link", { name: "Back to login" }),
    ).toHaveAttribute("href", "/login");
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Verification failed. Check the code and try again.",
    );
  });

  it("shows a readable pending state", async () => {
    stubApi({
      "POST /auth/verify": () => new Promise<Response>(() => undefined),
    });
    renderWithRouter(<App />, { route: "/verify" });

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify account" }));

    const button = screen.getByRole("button", { name: "Verifying…" });
    expect(button).toBeDisabled();
    expect(button.closest("form")).toHaveAttribute("aria-busy", "true");
  });
});
