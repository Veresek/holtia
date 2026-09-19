import { useState } from "react";

import { Dialog } from "../components/Dialog";
import { EmptyCta } from "../components/EmptyCta";
import { Masonry } from "../components/Masonry";
import { NoteCard } from "../components/NoteCard";
import { NoteForm } from "../components/NoteForm";
import { usePinOverlays } from "../components/PinOverlays";
import { useData } from "../data/DataProvider";
import { useNotes } from "../hooks/useNotes";
import { useNow } from "../hooks/useNow";
import { useTimeZone } from "../hooks/useTimeZone";
import { nextOccurrenceOnOrAfter, dateValue } from "../time";

export function NotesPage() {
  const {
    notes,
    loading,
    error,
    retry,
    createNote,
    updateNote,
    deleteNote,
  } = useNotes();
  const { blocks, tasks } = useData();
  const timeZone = useTimeZone();
  const today = dateValue(useNow(), timeZone);
  const pinOverlays = usePinOverlays();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = notes.find((note) => note.id === editingId);

  return (
    <section className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8 md:px-8 md:py-12">
      <div className="flex items-end justify-between gap-4">
        <header>
          <p className="text-sm text-ink-soft">Think in one place</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">
            Notes
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">
            A loose collection for ideas, decisions, and useful context.
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
          Add note
        </button>
      </div>

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

      {creating ? (
        <Dialog onClose={() => setCreating(false)} title="Add note">
          <NoteForm
            blocks={blocks}
            onCancel={() => setCreating(false)}
            onSubmit={async (payload) => {
              await createNote(payload);
              setCreating(false);
            }}
            submitLabel="Create note"
            tasks={tasks}
          />
        </Dialog>
      ) : null}

      {editing ? (
        <Dialog onClose={() => setEditingId(null)} title="Edit note">
          <NoteForm
            blocks={blocks}
            initial={editing}
            onCancel={() => setEditingId(null)}
            onSubmit={async (payload) => {
              await updateNote(editing.id, payload);
              setEditingId(null);
            }}
            submitLabel="Save changes"
            tasks={tasks}
          />
        </Dialog>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-ink-soft" role="status">
          Loading notes…
        </p>
      ) : notes.length === 0 ? (
        <div className="mt-8">
          <EmptyCta
            description="Keep an idea without forcing it into a project."
            onClick={() => setCreating(true)}
            title="Add your first note"
          />
        </div>
      ) : (
        <div className="mt-8">
          <p className="mb-3 text-xs text-ink-faint">
            {notes.length} {notes.length === 1 ? "note" : "notes"}
          </p>
          <Masonry>
            {notes.map((note) => {
              const block = note.timeBlockId
                ? blocks.find((item) => item.id === note.timeBlockId)
                : undefined;
              const linkedTask = note.taskId
                ? tasks.find((item) => item.id === note.taskId)
                : undefined;
              return (
              <NoteCard
                block={block}
                key={note.id}
                note={note}
                onDelete={() => deleteNote(note.id)}
                onEdit={() => {
                  setCreating(false);
                  setEditingId(note.id);
                }}
                onOpenBlock={
                  block
                    ? () =>
                        pinOverlays.openPins(
                          block.id,
                          nextOccurrenceOnOrAfter(block, today),
                        )
                    : undefined
                }
                onOpenTask={
                  linkedTask
                    ? () => pinOverlays.openTask(linkedTask.id)
                    : undefined
                }
                task={linkedTask}
              />
              );
            })}
          </Masonry>
        </div>
      )}
    </section>
  );
}
