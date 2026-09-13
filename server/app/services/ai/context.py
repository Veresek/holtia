from datetime import date

from sqlalchemy.orm import Session

from app.models.user import User
from app.services.blocks import list_owned_blocks
from app.services.notes import list_owned_notes
from app.services.tasks import list_owned_tasks
from app.timezones import today_in_timezone

RECENT_NOTE_TITLES = 4

SYSTEM_PROMPT = """You are the Holtia assistant. Holtia is a personal command center for the day.

Timezone: {timezone}. Today is {today}.

You may only propose creating:
- tasks: title, optional description, optional date (YYYY-MM-DD). Omit the date for an undated task.
- notes: title and markdown. Notes have no date.
- one-off time blocks: title, optional description, date, start, and end as HH:MM. Never repeating.

Do not edit, delete, complete, pin, or guess missing times or dates. If the request is unclear, ask a short question and return empty tasks, notes, and blocks.
Call propose_day_changes with your reply and any items. Do not invent identifiers.
"""


def today_for_user(user: User) -> date:
    return today_in_timezone(user.timezone)


def format_time(value) -> str:
    return value.strftime("%H:%M")


def build_day_context(
    db: Session,
    user: User,
) -> str:
    today = today_for_user(user)
    tasks = list_owned_tasks(db, user.id, today)
    blocks = list_owned_blocks(db, user.id, today)
    notes = list_owned_notes(db, user.id)[:RECENT_NOTE_TITLES]
    lines = [f"Today is {today.isoformat()} ({user.timezone}).", ""]
    lines.append("Today's tasks:")
    if tasks:
        for task in tasks:
            mark = "x" if task.done else " "
            lines.append(f"- [{mark}] {task.title}")
    else:
        lines.append("- none")
    lines.append("")
    lines.append("Today's time blocks:")
    if blocks:
        for block in blocks:
            lines.append(
                f"- {block.title} {format_time(block.start)}–{format_time(block.end)}"
            )
    else:
        lines.append("- none")
    lines.append("")
    lines.append("Recent notes:")
    if notes:
        for note in notes:
            lines.append(f"- {note.title}")
    else:
        lines.append("- none")
    return "\n".join(lines)


def system_prompt(user: User) -> str:
    return SYSTEM_PROMPT.format(
        timezone=user.timezone,
        today=today_for_user(user).isoformat(),
    )


def user_prompt(prompt: str, context: str) -> str:
    return f"{context}\n\nRequest:\n{prompt}"
