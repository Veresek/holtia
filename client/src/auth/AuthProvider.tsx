import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { userApi } from "../api/resources";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string) => Promise<User>;
  verify: (email: string, instanceCode: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (payload: Partial<Pick<User, "timezone">>) => Promise<User>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionChange = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const startedAt = sessionChange.current;

    userApi
      .me()
      .then((current) => {
        if (!cancelled && sessionChange.current === startedAt) {
          setUser(current);
        }
      })
      .catch(() => {
        if (!cancelled && sessionChange.current === startedAt) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await authApi.login({ email, password });
    sessionChange.current += 1;
    setUser(next);
    return next;
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const next = await authApi.register({ email, password });
    sessionChange.current += 1;
    if (next.verifiedAt) {
      setUser(next);
    }
    return next;
  }, []);

  const verify = useCallback(async (email: string, instanceCode: string) => {
    const next = await authApi.verify({ email, instanceCode });
    sessionChange.current += 1;
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
      sessionChange.current += 1;
      setUser(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        sessionChange.current += 1;
        setUser(null);
        return;
      }
      throw error;
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    await userApi.remove();
    sessionChange.current += 1;
    setUser(null);
  }, []);

  const updateUser = useCallback(
    async (payload: Partial<Pick<User, "timezone">>) => {
      const next = await userApi.update(payload);
      sessionChange.current += 1;
      setUser(next);
      return next;
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      register,
      verify,
      logout,
      updateUser,
      deleteAccount,
    }),
    [user, loading, login, register, verify, logout, updateUser, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
