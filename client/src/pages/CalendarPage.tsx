import { useMemo, useState } from "react";

import { BlockForm } from "../components/BlockForm";
import { DayGrid } from "../components/DayGrid";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { NoteForm } from "../components/NoteForm";
import { TaskForm } from "../components/TaskForm";
import { WeekGrid } from "../components/WeekGrid";
import { notePinsByBlock, taskPinsByBlockOnDate } from "../assignments";
import { useData } from "../data/DataProvider";
import { useBlocks } from "../hooks/useBlocks";
import { useNow } from "../hooks/useNow";
import { useTimeZone } from "../hooks/useTimeZone";
import {
  addCalendarDays,
  blockSegmentsOnDay,
  formatDayHeading,
  formatTimeLabel,
  formatWeekdayShort,
  formatWeekHeading,
  startOfWeek,
  dateValue,
  timeParts,
  weekDates,
} from "../time";

export function CalendarPage() {
  const now = useNow();
  const timeZone = useTimeZone();
  const today = dateValue(now, timeZone);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const {
    blocks,
    loading,
    error,
    retry,
    createBlock,
    updateBlock,
    deleteBlock,
  } = useBlocks(dates);
  const {
    tasks,
    notes,
    updateTask,
    updateNote,
  } = useData();
  const notesByBlock = notePinsByBlock(notes);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const editing = blocks.find((block) => block.id === editingId);
  const editingTask = tasks.find((task) => task.id === editingTaskId);
  const editingNote = notes.find((note) => note.id === editingNoteId);
  const nowParts = timeParts(now, timeZone);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const defaultCreateDate = dates.includes(selectedDate)
    ? selectedDate
    : dates.includes(today)
      ? today
      : weekStart;

  const closeEditors = () => {
    setCreatingDate(null);
    setEditingId(null);
    setEditingTaskId(null);
    setEditingNoteId(null);
  };

  function moveWeek(nextStart: string) {
    closeEditors();
    setWeekStart(nextStart);
    const nextDates = weekDates(nextStart);
    setSelectedDate(nextDates.includes(today) ? today : nextStart);
  }

  const weekDays = dates.map((date) => ({
    date,
    weekday: formatWeekdayShort(date),
    day: String(Number(date.slice(8))),
    label: formatDayHeading(date),
    isToday: date === today,
    blocks: blocks.flatMap((block) =>
      blockSegmentsOnDay(block, date).map((segment) => ({
        id: block.id,
        title: block.title,
        description: block.description,
        startLabel: formatTimeLabel(block.start),
        endLabel: formatTimeLabel(block.end),
        startMinutes: segment.startMinutes,
        endMinutes: segment.endMinutes,
        color: block.color,
      })),
    ),
    tasksByBlock: taskPinsByBlockOnDate(tasks, date),
    notesByBlock,
  }));
  const selectedDay = weekDays.find((day) => day.date === selectedDate) ?? weekDays[0];

  return (
    <section className="mx-auto w-full min-w-0 max-w-[90rem] px-4 py-8 md:px-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <header>
          <p className="text-sm text-ink-soft">Plan your time</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">
            Calendar
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">
            Lay out the week in a 24 hour grid. Repeating blocks stay one object.
          </p>
        </header>
        <button
          className="shrink-0 rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper-raised hover:bg-moss-hover"
          onClick={() => {
            closeEditors();
            setCreatingDate(defaultCreateDate);
          }}
          type="button"
        >
          Add block
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          aria-label="Previous week"
          className="rounded-md border border-line p-2 text-ink-soft hover:bg-paper-raised"
          onClick={() => moveWeek(addCalendarDays(weekStart, -7))}
          type="button"
        >
          <Icon name="chevronLeft" className="size-5" />
        </button>
        <p className="min-w-56 text-center text-sm font-medium text-ink">
          {formatWeekHeading(weekStart)}
        </p>
        <button
          aria-label="Next week"
          className="rounded-md border border-line p-2 text-ink-soft hover:bg-paper-raised"
          onClick={() => moveWeek(addCalendarDays(weekStart, 7))}
          type="button"
        >
          <Icon name="chevronRight" className="size-5" />
        </button>
        {weekStart !== startOfWeek(today) ? (
          <button
            className="rounded-md border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper-raised"
            onClick={() => {
              closeEditors();
              setWeekStart(startOfWeek(today));
              setSelectedDate(today);
            }}
            type="button"
          >
            Today
          </button>
        ) : null}
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

      {creatingDate ? (
        <Dialog onClose={() => setCreatingDate(null)} title="Add block" wide>
          <BlockForm
            defaultDate={creatingDate}
            onCancel={() => setCreatingDate(null)}
            onSubmit={async (payload) => {
              await createBlock(payload);
              setCreatingDate(null);
            }}
            submitLabel="Create block"
          />
        </Dialog>
      ) : null}

      {editing ? (
        <Dialog onClose={() => setEditingId(null)} title="Edit block" wide>
          <BlockForm
            initial={editing}
            onCancel={() => setEditingId(null)}
            onDelete={async () => {
              await deleteBlock(editing.id);
              setEditingId(null);
            }}
            onSubmit={async (payload) => {
              await updateBlock(editing.id, payload);
              setEditingId(null);
            }}
            submitLabel="Save changes"
          />
        </Dialog>
      ) : null}

      {editingTask ? (
        <Dialog onClose={() => setEditingTaskId(null)} title="Edit task">
          <TaskForm
            blocks={blocks}
            initial={editingTask}
            onCancel={() => setEditingTaskId(null)}
            onSubmit={async (payload) => {
              await updateTask(editingTask.id, payload);
              setEditingTaskId(null);
            }}
            submitLabel="Save changes"
          />
        </Dialog>
      ) : null}

      {editingNote ? (
        <Dialog onClose={() => setEditingNoteId(null)} title="Edit note">
          <NoteForm
            blocks={blocks}
            initial={editingNote}
            onCancel={() => setEditingNoteId(null)}
            onSubmit={async (payload) => {
              await updateNote(editingNote.id, payload);
              setEditingNoteId(null);
            }}
            submitLabel="Save changes"
            tasks={tasks}
          />
        </Dialog>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-ink-soft" role="status">
          Loading the week…
        </p>
      ) : (
        <div className="mt-8">
          <div className="hidden md:block">
            <WeekGrid
              days={weekDays}
              label={`Week of ${formatWeekHeading(weekStart)}`}
              nowMinutes={nowMinutes}
              onSelect={(id) => {
                closeEditors();
                setEditingId(id);
              }}
              onSelectDay={(date) => {
                closeEditors();
                setCreatingDate(date);
              }}
              onSelectNote={(id) => {
                closeEditors();
                setEditingNoteId(id);
              }}
              onSelectTask={(id) => {
                closeEditors();
                setEditingTaskId(id);
              }}
            />
          </div>
          <div className="min-w-0 md:hidden">
            <div
              aria-label="Choose a day"
              className="grid grid-cols-7 rounded-lg border border-line bg-paper-raised"
              role="group"
            >
              {weekDays.map((day) => (
                <button
                  aria-current={day.date === selectedDate ? "date" : undefined}
                  aria-label={`Show ${day.label}`}
                  className={[
                    "flex flex-col items-center gap-0.5 py-2",
                    day.date === selectedDate ? "bg-paper-deep" : "",
                    day.isToday ? "text-moss" : "text-ink",
                  ].join(" ")}
                  key={day.date}
                  onClick={() => {
                    closeEditors();
                    setSelectedDate(day.date);
                  }}
                  type="button"
                >
                  <span className="text-[0.7rem] font-medium tracking-wide text-ink-faint">
                    {day.weekday}
                  </span>
                  <span className="text-sm">{day.day}</span>
                </button>
              ))}
            </div>
            {selectedDay ? (
              <div className="mt-4 min-w-0">
                <DayGrid
                  blocks={selectedDay.blocks}
                  label={selectedDay.label}
                  notesByBlock={selectedDay.notesByBlock}
                  nowMinutes={selectedDay.isToday ? nowMinutes : undefined}
                  onSelect={(id) => {
                    closeEditors();
                    setEditingId(id);
                  }}
                  onSelectNote={(id) => {
                    closeEditors();
                    setEditingNoteId(id);
                  }}
                  onSelectTask={(id) => {
                    closeEditors();
                    setEditingTaskId(id);
                  }}
                  pixelsPerHour={40}
                  rangeEndMinutes={1440}
                  rangeStartMinutes={0}
                  tasksByBlock={selectedDay.tasksByBlock}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
