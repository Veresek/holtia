import { useId, useState, type ReactNode } from "react";

import { Dialog } from "../components/Dialog";
import { TaskComposer } from "../components/TaskComposer";
import { TaskForm } from "../components/TaskForm";
import { TaskItem } from "../components/TaskItem";
import { usePinOverlays } from "../components/PinOverlays";
import { useData } from "../data/DataProvider";
import { useNow } from "../hooks/useNow";
import { useTasks } from "../hooks/useTasks";
import { useTimeZone } from "../hooks/useTimeZone";
import { isArchivedTask } from "../taskArchive";
import {
  addCalendarDays,
  dateValue,
  nextOccurrenceOnOrAfter,
} from "../time";
import type { Task } from "../types";

type ComposerSection = "today" | "upcoming" | "none";

function compareByOrder(left: Task, right: Task) {
  return (
    Number(left.done) - Number(right.done) ||
    left.order - right.order ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareByDate(left: Task, right: Task) {
  return (
    (left.date ?? "").localeCompare(right.date ?? "") ||
    compareByOrder(left, right)
  );
}

function activeGroups(tasks: Task[], today: string, timeZone: string) {
  const overdue: Task[] = [];
  const todayTasks: Task[] = [];
  const upcoming: Task[] = [];
  const noDate: Task[] = [];
  for (const task of tasks) {
    if (isArchivedTask(task, today, timeZone)) {
      continue;
    }
    if (task.date === null) {
      noDate.push(task);
    } else if (task.date > today) {
      upcoming.push(task);
    } else if (task.date === today || task.done) {
      todayTasks.push(task);
    } else {
      overdue.push(task);
    }
  }
  overdue.sort(compareByDate);
  todayTasks.sort(compareByOrder);
  upcoming.sort(compareByDate);
  noDate.sort(compareByOrder);
  return { overdue, todayTasks, upcoming, noDate };
}

interface TaskSectionProps {
  title: string;
  tasks: Task[];
  renderTask: (task: Task) => ReactNode;
  composer?: ReactNode;
}

function TaskSection({ title, tasks, renderTask, composer }: TaskSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-ink" id={headingId}>
          {title}
        </h2>
        <p className="text-xs text-ink-faint">
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </p>
      </div>
      <div className="mt-1">
        {tasks.map(renderTask)}
        {composer}
      </div>
    </section>
  );
}

export function TasksPage() {
  const {
    tasks,
    loading,
    error,
    retry,
    createTask,
    updateTask,
    deleteTask,
  } = useTasks();
  const { blocks, notes } = useData();
  const timeZone = useTimeZone();
  const today = dateValue(useNow(), timeZone);
  const tomorrow = addCalendarDays(today, 1);
  const pinOverlays = usePinOverlays();
  const [composer, setComposer] = useState<ComposerSection | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = tasks.find((task) => task.id === editingId);
  const archivedTasks = tasks.filter((task) =>
    isArchivedTask(task, today, timeZone),
  );
  const { overdue, todayTasks, upcoming, noDate } = activeGroups(
    tasks,
    today,
    timeZone,
  );

  function renderTask(task: Task) {
    const block = task.timeBlockId
      ? blocks.find((item) => item.id === task.timeBlockId)
      : undefined;
    return (
      <TaskItem
        block={block}
        key={task.id}
        notes={notes.filter((note) => note.taskId === task.id)}
        onDelete={() => deleteTask(task.id)}
        onEdit={() => {
          setComposer(null);
          setEditingId(task.id);
        }}
        onOpenBlock={
          block
            ? () =>
                pinOverlays.openPins(
                  block.id,
                  task.date ?? nextOccurrenceOnOrAfter(block, today),
                )
            : undefined
        }
        onOpenNote={(id) => pinOverlays.openNote(id)}
        onToggle={() => updateTask(task.id, { done: !task.done })}
        task={task}
        today={today}
        variant="row"
      />
    );
  }

  function sectionComposer(
    section: ComposerSection,
    defaultDate: string | null,
  ) {
    return (
      <TaskComposer
        blocks={blocks}
        defaultDate={defaultDate}
        expanded={composer === section}
        onCollapse={() => setComposer(null)}
        onExpand={() => {
          setEditingId(null);
          setComposer(section);
        }}
        onSubmit={createTask}
      />
    );
  }

  return (
    <section className="mx-auto w-full min-w-0 max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <header>
        <p className="text-sm text-ink-soft">Capture and finish</p>
        <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">Tasks</h1>
      </header>

      {pinOverlays.overlay}

      {error ? (
        <div
          className="mt-6 flex items-center justify-between gap-4 rounded-md border border-rust/40 bg-paper-raised p-4 text-sm text-rust"
          role="alert"
        >
          <span>{error}</span>
          <button
            className="rounded-md border border-rust/40 px-3 py-1.5"
            onClick={() => void retry()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}

      {editing ? (
        <Dialog onClose={() => setEditingId(null)} title="Edit task">
          <TaskForm
            blocks={blocks}
            initial={editing}
            onCancel={() => setEditingId(null)}
            onSubmit={async (payload) => {
              await updateTask(editing.id, payload);
              setEditingId(null);
            }}
            submitLabel="Save changes"
          />
        </Dialog>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-ink-soft" role="status">
          Loading tasks…
        </p>
      ) : (
        <>
          {overdue.length > 0 ? (
            <TaskSection
              renderTask={renderTask}
              tasks={overdue}
              title="Overdue"
            />
          ) : null}
          <TaskSection
            composer={sectionComposer("today", today)}
            renderTask={renderTask}
            tasks={todayTasks}
            title="Today"
          />
          {upcoming.length > 0 ? (
            <TaskSection
              composer={sectionComposer("upcoming", tomorrow)}
              renderTask={renderTask}
              tasks={upcoming}
              title="Upcoming"
            />
          ) : null}
          <TaskSection
            composer={sectionComposer("none", null)}
            renderTask={renderTask}
            tasks={noDate}
            title="No date"
          />
          {archivedTasks.length > 0 ? (
            <details className="mt-8">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                Archive ({archivedTasks.length})
              </summary>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Completed before today.
              </p>
              <div className="mt-1">{archivedTasks.map(renderTask)}</div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
