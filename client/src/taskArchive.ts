import { parseInstant, dateValue } from "./time";
import type { Task } from "./types";

export function isArchivedTask(
  task: Task,
  today: string,
  timeZone: string,
) {
  if (!task.done) {
    return false;
  }
  if (!task.completedAt) {
    return true;
  }
  const completed = parseInstant(task.completedAt);
  if (!completed) {
    return false;
  }
  const completedOn = dateValue(completed, timeZone);
  return Boolean(completedOn) && completedOn < today;
}
