import { useState, type MouseEvent } from "react";

import { formatTimeLabel } from "../time";
import type { Note, Task, TimeBlock } from "../types";
import { ConfirmDelete } from "./ConfirmDelete";
import {
  ExpandableMarkdown,
  NOTE_PREVIEW_MAX_HEIGHT_REM,
} from "./ExpandableMarkdown";
import { ItemMenu } from "./ItemMenu";

interface NoteCardProps {
  note: Note;
  compact?: boolean;
  onEdit?: () => void;
  onDelete?: () => Promise<unknown>;
  block?: TimeBlock;
  task?: Task;
}

function displayUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function NoteCard({
  note,
  compact = false,
  onEdit,
  onDelete,
  block,
  task,
}: NoteCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!onDelete) {
      return;
    }
    setPending(true);
    try {
      await onDelete();
    } catch {
      setPending(false);
    }
  }

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if (!onEdit) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (
      target.closest(
        "a, button, input, label, select, textarea, [role='menuitem']",
      )
    ) {
      return;
    }
    if (!window.getSelection()?.isCollapsed) {
      return;
    }
    onEdit();
  }

  return (
    // Keyboard access is the title button (`aria-label="Edit …"`).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article
      className={[
        "min-w-0 rounded-lg border border-line bg-paper-raised p-4 transition-colors duration-150 hover:border-lichen",
        onEdit ? "cursor-pointer" : "",
      ].join(" ")}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 wrap-break-word font-serif text-xl text-ink">
          {onEdit ? (
            <button
              aria-label={`Edit ${note.title}`}
              className="max-w-full text-left wrap-break-word"
              onClick={onEdit}
              type="button"
            >
              {note.title}
            </button>
          ) : (
            note.title
          )}
        </h3>
        <ItemMenu
          disabled={pending}
          label={`Actions for ${note.title}`}
          onDelete={onDelete ? () => setConfirming(true) : undefined}
          onEdit={onEdit}
        />
      </div>
      {confirming && onDelete ? (
        <ConfirmDelete
          confirmLabel="Delete note"
          description="This cannot be undone."
          onCancel={() => setConfirming(false)}
          onConfirm={() => void handleDelete()}
          pending={pending}
          title={`Delete ${note.title}?`}
        />
      ) : null}
      {note.markdown ? (
        <ExpandableMarkdown
          className={[
            compact ? "mt-1.5" : "mt-3",
            "wrap-break-word text-sm leading-6 text-ink-soft",
          ].join(" ")}
          compact={compact}
          label={note.title}
          maxHeightRem={NOTE_PREVIEW_MAX_HEIGHT_REM}
          markdown={note.markdown}
        />
      ) : (
        <p
          className={[
            compact ? "mt-1.5" : "mt-3",
            "text-sm italic text-ink-faint",
          ].join(" ")}
        >
          Empty note
        </p>
      )}
      <p className="mt-4 wrap-break-word text-xs text-ink-faint">
        Edited {displayUpdatedAt(note.updatedAt)}
      </p>
      {task ? (
        <p className="mt-1 wrap-break-word text-xs text-ink-faint">{task.title}</p>
      ) : null}
      {block ? (
        <p className="mt-1 wrap-break-word text-xs text-ink-faint">
          {block.title} · {formatTimeLabel(block.start)}–
          {formatTimeLabel(block.end)}
        </p>
      ) : null}
    </article>
  );
}
