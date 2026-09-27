import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useShortcuts } from "../hooks/useShortcuts";
import { ShortcutsDialog } from "./ShortcutsDialog";

const ShortcutListContext = createContext<(() => void) | null>(null);

export function ShortcutListProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useShortcuts({
    help: () => setOpen(true),
    "go-home": () => navigate("/"),
    "go-calendar": () => navigate("/calendar"),
    "go-tasks": () => navigate("/tasks"),
    "go-notes": () => navigate("/notes"),
    "go-account": () => navigate("/account"),
  });

  return (
    <ShortcutListContext.Provider value={() => setOpen(true)}>
      {children}
      {open ? <ShortcutsDialog onClose={() => setOpen(false)} /> : null}
    </ShortcutListContext.Provider>
  );
}

export function useOpenShortcuts() {
  const open = useContext(ShortcutListContext);
  if (!open) {
    throw new Error("useOpenShortcuts must be used within ShortcutListProvider.");
  }
  return open;
}
