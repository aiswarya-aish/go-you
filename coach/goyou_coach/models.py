from dataclasses import dataclass
from goyou_coach.lift import e1rm
@dataclass(frozen=True)
class SetLog:
    reps: int
    weight: float

@dataclass(frozen=True)
class Session:
    day: int
    sets: tuple[SetLog, ...]

    def best_e1rm(self):
        max_val = max([e1rm(s.weight, s.reps) for s in self.sets])
        return max_val

    def top_set(self):
        return max(self.sets, key=lambda s: (s.weight, s.reps))

    def __post_init__(self) -> None:
        if not self.sets:
            raise ValueError("a session needs at least one set")




