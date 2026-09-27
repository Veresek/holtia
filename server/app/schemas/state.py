from datetime import datetime

from app.schemas.base import ApiReadModel


class CollectionFingerprint(ApiReadModel):
    count: int
    updated_at: datetime | None
    pinned: int


class AppStateRead(ApiReadModel):
    tasks: CollectionFingerprint
    notes: CollectionFingerprint
    blocks: CollectionFingerprint
