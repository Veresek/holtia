import { useId } from "react";

import { priorityLabel, TASK_PRIORITIES } from "../taskPriority";
import type { TaskPriority } from "../types";

interface PriorityFieldProps {
  value: TaskPriority;
  onChange: (value: TaskPriority) => void;
  id?: string;
}

export function PriorityField({ value, onChange, id }: PriorityFieldProps) {
  const generatedId = useId();
  const labelId = id ?? generatedId;

  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink" id={labelId}>
        Priority
      </legend>
      <div
        aria-labelledby={labelId}
        className="mt-1 grid grid-cols-3 gap-1 rounded-md border border-line bg-paper p-1"
        role="group"
      >
        {TASK_PRIORITIES.map((priority) => {
          const selected = value === priority;
          return (
            <button
              aria-pressed={selected}
              className={[
                "rounded-md px-2 py-1.5 text-sm transition-colors",
                selected
                  ? "bg-moss text-paper-raised"
                  : "text-ink-soft hover:text-ink",
              ].join(" ")}
              key={priority}
              onClick={() => onChange(priority)}
              type="button"
            >
              {priorityLabel(priority)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
