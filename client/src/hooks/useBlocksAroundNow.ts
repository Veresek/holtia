import { useMemo } from "react";

import { useData } from "../data/DataProvider";
import {
  AROUND_NOW_MIN_LOOKAHEAD_MINUTES,
  aroundNowWindow,
  blockSegmentsOnDay,
  calendarDayOffset,
} from "../time";
import type { TimeBlock } from "../types";
import { useNow } from "./useNow";
import { useTimeZone } from "./useTimeZone";

export interface BlockOccurrence {
  block: TimeBlock;
  occurrenceDate: string;
  startMinutes: number;
  endMinutes: number;
}

export function useBlocksAroundNow(
  lookAheadMinutes = AROUND_NOW_MIN_LOOKAHEAD_MINUTES,
) {
  const now = useNow();
  const timeZone = useTimeZone();
  const window = aroundNowWindow(now, lookAheadMinutes, timeZone);
  const { blocks, blocksLoading, blocksError, retryBlocks, createBlock } =
    useData();

  const occurrences = useMemo(() => {
    const current = aroundNowWindow(now, lookAheadMinutes, timeZone);
    const next: BlockOccurrence[] = [];
    for (const date of current.dates) {
      const dayOffset = calendarDayOffset(current.originDate, date) * 1440;
      for (const block of blocks) {
        for (const segment of blockSegmentsOnDay(block, date)) {
          const startMinutes = dayOffset + segment.startMinutes;
          const endMinutes = dayOffset + segment.endMinutes;
          if (
            endMinutes <= current.rangeStartMinutes ||
            startMinutes >= current.rangeEndMinutes
          ) {
            continue;
          }
          next.push({
            block,
            occurrenceDate: date,
            startMinutes,
            endMinutes,
          });
        }
      }
    }
    return next;
  }, [blocks, lookAheadMinutes, now, timeZone]);

  return {
    occurrences,
    rangeStartMinutes: window.rangeStartMinutes,
    rangeEndMinutes: window.rangeEndMinutes,
    nowMinutes: window.nowMinutes,
    loading: blocksLoading,
    error: blocksError,
    retry: retryBlocks,
    createBlock,
  };
}
