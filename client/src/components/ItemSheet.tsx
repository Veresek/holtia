import { useState } from "react";

import { useData } from "../data/DataProvider";
import {
  formatDateLabel,
  formatTimeLabel,
  nextOccurrenceOnOrAfter,
  dateValue,
} from "../time";
import { Dialog } from "./Dialog";
import { MarkdownBody } from "./MarkdownBody";
import { NoteForm } from "./NoteForm";
import { PinChip } from "./PinChip";
import { TaskForm } from "./TaskForm";

interface ItemSheetProps {
  kind: "task" | "note";
  id: string;
  mode: "read" | "edit";
  onModeChange: (mode: "read" | "edit") => void;
  onClose: () => void;
  onOpenBlock?: (blockId: string, date: string) => void;
  onOpenTask?: (id: string) => void;
}

export function ItemSheet({
  kind,
  id,
  mode,
  onModeChange,
  onClose,
  onOpenBlock,
  onOpenTask,
}: ItemSheetProps) {
  const {
    tasks,
    notes,
    blocks,
    updateTask,
    updateNote,
  } = useData();
  const [pending, setPending] = useState(false);
  const task = kind === "task" ? tasks.find((item) => item.id === id) : undefined;
  const note = kind === "note" ? notes.find((item) => item.id === id) : undefined;
  const relatedBlockId = task?.timeBlockId ?? note?.timeBlockId ?? null;
  const block = relatedBlockId
    ? blocks.find((item) => item.id === relatedBlockId)
    : undefined;
  const relatedTask = note?.taskId
    ? tasks.find((item) => item.id === note.taskId)
    : undefined;

  if (kind === "task" && !task) {
    return null;
  }
  if (kind === "note" && !note) {
    return null;
  }

  const editing = mode === "edit";
  const title = editing
    ? kind === "task"
      ? "Edit task"
      : "Edit note"
    : (task?.title ?? note?.title ?? "");

  async function handleToggle() {
    if (!task) {
      return;
    }
    setPending(true);
    try {
      await updateTask(task.id, { done: !task.done });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      action={
        editing ? undefined : (
          <button
            className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-paper"
            onClick={() => onModeChange("edit")}
            type="button"
          >
            Edit
          </button>
        )
      }
      onClose={onClose}
      title={title}
      wide={editing || kind === "note"}
    >
      {editing && task ? (
        <TaskForm
          blocks={blocks}
          initial={task}
          onCancel={onClose}
          onSubmit={async (payload) => {
            await updateTask(task.id, payload);
            onClose();
          }}
          submitLabel="Save changes"
        />
      ) : null}
      {editing && note ? (
        <NoteForm
          blocks={blocks}
          initial={note}
          onCancel={onClose}
          onSubmit={async (payload) => {
            await updateNote(note.id, payload);
            onClose();
          }}
          submitLabel="Save changes"
          tasks={tasks}
        />
      ) : null}
      {!editing && task ? (
        <div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              aria-label={`Mark ${task.title} as ${task.done ? "not done" : "done"}`}
              checked={task.done}
              className="size-4 accent-moss"
              disabled={pending}
              onChange={() => void handleToggle()}
              type="checkbox"
            />
            {task.done ? "Done" : "Open"}
          </label>
          {task.description ? (
            <MarkdownBody
              className="mt-3 wrap-break-word text-sm leading-6 text-ink-soft"
              markdown={task.description}
            />
          ) : (
            <p className="mt-3 text-sm italic text-ink-faint">No description</p>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {task.date && !block ? (
              <PinChip
                icon="calendar"
                label={`Pinned to ${formatDateLabel(task.date)}`}
              />
            ) : null}
            {block ? (
              <PinChip
                icon="calendar"
                label={`Pinned to ${block.title} · ${formatTimeLabel(block.start)}–${formatTimeLabel(block.end)}`}
                onClick={
                  onOpenBlock && task.date
                    ? () => onOpenBlock(block.id, task.date as string)
                    : undefined
                }
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {!editing && note ? (
        <div>
          {note.markdown ? (
            <MarkdownBody
              className="wrap-break-word text-sm leading-6 text-ink-soft"
              markdown={note.markdown}
            />
          ) : (
            <p className="text-sm italic text-ink-faint">Empty note</p>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {note.date ? (
              <PinChip
                icon="calendar"
                label={`Pinned to ${formatDateLabel(note.date)}`}
              />
            ) : null}
            {relatedTask ? (
              <PinChip
                icon="tasks"
                label={relatedTask.title}
                onClick={onOpenTask ? () => onOpenTask(relatedTask.id) : undefined}
              />
            ) : null}
            {block ? (
              <PinChip
                icon="notes"
                label={`On ${block.title} every day · ${formatTimeLabel(block.start)}–${formatTimeLabel(block.end)}`}
                onClick={
                  onOpenBlock
                    ? () =>
                        onOpenBlock(
                          block.id,
                          nextOccurrenceOnOrAfter(
                            block,
                            dateValue(new Date()),
                          ),
                        )
                    : undefined
                }
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
