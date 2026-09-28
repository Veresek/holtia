import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useNow } from "../hooks/useNow";
import { useTaskDraft } from "../hooks/useTaskDraft";
import { useTimeZone } from "../hooks/useTimeZone";
import { blockOptionLabel, dateValue } from "../time";
import type { TaskCreate, TimeBlock } from "../types";
import { Icon } from "./Icon";
import { FieldError, FieldLabel, fieldClass } from "./fields";
import { PriorityField } from "./PriorityField";

interface TaskComposerProps {
  blocks: TimeBlock[];
  defaultDate: string | null;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onSubmit: (payload: TaskCreate) => Promise<unknown>;
}

export function TaskComposer({
  blocks,
  defaultDate,
  expanded,
  onExpand,
  onCollapse,
  onSubmit,
}: TaskComposerProps) {
  const [revealed, setRevealed] = useState(expanded);
  const revealEase =
    "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

  useLayoutEffect(() => {
    if (!expanded) {
      setRevealed(false);
      return;
    }
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  return (
    <div>
      <div
        className={[
          "grid transition-[grid-template-rows,opacity]",
          revealEase,
          revealed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        ].join(" ")}
      >
        <div className="min-h-0 overflow-hidden">
          <button
            aria-expanded={expanded}
            aria-hidden={expanded || undefined}
            className={[
              "flex min-h-11 w-full items-center gap-2 rounded-md py-2 text-left text-sm text-moss transition-colors duration-150 hover:bg-paper-deep",
              expanded ? "pointer-events-none" : "",
            ].join(" ")}
            onClick={onExpand}
            tabIndex={expanded ? -1 : 0}
            type="button"
          >
            <Icon className="size-4" name="plus" />
            Add task
          </button>
        </div>
      </div>
      <div
        className={[
          "grid transition-[grid-template-rows,opacity]",
          revealEase,
          revealed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        ].join(" ")}
      >
        <div className="min-h-0 overflow-hidden">
          {expanded ? (
            <TaskComposerForm
              blocks={blocks}
              defaultDate={defaultDate}
              onCancel={onCollapse}
              onSubmit={onSubmit}
              ready={revealed}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface TaskComposerFormProps {
  blocks: TimeBlock[];
  defaultDate: string | null;
  onCancel: () => void;
  onSubmit: (payload: TaskCreate) => Promise<unknown>;
  ready: boolean;
}

function TaskComposerForm({
  blocks,
  defaultDate,
  onCancel,
  onSubmit,
  ready,
}: TaskComposerFormProps) {
  const titleId = useId();
  const titleErrorId = useId();
  const descriptionId = useId();
  const dateId = useId();
  const blockId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const timeZone = useTimeZone();
  const today = dateValue(useNow(), timeZone);
  const draft = useTaskDraft(blocks, undefined, defaultDate, timeZone);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) {
      return;
    }
    titleRef.current?.focus({ preventScroll: true });
  }, [ready]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.payload().title) {
      setTitleError("Enter a title.");
      return;
    }
    setTitleError(null);
    draft.setSaving(true);
    try {
      await onSubmit(draft.payload());
      draft.resetToDefaults();
    } catch {
      // The shared task state renders the API error.
    } finally {
      draft.setSaving(false);
    }
  }

  return (
    <form
      className="rounded-lg border border-line bg-paper-raised p-3"
      noValidate
      onSubmit={handleSubmit}
    >
      <FieldLabel htmlFor={titleId} required>
        Title
      </FieldLabel>
      <input
        aria-describedby={titleError ? titleErrorId : undefined}
        aria-invalid={titleError !== null || undefined}
        aria-required="true"
        className={fieldClass(titleError !== null)}
        id={titleId}
        maxLength={255}
        onChange={(event) => {
          draft.setTitle(event.target.value);
          if (titleError) {
            setTitleError(null);
          }
        }}
        placeholder="What needs doing?"
        ref={titleRef}
        value={draft.title}
      />
      {titleError ? <FieldError id={titleErrorId} message={titleError} /> : null}

      <label
        className="mt-3 block text-sm font-medium text-ink"
        htmlFor={descriptionId}
      >
        Description
      </label>
      <textarea
        className={fieldClass(false, "min-h-16 resize-y")}
        id={descriptionId}
        maxLength={10000}
        onChange={(event) => draft.setDescription(event.target.value)}
        placeholder="Add useful context. Markdown is welcome."
        value={draft.description}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-ink" htmlFor={dateId}>
            Date
          </label>
          <input
            className={fieldClass(false)}
            id={dateId}
            onChange={(event) => draft.handleDateChange(event.target.value)}
            type="date"
            value={draft.date}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-ink"
            htmlFor={blockId}
          >
            Time block
          </label>
          <select
            className={fieldClass(false)}
            id={blockId}
            onChange={(event) => draft.handleBlockChange(event.target.value)}
            value={draft.timeBlockId}
          >
            <option value="">No time block</option>
            {draft.availableBlocks.map((block) => (
              <option key={block.id} value={block.id}>
                {blockOptionLabel(block, draft.date || today)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <PriorityField onChange={draft.setPriority} value={draft.priority} />
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          className="rounded-md border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper-raised hover:bg-moss-hover disabled:cursor-not-allowed disabled:opacity-60"
          disabled={draft.saving}
          type="submit"
        >
          {draft.saving ? "Saving…" : "Add"}
        </button>
      </div>
    </form>
  );
}
