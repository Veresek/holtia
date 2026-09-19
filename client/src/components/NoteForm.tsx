import { useState, type FormEvent } from "react";

import { blockOptionLabel } from "../time";
import type { NoteCreate, Task, TimeBlock } from "../types";

interface NoteFormProps {
  initial?: {
    title: string;
    markdown: string;
    date?: string | null;
    taskId?: string | null;
    timeBlockId?: string | null;
  };
  blocks?: TimeBlock[];
  tasks?: Task[];
  submitLabel: string;
  onSubmit: (payload: NoteCreate) => Promise<unknown>;
  onCancel?: () => void;
}

export function NoteForm({
  initial,
  blocks = [],
  tasks = [],
  submitLabel,
  onSubmit,
  onCancel,
}: NoteFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [markdown, setMarkdown] = useState(initial?.markdown ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [taskId, setTaskId] = useState(initial?.taskId ?? "");
  const [timeBlockId, setTimeBlockId] = useState(initial?.timeBlockId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        title: normalizedTitle,
        markdown,
        date: date || null,
        taskId: taskId || null,
        timeBlockId: timeBlockId || null,
      });
      if (!initial) {
        setTitle("");
        setMarkdown("");
        setDate("");
        setTaskId("");
        setTimeBlockId("");
      }
    } catch {
      // The shared note state renders the API error.
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-ink" htmlFor="note-title">
        Title
      </label>
      <input
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id="note-title"
        maxLength={255}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Name this note"
        required
        value={title}
      />

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor="note-markdown"
      >
        Markdown
      </label>
      <textarea
        className="mt-1 min-h-52 w-full resize-y rounded-md border border-line bg-paper px-3 py-2 font-mono text-sm leading-6 text-ink focus:border-lichen"
        id="note-markdown"
        maxLength={100000}
        onChange={(event) => setMarkdown(event.target.value)}
        placeholder="Write anything. Markdown is welcome."
        value={markdown}
      />

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor="note-date"
      >
        Date
      </label>
      <input
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id="note-date"
        onChange={(event) => setDate(event.target.value)}
        type="date"
        value={date}
      />
      <p className="mt-1 text-xs text-ink-faint">
        Optional. Hangs this note on a calendar day.
      </p>

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor="note-task"
      >
        Task
      </label>
      <select
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id="note-task"
        onChange={(event) => setTaskId(event.target.value)}
        value={taskId}
      >
        <option value="">No task</option>
        {tasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.title}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-ink-faint">
        Optional. Hang this note on a task.
      </p>

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor="note-time-block"
      >
        Time block
      </label>
      <select
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id="note-time-block"
        onChange={(event) => setTimeBlockId(event.target.value)}
        value={timeBlockId}
      >
        <option value="">No time block</option>
        {blocks.map((block) => (
          <option key={block.id} value={block.id}>
            {blockOptionLabel(block)}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-ink-faint">
        Shows on every day this block repeats.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        {onCancel ? (
          <button
            className="rounded-md border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        ) : null}
        <button
          className="rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper-raised hover:bg-moss-hover disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving}
          type="submit"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
