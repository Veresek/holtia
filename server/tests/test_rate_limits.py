from app.services.rate_limits import InMemoryRateLimiter


def test_expired_clients_are_forgotten() -> None:
    limiter = InMemoryRateLimiter()

    assert limiter.retry_after("login", "old", 5, 60, now=0) is None
    assert limiter.retry_after("login", "new", 5, 60, now=120) is None

    assert ("login", "old") not in limiter._attempts
    assert list(limiter._attempts[("login", "new")]) == [120]
    assert all(limiter._attempts.values())


def test_attempts_inside_the_window_still_count() -> None:
    limiter = InMemoryRateLimiter()

    assert limiter.retry_after("login", "same", 1, 60, now=0) is None
    limited = limiter.retry_after("login", "same", 1, 60, now=30)

    assert limited is not None
    assert ("login", "same") in limiter._attempts
