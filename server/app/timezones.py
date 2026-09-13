from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "Europe/Warsaw"
IANA_TIMEZONE_MAX_LENGTH = 64


def parse_timezone(value: str) -> str:
    name = value.strip()
    if not name:
        raise ValueError("Timezone cannot be empty.")
    if len(name) > IANA_TIMEZONE_MAX_LENGTH:
        raise ValueError(
            f"Timezone cannot exceed {IANA_TIMEZONE_MAX_LENGTH} characters."
        )
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, KeyError) as exc:
        raise ValueError(f"Unknown timezone: {name}") from exc
    return name


def resolve_timezone(value: str | None, fallback: str) -> str:
    if value is None or not value.strip():
        return fallback
    try:
        return parse_timezone(value)
    except ValueError:
        return fallback


def zoneinfo_of(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, KeyError):
        return ZoneInfo(DEFAULT_TIMEZONE)


def today_in_timezone(name: str) -> date:
    return datetime.now(zoneinfo_of(name)).date()
