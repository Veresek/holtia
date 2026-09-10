import { useState, type MouseEvent } from "react";

import { formatTimeLabel } from "../time";
import type { Task, TimeBlock } from "../types";
import { ConfirmDelete } from "./ConfirmDelete";
import {
  ExpandableMarkdown,
  TASK_PREVIEW_MAX_HEIGHT_REM,
} from "./ExpandableMarkdown";
import { ItemMenu } from "./ItemMenu";

interface TaskItemProps {
  task: Task;
  onToggle: () => Promise<unknown>;
  onEdit?: () => void;
  onDelete?: () => Promise<unknown>;
  showDate?: boolean;
  block?: TimeBlock;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function TaskItem({
  task,
  onToggle,
  onEdit,
  onDelete,
  showDate = true,
  block,
}: TaskItemProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const hasBody = Boolean(task.description) || showDate || Boolean(block);

  async function handleToggle() {
    setPending(true);
    try {
      await onToggle();
    } catch {
      // The page banner shows the API error.
    } finally {
      setPending(false);
    }
  }

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
        "min-w-0 rounded-lg border border-line bg-paper-raised p-4 hover:border-lichen",
        onEdit ? "cursor-pointer" : "",
      ].join(" ")}
      onClick={handleCardClick}
    >
      <div
        className={[
          "flex gap-3",
          hasBody ? "items-start" : "items-center",
        ].join(" ")}
      >
        <input
          aria-label={`Mark ${task.title} as ${task.done ? "not done" : "done"}`}
          checked={task.done}
          className={[
            "size-4 shrink-0 accent-moss",
            hasBody ? "mt-1" : "",
          ].join(" ")}
          disabled={pending}
          onChange={() => void handleToggle()}
          type="checkbox"
        />
        <div className="min-w-0 flex-1">
          <h3
            className={[
              "wrap-break-word font-medium text-ink",
              task.done ? "line-through opacity-60" : "",
            ].join(" ")}
          >
            {onEdit ? (
              <button
                aria-label={`Edit ${task.title}`}
                className="max-w-full text-left wrap-break-word"
                onClick={onEdit}
                type="button"
              >
                {task.title}
              </button>
            ) : (
              task.title
            )}
          </h3>
          {task.description ? (
            <ExpandableMarkdown
              className={
                showDate
                  ? "mt-1 wrap-break-word text-sm leading-6 text-ink-soft"
                  : "mt-0.5 wrap-break-word text-xs text-ink-faint"
              }
              compact={!showDate}
              label={task.title}
              maxHeightRem={TASK_PREVIEW_MAX_HEIGHT_REM}
              markdown={task.description}
            />
          ) : null}
          {showDate ? (
            <p className="mt-2 wrap-break-word text-xs text-ink-faint">
              {task.date ? displayDate(task.date) : "No date"}
            </p>
          ) : null}
          {block ? (
            <p className="mt-1 wrap-break-word text-xs text-ink-faint">
              {block.title} · {formatTimeLabel(block.start)}–
              {formatTimeLabel(block.end)}
            </p>
          ) : null}
        </div>
        <ItemMenu
          disabled={pending}
          label={`Actions for ${task.title}`}
          onDelete={onDelete ? () => setConfirming(true) : undefined}
          onEdit={onEdit}
        />
      </div>
      {confirming && onDelete ? (
        <ConfirmDelete
          confirmLabel="Delete task"
          description="This cannot be undone."
          onCancel={() => setConfirming(false)}
          onConfirm={() => void handleDelete()}
          pending={pending}
          title={`Delete ${task.title}?`}
        />
      ) : null}
    </article>
  );
}
