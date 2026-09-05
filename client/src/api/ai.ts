import type {
  AiKeyCreate,
  AiKeyUpdate,
  AiPlanResponse,
  AiSettings,
} from "../types";
import { apiRequest } from "./client";

export const aiApi = {
  settings: () => apiRequest<AiSettings>("/ai/settings"),
  createKey: (payload: AiKeyCreate) =>
    apiRequest<AiSettings>("/ai/keys", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateKey: (keyId: string, payload: AiKeyUpdate) =>
    apiRequest<AiSettings>(`/ai/keys/${keyId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  removeKey: (keyId: string) =>
    apiRequest<AiSettings>(`/ai/keys/${keyId}`, { method: "DELETE" }),
  activateKey: (keyId: string) =>
    apiRequest<AiSettings>(`/ai/keys/${keyId}/active`, { method: "PUT" }),
  plan: (prompt: string) =>
    apiRequest<AiPlanResponse>("/ai/plan", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
};
