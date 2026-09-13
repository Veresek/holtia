from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models.user import User
from app.schemas.auth import Credentials, RegisterRequest, ResetRequest, VerifyRequest
from app.schemas.user import UserRead
from app.services import auth as auth_service
from app.services.rate_limits import enforce_auth_rate_limit
from app.services.tokens import REFRESH_COOKIE

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=UserRead,
)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
) -> User:
    user, tokens = auth_service.register(
        db,
        settings,
        payload.email,
        payload.password,
        payload.timezone,
    )
    if tokens is not None:
        auth_service.set_session_cookies(response, tokens, settings)
    return user


@router.post("/login", response_model=UserRead)
def login(
    payload: Credentials,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
) -> User:
    user, tokens = auth_service.login(db, settings, payload.email, payload.password)
    auth_service.set_session_cookies(response, tokens, settings)
    return user


@router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
) -> None:
    tokens = auth_service.refresh(
        db,
        settings,
        request.cookies.get(REFRESH_COOKIE),
    )
    auth_service.set_session_cookies(response, tokens, settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    auth_service.logout(db, request.cookies.get(REFRESH_COOKIE))
    auth_service.clear_session_cookies(response, settings)


@router.post("/verify", response_model=UserRead)
def verify(
    payload: VerifyRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
) -> User:
    user, tokens = auth_service.verify(
        db,
        settings,
        payload.email,
        payload.instance_code,
    )
    auth_service.set_session_cookies(response, tokens, settings)
    return user


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset(
    payload: ResetRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _rate_limit: None = Depends(enforce_auth_rate_limit),
) -> None:
    auth_service.reset_password(
        db,
        settings,
        payload.email,
        payload.instance_code,
        payload.new_password,
    )
