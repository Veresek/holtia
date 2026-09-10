import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";

interface DialogProps {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const mountedLayers = new Set<number>();

let lockCount = 0;
let savedOverflow: string | null = null;
let nextLayer = 0;

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
  );
}

function lockPage() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = document.getElementById("root");
    if (root) {
      root.inert = true;
    }
  }
  lockCount += 1;
}

function unlockPage() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow ?? "";
    savedOverflow = null;
    const root = document.getElementById("root");
    if (root) {
      root.inert = false;
    }
  }
}

export function Dialog({ title, onClose, wide = false, children }: DialogProps) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const layerRef = useRef(0);
  if (layerRef.current === 0) {
    nextLayer += 1;
    layerRef.current = nextLayer;
  }

  useEffect(() => {
    const layer = layerRef.current;
    const previousActive = document.activeElement;
    mountedLayers.add(layer);
    lockPage();
    titleRef.current?.focus();

    function isTop() {
      return Math.max(0, ...mountedLayers) === layer;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!isTop()) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusable = focusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      mountedLayers.delete(layer);
      unlockPage();
      document.removeEventListener("keydown", onKeyDown);
      if (previousActive instanceof HTMLElement) {
        previousActive.focus();
      }
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center overflow-y-auto px-4 py-10 md:items-center"
      style={{ zIndex: 50 + layerRef.current * 10 }}
    >
      <button
        aria-label="Dismiss"
        className="fixed inset-0 animate-fade-in bg-ink/35"
        onClick={() => onCloseRef.current()}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={[
          "relative z-10 mb-8 w-full animate-rise-in rounded-lg border border-line bg-paper-raised p-4 md:mb-0",
          wide ? "max-w-2xl" : "max-w-lg",
        ].join(" ")}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            className="font-serif text-2xl text-ink"
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
          >
            {title}
          </h2>
          <button
            aria-label="Close"
            className="rounded-md p-1.5 text-ink-soft hover:bg-paper"
            onClick={() => onCloseRef.current()}
            type="button"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
