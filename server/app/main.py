from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.routers import ai, auth, blocks, notes, state, tasks, users

settings = get_settings()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.client_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


@api.get("/health", tags=["system"])
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


api.include_router(auth.router)
api.include_router(users.router)
api.include_router(ai.router)
api.include_router(tasks.router)
api.include_router(blocks.router)
api.include_router(notes.router)
api.include_router(state.router)
app.include_router(api)
