import { useMemo, useState, type FormEvent } from "react";

import {
  blockOccursOn,
  formatTimeLabel,
  nextOccurrenceOnOrAfter,
  warsawDateValue,
} from "../time";
import type { TaskCreate, TimeBlock } from "../types";

interface TaskFormProps {
  initial?: {
    title: string;
    description: string;
    date: string | null;
    timeBlockId?: string | null;
  };
  defaultDate?: string;
  blocks?: TimeBlock[];
  submitLabel: string;
  onSubmit: (payload: TaskCreate) => Promise<unknown>;
  onCancel?: () => void;
}

export function TaskForm({
  initial,
  defaultDate,
  blocks = [],
  submitLabel,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? "");
  const [timeBlockId, setTimeBlockId] = useState(initial?.timeBlockId ?? "");
  const [saving, setSaving] = useState(false);
  const availableBlocks = useMemo(
    () =>
      date
        ? blocks.filter((block) => blockOccursOn(block, date))
        : blocks,
    [blocks, date],
  );

  function handleDateChange(value: string) {
    setDate(value);
    if (!value) {
      setTimeBlockId("");
      return;
    }
    if (!timeBlockId) {
      return;
    }
    const selected = blocks.find((block) => block.id === timeBlockId);
    if (selected && !blockOccursOn(selected, value)) {
      setTimeBlockId("");
    }
  }

  function clearDate() {
    setDate("");
    setTimeBlockId("");
  }

  function handleBlockChange(value: string) {
    setTimeBlockId(value);
    if (!value || date) {
      return;
    }
    const selected = blocks.find((block) => block.id === value);
    if (selected) {
      setDate(nextOccurrenceOnOrAfter(selected, warsawDateValue(new Date())));
    }
  }

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
        description: description.trim(),
        date: date || null,
        timeBlockId: timeBlockId || null,
      });
      if (!initial) {
        setTitle("");
        setDescription("");
        setTimeBlockId("");
        if (!defaultDate) {
          setDate("");
        }
      }
    } catch {
      // The shared task state renders the API error.
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-ink" htmlFor="task-title">
        Title
      </label>
      <input
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id="task-title"
        maxLength={255}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What needs doing?"
        required
        value={title}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem]">
        <div>
          <label
            className="block text-sm font-medium text-ink"
            htmlFor="task-description"
          >
            Description
          </label>
          <textarea
            className="mt-1 min-h-24 w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
            id="task-description"
            maxLength={10000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add useful context. Markdown is welcome."
            value={description}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-ink"
            htmlFor="task-date"
          >
            Date
          </label>
          <input
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
            id="task-date"
            onChange={(event) => handleDateChange(event.target.value)}
            type="date"
            value={date}
          />
          <button
            className="mt-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!date}
            onClick={clearDate}
            type="button"
          >
            No date
          </button>
          {!date ? (
            <p className="mt-2 text-xs leading-5 text-ink-faint">
              Tasks with no date live in Tasks, not on Home.
            </p>
          ) : null}
        </div>
      </div>

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor="task-time-block"
      >
        Time block
      </label>
      <select
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id="task-time-block"
        onChange={(event) => handleBlockChange(event.target.value)}
        value={timeBlockId}
      >
        <option value="">No time block</option>
        {availableBlocks.map((block) => (
          <option key={block.id} value={block.id}>
            {block.title} · {formatTimeLabel(block.start)}–
            {formatTimeLabel(block.end)}
          </option>
        ))}
      </select>

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
