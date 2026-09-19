import { useId, type FormEvent } from "react";

import { useTaskDraft } from "../hooks/useTaskDraft";
import { blockOptionLabel } from "../time";
import type { TaskCreate, TimeBlock } from "../types";

interface TaskFormProps {
  initial?: {
    title: string;
    description: string;
    date: string | null;
    timeBlockId?: string | null;
  };
  blocks?: TimeBlock[];
  submitLabel: string;
  onSubmit: (payload: TaskCreate) => Promise<unknown>;
  onCancel?: () => void;
}

export function TaskForm({
  initial,
  blocks = [],
  submitLabel,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dateId = useId();
  const blockId = useId();
  const draft = useTaskDraft(blocks, initial);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.payload().title) {
      return;
    }
    draft.setSaving(true);
    try {
      await onSubmit(draft.payload());
      if (!initial) {
        draft.resetToDefaults();
      }
    } catch {
      // The shared task state renders the API error.
    } finally {
      draft.setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-ink" htmlFor={titleId}>
        Title
      </label>
      <input
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id={titleId}
        maxLength={255}
        onChange={(event) => draft.setTitle(event.target.value)}
        placeholder="What needs doing?"
        required
        value={draft.title}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem]">
        <div>
          <label
            className="block text-sm font-medium text-ink"
            htmlFor={descriptionId}
          >
            Description
          </label>
          <textarea
            className="mt-1 min-h-24 w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
            id={descriptionId}
            maxLength={10000}
            onChange={(event) => draft.setDescription(event.target.value)}
            placeholder="Add useful context. Markdown is welcome."
            value={draft.description}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-ink"
            htmlFor={dateId}
          >
            Date
          </label>
          <input
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
            id={dateId}
            onChange={(event) => draft.handleDateChange(event.target.value)}
            type="date"
            value={draft.date}
          />
        </div>
      </div>

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor={blockId}
      >
        Time block
      </label>
      <select
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id={blockId}
        onChange={(event) => draft.handleBlockChange(event.target.value)}
        value={draft.timeBlockId}
      >
        <option value="">No time block</option>
        {draft.availableBlocks.map((block) => (
          <option key={block.id} value={block.id}>
            {blockOptionLabel(block, draft.date || undefined)}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-ink-faint">
        Pins to one day this block occurs.
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
          disabled={draft.saving}
          type="submit"
        >
          {draft.saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
