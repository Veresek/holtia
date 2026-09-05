import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "./Icon";

interface ItemMenuProps {
  label: string;
  disabled?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ItemMenu({ label, disabled = false, onEdit, onDelete }: ItemMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    firstItemRef.current?.focus();

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!onEdit && !onDelete) {
    return null;
  }

  function choose(action?: () => void) {
    setOpen(false);
    action?.();
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        className="-my-1.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-soft hover:bg-paper"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Icon name="more" className="size-5" />
      </button>
      {open ? (
        <div
          className="absolute right-0 z-20 mt-1 min-w-32 rounded-md border border-line bg-paper-raised py-1"
          id={menuId}
          role="menu"
        >
          {onEdit ? (
            <button
              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-paper"
              onClick={() => choose(onEdit)}
              ref={firstItemRef}
              role="menuitem"
              type="button"
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              className="block w-full px-3 py-1.5 text-left text-sm text-rust hover:bg-paper"
              onClick={() => choose(onDelete)}
              ref={onEdit ? undefined : firstItemRef}
              role="menuitem"
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
