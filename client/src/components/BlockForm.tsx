import { useId, useState, type FormEvent } from "react";

import { isPresetBlockColor, normalizeBlockColor } from "../blockColor";
import { timeInputValue, toTimePayload } from "../time";
import {
  BLOCK_COLOR_PRESETS,
  type Recurrence,
  type TimeBlockCreate,
} from "../types";
import { ConfirmDelete } from "./ConfirmDelete";
import { Icon } from "./Icon";

const WEEKDAYS = [
  { day: 0, label: "Monday" },
  { day: 1, label: "Tuesday" },
  { day: 2, label: "Wednesday" },
  { day: 3, label: "Thursday" },
  { day: 4, label: "Friday" },
  { day: 5, label: "Saturday" },
  { day: 6, label: "Sunday" },
] as const;

interface BlockFormProps {
  initial?: {
    title: string;
    description: string;
    date: string;
    start: string;
    end: string;
    recurrence: Recurrence;
    recurrenceDays: number[];
    color: string;
  };
  defaultDate?: string;
  submitLabel: string;
  onSubmit: (payload: TimeBlockCreate) => Promise<unknown>;
  onCancel?: () => void;
  onDelete?: () => Promise<unknown>;
}

export function BlockForm({
  initial,
  defaultDate,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: BlockFormProps) {
  const formId = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? "");
  const [start, setStart] = useState(
    initial?.start ? timeInputValue(initial.start) : "09:00",
  );
  const [end, setEnd] = useState(
    initial?.end ? timeInputValue(initial.end) : "10:00",
  );
  const [recurrence, setRecurrence] = useState<Recurrence>(
    initial?.recurrence ?? "none",
  );
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(
    initial?.recurrenceDays ?? [],
  );
  const [color, setColor] = useState(normalizeBlockColor(initial?.color));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const errorId = `${formId}-error`;
  const repeating = recurrence !== "none";

  function toggleDay(day: number) {
    setRecurrenceDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || !date) {
      return;
    }
    if (end === start) {
      setFormError("End cannot be the same as start.");
      return;
    }
    if (recurrence === "weekdays" && recurrenceDays.length === 0) {
      setFormError("Choose at least one day.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await onSubmit({
        title: normalizedTitle,
        description: description.trim(),
        date,
        start: toTimePayload(start),
        end: toTimePayload(end),
        recurrence,
        recurrenceDays: recurrence === "weekdays" ? recurrenceDays : [],
        color: normalizeBlockColor(color),
      });
    } catch {
      // The shared calendar state renders the API error.
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) {
      return;
    }
    setSaving(true);
    try {
      await onDelete();
    } catch {
      // The shared calendar state renders the API error.
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label
        className="block text-sm font-medium text-ink"
        htmlFor={`${formId}-title`}
      >
        Title
      </label>
      <input
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id={`${formId}-title`}
        maxLength={255}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What are you protecting?"
        required
        value={title}
      />

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor={`${formId}-description`}
      >
        Description
      </label>
      <textarea
        className="mt-1 min-h-20 w-full resize-y rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id={`${formId}-description`}
        maxLength={10000}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Add useful context. Markdown is welcome."
        value={description}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <label
            className="block text-sm font-medium text-ink"
            htmlFor={`${formId}-date`}
          >
            {repeating ? "Starts on" : "Date"}
          </label>
          <input
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
            id={`${formId}-date`}
            onChange={(event) => setDate(event.target.value)}
            required
            type="date"
            value={date}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-ink"
            htmlFor={`${formId}-start`}
          >
            Start
          </label>
          <input
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
            id={`${formId}-start`}
            onChange={(event) => setStart(event.target.value)}
            required
            type="time"
            value={start}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-ink"
            htmlFor={`${formId}-end`}
          >
            End
          </label>
          <input
            aria-describedby={formError && end === start ? errorId : undefined}
            aria-invalid={formError !== null && end === start}
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
            id={`${formId}-end`}
            onChange={(event) => setEnd(event.target.value)}
            required
            type="time"
            value={end}
          />
        </div>
      </div>

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor={`${formId}-recurrence`}
      >
        Repeat
      </label>
      <select
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-lichen"
        id={`${formId}-recurrence`}
        onChange={(event) => {
          const next = event.target.value as Recurrence;
          setRecurrence(next);
          if (next !== "weekdays") {
            setRecurrenceDays([]);
          }
        }}
        value={recurrence}
      >
        <option value="none">Does not repeat</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly (same weekday)</option>
        <option value="weekdays">On selected days</option>
      </select>

      {recurrence === "weekdays" ? (
        <fieldset className="mt-3">
          <legend className="text-sm font-medium text-ink">Days</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((weekday) => (
              <label
                className="flex items-center gap-2 rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm"
                key={weekday.day}
              >
                <input
                  checked={recurrenceDays.includes(weekday.day)}
                  className="accent-moss"
                  onChange={() => toggleDay(weekday.day)}
                  type="checkbox"
                />
                {weekday.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink">Color</legend>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {BLOCK_COLOR_PRESETS.map((option) => {
            const selected = color === option.value;
            return (
              <label
                className={[
                  "relative block aspect-square w-full cursor-pointer rounded-md",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-moss",
                  selected
                    ? "outline outline-2 outline-offset-2 outline-moss"
                    : "border border-line",
                ].join(" ")}
                key={option.value}
              >
                <input
                  aria-label={option.label}
                  checked={selected}
                  className="sr-only"
                  name={`${formId}-color`}
                  onChange={() => setColor(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span
                  aria-hidden="true"
                  className="block size-full rounded-md"
                  style={{ backgroundColor: option.value }}
                />
              </label>
            );
          })}
          <label
            className={[
              "relative block aspect-square w-full cursor-pointer rounded-md",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-moss",
              isPresetBlockColor(color)
                ? "border border-dashed border-line bg-paper"
                : "outline outline-2 outline-offset-2 outline-moss",
            ].join(" ")}
          >
            {isPresetBlockColor(color) ? (
              <span className="pointer-events-none flex size-full items-center justify-center text-ink-soft">
                <Icon className="size-4" name="plus" />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="pointer-events-none block size-full rounded-md"
                style={{ backgroundColor: color }}
              />
            )}
            <input
              aria-label="Custom color"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(event) => setColor(normalizeBlockColor(event.target.value))}
              type="color"
              value={color}
            />
          </label>
        </div>
      </fieldset>

      {end !== "" && start !== "" && end < start ? (
        <p className="mt-3 text-sm text-ink-soft">
          This block continues into the next day.
        </p>
      ) : null}

      {formError ? (
        <p className="mt-3 text-sm text-rust" id={errorId} role="alert">
          {formError}
        </p>
      ) : null}

      {onDelete && confirmingDelete ? (
        <ConfirmDelete
          confirmLabel="Delete block"
          description={
            repeating
              ? "This removes the block from every day it repeats."
              : "This cannot be undone."
          }
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => void handleDelete()}
          pending={saving}
          title="Delete this block?"
        />
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {onDelete ? (
          <button
            className="rounded-md border border-line px-3 py-2 text-sm text-rust hover:bg-paper"
            disabled={saving}
            onClick={() => setConfirmingDelete(true)}
            type="button"
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex justify-end gap-2">
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
      </div>
    </form>
  );
}
