import { useId, useState, type FormEvent } from "react";

import { isPresetBlockColor, normalizeBlockColor } from "../blockColor";
import { timeInputValue, toTimePayload } from "../time";
import {
  BLOCK_COLOR_PRESETS,
  type Note,
  type Recurrence,
  type Task,
  type TimeBlockCreate,
} from "../types";
import { ConfirmDelete } from "./ConfirmDelete";
import { FieldError, FieldLabel, fieldClass, RequiredMark } from "./fields";
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
  pinnedTasks?: Task[];
  pinnedNotes?: Note[];
  onOpenTask?: (id: string) => void;
  onOpenNote?: (id: string) => void;
  onUnpinTask?: (id: string) => Promise<unknown>;
  onUnpinNote?: (id: string) => Promise<unknown>;
}

export function BlockForm({
  initial,
  defaultDate,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
  pinnedTasks = [],
  pinnedNotes = [],
  onOpenTask,
  onOpenNote,
  onUnpinTask,
  onUnpinNote,
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
  const [errors, setErrors] = useState<{
    title?: string;
    date?: string;
    start?: string;
    end?: string;
    days?: string;
  }>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [unpinningId, setUnpinningId] = useState<string | null>(null);
  const daysErrorId = `${formId}-days-error`;
  const repeating = recurrence !== "none";

  function toggleDay(day: number) {
    setRecurrenceDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right),
    );
    setErrors((current) => ({ ...current, days: undefined }));
  }

  function fieldErrors() {
    const next: typeof errors = {};
    if (!title.trim()) {
      next.title = "Enter a title.";
    }
    if (!date) {
      next.date = "Choose a date.";
    }
    if (!start) {
      next.start = "Choose a start time.";
    }
    if (!end) {
      next.end = "Choose an end time.";
    } else if (start && end === start) {
      next.end = "End cannot be the same as start.";
    }
    if (recurrence === "weekdays" && recurrenceDays.length === 0) {
      next.days = "Choose at least one day.";
    }
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = fieldErrors();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
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
    <form noValidate onSubmit={handleSubmit}>
      <FieldLabel htmlFor={`${formId}-title`} required>
        Title
      </FieldLabel>
      <input
        aria-describedby={errors.title ? `${formId}-title-error` : undefined}
        aria-invalid={errors.title !== undefined || undefined}
        aria-required="true"
        className={fieldClass(errors.title !== undefined)}
        id={`${formId}-title`}
        maxLength={255}
        onChange={(event) => {
          setTitle(event.target.value);
          setErrors((current) => ({ ...current, title: undefined }));
        }}
        placeholder="What are you protecting?"
        value={title}
      />
      {errors.title ? (
        <FieldError id={`${formId}-title-error`} message={errors.title} />
      ) : null}

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor={`${formId}-description`}
      >
        Description
      </label>
      <textarea
        className={fieldClass(false, "min-h-20 resize-y")}
        id={`${formId}-description`}
        maxLength={10000}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Add useful context. Markdown is welcome."
        value={description}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <FieldLabel htmlFor={`${formId}-date`} required>
            {repeating ? "Starts on" : "Date"}
          </FieldLabel>
          <input
            aria-describedby={errors.date ? `${formId}-date-error` : undefined}
            aria-invalid={errors.date !== undefined || undefined}
            aria-required="true"
            className={fieldClass(errors.date !== undefined)}
            id={`${formId}-date`}
            onChange={(event) => {
              setDate(event.target.value);
              setErrors((current) => ({ ...current, date: undefined }));
            }}
            type="date"
            value={date}
          />
          {errors.date ? (
            <FieldError id={`${formId}-date-error`} message={errors.date} />
          ) : null}
        </div>
        <div>
          <FieldLabel htmlFor={`${formId}-start`} required>
            Start
          </FieldLabel>
          <input
            aria-describedby={errors.start ? `${formId}-start-error` : undefined}
            aria-invalid={errors.start !== undefined || undefined}
            aria-required="true"
            className={fieldClass(errors.start !== undefined)}
            id={`${formId}-start`}
            onChange={(event) => {
              setStart(event.target.value);
              setErrors((current) => ({ ...current, start: undefined }));
            }}
            type="time"
            value={start}
          />
          {errors.start ? (
            <FieldError id={`${formId}-start-error`} message={errors.start} />
          ) : null}
        </div>
        <div>
          <FieldLabel htmlFor={`${formId}-end`} required>
            End
          </FieldLabel>
          <input
            aria-describedby={errors.end ? `${formId}-end-error` : undefined}
            aria-invalid={errors.end !== undefined || undefined}
            aria-required="true"
            className={fieldClass(errors.end !== undefined)}
            id={`${formId}-end`}
            onChange={(event) => {
              setEnd(event.target.value);
              setErrors((current) => ({ ...current, end: undefined }));
            }}
            type="time"
            value={end}
          />
          {errors.end ? (
            <FieldError id={`${formId}-end-error`} message={errors.end} />
          ) : null}
        </div>
      </div>

      <label
        className="mt-4 block text-sm font-medium text-ink"
        htmlFor={`${formId}-recurrence`}
      >
        Repeat
      </label>
      <select
        className={fieldClass(false)}
        id={`${formId}-recurrence`}
        onChange={(event) => {
          const next = event.target.value as Recurrence;
          setRecurrence(next);
          if (next !== "weekdays") {
            setRecurrenceDays([]);
            setErrors((current) => ({ ...current, days: undefined }));
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
        <fieldset
          aria-describedby={errors.days ? daysErrorId : undefined}
          aria-invalid={errors.days !== undefined || undefined}
          className={[
            "mt-3",
            errors.days ? "rounded-md border border-rust p-2" : "",
          ].join(" ")}
        >
          <legend className="text-sm font-medium text-ink">
            Days
            <RequiredMark />
          </legend>
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
          {errors.days ? (
            <FieldError id={daysErrorId} message={errors.days} />
          ) : null}
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

      {initial ? (
        <section className="mt-4">
          <h3 className="text-sm font-medium text-ink">Pinned to this day</h3>
          {pinnedTasks.length === 0 ? (
            <p className="mt-1 text-sm text-ink-faint">No tasks on this day.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {pinnedTasks.map((task) => (
                <li
                  className="flex items-center justify-between gap-2"
                  key={task.id}
                >
                  <button
                    className={[
                      "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper",
                      task.done ? "text-ink-faint line-through" : "text-ink",
                    ].join(" ")}
                    onClick={() => onOpenTask?.(task.id)}
                    type="button"
                  >
                    {task.title}
                  </button>
                  {onUnpinTask ? (
                    <button
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-faint hover:text-ink"
                      disabled={unpinningId === task.id}
                      onClick={() => {
                        setUnpinningId(task.id);
                        void onUnpinTask(task.id).finally(() =>
                          setUnpinningId(null),
                        );
                      }}
                      type="button"
                    >
                      Unpin
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-3 text-sm font-medium text-ink">
            Pinned to this series
          </h3>
          {pinnedNotes.length === 0 ? (
            <p className="mt-1 text-sm text-ink-faint">
              No notes on this block.
            </p>
          ) : (
            <ul className="mt-1 space-y-1">
              {pinnedNotes.map((note) => (
                <li
                  className="flex items-center justify-between gap-2"
                  key={note.id}
                >
                  <button
                    className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-paper"
                    onClick={() => onOpenNote?.(note.id)}
                    type="button"
                  >
                    {note.title}
                  </button>
                  {onUnpinNote ? (
                    <button
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-faint hover:text-ink"
                      disabled={unpinningId === note.id}
                      onClick={() => {
                        setUnpinningId(note.id);
                        void onUnpinNote(note.id).finally(() =>
                          setUnpinningId(null),
                        );
                      }}
                      type="button"
                    >
                      Unpin
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {onDelete && confirmingDelete ? (
        <ConfirmDelete
          confirmLabel="Delete event"
          description={
            repeating
              ? "This removes the event from every day it repeats."
              : "This cannot be undone."
          }
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => void handleDelete()}
          pending={saving}
          title="Delete this event?"
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
