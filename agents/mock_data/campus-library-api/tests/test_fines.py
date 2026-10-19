from datetime import date

from app.services.fines import calculate_fine


def test_late_return_fine():
    assert calculate_fine(date(2026, 3, 1), date(2026, 3, 4)) == 15


def test_fine_is_capped():
    assert calculate_fine(date(2026, 1, 1), date(2026, 6, 1)) == 500


def test_early_return_has_no_fine():
    assert calculate_fine(date(2026, 3, 10), date(2026, 3, 8)) == 0
