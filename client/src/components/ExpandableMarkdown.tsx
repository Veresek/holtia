import { useLayoutEffect, useRef, useState } from "react";

import { Icon } from "./Icon";
import { MarkdownBody } from "./MarkdownBody";

export const TASK_PREVIEW_MAX_HEIGHT_REM = 4.5;
export const NOTE_PREVIEW_MAX_HEIGHT_REM = 9;

interface ExpandableMarkdownProps {
  markdown: string;
  maxHeightRem: number;
  label: string;
  compact?: boolean;
  className?: string;
}

function remToPixels(rem: number) {
  const rootSize = parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return rem * (Number.isFinite(rootSize) && rootSize > 0 ? rootSize : 16);
}

export function ExpandableMarkdown({
  markdown,
  maxHeightRem,
  label,
  compact = false,
  className,
}: ExpandableMarkdownProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) {
      return;
    }

    function measure() {
      if (!node) {
        return;
      }
      const limitPx = remToPixels(maxHeightRem);
      const next = node.scrollHeight > limitPx + 1;
      setOverflow(next);
      if (!next) {
        setExpanded(false);
      }
    }

    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [markdown, maxHeightRem]);

  return (
    <div className="min-w-0">
      <div
        className={!expanded ? "overflow-hidden" : undefined}
        ref={bodyRef}
        style={!expanded ? { maxHeight: `${maxHeightRem}rem` } : undefined}
      >
        <MarkdownBody className={className} compact={compact} markdown={markdown} />
      </div>
      {overflow ? (
        <button
          aria-expanded={expanded}
          aria-label={expanded ? `Show less of ${label}` : `Show more of ${label}`}
          className="relative mt-1 rounded-md p-1.5 text-ink-soft hover:bg-paper hover:text-ink"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <Icon
            className={["size-5 transition-transform duration-150", expanded ? "rotate-180" : ""].join(" ")}
            name="chevronDown"
          />
        </button>
      ) : null}
    </div>
  );
}
