import { useCallback, useState } from "react";

import { useData } from "../data/DataProvider";
import { ItemSheet } from "./ItemSheet";
import { NoteForm } from "./NoteForm";
import { OccurrenceSheet } from "./OccurrenceSheet";
import { TaskForm } from "./TaskForm";
import { Dialog } from "./Dialog";

export interface PinsOverlay {
  blockId: string;
  date: string;
}

export interface ItemOverlay {
  kind: "task" | "note";
  id: string;
  mode: "read" | "edit";
}

export interface CreateOverlay {
  kind: "task" | "note";
  date?: string | null;
  timeBlockId?: string | null;
  taskId?: string | null;
}

export function usePinOverlays(options?: { onEditBlock?: (id: string) => void }) {
  const [pins, setPins] = useState<PinsOverlay | null>(null);
  const [item, setItem] = useState<ItemOverlay | null>(null);
  const [creating, setCreating] = useState<CreateOverlay | null>(null);
  const onEditBlock = options?.onEditBlock;

  const openTask = useCallback((id: string, mode: "read" | "edit" = "read") => {
    setItem({ kind: "task", id, mode });
  }, []);

  const openNote = useCallback((id: string, mode: "read" | "edit" = "read") => {
    setItem({ kind: "note", id, mode });
  }, []);

  const openPins = useCallback((blockId: string, date: string) => {
    setPins({ blockId, date });
  }, []);

  const overlay = (
    <PinOverlays
      creating={creating}
      item={item}
      onCreatingChange={setCreating}
      onEditBlock={onEditBlock}
      onItemChange={setItem}
      onPinsChange={setPins}
      pins={pins}
    />
  );

  return {
    overlay,
    openTask,
    openNote,
    openPins,
    closePins: () => setPins(null),
    closeItem: () => setItem(null),
    closeAll: () => {
      setPins(null);
      setItem(null);
      setCreating(null);
    },
  };
}

function PinOverlays({
  pins,
  item,
  creating,
  onPinsChange,
  onItemChange,
  onCreatingChange,
  onEditBlock,
}: {
  pins: PinsOverlay | null;
  item: ItemOverlay | null;
  creating: CreateOverlay | null;
  onPinsChange: (value: PinsOverlay | null) => void;
  onItemChange: (value: ItemOverlay | null) => void;
  onCreatingChange: (value: CreateOverlay | null) => void;
  onEditBlock?: (id: string) => void;
}) {
  const { blocks, tasks, createTask, createNote } = useData();

  return (
    <>
      {pins ? (
        <OccurrenceSheet
          blockId={pins.blockId}
          date={pins.date}
          onClose={() => onPinsChange(null)}
          onCreateNote={() =>
            onCreatingChange({
              kind: "note",
              timeBlockId: pins.blockId,
            })
          }
          onCreateTask={() =>
            onCreatingChange({
              kind: "task",
              date: pins.date,
              timeBlockId: pins.blockId,
            })
          }
          onEditBlock={
            onEditBlock
              ? () => {
                  onPinsChange(null);
                  onEditBlock(pins.blockId);
                }
              : undefined
          }
          onOpenNote={(id) => onItemChange({ kind: "note", id, mode: "read" })}
          onOpenTask={(id) => onItemChange({ kind: "task", id, mode: "read" })}
        />
      ) : null}
      {item ? (
        <ItemSheet
          id={item.id}
          kind={item.kind}
          mode={item.mode}
          onClose={() => onItemChange(null)}
          onModeChange={(mode) => onItemChange({ ...item, mode })}
          onOpenBlock={(blockId, date) => onPinsChange({ blockId, date })}
          onOpenTask={(id) =>
            onItemChange({ kind: "task", id, mode: "read" })
          }
        />
      ) : null}
      {creating?.kind === "task" ? (
        <Dialog
          onClose={() => onCreatingChange(null)}
          title="Add task"
        >
          <TaskForm
            blocks={blocks}
            initial={{
              title: "",
              description: "",
              date: creating.date ?? "",
              timeBlockId: creating.timeBlockId ?? "",
            }}
            onCancel={() => onCreatingChange(null)}
            onSubmit={async (payload) => {
              await createTask(payload);
              onCreatingChange(null);
            }}
            submitLabel="Create task"
          />
        </Dialog>
      ) : null}
      {creating?.kind === "note" ? (
        <Dialog onClose={() => onCreatingChange(null)} title="Add note">
          <NoteForm
            blocks={blocks}
            initial={{
              title: "",
              markdown: "",
              date: creating.date ?? "",
              taskId: creating.taskId ?? "",
              timeBlockId: creating.timeBlockId ?? "",
            }}
            onCancel={() => onCreatingChange(null)}
            onSubmit={async (payload) => {
              await createNote(payload);
              onCreatingChange(null);
            }}
            submitLabel="Create note"
            tasks={tasks}
          />
        </Dialog>
      ) : null}
    </>
  );
}
