import pytest

from goyou_coach.lift import e1rm, reps_at_weight, weight_for_reps


# 1. Known values, worked out by hand: weight * (1 + reps / 30)
@pytest.mark.parametrize(
    "weight, reps, expected",
    [
        (80, 8, 101.3333),  # 80 * 1.26667
        (100, 5, 116.6667),  # 100 * 1.16667
        (60, 10, 80.0),  # 60 * 1.33333
    ],
)
def test_e1rm_known_values(weight, reps, expected):
    assert e1rm(weight, reps) == pytest.approx(expected, abs=0.001)


# 2. Doing 0 reps adds nothing, so the estimate is just the weight itself.
def test_e1rm_with_zero_reps_is_the_weight():
    assert e1rm(80, 0) == pytest.approx(80)


# 3. More reps at the same weight means a higher estimate.
def test_e1rm_grows_with_reps():
    assert e1rm(80, 10) > e1rm(80, 5) > e1rm(80, 1)


# 4. Round trip: e1rm -> weight_for_reps gives back the original weight.
@pytest.mark.parametrize("weight, reps", [(80, 8), (100, 5), (60, 10), (2.5, 1), (142.5, 3)])
def test_weight_round_trip(weight, reps):
    assert weight_for_reps(e1rm(weight, reps), reps) == pytest.approx(weight)


# 5. Round trip: e1rm -> reps_at_weight gives back the original reps.
@pytest.mark.parametrize("weight, reps", [(80, 8), (100, 5), (60, 10), (2.5, 1), (142.5, 3)])
def test_reps_round_trip(weight, reps):
    assert reps_at_weight(e1rm(weight, reps), weight) == pytest.approx(reps)


# 6. At exactly your e1RM the formula says 0 extra reps (Epley is only approximate near 1 rep).
def test_reps_at_your_own_e1rm_is_zero():
    assert reps_at_weight(100, 100) == pytest.approx(0)


# 7. A lighter weight allows more reps than a heavier one.
def test_lighter_weight_allows_more_reps():
    assert reps_at_weight(100, 60) > reps_at_weight(100, 80)


# 8. Failure cases. A bad weight must raise a clear error, not a bare ZeroDivisionError or a made-up number.
@pytest.mark.parametrize("bad_weight", [0, -5, -0.5])
def test_reps_at_weight_rejects_non_positive_weight(bad_weight):
    with pytest.raises(ValueError):
        reps_at_weight(100, bad_weight)


# 9. Bad input must raise, never come back as an error string that looks like a result.
def test_weight_for_reps_does_not_return_text_for_bad_input():
    with pytest.raises(TypeError):
        weight_for_reps("abc", 5)
