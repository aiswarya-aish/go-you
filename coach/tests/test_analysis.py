import pytest

from goyou_coach.analysis import is_plateaued
from goyou_coach.models import Session, SetLog


# One 1-rep set per session. e1rm(w, 1) = w * 31/30, so scaling by 30/31
# makes each session's best_e1rm() equal the number we pass in.
def sessions_from(e1rms):
    return [Session(day, (SetLog(1, v * 30 / 31),)) for day, v in enumerate(e1rms)]


# Nothing in the last 4 sessions beats the earlier best (110): stalled.
def test_plateau_when_nothing_beats_the_earlier_best():
    assert is_plateaued(sessions_from([100, 105, 110, 109, 110, 108, 110]), window=4)


# A recent session set a new best (112 > 110): still progressing.
def test_no_plateau_when_a_recent_session_sets_a_new_best():
    assert not is_plateaued(sessions_from([100, 105, 110, 109, 110, 112]), window=4)


# 110.2 is only +0.18% over 110, inside the 0.5% tolerance: still a plateau.
def test_tiny_gain_inside_tolerance_still_counts_as_plateau():
    assert is_plateaued(sessions_from([100, 110, 110.2, 109, 110, 109]), window=4)


# A gain just past the tolerance (+1%) is real progress.
def test_gain_beyond_tolerance_is_not_a_plateau():
    assert not is_plateaued(sessions_from([100, 110, 109, 109, 109, 111.1]), window=4)


# With only `window` sessions there is nothing earlier to compare against.
def test_not_enough_history_is_not_a_plateau():
    assert not is_plateaued(sessions_from([100, 100, 100, 100]), window=4)


def test_no_sessions_is_not_a_plateau():
    assert not is_plateaued([], window=4)


# One more session than the window is the smallest history we can judge.
def test_smallest_judgeable_history():
    assert is_plateaued(sessions_from([100, 100, 100, 100, 100]), window=4)


# window=0 would make values[-0:] return everything, so it is refused.
def test_window_below_one_is_rejected():
    with pytest.raises(ValueError):
        is_plateaued(sessions_from([100, 100]), window=0)


# A custom tolerance changes the verdict: +1% is a plateau at 2% tolerance.
def test_custom_tolerance():
    history = sessions_from([100, 110, 109, 109, 109, 111.1])
    assert not is_plateaued(history, window=4)
    assert is_plateaued(history, window=4, tolerance=0.02)


# Input order must not matter; sessions are sorted by day. A steadily rising
# lift is progressing, but read newest-first it would look like a stall.
def test_sessions_are_ordered_by_day_even_if_given_shuffled():
    shuffled = list(reversed(sessions_from([100, 102, 104, 106, 108, 110])))
    assert not is_plateaued(shuffled, window=4)
