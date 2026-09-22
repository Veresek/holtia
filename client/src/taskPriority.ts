import type { Task, TaskPriority } from "./types";
import { TASK_PRIORITIES } from "./types";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function priorityRank(priority: TaskPriority | undefined): number {
  return PRIORITY_RANK[priority ?? "medium"];
}

export function compareByPriority(left: Task, right: Task): number {
  return priorityRank(left.priority) - priorityRank(right.priority);
}

export function priorityLabel(priority: TaskPriority): string {
  switch (priority) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
  }
}

export function priorityToneClass(priority: TaskPriority): string {
  switch (priority) {
    case "high":
      return "text-rust";
    case "medium":
      return "text-ink-soft";
    case "low":
      return "text-ink-faint";
  }
}

export { TASK_PRIORITIES };
