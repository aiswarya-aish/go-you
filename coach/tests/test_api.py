from fastapi.testclient import TestClient

from goyou_coach.api import app

client = TestClient(app)


# One 1-rep set per session, weight in kg. e1rm(w, 1) = w * 31/30, so scaling
# by 30/31 makes each session's best e1RM equal the number we pass in.
def history(e1rms):
    return [{"day": d, "sets": [{"reps": 1, "weight": w * 30 / 31}]} for d, w in enumerate(e1rms)]


def post(sessions, **extra):
    return client.post("/plateau", json={"sessions": sessions, **extra})


# --- health ---

def test_health():
    assert client.get("/health").json() == {"status": "ok"}


# --- the answer ---

# Nothing in the last 4 sessions beats the earlier best (110): stalled.
def test_plateau_true():
    r = post(history([100, 110, 109, 110, 108, 110]))
    assert r.status_code == 200
    assert r.json()["plateaued"] is True


# A new best (112) in the last 4 sessions: still progressing.
def test_plateau_false_when_progressing():
    r = post(history([100, 102, 104, 106, 108, 112]))
    assert r.status_code == 200
    assert r.json()["plateaued"] is False


# Not enough history to judge (needs more than `window` sessions).
def test_not_enough_history_is_not_a_plateau():
    assert post(history([100, 100, 100])).json()["plateaued"] is False


def test_empty_history_is_not_a_plateau():
    r = post([])
    assert r.status_code == 200
    assert r.json()["plateaued"] is False


# The response also says how many sessions were looked at.
def test_response_reports_sessions_seen():
    assert post(history([100, 110, 109, 110, 108, 110])).json()["sessions_seen"] == 6


# A custom window changes the verdict: with window=2, the last two sessions
# (105, 106) both fall short of the earlier best (110).
def test_custom_window():
    sessions = history([100, 110, 105, 106])
    assert post(sessions, window=2).json()["plateaued"] is True
    # window=4 needs more than 4 sessions, so it cannot judge.
    assert post(sessions, window=4).json()["plateaued"] is False


# Several sets in one session: the best set counts (110 from the heavier set).
def test_best_set_of_the_session_counts():
    sessions = history([100, 110, 105, 105, 105, 105])
    sessions[5]["sets"].append({"reps": 1, "weight": 120 * 30 / 31})  # 120 e1RM > 110
    assert post(sessions).json()["plateaued"] is False


# Sessions can arrive in any order; they are sorted by day.
def test_order_does_not_matter():
    shuffled = list(reversed(history([100, 102, 104, 106, 108, 110])))
    assert post(shuffled).json()["plateaued"] is False


# --- bad input is refused with 422 before it reaches the coach code ---

def test_rejects_zero_reps():
    bad = [{"day": 0, "sets": [{"reps": 0, "weight": 50}]}]
    assert post(bad).status_code == 422


def test_rejects_negative_weight():
    bad = [{"day": 0, "sets": [{"reps": 5, "weight": -1}]}]
    assert post(bad).status_code == 422


def test_rejects_session_with_no_sets():
    assert post([{"day": 0, "sets": []}]).status_code == 422


def test_rejects_window_below_one():
    assert post(history([100, 100]), window=0).status_code == 422


def test_rejects_missing_sessions_field():
    assert client.post("/plateau", json={}).status_code == 422


def test_rejects_wrong_type():
    bad = [{"day": 0, "sets": [{"reps": "many", "weight": 50}]}]
    assert post(bad).status_code == 422
