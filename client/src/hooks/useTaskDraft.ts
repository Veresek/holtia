import { useMemo, useState } from "react";

import {
  blockOccursOn,
  dateValue,
  DEFAULT_TIME_ZONE,
  nextOccurrenceOnOrAfter,
} from "../time";
import type { TaskCreate, TaskPriority, TimeBlock } from "../types";

export interface TaskDraftValues {
  title: string;
  description: string;
  date: string | null;
  timeBlockId?: string | null;
  priority?: TaskPriority;
}

export function useTaskDraft(
  blocks: TimeBlock[],
  initial?: TaskDraftValues,
  defaultDate?: string | null,
  timeZone: string = DEFAULT_TIME_ZONE,
) {
  const startingDate = initial ? (initial.date ?? "") : (defaultDate ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(startingDate);
  const [timeBlockId, setTimeBlockId] = useState(initial?.timeBlockId ?? "");
  const [priority, setPriority] = useState<TaskPriority>(
    initial?.priority ?? "medium",
  );
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

  function handleBlockChange(value: string) {
    setTimeBlockId(value);
    if (!value || date) {
      return;
    }
    const selected = blocks.find((block) => block.id === value);
    if (selected) {
      setDate(
        nextOccurrenceOnOrAfter(selected, dateValue(new Date(), timeZone)),
      );
    }
  }

  function resetToDefaults() {
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setTimeBlockId(initial?.timeBlockId ?? "");
    setPriority(initial?.priority ?? "medium");
    setDate(startingDate);
    setSaving(false);
  }

  function payload(): TaskCreate {
    return {
      title: title.trim(),
      description: description.trim(),
      date: date || null,
      timeBlockId: timeBlockId || null,
      priority,
    };
  }

  return {
    title,
    setTitle,
    description,
    setDescription,
    date,
    timeBlockId,
    priority,
    setPriority,
    saving,
    setSaving,
    availableBlocks,
    handleDateChange,
    handleBlockChange,
    resetToDefaults,
    payload,
  };
}
