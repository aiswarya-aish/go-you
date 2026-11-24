from fastapi import FastAPI
from pydantic import BaseModel, Field

from goyou_coach.analysis import is_plateaued
from goyou_coach.models import Session, SetLog


class SetIn(BaseModel):
    reps: int = Field(ge=1, le=1000)
    weight: float = Field(ge=0, le=2000)  # kilograms


class SessionIn(BaseModel):
    day: int
    sets: list[SetIn] = Field(min_length=1)


class PlateauRequest(BaseModel):
    sessions: list[SessionIn]
    window: int = Field(default=4, ge=1, le=20)


app = FastAPI(title="GO-YOU Coach")


@app.get("/health")
def health():
    return {"status": "ok"}


class PlateauResponse(BaseModel):
    plateaued: bool
    sessions_seen: int


@app.post("/plateau", response_model=PlateauResponse)
def plateau(req: PlateauRequest):
    # Turn the validated request objects into the coach's own classes.
    sessions = [
        Session(s.day, tuple(SetLog(x.reps, x.weight) for x in s.sets))
        for s in req.sessions
    ]
    return PlateauResponse(
        plateaued=is_plateaued(sessions, window=req.window),
        sessions_seen=len(sessions),
    )


