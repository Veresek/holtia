import { useMemo, useState } from "react";

import { notesOnDate, notePinsByBlock, taskPinsByBlockOnDate } from "../assignments";
import { BlockForm } from "../components/BlockForm";
import { DayGrid } from "../components/DayGrid";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { MonthGrid } from "../components/MonthGrid";
import { usePinOverlays } from "../components/PinOverlays";
import { WeekGrid } from "../components/WeekGrid";
import { useData } from "../data/DataProvider";
import { useBlocks } from "../hooks/useBlocks";
import { useNow } from "../hooks/useNow";
import { useTimeZone } from "../hooks/useTimeZone";
import {
  addCalendarDays,
  addCalendarMonths,
  blockSegmentsOnDay,
  formatDayHeading,
  formatMinutesLabel,
  formatMonthHeading,
  formatTimeLabel,
  formatWeekdayShort,
  formatWeekHeading,
  startOfMonth,
  startOfWeek,
  dateValue,
  monthGridDates,
  timeParts,
  weekDates,
} from "../time";

type CalendarView = "day" | "week" | "month";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export function CalendarPage() {
  const now = useNow();
  const timeZone = useTimeZone();
  const today = dateValue(now, timeZone);
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDate, setSelectedDate] = useState(today);
  const weekStart = startOfWeek(selectedDate);
  const dates = useMemo(() => {
    if (view === "day") {
      return [selectedDate];
    }
    if (view === "month") {
      return monthGridDates(selectedDate);
    }
    return weekDates(weekStart);
  }, [selectedDate, view, weekStart]);
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
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const pinOverlays = usePinOverlays({
    onEditBlock: (id) => {
      setCreatingDate(null);
      setEditingId(id);
    },
  });
  const editing = blocks.find((block) => block.id === editingId);
  const nowParts = timeParts(now, timeZone);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;

  const closeEditors = () => {
    setCreatingDate(null);
    setEditingId(null);
    pinOverlays.closeAll();
  };

  function moveWeek(nextStart: string) {
    closeEditors();
    const nextDates = weekDates(nextStart);
    setSelectedDate(nextDates.includes(today) ? today : nextStart);
  }

  function move(direction: -1 | 1) {
    if (view === "day") {
      closeEditors();
      setSelectedDate(addCalendarDays(selectedDate, direction));
      return;
    }
    if (view === "month") {
      closeEditors();
      setSelectedDate(addCalendarMonths(selectedDate, direction));
      return;
    }
    moveWeek(addCalendarDays(weekStart, direction * 7));
  }

  function showToday() {
    closeEditors();
    setSelectedDate(today);
  }

  const dayModel = (date: string) => ({
    date,
    weekday: formatWeekdayShort(date),
    day: String(Number(date.slice(8))),
    label: formatDayHeading(date),
    inMonth: date.slice(0, 7) === selectedDate.slice(0, 7),
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
    events: blocks
      .flatMap((block) =>
        blockSegmentsOnDay(block, date).map((segment) => ({
          id: block.id,
          title: block.title,
          timeLabel: formatMinutesLabel(segment.startMinutes),
          color: block.color,
          startMinutes: segment.startMinutes,
        })),
      )
      .sort(
        (left, right) =>
          left.startMinutes - right.startMinutes ||
          left.title.localeCompare(right.title) ||
          left.id.localeCompare(right.id),
      ),
    tasksByBlock: taskPinsByBlockOnDate(tasks, date),
    notesByBlock,
    dayNotes: notesOnDate(notes, date).map((note) => ({
      id: note.id,
      title: note.title,
    })),
  });

  const weekDays = weekDates(weekStart).map(dayModel);
  const selectedDay =
    weekDays.find((day) => day.date === selectedDate) ?? dayModel(selectedDate);
  const focusedDay = view === "day" ? dayModel(selectedDate) : selectedDay;
  const monthDays = monthGridDates(selectedDate).map(dayModel);
  const pinDate = editingDate ?? selectedDate;
  const heading =
    view === "day"
      ? formatDayHeading(selectedDate)
      : view === "month"
        ? formatMonthHeading(selectedDate)
        : formatWeekHeading(weekStart);
  const stepLabel = view === "day" ? "day" : view === "month" ? "month" : "week";
  const showingToday =
    view === "day"
      ? selectedDate === today
      : view === "month"
        ? startOfMonth(selectedDate) === startOfMonth(today)
        : weekStart === startOfWeek(today);

  function openCreate(date: string) {
    closeEditors();
    setCreatingDate(date);
  }

  function openEdit(id: string, date: string) {
    closeEditors();
    setEditingId(id);
    setEditingDate(date);
  }

  const dayColumn = (day: ReturnType<typeof dayModel>, emptyCreates: boolean) => (
    <div className="min-w-0">
      {day.dayNotes.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {day.dayNotes.map((note) => (
            <button
              className="rounded-md border border-line bg-paper-raised px-2 py-1 text-xs text-ink-soft hover:text-ink"
              key={note.id}
              onClick={() => pinOverlays.openNote(note.id)}
              type="button"
            >
              {note.title}
            </button>
          ))}
        </div>
      ) : null}
      <DayGrid
        blocks={day.blocks}
        label={day.label}
        notesByBlock={day.notesByBlock}
        nowMinutes={day.isToday ? nowMinutes : undefined}
        onEmptySelect={emptyCreates ? () => openCreate(day.date) : undefined}
        onSelect={(id) => openEdit(id, day.date)}
        onSelectNote={(id) => pinOverlays.openNote(id)}
        onSelectPins={(id) => pinOverlays.openPins(id, day.date)}
        onSelectTask={(id) => pinOverlays.openTask(id)}
        pixelsPerHour={40}
        rangeEndMinutes={1440}
        rangeStartMinutes={0}
        tasksByBlock={day.tasksByBlock}
      />
    </div>
  );

  return (
    <section className="mx-auto w-full min-w-0 max-w-[90rem] px-4 py-8 md:px-8 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <header>
          <p className="text-sm text-ink-soft">Plan your time</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">
            Calendar
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">
            Lay out a day, a week, or a month. Repeating events stay one object.
          </p>
        </header>
        <button
          className="shrink-0 rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper-raised hover:bg-moss-hover"
          onClick={() => openCreate(selectedDate)}
          type="button"
        >
          Add event
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          aria-label={`Previous ${stepLabel}`}
          className="rounded-md border border-line p-2 text-ink-soft hover:bg-paper-raised"
          onClick={() => move(-1)}
          type="button"
        >
          <Icon name="chevronLeft" className="size-5" />
        </button>
        <p className="min-w-56 text-center text-sm font-medium text-ink">
          {heading}
        </p>
        <button
          aria-label={`Next ${stepLabel}`}
          className="rounded-md border border-line p-2 text-ink-soft hover:bg-paper-raised"
          onClick={() => move(1)}
          type="button"
        >
          <Icon name="chevronRight" className="size-5" />
        </button>
        {showingToday ? null : (
          <button
            className="rounded-md border border-line px-3 py-2 text-sm text-ink-soft hover:bg-paper-raised"
            onClick={showToday}
            type="button"
          >
            Today
          </button>
        )}
        <fieldset className="m-0 inline-flex overflow-hidden rounded-md border border-solid border-line p-0 md:ml-auto">
          <legend className="sr-only">Calendar view</legend>
          {VIEWS.map((option) => (
            <label
              className={[
                "cursor-pointer px-3 py-2 text-sm",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-moss",
                view === option.id
                  ? "bg-paper-deep font-medium text-ink"
                  : "text-ink-soft",
              ].join(" ")}
              key={option.id}
            >
              <input
                checked={view === option.id}
                className="sr-only"
                name="calendar-view"
                onChange={() => {
                  closeEditors();
                  setView(option.id);
                }}
                type="radio"
                value={option.id}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
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
        <Dialog onClose={() => setCreatingDate(null)} title="Add event" wide>
          <BlockForm
            defaultDate={creatingDate}
            onCancel={() => setCreatingDate(null)}
            onSubmit={async (payload) => {
              await createBlock(payload);
              setCreatingDate(null);
            }}
            submitLabel="Create event"
          />
        </Dialog>
      ) : null}

      {editing ? (
        <Dialog onClose={() => setEditingId(null)} title="Edit event" wide>
          <BlockForm
            initial={editing}
            onCancel={() => setEditingId(null)}
            onDelete={async () => {
              await deleteBlock(editing.id);
              setEditingId(null);
            }}
            onOpenNote={(id) => pinOverlays.openNote(id)}
            onOpenTask={(id) => pinOverlays.openTask(id)}
            onSubmit={async (payload) => {
              await updateBlock(editing.id, payload);
              setEditingId(null);
            }}
            onUnpinNote={(id) => updateNote(id, { timeBlockId: null })}
            onUnpinTask={(id) => updateTask(id, { timeBlockId: null })}
            pinnedNotes={notes.filter((note) => note.timeBlockId === editing.id)}
            pinnedTasks={tasks.filter(
              (task) =>
                task.timeBlockId === editing.id && task.date === pinDate,
            )}
            submitLabel="Save changes"
          />
        </Dialog>
      ) : null}

      {pinOverlays.overlay}

      {loading ? (
        <p className="mt-8 text-sm text-ink-soft" role="status">
          Loading the week…
        </p>
      ) : (
        <div className="mt-8">
          {view === "month" ? (
            <MonthGrid
              days={monthDays}
              label={`Month of ${formatMonthHeading(selectedDate)}`}
              onSelectDay={(date) => {
                closeEditors();
                setSelectedDate(date);
                setView("day");
              }}
              onSelectEvent={(id, date) => openEdit(id, date)}
            />
          ) : null}
          {view === "day" ? dayColumn(focusedDay, true) : null}
          {view === "week" ? (
            <>
              <div className="hidden md:block">
                <WeekGrid
                  days={weekDays}
                  label={`Week of ${formatWeekHeading(weekStart)}`}
                  nowMinutes={nowMinutes}
                  onSelect={(id, date) => openEdit(id, date)}
                  onSelectDay={(date) => openCreate(date)}
                  onSelectDayNote={(id) => pinOverlays.openNote(id)}
                  onSelectNote={(id) => pinOverlays.openNote(id)}
                  onSelectPins={(id, date) => pinOverlays.openPins(id, date)}
                  onSelectTask={(id) => pinOverlays.openTask(id)}
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
                <div className="mt-4">{dayColumn(selectedDay, false)}</div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
