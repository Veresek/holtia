import { useLayoutEffect, useRef, useState } from 'react';

import { BlockForm } from '../components/BlockForm';
import { DayGrid } from '../components/DayGrid';
import { Dialog } from '../components/Dialog';
import { EmptyCta } from '../components/EmptyCta';
import { Icon } from '../components/Icon';
import { Masonry } from '../components/Masonry';
import { NoteCard } from '../components/NoteCard';
import { NoteForm } from '../components/NoteForm';
import { TaskForm } from '../components/TaskForm';
import { TaskItem } from '../components/TaskItem';
import { notePinsByBlock, taskPinsByBlockOnDate } from '../assignments';
import { useData } from '../data/DataProvider';
import { useBlocksAroundNow } from '../hooks/useBlocksAroundNow';
import { useNotes } from '../hooks/useNotes';
import { useNow } from '../hooks/useNow';
import { useTasks } from '../hooks/useTasks';
import { useTimeZone } from '../hooks/useTimeZone';
import {
	AROUND_NOW_GROW_MEDIA,
	AROUND_NOW_GROW_MIN_WIDTH,
	AROUND_NOW_MIN_LOOKAHEAD_MINUTES,
	AROUND_NOW_PIXELS_PER_HOUR,
	aroundNowLookAheadMinutes,
	formatTimeLabel,
	dateValue,
	greeting,
} from '../time';

const HOME_OPEN_TASK_LIMIT = 4;

