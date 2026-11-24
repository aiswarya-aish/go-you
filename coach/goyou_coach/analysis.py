PLATEAU_TOLERANCE = 0.005   # 0.5%


def _best_e1rms(sessions):
    ordered = sorted(sessions, key=lambda s: s.day)
    return [s.best_e1rm() for s in ordered]


def is_plateaued(sessions, window=4, tolerance=PLATEAU_TOLERANCE):
    if window < 1:
        raise ValueError("window must be at least 1")

    values = _best_e1rms(sessions)

    if len(values) <= window:
        return False

    earlier_best = max(values[:-window])
    recent_best = max(values[-window:])

    return recent_best <= earlier_best * (1 + tolerance)
