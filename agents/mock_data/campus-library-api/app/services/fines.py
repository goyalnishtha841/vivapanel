from datetime import date

FINE_PER_DAY = 5  # rupees
MAX_FINE = 500


def calculate_fine(due: date, returned: date) -> int:
    days_late = (returned - due).days
    return min(days_late * FINE_PER_DAY, MAX_FINE)
