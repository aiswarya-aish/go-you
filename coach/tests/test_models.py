from dataclasses import FrozenInstanceError

import pytest

from goyou_coach.models import Session, SetLog


# The best e1RM of a session is the highest estimate among its sets:
# 8 reps at 80 kg -> 101.33, 7 reps at 80 kg -> 98.67, so 101.33 wins.
def test_best_e1rm_picks_the_strongest_set():
    session = Session(3, (SetLog(8, 80), SetLog(7, 80)))
    assert session.best_e1rm() == pytest.approx(101.333, abs=0.001)


# Two sets with the same numbers are equal (a dataclass gives you this for free).
def test_sets_with_same_values_are_equal():
    assert SetLog(8, 80) == SetLog(8, 80)
    assert SetLog(8, 80) != SetLog(7, 80)


# top_set is the heaviest set.
def test_top_set_is_the_heaviest():
    session = Session(0, (SetLog(10, 60), SetLog(5, 100), SetLog(8, 80)))
    assert session.top_set() == SetLog(5, 100)


# When weights tie, the set with more reps wins.
def test_top_set_breaks_ties_by_reps():
    session = Session(0, (SetLog(6, 80), SetLog(8, 80), SetLog(7, 80)))
    assert session.top_set() == SetLog(8, 80)


# A past set is a fact: it must not be editable after creation.
def test_set_is_frozen():
    s = SetLog(8, 80)
    with pytest.raises(FrozenInstanceError):
        s.reps = 10


def test_session_is_frozen():
    session = Session(0, (SetLog(8, 80),))
    with pytest.raises(FrozenInstanceError):
        session.day = 5


# A session with no sets makes no sense, so it should be refused when created.
def test_empty_session_is_rejected():
    with pytest.raises(ValueError):
        Session(0, ())
