import { vi } from "vitest";

import type { AiSettings, User } from "../types";

export const ada: User = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "ada@example.com",
  verifiedAt: "2026-08-31T00:00:00.000Z",
  createdAt: "2026-08-30T00:00:00.000Z",
};

export const openaiKeyId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const models: AiSettings["models"] = {
  openai: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }],
  xai: [{ id: "grok-3-mini", label: "Grok 3 mini" }],
  gemini: [{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
};

export const disabledAiSettings: AiSettings = {
  enabled: false,
  configured: false,
  provider: null,
  model: null,
  keyHint: null,
  activeKeyId: null,
  keys: [],
  models,
};

export const enabledAiSettings: AiSettings = {
  ...disabledAiSettings,
  enabled: true,
};

export const configuredAiSettings: AiSettings = {
  ...enabledAiSettings,
  configured: true,
  provider: "openai",
  model: "gpt-4o-mini",
  keyHint: "alue",
  activeKeyId: openaiKeyId,
  keys: [
    {
      id: openaiKeyId,
      provider: "openai",
      model: "gpt-4o-mini",
      keyHint: "alue",
    },
  ],
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Handler = (init?: RequestInit) => Response | Promise<Response>;

export const emptyAppState = {
  tasks: { count: 0, updatedAt: null },
  notes: { count: 0, updatedAt: null },
  blocks: { count: 0, updatedAt: null },
};

export function stubApi(
  handlers: Record<string, Handler> = {},
  options: { user?: User | null } = {},
) {
  const sessionUser = options.user === undefined ? null : options.user;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const path = url.replace(/^.*\/api/, "");
      const key = `${method} ${path}`;

      if (handlers[key]) {
        return handlers[key](init);
      }

      if (path === "/users/me" && method === "GET") {
        if (sessionUser) {
          return jsonResponse(sessionUser);
        }
        return jsonResponse({ detail: "Not authenticated." }, 401);
      }

      if (path === "/auth/refresh" && method === "POST") {
        return jsonResponse({ detail: "Not authenticated." }, 401);
      }

      if (path === "/auth/logout" && method === "POST") {
        return new Response(null, { status: 204 });
      }

      if (path.startsWith("/tasks") && method === "GET") {
        return jsonResponse([]);
      }

      if (
        method === "GET" &&
        (path === "/blocks" || path.startsWith("/blocks?"))
      ) {
        return jsonResponse([]);
      }

      if (path === "/notes" && method === "GET") {
        return jsonResponse([]);
      }

      if (path === "/state" && method === "GET") {
        return jsonResponse(emptyAppState);
      }

      if (path === "/ai/settings" && method === "GET") {
        return jsonResponse(disabledAiSettings);
      }

      throw new Error(`Unhandled fetch: ${key}`);
    }),
  );
}

export function stubSignedIn(handlers: Record<string, Handler> = {}) {
  stubApi(handlers, { user: ada });
}
