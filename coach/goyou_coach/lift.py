EPLEY_DIVISOR = 30
def e1rm(weight, reps):
    e1rm_value = weight * (1 + reps / EPLEY_DIVISOR)
    return e1rm_value

def weight_for_reps(e1rm,reps):
    return e1rm/(1+(reps/EPLEY_DIVISOR))

def reps_at_weight(e1rm,weight):
    if weight <= 0:
        raise ValueError("weight must be positive")
    reps = EPLEY_DIVISOR * ((e1rm/weight) - 1)
    return reps