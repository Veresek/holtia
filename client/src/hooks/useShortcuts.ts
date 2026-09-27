import { useEffect, useRef } from "react";

import { isDialogOpen } from "../components/Dialog";
import { SHORTCUTS, type Shortcut } from "../shortcuts";

export const PANEL_SHORTCUT_PRIORITY = 1;

interface Registration {
  id: string;
  priority: number;
  run: () => void;
}

const registrations: Registration[] = [];
let listening = false;

function pressedKey(event: KeyboardEvent) {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

function matchesShortcut(shortcut: Shortcut, event: KeyboardEvent) {
  const key = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;
  return pressedKey(event) === key;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function onKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
    return;
  }
  if (isTypingTarget(event.target) || isDialogOpen()) {
    return;
  }
  const matched = new Set(
    SHORTCUTS.filter((shortcut) => matchesShortcut(shortcut, event)).map(
      (shortcut) => shortcut.id,
    ),
  );
  if (matched.size === 0) {
    return;
  }
  const winner = registrations
    .filter((registration) => matched.has(registration.id))
    .sort((left, right) => right.priority - left.priority)[0];
  if (!winner) {
    return;
  }
  event.preventDefault();
  winner.run();
}

function ensureListening() {
  if (listening) {
    return;
  }
  listening = true;
  window.addEventListener("keydown", onKeyDown);
}

export function useShortcuts(
  handlers: Partial<Record<string, () => void>>,
  priority = 0,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const signature = Object.keys(handlers).sort().join("\0");

  useEffect(() => {
    ensureListening();
    const ids = signature ? signature.split("\0") : [];
    const added = ids.map((id) => {
      const registration: Registration = {
        id,
        priority,
        run: () => handlersRef.current[id]?.(),
      };
      registrations.push(registration);
      return registration;
    });
    return () => {
      for (const registration of added) {
        const index = registrations.indexOf(registration);
        if (index !== -1) {
          registrations.splice(index, 1);
        }
      }
    };
  }, [priority, signature]);
}
