import type { Note, Task } from "./types";

export interface BlockPin {
  id: string;
  title: string;
}

export function taskPinsByBlockOnDate(tasks: Task[], date: string) {
  const grouped: Record<string, BlockPin[]> = {};
  for (const task of tasks) {
    if (!task.timeBlockId || task.date !== date) {
      continue;
    }
    const pins = grouped[task.timeBlockId] ?? [];
    pins.push({ id: task.id, title: task.title });
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
    pins.push({ id: note.id, title: note.title });
    grouped[note.timeBlockId] = pins;
  }
  return grouped;
}
