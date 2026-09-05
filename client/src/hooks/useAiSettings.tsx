import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { aiApi } from "../api/ai";
import { ApiError } from "../api/client";
import type { AiSettings } from "../types";

const LOAD_ERROR = "Assistant settings could not be loaded.";

export interface AiSettingsContextValue {
  settings: AiSettings | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setSettings: (settings: AiSettings) => void;
}

const AiSettingsContext = createContext<AiSettingsContextValue | null>(null);

interface AiSettingsProviderProps {
  children: ReactNode;
}

export function AiSettingsProvider({ children }: AiSettingsProviderProps) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await aiApi.settings();
      setSettings(next);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : LOAD_ERROR,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({
      settings,
      loading,
      error,
      reload,
      setSettings,
    }),
    [error, loading, reload, settings],
  );

  return (
    <AiSettingsContext.Provider value={value}>
      {children}
    </AiSettingsContext.Provider>
  );
}

export function useAiSettings(): AiSettingsContextValue {
  const context = useContext(AiSettingsContext);
  if (!context) {
    throw new Error("useAiSettings must be used within AiSettingsProvider.");
  }
  return context;
}
