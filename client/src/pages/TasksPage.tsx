import { useState } from "react";

import { Dialog } from "../components/Dialog";
import { EmptyCta } from "../components/EmptyCta";
import { TaskForm } from "../components/TaskForm";
import { TaskItem } from "../components/TaskItem";
import { useData } from "../data/DataProvider";
import { useTasks } from "../hooks/useTasks";

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
  const { blocks } = useData();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = tasks.find((task) => task.id === editingId);

  return (
    <section className="mx-auto w-full min-w-0 max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <div className="flex items-end justify-between gap-4">
        <header>
          <p className="text-sm text-ink-soft">Capture and finish</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">Tasks</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">
            Every task lives here, including tasks with no date.
          </p>
        </header>
        <button
          className="shrink-0 rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper-raised hover:bg-moss-hover"
          onClick={() => {
            setEditingId(null);
            setCreating(true);
          }}
          type="button"
        >
          Add task
        </button>
      </div>

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

      {creating ? (
        <Dialog onClose={() => setCreating(false)} title="Add task">
          <TaskForm
            blocks={blocks}
            onCancel={() => setCreating(false)}
            onSubmit={async (payload) => {
              await createTask(payload);
              setCreating(false);
            }}
            submitLabel="Create task"
          />
        </Dialog>
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
      ) : tasks.length === 0 ? (
        <div className="mt-8">
          <EmptyCta
            description="Capture it here, with or without a date."
            onClick={() => setCreating(true)}
            title="Add your first task"
          />
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          <p className="text-xs text-ink-faint">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </p>
          {tasks.map((task) => (
            <TaskItem
              block={
                task.timeBlockId
                  ? blocks.find((item) => item.id === task.timeBlockId)
                  : undefined
              }
              key={task.id}
              onDelete={() => deleteTask(task.id)}
              onEdit={() => {
                setCreating(false);
                setEditingId(task.id);
              }}
              onToggle={() => updateTask(task.id, { done: !task.done })}
              task={task}
            />
          ))}
        </div>
      )}
    </section>
  );
}