export function HomePage() {
	const now = useNow();
	const timeZone = useTimeZone();
	const dateValueToday = dateValue(now, timeZone);
	const tasksBodyRef = useRef<HTMLDivElement>(null);
	const [lookAheadMinutes, setLookAheadMinutes] = useState(
		AROUND_NOW_MIN_LOOKAHEAD_MINUTES,
	);

	useLayoutEffect(() => {
		const body = tasksBodyRef.current;
		if (!body) {
			return;
		}

		const media =
			typeof window.matchMedia === 'function'
				? window.matchMedia(AROUND_NOW_GROW_MEDIA)
				: null;

		function applyLookAhead() {
			const grows = media
				? media.matches
				: window.innerWidth >= AROUND_NOW_GROW_MIN_WIDTH;
			if (!grows) {
				setLookAheadMinutes(current =>
					current === AROUND_NOW_MIN_LOOKAHEAD_MINUTES
						? current
						: AROUND_NOW_MIN_LOOKAHEAD_MINUTES,
				);
				return;
			}
			const height = tasksBodyRef.current?.getBoundingClientRect().height ?? 0;
			const next = aroundNowLookAheadMinutes(height);
			setLookAheadMinutes(current => (current === next ? current : next));
		}

		applyLookAhead();
		window.addEventListener('resize', applyLookAhead);
		media?.addEventListener('change', applyLookAhead);
		if (typeof ResizeObserver === 'undefined') {
			return () => {
				window.removeEventListener('resize', applyLookAhead);
				media?.removeEventListener('change', applyLookAhead);
			};
		}
		const observer = new ResizeObserver(applyLookAhead);
		observer.observe(body);
		return () => {
			window.removeEventListener('resize', applyLookAhead);
			media?.removeEventListener('change', applyLookAhead);
			observer.disconnect();
		};
	}, []);
	const { tasks, loading, error, retry, createTask, updateTask, deleteTask } =
		useTasks(dateValueToday);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [expandedTasks, setExpandedTasks] = useState(false);
	const openTasks = tasks.filter(task => !task.done);
	const hasMoreTasks = openTasks.length > HOME_OPEN_TASK_LIMIT;
	const visibleTasks = expandedTasks
		? openTasks
		: openTasks.slice(0, HOME_OPEN_TASK_LIMIT);
	const {
		notes,
		loading: notesLoading,
		error: notesError,
		retry: retryNotes,
		createNote,
		updateNote,
		deleteNote,
	} = useNotes();
	const [creatingNote, setCreatingNote] = useState(false);
	const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
	const editingNote = notes.find(note => note.id === editingNoteId);
	const {
		occurrences,
		rangeStartMinutes,
		rangeEndMinutes,
		nowMinutes,
		loading: blocksLoading,
		error: blocksError,
		retry: retryBlocks,
		createBlock,
	} = useBlocksAroundNow(lookAheadMinutes);
	const { tasks: allTasks, blocks, notes: allNotes } = useData();
	const editing = allTasks.find(task => task.id === editingId);
	const aroundNowTasksByBlock = Object.fromEntries(
		occurrences.map(occurrence => [
			occurrence.block.id,
			taskPinsByBlockOnDate(allTasks, occurrence.occurrenceDate)[
				occurrence.block.id
			] ?? [],
		]),
	);
	const aroundNowNotesByBlock = notePinsByBlock(allNotes);
	const [creatingBlock, setCreatingBlock] = useState(false);
	const dateAndTime = new Intl.DateTimeFormat('en', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone,
	}).format(now);

	return (
		<div className='mx-auto w-full min-w-0 max-w-6xl px-4 py-8 md:px-8 md:py-12'>
			<header>
				<p className='text-sm text-ink-soft'>{dateAndTime}</p>
				<h1 className='mt-2 font-serif text-3xl md:text-4xl'>
					{greeting(now, timeZone)}
				</h1>
				<p className='mt-2 text-sm text-ink-soft'>
					Start with one thing that matters today.
				</p>
			</header>

			<div className='mt-8 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]'>
				<section
					aria-busy={blocksLoading}
					aria-labelledby='around-now-heading'
					className='min-w-0 lg:col-start-2 lg:row-start-1'>
					<div className='mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2'>
						<h2 className='font-medium' id='around-now-heading'>
							Around now
						</h2>
						<button
							className='shrink-0 rounded-md bg-moss px-3 py-1.5 text-sm font-medium text-paper-raised hover:bg-moss-hover'
							onClick={() => setCreatingBlock(true)}
							type='button'>
							Add block
						</button>
					</div>
					{blocksError ? (
						<div
							className='mb-3 flex items-center justify-between gap-4 rounded-md border border-rust/40 bg-paper-raised p-4 text-sm text-rust'
							role='alert'>
							<span>{blocksError}</span>
							<button
								className='rounded-md border border-rust/40 px-3 py-1.5'
								onClick={() => void retryBlocks()}
								type='button'>
								Retry
							</button>
						</div>
					) : null}
					{creatingBlock ? (
						<Dialog
							onClose={() => setCreatingBlock(false)}
							title='Add block'
							wide>
							<BlockForm
								defaultDate={dateValueToday}
								onCancel={() => setCreatingBlock(false)}
								onSubmit={async payload => {
									await createBlock(payload);
									setCreatingBlock(false);
								}}
								submitLabel='Create block'
							/>
						</Dialog>
					) : null}
					<div className='min-h-40'>
						{blocksLoading ? (
							<p className='text-sm text-ink-soft' role='status'>
								Loading nearby blocks…
							</p>
						) : (
							<DayGrid
								blocks={occurrences.map(occurrence => ({
									id: occurrence.block.id,
									title: occurrence.block.title,
									description: occurrence.block.description,
									startLabel: formatTimeLabel(occurrence.block.start),
									endLabel: formatTimeLabel(occurrence.block.end),
									startMinutes: occurrence.startMinutes,
									endMinutes: occurrence.endMinutes,
									color: occurrence.block.color,
								}))}
								label='Around now'
								notesByBlock={aroundNowNotesByBlock}
								nowMinutes={nowMinutes}
								onSelectNote={id => {
									setCreatingNote(false);
									setEditingNoteId(id);
								}}
								onSelectTask={id => {
									setCreating(false);
									setEditingId(id);
								}}
								pixelsPerHour={AROUND_NOW_PIXELS_PER_HOUR}
								rangeEndMinutes={rangeEndMinutes}
								rangeStartMinutes={rangeStartMinutes}
								readOnly
								tasksByBlock={aroundNowTasksByBlock}
							/>
						)}
					</div>
				</section>

				<section
					aria-busy={loading}
					aria-labelledby='todays-tasks-heading'
					className='min-w-0 lg:col-start-1 lg:row-start-1'>
					<div className='mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2'>
						<h2 className='font-medium' id='todays-tasks-heading'>
							Today’s tasks
						</h2>
						<div className='flex items-center gap-3'>
							<span className='text-xs text-ink-faint'>
								{openTasks.length} {openTasks.length === 1 ? 'task' : 'tasks'}
							</span>
							{openTasks.length > 0 ? (
								<button
									className='shrink-0 rounded-md bg-moss px-3 py-1.5 text-sm font-medium text-paper-raised hover:bg-moss-hover'
									onClick={() => {
										setEditingId(null);
										setCreating(true);
									}}
									type='button'>
									Add task
								</button>
							) : null}
						</div>
					</div>
					{error ? (
						<div
							className='mb-3 flex items-center justify-between gap-4 rounded-md border border-rust/40 bg-paper-raised p-4 text-sm text-rust'
							role='alert'>
							<span>{error}</span>
							<button
								className='rounded-md border border-rust/40 px-3 py-1.5'
								onClick={() => void retry()}
								type='button'>
								Retry
							</button>
						</div>
					) : null}
					{creating ? (
						<Dialog onClose={() => setCreating(false)} title='Add task'>
							<TaskForm
								blocks={blocks}
								onCancel={() => setCreating(false)}
								onSubmit={async payload => {
									await createTask(payload);
									setCreating(false);
								}}
								submitLabel='Create task'
							/>
						</Dialog>
					) : null}
					{editing ? (
						<Dialog onClose={() => setEditingId(null)} title='Edit task'>
							<TaskForm
								blocks={blocks}
								initial={editing}
								onCancel={() => setEditingId(null)}
								onSubmit={async payload => {
									await updateTask(editing.id, payload);
									setEditingId(null);
								}}
								submitLabel='Save changes'
							/>
						</Dialog>
					) : null}
					<div>
						<div ref={tasksBodyRef}>
							{loading ? (
								<p className='text-sm text-ink-soft' role='status'>
									Loading today’s tasks…
								</p>
							) : openTasks.length === 0 ? (
								<EmptyCta
									description='Give today a clear starting point.'
									onClick={() => setCreating(true)}
									title='Add your first task'
								/>
							) : (
								<div className='space-y-2'>
									{visibleTasks.map(task => (
										<TaskItem
											block={
												task.timeBlockId
													? blocks.find(item => item.id === task.timeBlockId)
													: undefined
											}
											dense
											key={task.id}
											onDelete={() => deleteTask(task.id)}
											onEdit={() => {
												setCreating(false);
												setEditingId(task.id);
											}}
											onToggle={() =>
												updateTask(task.id, { done: !task.done })
											}
											showDate={false}
											task={task}
										/>
									))}
								</div>
							)}
						</div>
						{hasMoreTasks ? (
							<button
								aria-expanded={expandedTasks}
								aria-label={
									expandedTasks
										? 'Show fewer of today’s tasks'
										: 'Show more of today’s tasks'
								}
								className='relative mx-auto mt-1 flex rounded-md p-1.5 text-ink-soft hover:bg-paper hover:text-ink'
								onClick={() => setExpandedTasks(current => !current)}
								type='button'>
								<Icon
									className={[
										'size-5 transition-transform duration-150',
										expandedTasks ? 'rotate-180' : '',
									].join(' ')}
									name='chevronDown'
								/>
							</button>
						) : null}
					</div>
				</section>

				<section
					aria-busy={notesLoading}
					aria-labelledby='recent-notes-heading'
					className='min-w-0 lg:col-span-2 lg:row-start-2'>
					<div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
						<h2 className='font-medium' id='recent-notes-heading'>
							Recent notes
						</h2>
						<div className='flex items-center gap-3'>
							<span className='text-xs text-ink-faint'>
								{notes.length} {notes.length === 1 ? 'note' : 'notes'}
							</span>
							{notes.length > 0 ? (
								<button
									className='shrink-0 rounded-md bg-moss px-3 py-1.5 text-sm font-medium text-paper-raised hover:bg-moss-hover'
									onClick={() => {
										setEditingNoteId(null);
										setCreatingNote(true);
									}}
									type='button'>
									Add note
								</button>
							) : null}
						</div>
					</div>
					{notesError ? (
						<div
							className='mb-3 flex items-center justify-between gap-4 rounded-md border border-rust/40 bg-paper-raised p-4 text-sm text-rust'
							role='alert'>
							<span>{notesError}</span>
							<button
								className='rounded-md border border-rust/40 px-3 py-1.5'
								onClick={() => void retryNotes()}
								type='button'>
								Retry notes
							</button>
						</div>
					) : null}
					{creatingNote ? (
						<Dialog onClose={() => setCreatingNote(false)} title='Add note'>
							<NoteForm
								blocks={blocks}
								onCancel={() => setCreatingNote(false)}
								onSubmit={async payload => {
									await createNote(payload);
									setCreatingNote(false);
								}}
								submitLabel='Create note'
								tasks={allTasks}
							/>
						</Dialog>
					) : null}
					{editingNote ? (
						<Dialog onClose={() => setEditingNoteId(null)} title='Edit note'>
							<NoteForm
								blocks={blocks}
								initial={editingNote}
								onCancel={() => setEditingNoteId(null)}
								onSubmit={async payload => {
									await updateNote(editingNote.id, payload);
									setEditingNoteId(null);
								}}
								submitLabel='Save changes'
								tasks={allTasks}
							/>
						</Dialog>
					) : null}
					{notesLoading ? (
						<p className='text-sm text-ink-soft' role='status'>
							Loading recent notes…
						</p>
					) : notes.length === 0 ? (
						<EmptyCta
							description='Keep an idea close to the rest of your day.'
							onClick={() => setCreatingNote(true)}
							title='Add your first note'
						/>
					) : (
						<Masonry>
							{notes.slice(0, 4).map(note => (
								<NoteCard
									block={
										note.timeBlockId
											? blocks.find(item => item.id === note.timeBlockId)
											: undefined
									}
									compact
									key={note.id}
									note={note}
									onDelete={() => deleteNote(note.id)}
									onEdit={() => {
										setCreatingNote(false);
										setEditingNoteId(note.id);
									}}
									task={
										note.taskId
											? allTasks.find(item => item.id === note.taskId)
											: undefined
									}
								/>
							))}
						</Masonry>
					)}
				</section>
			</div>
		</div>
	);
}
