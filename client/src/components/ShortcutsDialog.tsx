import { shortcutsByScope } from "../shortcuts";
import { Dialog } from "./Dialog";

interface ShortcutsDialogProps {
  onClose: () => void;
}

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  return (
    <Dialog onClose={onClose} title="Keyboard shortcuts">
      <p className="text-sm text-ink-soft">
        Shortcuts stay quiet while you are typing or a dialog is open.
      </p>
      <div className="mt-4 space-y-5">
        {shortcutsByScope().map((group) => (
          <section key={group.scope}>
            <h3 className="text-sm font-medium text-ink">{group.scope}</h3>
            <ul className="mt-2 space-y-2">
              {group.shortcuts.map((shortcut) => (
                <li
                  className="flex items-center justify-between gap-4 text-sm"
                  key={shortcut.id}
                >
                  <span className="text-ink-soft">{shortcut.label}</span>
                  <kbd className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-sans text-xs text-ink">
                    {shortcut.keysLabel}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
