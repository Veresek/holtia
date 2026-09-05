import type { BlockPin } from "../assignments";
import { formatHourLabel, hourTicks } from "../time";
import { MarkdownBody } from "./MarkdownBody";

export interface DayGridBlock {
  id: string;
  title: string;
  description?: string;
  startLabel: string;
  endLabel: string;
  startMinutes: number;
  endMinutes: number;
}

interface LaidOutBlock extends DayGridBlock {
  clippedStart: number;
  clippedEnd: number;
  column: number;
  columns: number;
}

interface DayGridProps {
  label: string;
  rangeStartMinutes: number;
  rangeEndMinutes: number;
  blocks: DayGridBlock[];
  nowMinutes?: number;
  readOnly?: boolean;
  pixelsPerHour?: number;
  showAxis?: boolean;
  framed?: boolean;
  className?: string;
  onSelect?: (id: string) => void;
  onSelectTask?: (id: string) => void;
  onSelectNote?: (id: string) => void;
  tasksByBlock?: Record<string, BlockPin[]>;
  notesByBlock?: Record<string, BlockPin[]>;
}

function layoutOverlaps(blocks: DayGridBlock[], rangeStart: number, rangeEnd: number) {
  const clipped = blocks.flatMap((block) => {
    const clippedStart = Math.max(block.startMinutes, rangeStart);
    const clippedEnd = Math.min(block.endMinutes, rangeEnd);
    if (clippedEnd <= clippedStart) {
      return [];
    }
    return [{ ...block, clippedStart, clippedEnd }];
  });
  const sorted = [...clipped].sort(
    (left, right) =>
      left.clippedStart - right.clippedStart ||
      left.clippedEnd - right.clippedEnd ||
      left.id.localeCompare(right.id),
  );
  const clusters: (typeof sorted)[] = [];
  let current: typeof sorted = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    if (current.length === 0 || item.clippedStart < clusterEnd) {
      current.push(item);
      clusterEnd = Math.max(clusterEnd, item.clippedEnd);
    } else {
      clusters.push(current);
      current = [item];
      clusterEnd = item.clippedEnd;
    }
  }
  if (current.length > 0) {
    clusters.push(current);
  }

  const laidOut: LaidOutBlock[] = [];
  for (const cluster of clusters) {
    const columnEnds: number[] = [];
    const assigned: (Omit<LaidOutBlock, "columns">)[] = [];
    for (const item of cluster) {
      let column = columnEnds.findIndex((end) => end <= item.clippedStart);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.clippedEnd);
      } else {
        columnEnds[column] = item.clippedEnd;
      }
      assigned.push({ ...item, column });
    }
    const columns = Math.max(columnEnds.length, 1);
    for (const item of assigned) {
      laidOut.push({ ...item, columns });
    }
  }
  return laidOut;
}

const PIN_LIMIT = 3;

