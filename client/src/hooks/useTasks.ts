import { useMemo } from "react";

import { useData } from "../data/DataProvider";
import { compareByPriority } from "../taskPriority";
import type { Task } from "../types";

function compareText(left: string | undefined, right: string | undefined) {
  return (left ?? "").localeCompare(right ?? "");
}

function taskOrder(left: Task, right: Task) {
  return (
    compareByPriority(left, right) ||
    Number(Boolean(left.done)) - Number(Boolean(right.done)) ||
    (left.order ?? 0) - (right.order ?? 0) ||
    compareText(left.createdAt, right.createdAt) ||
    compareText(left.id, right.id)
  );
}

export function useTasks(date?: string | "undated") {
  const {
    tasks: allTasks,
    tasksLoading,
    tasksError,
    retryTasks,
    createTask,
    updateTask,
    deleteTask,
  } = useData();

  const tasks = useMemo(() => {
    const filtered =
      date === undefined
        ? allTasks
        : date === "undated"
          ? allTasks.filter((task) => task.date === null)
          : allTasks.filter((task) => task.date === date);
    return [...filtered].sort(taskOrder);
  }, [allTasks, date]);

  return {
    tasks,
    loading: tasksLoading,
    error: tasksError,
    retry: retryTasks,
    createTask,
    updateTask,
    deleteTask,
  };
}
