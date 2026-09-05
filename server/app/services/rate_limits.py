from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import Depends, HTTPException, Request, status

from app.config import Settings, get_settings
from app.deps import get_current_user
from app.models.user import User

RATE_LIMITED = "Too many requests. Try again later."


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._attempts: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def retry_after(
        self,
        scope: str,
        client_key: str,
        limit: int,
        window_seconds: int,
        *,
        now: float | None = None,
    ) -> int | None:
        current = monotonic() if now is None else now
        cutoff = current - window_seconds
        key = (scope, client_key)
        with self._lock:
            attempts = self._attempts[key]
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()
            if len(attempts) >= limit:
                return max(1, int(attempts[0] + window_seconds - current) + 1)
            attempts.append(current)
        return None

    def clear(self) -> None:
        with self._lock:
            self._attempts.clear()


auth_rate_limiter = InMemoryRateLimiter()
ai_rate_limiter = InMemoryRateLimiter()


def client_key(request: Request) -> str:
    if request.client is None:
        return "unknown"
    return request.client.host


def enforce_auth_rate_limit(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> None:
    if not settings.rate_limiting_enabled:
        return
    retry_after = auth_rate_limiter.retry_after(
        request.url.path,
        client_key(request),
        settings.auth_rate_limit_requests,
        settings.auth_rate_limit_window_seconds,
    )
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=RATE_LIMITED,
            headers={"Retry-After": str(retry_after)},
        )


def enforce_ai_rate_limit(
    request: Request,
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> None:
    if not settings.rate_limiting_enabled:
        return
    retry_after = ai_rate_limiter.retry_after(
        request.url.path,
        str(user.id),
        settings.ai_rate_limit_requests,
        settings.ai_rate_limit_window_seconds,
    )
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=RATE_LIMITED,
            headers={"Retry-After": str(retry_after)},
        )
