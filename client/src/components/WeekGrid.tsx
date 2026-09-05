import type { BlockPin } from "../assignments";
import { formatHourLabel, hourTicks } from "../time";
import { DayGrid, type DayGridBlock } from "./DayGrid";

export interface WeekGridDay {
  date: string;
  weekday: string;
  day: string;
  label: string;
  isToday: boolean;
  blocks: DayGridBlock[];
  tasksByBlock?: Record<string, BlockPin[]>;
  notesByBlock?: Record<string, BlockPin[]>;
}

interface WeekGridProps {
  label: string;
  days: WeekGridDay[];
  nowMinutes?: number;
  pixelsPerHour?: number;
  onSelect?: (id: string) => void;
  onSelectDay?: (date: string) => void;
  onSelectNote?: (id: string) => void;
  onSelectTask?: (id: string) => void;
}

export function WeekGrid({
  label,
  days,
  nowMinutes,
  pixelsPerHour = 40,
  onSelect,
  onSelectDay,
  onSelectNote,
  onSelectTask,
}: WeekGridProps) {
  const rangeStartMinutes = 0;
  const rangeEndMinutes = 1440;
  const duration = rangeEndMinutes - rangeStartMinutes;
  const height = (duration / 60) * pixelsPerHour;
  const ticks = hourTicks(rangeStartMinutes, rangeEndMinutes);

  return (
    <div
      aria-label={label}
      className="overflow-x-auto rounded-lg border border-line bg-paper-raised"
      role="group"
    >
      <div className="grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))]">
        <div className="sticky left-0 z-20 border-b border-line bg-paper-raised" />
        {days.map((day) => {
          const heading = (
            <>
              <span className="text-[0.7rem] font-medium tracking-wide text-ink-faint">
                {day.weekday}
              </span>
              <span
                className={[
                  "text-sm",
                  day.isToday ? "font-medium text-moss" : "text-ink",
                ].join(" ")}
              >
                {day.day}
              </span>
            </>
          );
          const headingClass = [
            "flex flex-col items-center gap-0.5 border-b border-l border-line py-2",
            day.isToday ? "bg-paper-deep" : "",
          ].join(" ");
          if (onSelectDay) {
            return (
              <button
                aria-current={day.isToday ? "date" : undefined}
                aria-label={day.label}
                className={`${headingClass} hover:bg-paper-deep`}
                key={day.date}
                onClick={() => onSelectDay(day.date)}
                type="button"
              >
                {heading}
              </button>
            );
          }
          return (
            <div
              aria-current={day.isToday ? "date" : undefined}
              className={headingClass}
              key={day.date}
            >
              {heading}
            </div>
          );
        })}
        <div
          className="sticky left-0 z-20 border-r border-line/80 bg-paper-raised"
          style={{ height }}
        >
          <div className="relative" style={{ height }}>
            {ticks.map((tick) => (
              <div
                className="absolute right-0 left-0"
                key={tick}
                style={{
                  top: ((tick - rangeStartMinutes) / duration) * 100 + "%",
                }}
              >
                <span
                  className="block -translate-y-1/2 pr-2 text-right text-[0.7rem] text-ink-faint"
                >
                  {formatHourLabel(tick / 60)}
                </span>
              </div>
            ))}
          </div>
        </div>
        {days.map((day) => (
          <DayGrid
            blocks={day.blocks}
            className={[
              "border-l border-line",
              day.isToday ? "bg-paper-deep" : "",
            ].join(" ")}
            framed={false}
            key={day.date}
            label={day.label}
            notesByBlock={day.notesByBlock}
            nowMinutes={day.isToday ? nowMinutes : undefined}
            onSelect={onSelect}
            onSelectNote={onSelectNote}
            onSelectTask={onSelectTask}
            pixelsPerHour={pixelsPerHour}
            rangeEndMinutes={rangeEndMinutes}
            rangeStartMinutes={rangeStartMinutes}
            showAxis={false}
            tasksByBlock={day.tasksByBlock}
          />
        ))}
      </div>
    </div>
  );
}