function BlockPins({
  blockId,
  notes,
  onSelect,
  onSelectNote,
  onSelectTask,
  tasks,
}: {
  blockId: string;
  notes: BlockPin[];
  onSelect?: (id: string) => void;
  onSelectNote?: (id: string) => void;
  onSelectTask?: (id: string) => void;
  tasks: BlockPin[];
}) {
  const shownTasks = tasks.slice(0, PIN_LIMIT);
  const shownNotes = notes.slice(0, PIN_LIMIT - shownTasks.length);
  const extra = tasks.length + notes.length - shownTasks.length - shownNotes.length;

  function pinButton(
    pin: BlockPin,
    kind: "task" | "note",
    onOpen?: (id: string) => void,
  ) {
    const className = "relative z-10 block w-full truncate text-left text-[0.7rem] text-ink-faint hover:text-ink";
    if (!onOpen) {
      return (
        <span className="block truncate text-[0.7rem] text-ink-faint" key={`${kind}-${pin.id}`}>
          {pin.title}
        </span>
      );
    }
    return (
      <button
        className={className}
        key={`${kind}-${pin.id}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(pin.id);
        }}
        type="button"
      >
        {pin.title}
      </button>
    );
  }

  return (
    <>
      {shownTasks.map((pin) => pinButton(pin, "task", onSelectTask))}
      {shownNotes.map((pin) => pinButton(pin, "note", onSelectNote))}
      {extra > 0 ? (
        onSelect ? (
          <button
            className="relative z-10 block w-full truncate text-left text-[0.7rem] text-ink-faint hover:text-ink"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(blockId);
            }}
            type="button"
          >
            +{extra} more
          </button>
        ) : (
          <span className="block truncate text-[0.7rem] text-ink-faint">
            +{extra} more
          </span>
        )
      ) : null}
    </>
  );
}

export function DayGrid({
  label,
  rangeStartMinutes,
  rangeEndMinutes,
  blocks,
  nowMinutes,
  readOnly = false,
  pixelsPerHour = 48,
  showAxis = true,
  framed = true,
  className = "",
  onSelect,
  onSelectTask,
  onSelectNote,
  tasksByBlock,
  notesByBlock,
}: DayGridProps) {
  const duration = Math.max(rangeEndMinutes - rangeStartMinutes, 1);
  const height = (duration / 60) * pixelsPerHour;
  const ticks = hourTicks(rangeStartMinutes, rangeEndMinutes);
  const laidOut = layoutOverlaps(blocks, rangeStartMinutes, rangeEndMinutes);
  const showNow =
    nowMinutes !== undefined &&
    nowMinutes >= rangeStartMinutes &&
    nowMinutes <= rangeEndMinutes;

  return (
    <div
      aria-label={label}
      className={[
        "min-w-0 overflow-hidden",
        framed ? "rounded-lg border border-line bg-paper-raised" : "",
        className,
      ].join(" ")}
      role={readOnly ? "list" : "group"}
    >
      <div className="flex min-w-0">
        {showAxis ? (
          <div
            className="relative w-12 shrink-0 border-r border-line/80 md:w-18"
            style={{ height }}
          >
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
        ) : null}
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {ticks.map((tick) => (
            <div
              className="absolute right-0 left-0 h-px bg-line/80"
              key={`line-${tick}`}
              style={{
                top: ((tick - rangeStartMinutes) / duration) * 100 + "%",
              }}
            />
          ))}
          {laidOut.map((block) => {
            const top =
              ((block.clippedStart - rangeStartMinutes) / duration) * 100;
            const blockHeight =
              ((block.clippedEnd - block.clippedStart) / duration) * 100;
            const width = `calc(${100 / block.columns}% - 0.25rem)`;
            const left = `calc(${(block.column / block.columns) * 100}% + 0.125rem)`;
            const className = [
              "absolute overflow-hidden rounded-md border border-moss/30 bg-paper px-2 py-1 text-left",
              readOnly ? "" : "hover:border-lichen",
            ].join(" ");
            const style = {
              top: `${top}%`,
              height: `${blockHeight}%`,
              left,
              width,
            };
            const heading = readOnly ? (
              <>
                <span className="block truncate text-sm font-medium text-ink">
                  {block.title}
                </span>
                <span className="block text-[0.7rem] text-ink-soft">
                  {block.startLabel}–{block.endLabel}
                </span>
              </>
            ) : (
              <button
                aria-label={`${block.title}, ${block.startLabel}–${block.endLabel}`}
                className="block w-full text-left"
                onClick={() => onSelect?.(block.id)}
                type="button"
              >
                <span className="block truncate text-sm font-medium text-ink">
                  {block.title}
                </span>
                <span className="block text-[0.7rem] text-ink-soft">
                  {block.startLabel}–{block.endLabel}
                </span>
              </button>
            );
            return (
              <article
                className={className}
                key={`${block.id}-${block.startMinutes}`}
                role={readOnly ? "listitem" : undefined}
                style={style}
              >
                {heading}
                <BlockPins
                  blockId={block.id}
                  notes={notesByBlock?.[block.id] ?? []}
                  onSelect={onSelect}
                  onSelectNote={onSelectNote}
                  onSelectTask={onSelectTask}
                  tasks={tasksByBlock?.[block.id] ?? []}
                />
                {block.description ? (
                  <MarkdownBody
                    className="mt-1 wrap-break-word text-[0.7rem] leading-4 text-ink-soft line-clamp-3"
                    compact
                    links={readOnly}
                    markdown={block.description}
                  />
                ) : null}
              </article>
            );
          })}
          {showNow ? (
            <div
              className="pointer-events-none absolute right-0 left-0 z-10"
              style={{
                top:
                  ((nowMinutes - rangeStartMinutes) / duration) * 100 + "%",
              }}
            >
              <span
                aria-hidden="true"
                className="absolute right-0 left-0 h-px bg-moss"
              />
              <span className="absolute -top-2.5 left-2 rounded-sm bg-paper-raised px-1 text-[0.7rem] font-medium text-moss">
                Now
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
