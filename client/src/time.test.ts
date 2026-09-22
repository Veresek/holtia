import { describe, expect, it } from 'vitest';

import {
	addCalendarDays,
	aroundNowLookAheadMinutes,
	aroundNowWindow,
	blockOccursOn,
	blockSegmentsOnDay,
	formatTaskDateChip,
	addCalendarMonths,
	formatMonthHeading,
	formatWeekHeading,
	hourTicks,
	isOvernight,
	monthGridDates,
	nextOccurrenceOnOrAfter,
	parseInstant,
	parseTimeMinutes,
	startOfMonth,
	startOfWeek,
	dateValue,
	greeting,
	weekdayMondayFirst,
	weekDates,
} from './time';

describe('time helpers', () => {
	it('adds calendar days without shifting the civil date', () => {
		expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01');
		expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('maps ISO dates to Monday-first weekdays', () => {
		expect(weekdayMondayFirst('2026-08-31')).toBe(0);
		expect(weekdayMondayFirst('2026-09-06')).toBe(6);
	});

	it('opens a week on Monday', () => {
		expect(startOfWeek('2026-08-31')).toBe('2026-08-31');
		expect(startOfWeek('2026-09-02')).toBe('2026-08-31');
		expect(startOfWeek('2026-09-06')).toBe('2026-08-31');
		expect(weekDates('2026-08-31')).toEqual([
			'2026-08-31',
			'2026-09-01',
			'2026-09-02',
			'2026-09-03',
			'2026-09-04',
			'2026-09-05',
			'2026-09-06',
		]);
	});

	it('builds a Monday-first month grid and clamps short months', () => {
		expect(startOfMonth('2026-09-22')).toBe('2026-09-01');
		expect(addCalendarMonths('2026-09-22', 1)).toBe('2026-10-22');
		expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
		expect(addCalendarMonths('2026-03-31', -1)).toBe('2026-02-28');
		const grid = monthGridDates('2026-09-15');
		expect(grid[0]).toBe(startOfWeek('2026-09-01'));
		expect(grid.at(-1)).toBe(addCalendarDays(startOfWeek('2026-09-30'), 6));
		expect(grid.length % 7).toBe(0);
		expect(formatMonthHeading('2026-09-15')).toBe('September 2026');
	});

	it('formats a week heading across a month boundary', () => {
		expect(formatWeekHeading('2026-08-31')).toBe(
			'August 31 – September 6, 2026',
		);
		expect(formatWeekHeading('2026-09-07')).toBe('September 7–13, 2026');
	});

	it('labels a task date relative to today', () => {
		const today = '2026-09-16';
		expect(formatTaskDateChip(today, today)).toEqual({
			label: 'Today',
			tone: 'today',
		});
		expect(formatTaskDateChip('2026-09-17', today)).toEqual({
			label: 'Tomorrow',
			tone: 'upcoming',
		});
		expect(formatTaskDateChip('2026-09-15', today)).toEqual({
			label: 'Yesterday',
			tone: 'overdue',
		});
		expect(formatTaskDateChip('2026-09-18', today)).toEqual({
			label: 'Friday',
			tone: 'upcoming',
		});
		expect(formatTaskDateChip('2026-09-14', today)).toEqual({
			label: 'Monday',
			tone: 'overdue',
		});
		expect(formatTaskDateChip('2026-09-23', today)).toEqual({
			label: 'Sep 23',
			tone: 'upcoming',
		});
		expect(formatTaskDateChip('2026-09-09', today)).toEqual({
			label: 'Sep 9',
			tone: 'overdue',
		});
		expect(formatTaskDateChip('2027-01-05', today)).toEqual({
			label: 'Jan 5, 2027',
			tone: 'upcoming',
		});
	});

	it('lists hour ticks inside a range', () => {
		expect(hourTicks(0, 180)).toEqual([60, 120]);
		expect(hourTicks(0, 1440)).toEqual(
			Array.from({ length: 23 }, (_, index) => (index + 1) * 60),
		);
		expect(hourTicks(90, 180)).toEqual([120]);
	});

	it('expands recurrence onto later dates', () => {
		const weekly = {
			date: '2026-08-31',
			recurrence: 'weekly' as const,
			recurrenceDays: [],
		};
		expect(blockOccursOn(weekly, '2026-08-31')).toBe(true);
		expect(blockOccursOn(weekly, '2026-09-07')).toBe(true);
		expect(blockOccursOn(weekly, '2026-09-01')).toBe(false);

		const weekdays = {
			date: '2026-08-29',
			recurrence: 'weekdays' as const,
			recurrenceDays: [0, 2, 4],
		};
		expect(blockOccursOn(weekdays, '2026-08-31')).toBe(true);
		expect(blockOccursOn(weekdays, '2026-08-30')).toBe(false);
	});

	it('finds the next occurrence on or after a day', () => {
		const weekly = {
			date: '2026-08-31',
			recurrence: 'weekly' as const,
			recurrenceDays: [],
		};
		expect(nextOccurrenceOnOrAfter(weekly, '2026-09-01')).toBe('2026-09-07');
		expect(nextOccurrenceOnOrAfter(weekly, '2026-08-31')).toBe('2026-08-31');

		const oneOff = {
			date: '2026-08-31',
			recurrence: 'none' as const,
			recurrenceDays: [],
		};
		expect(nextOccurrenceOnOrAfter(oneOff, '2026-09-05')).toBe('2026-08-31');
	});

	it('parses clock times into minutes', () => {
		expect(parseTimeMinutes('09:30:00')).toBe(570);
	});

	it('splits overnight blocks across midnight', () => {
		const overnight = {
			date: '2026-08-31',
			start: '22:00:00',
			end: '06:00:00',
			recurrence: 'none' as const,
			recurrenceDays: [],
		};
		expect(isOvernight(overnight.start, overnight.end)).toBe(true);
		expect(blockSegmentsOnDay(overnight, '2026-08-31')).toEqual([
			{ startMinutes: 22 * 60, endMinutes: 1440 },
		]);
		expect(blockSegmentsOnDay(overnight, '2026-09-01')).toEqual([
			{ startMinutes: 0, endMinutes: 6 * 60 },
		]);
		expect(blockSegmentsOnDay(overnight, '2026-09-02')).toEqual([]);
	});

	it('places both daily overnight segments on the same day', () => {
		const overnight = {
			date: '2026-08-31',
			start: '22:00:00',
			end: '06:00:00',
			recurrence: 'daily' as const,
			recurrenceDays: [],
		};
		expect(blockSegmentsOnDay(overnight, '2026-09-01')).toEqual([
			{ startMinutes: 22 * 60, endMinutes: 1440 },
			{ startMinutes: 0, endMinutes: 6 * 60 },
		]);
	});

	it('builds a four-hour window around now', () => {
		const window = aroundNowWindow(new Date('2026-08-31T12:00:00+02:00'));
		expect(window.rangeEndMinutes - window.rangeStartMinutes).toBe(240);
		expect(window.dates).toEqual(['2026-08-31']);
	});

	it('extends look-ahead without changing the look-back', () => {
		const window = aroundNowWindow(new Date('2026-08-31T12:00:00+02:00'), 540);
		expect(window.nowMinutes - window.rangeStartMinutes).toBe(60);
		expect(window.rangeEndMinutes - window.nowMinutes).toBe(540);
	});

	it('lists every calendar day a long window covers', () => {
		const window = aroundNowWindow(
			new Date('2026-08-31T22:00:00+02:00'),
			30 * 60,
		);
		expect(window.dates).toEqual(['2026-08-31', '2026-09-01', '2026-09-02']);
	});

	it('keeps the three-hour look-ahead floor for a short slot', () => {
		expect(aroundNowLookAheadMinutes(0)).toBe(180);
		expect(aroundNowLookAheadMinutes(160)).toBe(180);
	});

	it('turns extra slot height into look-ahead minutes', () => {
		expect(aroundNowLookAheadMinutes(400)).toBe(540);
	});

	it('picks a greeting from the account time of day', () => {
		expect(greeting(new Date('2026-09-01T04:59:00+02:00'))).toBe(
			'Good night.',
		);
		expect(greeting(new Date('2026-09-01T05:00:00+02:00'))).toBe(
			'Good morning.',
		);
		expect(greeting(new Date('2026-09-01T11:59:00+02:00'))).toBe(
			'Good morning.',
		);
		expect(greeting(new Date('2026-09-01T12:00:00+02:00'))).toBe(
			'Good afternoon.',
		);
		expect(greeting(new Date('2026-09-01T17:59:00+02:00'))).toBe(
			'Good afternoon.',
		);
		expect(greeting(new Date('2026-09-01T18:00:00+02:00'))).toBe(
			'Good evening.',
		);
		expect(greeting(new Date('2026-09-01T21:59:00+02:00'))).toBe(
			'Good evening.',
		);
		expect(greeting(new Date('2026-09-01T22:00:00+02:00'))).toBe(
			'Good night.',
		);
		expect(greeting(new Date('2026-09-01T00:30:00+02:00'))).toBe(
			'Good night.',
		);
	});

	it('parses instants with extra fractional digits', () => {
		const parsed = parseInstant('2026-09-11T12:00:00.123456+02:00');
		expect(parsed).not.toBeNull();
		expect(dateValue(parsed as Date)).toBe('2026-09-11');
	});

	it('parses a space-separated datetime', () => {
		const parsed = parseInstant('2026-09-11 12:00:00.123456+02:00');
		expect(parsed).not.toBeNull();
		expect(dateValue(parsed as Date)).toBe('2026-09-11');
	});

	it('does not throw on an invalid Date', () => {
		expect(dateValue(new Date('not-a-date'))).toBe('');
		expect(parseInstant('not-a-date')).toBeNull();
		expect(parseInstant('')).toBeNull();
	});
});
