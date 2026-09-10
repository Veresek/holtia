import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, stubSignedIn } from '../test/api';
import { stubAroundNowSlotHeight } from '../test/preview';
import { renderPage } from '../test/render';
import { aroundNowWindow, warsawDateValue } from '../time';
import type { Note, Task, TimeBlock } from '../types';
import { HomePage } from './HomePage';

function todayValue() {
	return warsawDateValue(new Date());
}

function todayTask(overrides: Partial<Task> = {}): Task {
	return {
		id: '22222222-2222-2222-2222-222222222222',
		title: 'Plan today',
		description: '',
		done: false,
		date: todayValue(),
		timeBlockId: null,
		order: 0,
		createdAt: new Date().toISOString(),
		...overrides,
	};
}

describe('HomePage tasks', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('uses Warsaw time for the greeting and date', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-31T22:30:00.000Z'));
		stubSignedIn();

		renderPage(<HomePage />);

		expect(
			screen.getByRole('heading', { name: 'Good night.' }),
		).toBeInTheDocument();
		expect(screen.getByText(/Tuesday, September 1/)).toBeInTheDocument();
	});

	it('orders mobile review sections around now, tasks, then notes', async () => {
		stubSignedIn();
		renderPage(<HomePage />);

		await screen.findByRole('button', { name: /Add your first task/ });
		const headings = screen
			.getAllByRole('heading', { level: 2 })
			.map(heading => heading.textContent);

		expect(headings).toEqual(['Around now', 'Today’s tasks', 'Recent notes']);
		expect(
			screen.getByRole('list', { name: 'Around now' }),
		).toBeInTheDocument();
		expect(screen.getByText('Now')).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: /Add your first note/ }),
		).toBeInTheDocument();
	});

	it('shows the four most recently edited notes', async () => {
		const notes: Note[] = Array.from({ length: 5 }, (_, index) => ({
			id: `00000000-0000-0000-0000-00000000000${index}`,
			title: `Note ${index + 1}`,
			markdown: '',
			taskId: null,
			timeBlockId: null,
			updatedAt: `2026-09-01T0${index}:00:00Z`,
		}));
		stubSignedIn({
			'GET /notes': () => jsonResponse(notes),
		});

		renderPage(<HomePage />);

		expect(await screen.findByText('Note 5')).toBeInTheDocument();
		expect(screen.getByText('Note 4')).toBeInTheDocument();
		expect(screen.getByText('Note 3')).toBeInTheDocument();
		expect(screen.getByText('Note 2')).toBeInTheDocument();
		expect(screen.queryByText('Note 1')).not.toBeInTheDocument();
	});

	it('edits and deletes a note from the actions menu', async () => {
		const note: Note = {
			id: '00000000-0000-0000-0000-000000000001',
			title: 'Morning idea',
			markdown: 'Start small.',
			taskId: null,
			timeBlockId: null,
			updatedAt: '2026-09-01T10:00:00Z',
		};
		let patchBody: Record<string, unknown> | undefined;
		stubSignedIn({
			'GET /notes': () => jsonResponse([note]),
			[`PATCH /notes/${note.id}`]: init => {
				patchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
				return jsonResponse({
					...note,
					...patchBody,
					updatedAt: '2026-09-01T11:00:00Z',
				});
			},
			[`DELETE /notes/${note.id}`]: () => new Response(null, { status: 204 }),
		});
		renderPage(<HomePage />);

		fireEvent.click(
			await screen.findByRole('button', { name: 'Actions for Morning idea' }),
		);
		fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
		expect(
			screen.getByRole('dialog', { name: 'Edit note' }),
		).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText('Title'), {
			target: { value: 'Evening idea' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(await screen.findByText('Evening idea')).toBeInTheDocument();
		expect(patchBody).toMatchObject({ title: 'Evening idea' });

		fireEvent.click(
			screen.getByRole('button', { name: 'Actions for Evening idea' }),
		);
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
		expect(
			screen.getByRole('dialog', { name: 'Delete Evening idea?' }),
		).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Delete note' }));
		await waitFor(() =>
			expect(screen.queryByText('Evening idea')).not.toBeInTheDocument(),
		);
	});

	it('shows today’s open tasks and hides undated ones', async () => {
		const task = todayTask();
		const undated = todayTask({
			id: '33333333-3333-3333-3333-333333333333',
			title: 'Review the inbox',
			date: null,
		});
		stubSignedIn({
			'GET /tasks': () => jsonResponse([task, undated]),
		});

		renderPage(<HomePage />);

		expect(await screen.findByText(task.title)).toBeInTheDocument();
		expect(screen.queryByText(undated.title)).not.toBeInTheDocument();
	});

	it('shows the task description instead of the date', async () => {
		const task = {
			...todayTask(),
			description: 'Write the first paragraph.',
		};
		stubSignedIn({
			'GET /tasks': () => jsonResponse([task]),
		});

		renderPage(<HomePage />);

		expect(await screen.findByText(task.title)).toBeInTheDocument();
		expect(screen.getByText(task.description)).toBeInTheDocument();
		expect(screen.queryByText('No date')).not.toBeInTheDocument();
		expect(
			screen.queryByText(
				new Intl.DateTimeFormat('en', {
					month: 'short',
					day: 'numeric',
					year: 'numeric',
				}).format(new Date(`${todayValue()}T00:00:00`)),
			),
		).not.toBeInTheDocument();
	});

	it('hides completed tasks and shows at most four open ones', async () => {
		const tasks = Array.from({ length: 6 }, (_, index) =>
			todayTask({
				id: `22222222-2222-2222-2222-22222222222${index}`,
				title: `Task ${index + 1}`,
				done: index === 0,
				order: index,
			}),
		);
		stubSignedIn({
			'GET /tasks': () => jsonResponse(tasks),
		});

		renderPage(<HomePage />);

		expect(await screen.findByText('Task 2')).toBeInTheDocument();
		expect(screen.getByText('Task 3')).toBeInTheDocument();
		expect(screen.getByText('Task 4')).toBeInTheDocument();
		expect(screen.getByText('Task 5')).toBeInTheDocument();
		expect(screen.queryByText('Task 1')).not.toBeInTheDocument();
		expect(screen.queryByText('Task 6')).not.toBeInTheDocument();
		expect(screen.getByText('5 tasks')).toBeInTheDocument();

		const toggle = screen.getByRole('button', {
			name: 'Show more of today’s tasks',
		});
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(
			screen.queryByRole('link', { name: 'See all today’s tasks' }),
		).not.toBeInTheDocument();

		fireEvent.click(toggle);
		expect(screen.getByText('Task 6')).toBeInTheDocument();
		expect(toggle).toHaveAttribute('aria-expanded', 'true');
		expect(toggle).toHaveAccessibleName('Show fewer of today’s tasks');

		fireEvent.click(toggle);
		expect(screen.queryByText('Task 6')).not.toBeInTheDocument();
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
	});

	it('lets the next open task in when one of the four is completed', async () => {
		const tasks = Array.from({ length: 5 }, (_, index) =>
			todayTask({
				id: `22222222-2222-2222-2222-22222222222${index}`,
				title: `Task ${index + 1}`,
				order: index,
			}),
		);
		stubSignedIn({
			'GET /tasks': () => jsonResponse(tasks),
			[`PATCH /tasks/${tasks[0].id}`]: () =>
				jsonResponse({ ...tasks[0], done: true }),
		});

		renderPage(<HomePage />);

		expect(await screen.findByText('Task 1')).toBeInTheDocument();
		expect(screen.queryByText('Task 5')).not.toBeInTheDocument();

		fireEvent.click(
			screen.getByRole('checkbox', { name: 'Mark Task 1 as done' }),
		);

		expect(await screen.findByText('Task 5')).toBeInTheDocument();
		expect(screen.queryByText('Task 1')).not.toBeInTheDocument();
		expect(screen.getByText('Task 2')).toBeInTheDocument();
		expect(screen.getByText('Task 3')).toBeInTheDocument();
		expect(screen.getByText('Task 4')).toBeInTheDocument();
	});

	it('shows loading while today’s task request is pending', () => {
		stubSignedIn({
			'GET /tasks': () => new Promise<Response>(() => undefined),
		});

		renderPage(<HomePage />);

		expect(screen.getByText('Loading today’s tasks…')).toBeInTheDocument();
	});

	it('shows an error, retries, and reaches the empty CTA', async () => {
		let attempts = 0;
		stubSignedIn({
			'GET /tasks': () => {
				attempts += 1;
				return attempts === 1
					? jsonResponse({ detail: 'Today could not be loaded.' }, 500)
					: jsonResponse([]);
			},
		});
		renderPage(<HomePage />);

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Today could not be loaded.',
		);
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(
			await screen.findByRole('button', { name: /Add your first task/ }),
		).toBeInTheDocument();
		expect(attempts).toBe(2);
	});

	it('stays empty when today has no open tasks', async () => {
		const otherTask = todayTask({
			id: '33333333-3333-3333-3333-333333333333',
			title: 'Review the inbox',
			date: null,
		});
		const doneToday = todayTask({
			id: '44444444-4444-4444-4444-444444444444',
			title: 'Already done',
			done: true,
		});
		stubSignedIn({
			'GET /tasks': () => jsonResponse([otherTask, doneToday]),
		});

		renderPage(<HomePage />);

		expect(
			await screen.findByRole('button', { name: /Add your first task/ }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Add task' }),
		).not.toBeInTheDocument();
		expect(screen.queryByText(doneToday.title)).not.toBeInTheDocument();
		expect(screen.queryByText(otherTask.title)).not.toBeInTheDocument();
	});

	it('queries today, creates a task, and toggles it', async () => {
		const created = todayTask();
		let createBody: Record<string, unknown> | undefined;
		let toggleBody: Record<string, unknown> | undefined;
		stubSignedIn({
			'GET /tasks': () => jsonResponse([]),
			'POST /tasks': init => {
				createBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
				return jsonResponse({ ...created, title: createBody.title }, 201);
			},
			[`PATCH /tasks/${created.id}`]: init => {
				toggleBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
				return jsonResponse({ ...created, ...toggleBody });
			},
		});
		renderPage(<HomePage />);

		fireEvent.click(
			await screen.findByRole('button', { name: /Add your first task/ }),
		);
		expect(
			screen.getByRole('dialog', { name: 'Add task' }),
		).toBeInTheDocument();
		expect(screen.getByLabelText('Description')).toBeInTheDocument();
		expect(screen.getByLabelText('Date')).toHaveValue(todayValue());
		fireEvent.change(screen.getByLabelText('Title'), {
			target: { value: 'Choose today’s focus' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

		expect(await screen.findByText('Choose today’s focus')).toBeInTheDocument();
		expect(createBody).toMatchObject({
			title: 'Choose today’s focus',
			date: todayValue(),
		});

		fireEvent.click(
			screen.getByRole('checkbox', {
				name: 'Mark Choose today’s focus as done',
			}),
		);
		await waitFor(() => expect(toggleBody).toEqual({ done: true }));
		expect(screen.queryByText('Choose today’s focus')).not.toBeInTheDocument();
	});

	it('clears today’s default date so the task lives in Tasks', async () => {
		let createBody: Record<string, unknown> | undefined;
		stubSignedIn({
			'GET /tasks': () => jsonResponse([]),
			'POST /tasks': init => {
				createBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
				return jsonResponse(
					{
						...todayTask({
							title: String(createBody.title),
							date: (createBody.date as string | null) ?? null,
						}),
					},
					201,
				);
			},
		});
		renderPage(<HomePage />);

		fireEvent.click(
			await screen.findByRole('button', { name: /Add your first task/ }),
		);
		expect(screen.getByLabelText('Date')).toHaveValue(todayValue());
		fireEvent.click(screen.getByRole('button', { name: 'No date' }));
		expect(screen.getByLabelText('Date')).toHaveValue('');
		expect(
			screen.getByText('Tasks with no date live in Tasks, not on Home.'),
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'No date' })).toBeDisabled();
		fireEvent.change(screen.getByLabelText('Title'), {
			target: { value: 'Inbox later' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

		await waitFor(() =>
			expect(createBody).toMatchObject({
				title: 'Inbox later',
				date: null,
			}),
		);
		expect(screen.queryByText('Inbox later')).not.toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: /Add your first task/ }),
		).toBeInTheDocument();
	});

	it('edits and deletes a task from the actions menu', async () => {
		const task = todayTask();
		const patchBodies: Record<string, unknown>[] = [];
		stubSignedIn({
			'GET /tasks': () => jsonResponse([task]),
			[`PATCH /tasks/${task.id}`]: init => {
				const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
				patchBodies.push(body);
				return jsonResponse({ ...task, ...body });
			},
			[`DELETE /tasks/${task.id}`]: () => new Response(null, { status: 204 }),
		});
		renderPage(<HomePage />);

		fireEvent.click(
			await screen.findByRole('button', { name: `Actions for ${task.title}` }),
		);
		fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
		expect(
			screen.getByRole('dialog', { name: 'Edit task' }),
		).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText('Title'), {
			target: { value: 'Plan the morning' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(await screen.findByText('Plan the morning')).toBeInTheDocument();
		expect(patchBodies[0]).toMatchObject({ title: 'Plan the morning' });

		fireEvent.click(
			screen.getByRole('button', { name: 'Actions for Plan the morning' }),
		);
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
		expect(
			screen.getByRole('dialog', { name: 'Delete Plan the morning?' }),
		).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
		await waitFor(() =>
			expect(screen.queryByText('Plan the morning')).not.toBeInTheDocument(),
		);
	});
});

function sampleHomeBlock(overrides: Partial<TimeBlock> = {}): TimeBlock {
	return {
		id: '44444444-4444-4444-4444-444444444444',
		title: 'Deep work',
		description: '',
		date: todayValue(),
		start: '09:00:00',
		end: '11:00:00',
		recurrence: 'none',
		recurrenceDays: [],
		...overrides,
	};
}

describe('HomePage around now', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('shows nearby hour labels on an empty window', async () => {
		stubSignedIn();
		renderPage(<HomePage />);

		const preview = await screen.findByRole('list', { name: 'Around now' });
		expect(within(preview).getByText('Now')).toBeInTheDocument();
		expect(within(preview).queryByText('Deep work')).not.toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'Add block' }),
		).toBeInTheDocument();
	});

	it('shows more upcoming hours when today’s tasks are taller', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
		const spy = stubAroundNowSlotHeight(400);
		try {
			stubSignedIn();
			renderPage(<HomePage />);

			const preview = await screen.findByRole('list', { name: 'Around now' });
			expect(within(preview).getByText('Now')).toBeInTheDocument();
			expect(within(preview).getByText('16:00')).toBeInTheDocument();
			expect(within(preview).getByText('20:00')).toBeInTheDocument();
		} finally {
			spy.mockRestore();
		}
	});

	it('keeps the four-hour window when today’s tasks are shorter', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
		const spy = stubAroundNowSlotHeight(80);
		try {
			stubSignedIn();
			renderPage(<HomePage />);

			const preview = await screen.findByRole('list', { name: 'Around now' });
			expect(within(preview).getByText('Now')).toBeInTheDocument();
			expect(within(preview).getByText('14:00')).toBeInTheDocument();
			expect(within(preview).queryByText('16:00')).not.toBeInTheDocument();
		} finally {
			spy.mockRestore();
		}
	});

	it('keeps the three-hour look-ahead on a narrow viewport', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
		const spy = stubAroundNowSlotHeight(400, false);
		try {
			stubSignedIn();
			renderPage(<HomePage />);

			const preview = await screen.findByRole('list', { name: 'Around now' });
			expect(within(preview).getByText('Now')).toBeInTheDocument();
			expect(within(preview).getByText('14:00')).toBeInTheDocument();
			expect(within(preview).queryByText('16:00')).not.toBeInTheDocument();
			expect(within(preview).queryByText('20:00')).not.toBeInTheDocument();
		} finally {
			spy.mockRestore();
		}
	});

	it('creates a nearby block from the header action', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-01T07:00:00.000Z'));
		const created = sampleHomeBlock({ title: 'Writing' });
		let submitted: Record<string, unknown> | undefined;
		stubSignedIn({
			'POST /blocks': init => {
				submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
				return jsonResponse(
					{ ...created, title: String(submitted.title) },
					201,
				);
			},
		});
		renderPage(<HomePage />);

		fireEvent.click(await screen.findByRole('button', { name: 'Add block' }));
		expect(
			screen.getByRole('dialog', { name: 'Add block' }),
		).toBeInTheDocument();
		expect(screen.getByLabelText('Date')).toHaveValue(todayValue());
		fireEvent.change(screen.getByLabelText('Title'), {
			target: { value: 'Writing' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Create block' }));

		expect(await screen.findByText('Writing')).toBeInTheDocument();
		expect(submitted).toMatchObject({
			title: 'Writing',
			date: todayValue(),
			start: '09:00:00',
			end: '10:00:00',
			recurrence: 'none',
		});
	});

	it('shows a block that overlaps the window and hides one that does not', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-01T07:00:00.000Z'));
		const window = aroundNowWindow(new Date());
		const inside = sampleHomeBlock({
			date: window.dates[0],
			start: '08:30:00',
			end: '09:30:00',
		});
		const outside = sampleHomeBlock({
			id: '55555555-5555-5555-5555-555555555555',
			title: 'Evening walk',
			date: window.dates[0],
			start: '18:00:00',
			end: '19:00:00',
		});
		stubSignedIn({
			'GET /blocks': () => jsonResponse([inside, outside]),
		});

		renderPage(<HomePage />);

		expect(await screen.findByText('Deep work')).toBeInTheDocument();
		expect(screen.queryByText('Evening walk')).not.toBeInTheDocument();
	});

	it('shows blocks from both days when the window crosses midnight', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-08-31T22:30:00.000Z'));
		const window = aroundNowWindow(new Date());
		expect(window.dates).toEqual(['2026-08-31', '2026-09-01']);
		stubSignedIn({
			'GET /blocks': () =>
				jsonResponse([
					sampleHomeBlock({
						date: '2026-08-31',
						start: '23:00:00',
						end: '23:45:00',
						title: 'Wind down',
					}),
					sampleHomeBlock({
						id: '66666666-6666-6666-6666-666666666666',
						date: '2026-09-01',
						start: '02:00:00',
						end: '03:00:00',
						title: 'Night notes',
					}),
				]),
		});

		renderPage(<HomePage />);

		expect(await screen.findByText('Wind down')).toBeInTheDocument();
		expect(screen.getByText('Night notes')).toBeInTheDocument();
	});

	it('shows yesterday’s overnight block in a morning window', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
		const window = aroundNowWindow(new Date());
		expect(window.dates).toEqual(['2026-09-01']);
		stubSignedIn({
			'GET /blocks': () =>
				jsonResponse([
					sampleHomeBlock({
						date: '2026-08-31',
						start: '22:00:00',
						end: '06:00:00',
						title: 'Night shift',
					}),
				]),
		});

		renderPage(<HomePage />);

		expect(await screen.findByText('Night shift')).toBeInTheDocument();
		expect(screen.getByText('22:00–06:00')).toBeInTheDocument();
	});

	it('retries a failed nearby-block request', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-01T10:00:00.000Z'));
		let attempts = 0;
		stubSignedIn({
			'GET /blocks': () => {
				attempts += 1;
				return attempts === 1
					? jsonResponse({ detail: 'Nearby blocks could not be loaded.' }, 500)
					: jsonResponse([]);
			},
		});
		renderPage(<HomePage />);

		const aroundNow = await screen.findByRole('region', { name: 'Around now' });
		expect(await within(aroundNow).findByRole('alert')).toHaveTextContent(
			'Nearby blocks could not be loaded.',
		);
		fireEvent.click(within(aroundNow).getByRole('button', { name: 'Retry' }));
		expect(
			await screen.findByRole('list', { name: 'Around now' }),
		).toBeInTheDocument();
		expect(attempts).toBe(2);
	});

	it('shows a pinned task on a nearby block', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-01T07:00:00.000Z'));
		const window = aroundNowWindow(new Date());
		const block = sampleHomeBlock({
			date: window.dates[0],
			start: '08:30:00',
			end: '09:30:00',
		});
		stubSignedIn({
			'GET /blocks': () => jsonResponse([block]),
			'GET /tasks': () =>
				jsonResponse([
					todayTask({
						title: 'Draft the outline',
						date: window.dates[0],
						timeBlockId: block.id,
					}),
				]),
		});
		renderPage(<HomePage />);

		const preview = await screen.findByRole('list', { name: 'Around now' });
		expect(within(preview).getByText('Draft the outline')).toBeInTheDocument();
	});
});
