import { useState, type FormEvent } from "react";

import { useData } from "../data/DataProvider";
import { formatDayHeading, formatTimeLabel } from "../time";
import { Dialog } from "./Dialog";

interface OccurrenceSheetProps {
  blockId: string;
  date: string;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onOpenNote: (id: string) => void;
  onCreateTask: () => void;
  onCreateNote: () => void;
  onEditBlock?: () => void;
}

export function OccurrenceSheet({
  blockId,
  date,
  onClose,
  onOpenTask,
  onOpenNote,
  onCreateTask,
  onCreateNote,
  onEditBlock,
}: OccurrenceSheetProps) {
  const { blocks, tasks, notes, updateTask, updateNote } = useData();
  const block = blocks.find((item) => item.id === blockId);
  const [pinTaskId, setPinTaskId] = useState("");
  const [pinNoteId, setPinNoteId] = useState("");
  const [saving, setSaving] = useState(false);

  if (!block) {
    return null;
  }

  const pinnedTasks = tasks.filter(
    (task) => task.timeBlockId === block.id && task.date === date,
  );
  const pinnedNotes = notes.filter((note) => note.timeBlockId === block.id);
  const pinableTasks = tasks.filter(
    (task) => !(task.timeBlockId === block.id && task.date === date),
  );
  const pinableNotes = notes.filter((note) => note.timeBlockId !== block.id);

  async function handlePinTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pinTaskId) {
      return;
    }
    setSaving(true);
    try {
      await updateTask(pinTaskId, { timeBlockId: blockId, date });
      setPinTaskId("");
    } finally {
      setSaving(false);
    }
  }

  async function handlePinNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pinNoteId) {
      return;
    }
    setSaving(true);
    try {
      await updateNote(pinNoteId, { timeBlockId: blockId });
      setPinNoteId("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onClose={onClose} title={block.title}>
      <p className="text-sm text-ink-soft">
        {formatTimeLabel(block.start)}–{formatTimeLabel(block.end)} ·{" "}
        {formatDayHeading(date)}
      </p>
      {block.recurrence !== "none" ? (
        <p className="mt-1 text-xs text-ink-faint">
          Notes on this block show every day it repeats. Tasks pin to this day
          only.
        </p>
      ) : null}

      <section className="mt-4">
        <h3 className="text-sm font-medium text-ink">Tasks</h3>
        {pinnedTasks.length === 0 ? (
          <p className="mt-1 text-sm text-ink-faint">No tasks on this day.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {pinnedTasks.map((task) => (
              <li key={task.id}>
                <button
                  className={[
                    "block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper",
                    task.done ? "text-ink-faint line-through" : "text-ink",
                  ].join(" ")}
                  onClick={() => onOpenTask(task.id)}
                  type="button"
                >
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h3 className="text-sm font-medium text-ink">Notes</h3>
        {pinnedNotes.length === 0 ? (
          <p className="mt-1 text-sm text-ink-faint">
            No notes on this block.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {pinnedNotes.map((note) => (
              <li key={note.id}>
                <button
                  className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-paper"
                  onClick={() => onOpenNote(note.id)}
                  type="button"
                >
                  {note.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pinableTasks.length > 0 ? (
        <form className="mt-4" onSubmit={(event) => void handlePinTask(event)}>
          <label className="block text-sm font-medium text-ink" htmlFor="pin-task">
            Pin a task
          </label>
          <div className="mt-1 flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
              id="pin-task"
              onChange={(event) => setPinTaskId(event.target.value)}
              value={pinTaskId}
            >
              <option value="">Choose a task</option>
              {pinableTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
            <button
              className="shrink-0 rounded-md border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || !pinTaskId}
              type="submit"
            >
              Pin
            </button>
          </div>
        </form>
      ) : null}

      {pinableNotes.length > 0 ? (
        <form className="mt-4" onSubmit={(event) => void handlePinNote(event)}>
          <label className="block text-sm font-medium text-ink" htmlFor="pin-note">
            Pin a note
          </label>
          <div className="mt-1 flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
              id="pin-note"
              onChange={(event) => setPinNoteId(event.target.value)}
              value={pinNoteId}
            >
              <option value="">Choose a note</option>
              {pinableNotes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.title}
                </option>
              ))}
            </select>
            <button
              className="shrink-0 rounded-md border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || !pinNoteId}
              type="submit"
            >
              Pin
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-md bg-moss px-3 py-2 text-sm font-medium text-paper-raised hover:bg-moss-hover"
          onClick={onCreateTask}
          type="button"
        >
          New task
        </button>
        <button
          className="rounded-md border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper"
          onClick={onCreateNote}
          type="button"
        >
          New note
        </button>
        {onEditBlock ? (
          <button
            className="rounded-md border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper"
            onClick={onEditBlock}
            type="button"
          >
            Edit block
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}
