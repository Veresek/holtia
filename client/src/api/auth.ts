import { deviceTimeZone } from "../time";
import type { User } from "../types";
import { apiRequest } from "./client";

interface Credentials {
  email: string;
  password: string;
}

interface VerifyPayload {
  email: string;
  code: string;
}

interface SendCodePayload {
  email: string;
  purpose: "verify" | "reset";
}

interface ResetPayload {
  email: string;
  instanceCode: string;
  newPassword: string;
}

export const authApi = {
  register: (payload: Credentials & { timezone?: string }) =>
    apiRequest<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        timezone: payload.timezone ?? deviceTimeZone(),
      }),
    }),
  login: (payload: Credentials) =>
    apiRequest<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sendCode: (payload: SendCodePayload) =>
    apiRequest<void>("/auth/send-code", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verify: (payload: VerifyPayload) =>
    apiRequest<User>("/auth/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reset: (payload: ResetPayload) =>
    apiRequest<void>("/auth/reset", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  refresh: () =>
    apiRequest<void>("/auth/refresh", {
      method: "POST",
      skipRefresh: true,
    }),
  logout: () =>
    apiRequest<void>("/auth/logout", {
      method: "POST",
      skipRefresh: true,
    }),
};
