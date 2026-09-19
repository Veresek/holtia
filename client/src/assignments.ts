import type { Note, Task } from "./types";

export interface BlockPin {
  id: string;
  title: string;
  kind: "task" | "note";
  done?: boolean;
}

export function taskPinsByBlockOnDate(tasks: Task[], date: string) {
  const grouped: Record<string, BlockPin[]> = {};
  for (const task of tasks) {
    if (!task.timeBlockId || task.date !== date) {
      continue;
    }
    const pins = grouped[task.timeBlockId] ?? [];
    pins.push({
      id: task.id,
      title: task.title,
      kind: "task",
      done: task.done,
    });
    grouped[task.timeBlockId] = pins;
  }
  return grouped;
}

export function notePinsByBlock(notes: Note[]) {
  const grouped: Record<string, BlockPin[]> = {};
  for (const note of notes) {
    if (!note.timeBlockId) {
      continue;
    }
    const pins = grouped[note.timeBlockId] ?? [];
    pins.push({ id: note.id, title: note.title, kind: "note" });
    grouped[note.timeBlockId] = pins;
  }
  return grouped;
}

export function notesOnDate(notes: Note[], date: string) {
  return notes.filter((note) => note.date === date);
}

export function mixPins(tasks: BlockPin[], notes: BlockPin[], limit: number) {
  const shown: BlockPin[] = [];
  let taskIndex = 0;
  let noteIndex = 0;
  while (
    shown.length < limit &&
    (taskIndex < tasks.length || noteIndex < notes.length)
  ) {
    if (taskIndex < tasks.length && shown.length < limit) {
      shown.push(tasks[taskIndex]);
      taskIndex += 1;
    }
    if (noteIndex < notes.length && shown.length < limit) {
      shown.push(notes[noteIndex]);
      noteIndex += 1;
    }
  }
  return {
    shown,
    extra: tasks.length + notes.length - shown.length,
  };
}

export function pinCountLabel(taskCount: number, noteCount: number) {
  const parts: string[] = [];
  if (taskCount > 0) {
    parts.push(`${taskCount} ${taskCount === 1 ? "task" : "tasks"}`);
  }
  if (noteCount > 0) {
    parts.push(`${noteCount} ${noteCount === 1 ? "note" : "notes"}`);
  }
  return parts.join(" · ");
}
