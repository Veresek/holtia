export type ShortcutScope = "Anywhere" | "Notes" | "Calendar";

export interface Shortcut {
  id: string;
  key: string;
  keysLabel: string;
  label: string;
  scope: ShortcutScope;
}

export const SHORTCUT_SCOPES: ShortcutScope[] = [
  "Anywhere",
  "Notes",
  "Calendar",
];

export const SHORTCUTS: Shortcut[] = [
  {
    id: "help",
    key: "?",
    keysLabel: "?",
    label: "Show keyboard shortcuts",
    scope: "Anywhere",
  },
  {
    id: "go-home",
    key: "1",
    keysLabel: "1",
    label: "Go to Home",
    scope: "Anywhere",
  },
  {
    id: "go-calendar",
    key: "2",
    keysLabel: "2",
    label: "Go to Calendar",
    scope: "Anywhere",
  },
  {
    id: "go-tasks",
    key: "3",
    keysLabel: "3",
    label: "Go to Tasks",
    scope: "Anywhere",
  },
  {
    id: "go-notes",
    key: "4",
    keysLabel: "4",
    label: "Go to Notes",
    scope: "Anywhere",
  },
  {
    id: "go-account",
    key: "5",
    keysLabel: "5",
    label: "Go to Account",
    scope: "Anywhere",
  },
  {
    id: "create",
    key: "n",
    keysLabel: "n",
    label: "Add a task, event, or note",
    scope: "Anywhere",
  },
  {
    id: "focus-assistant",
    key: "/",
    keysLabel: "/",
    label: "Focus the assistant",
    scope: "Anywhere",
  },
  {
    id: "close-dialog",
    key: "Escape",
    keysLabel: "Esc",
    label: "Close a dialog",
    scope: "Anywhere",
  },
  {
    id: "search-notes",
    key: "/",
    keysLabel: "/",
    label: "Focus note search",
    scope: "Notes",
  },
  {
    id: "calendar-today",
    key: "t",
    keysLabel: "t",
    label: "Show today",
    scope: "Calendar",
  },
  {
    id: "calendar-previous",
    key: "ArrowLeft",
    keysLabel: "←",
    label: "Show the previous day, week, or month",
    scope: "Calendar",
  },
  {
    id: "calendar-next",
    key: "ArrowRight",
    keysLabel: "→",
    label: "Show the next day, week, or month",
    scope: "Calendar",
  },
  {
    id: "calendar-day",
    key: "d",
    keysLabel: "d",
    label: "Day view",
    scope: "Calendar",
  },
  {
    id: "calendar-week",
    key: "w",
    keysLabel: "w",
    label: "Week view",
    scope: "Calendar",
  },
  {
    id: "calendar-month",
    key: "m",
    keysLabel: "m",
    label: "Month view",
    scope: "Calendar",
  },
];

export function shortcutsByScope() {
  return SHORTCUT_SCOPES.map((scope) => ({
    scope,
    shortcuts: SHORTCUTS.filter((shortcut) => shortcut.scope === scope),
  }));
}
