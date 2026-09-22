import { normalizeBlockColor } from "../blockColor";

const VISIBLE_EVENTS = 3;

export interface MonthGridEvent {
  id: string;
  title: string;
  timeLabel: string;
  color?: string;
}

export interface MonthGridDay {
  date: string;
  weekday: string;
  day: string;
  label: string;
  inMonth: boolean;
  isToday: boolean;
  events: MonthGridEvent[];
}

interface MonthGridProps {
  label: string;
  days: MonthGridDay[];
  onSelectDay: (date: string) => void;
  onSelectEvent: (id: string, date: string) => void;
}

export function MonthGrid({
  label,
  days,
  onSelectDay,
  onSelectEvent,
}: MonthGridProps) {
  const weekdays = days.slice(0, 7).map((day) => day.weekday);

  return (
    <div
      aria-label={label}
      className="overflow-hidden rounded-lg border border-line bg-paper-raised"
      role="group"
    >
      <div className="grid grid-cols-7 border-t border-l border-line">
        {weekdays.map((weekday) => (
          <div
            className="border-r border-b border-line px-1 py-2 text-center text-[0.7rem] font-medium tracking-wide text-ink-faint"
            key={weekday}
          >
            {weekday}
          </div>
        ))}
        {days.map((day) => {
          const shown = day.events.slice(0, VISIBLE_EVENTS);
          const extra = day.events.length - shown.length;
          return (
            <div
              className={[
                "flex min-h-28 flex-col gap-0.5 border-r border-b border-line p-1",
                day.inMonth ? "" : "bg-paper",
              ].join(" ")}
              key={day.date}
            >
              <button
                aria-current={day.isToday ? "date" : undefined}
                aria-label={day.label}
                className={[
                  "self-start rounded-md px-1.5 py-0.5 text-sm hover:bg-paper-deep",
                  day.isToday
                    ? "font-medium text-moss"
                    : day.inMonth
                      ? "text-ink"
                      : "text-ink-faint",
                ].join(" ")}
                onClick={() => onSelectDay(day.date)}
                type="button"
              >
                {day.day}
              </button>
              {shown.map((event) => (
                <button
                  aria-label={`${event.title}, ${event.timeLabel}`}
                  className="block w-full truncate border-l-2 pl-1 text-left text-[0.7rem] text-ink-soft hover:text-ink"
                  key={`${event.id}-${event.timeLabel}`}
                  onClick={() => onSelectEvent(event.id, day.date)}
                  style={{ borderLeftColor: normalizeBlockColor(event.color) }}
                  type="button"
                >
                  <span className="text-ink-faint">{event.timeLabel}</span>{" "}
                  {event.title}
                </button>
              ))}
              {extra > 0 ? (
                <button
                  className="truncate text-left text-[0.7rem] text-ink-faint hover:text-ink"
                  onClick={() => onSelectDay(day.date)}
                  type="button"
                >
                  +{extra} more
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
