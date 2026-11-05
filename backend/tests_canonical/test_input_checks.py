"""FOLLOW_UPS #50: POST /holidays, POST|PATCH /locations and PUT /settings/attendance check their input and answer
422 in Arabic instead of reaching the database with a null date, a missing coordinate or an unreadable time (500).
Database-free: the three checks are pure functions of the body (and, for an update, the stored row)."""
from datetime import date, time

import pytest

from app.core.errors import ApiError
from app.routers import canonical


def refused(fn, *args) -> str:
    with pytest.raises(ApiError) as e:
        fn(*args)
    assert e.value.status == 422 and e.value.code == "validation_error"
    return e.value.message


# ---------------------------------------------------------------------------------------------- holidays
def test_holiday_full_body_passes():
    v = canonical._holiday_input({"name_ar": " عيد ", "start_date": "2026-03-20", "days": 4})
    assert v == {"name": "عيد", "day": date(2026, 3, 20), "days": 4}


def test_holiday_days_default_to_one():
    assert canonical._holiday_input({"name": "يوم", "start_date": "2026-09-23T00:00:00"})["days"] == 1


@pytest.mark.parametrize("body", [{}, {"start_date": "2026-03-20"}, {"name_ar": "   ", "start_date": "2026-03-20"}])
def test_holiday_needs_a_name(body):
    assert "اسم" in refused(canonical._holiday_input, body)


@pytest.mark.parametrize("day", [None, "", "2026-13-01", "tomorrow"])
def test_holiday_needs_a_real_date(day):
    assert "تاريخ" in refused(canonical._holiday_input, {"name_ar": "عيد", "start_date": day})


@pytest.mark.parametrize("days", [0, 61, 2.5, "x"])
def test_holiday_days_are_bounded(days):
    refused(canonical._holiday_input, {"name_ar": "عيد", "start_date": "2026-03-20", "days": days})


# ---------------------------------------------------------------------------------------------- locations
def test_location_full_body_passes():
    v = canonical._location_input({"name": "المكتب", "latitude": "24.7", "longitude": 46.6, "radius_m": 150})
    assert v == {"name": "المكتب", "lat": 24.7, "lng": 46.6, "radius": 150, "type": "project"}


def test_location_empty_body_is_refused():
    assert "اسم" in refused(canonical._location_input, {})


@pytest.mark.parametrize("patch", [{"latitude": None}, {"latitude": 91}, {"longitude": -181}, {"longitude": "east"},
                                   {"radius_m": 5}, {"radius_m": 6000}, {"polygon": "square"}])
def test_location_bad_values_are_refused(patch):
    refused(canonical._location_input, {"name": "المكتب", "latitude": 24.7, "longitude": 46.6, **patch})


def test_location_update_keeps_stored_values():
    stored = {"name": "القديم", "latitude": 21.5, "longitude": 39.2, "radius_m": 300, "type": "office"}
    v = canonical._location_input({"radius_m": 400}, stored)
    assert v == {"name": "القديم", "lat": 21.5, "lng": 39.2, "radius": 400, "type": "office"}


# ---------------------------------------------------------------------------------------------- attendance settings
STORED = {"work_start": time(8, 0), "tolerance_minutes": 15, "remote_days_per_year": 10, "flexible_enabled": False,
          "flex_window_start": time(8, 0), "flex_window_end": time(17, 0), "shift_duration_minutes": 480}


def test_attendance_empty_body_keeps_everything():
    assert canonical._attendance_input({}, STORED) == {
        "work_start": "08:00", "tolerance": 15, "remote": 10, "enabled": False,
        "window_start": "08:00", "window_end": "17:00", "duration": 480}


def test_attendance_screen_body_passes():
    v = canonical._attendance_input({"work_start": "07:30:00", "tolerance_minutes": 10, "remote_days_per_year": 12,
                                     "flexible_enabled": True, "shift_hours": 7.5, "window_start": "07:00",
                                     "window_end": "16:00"}, STORED)
    assert v == {"work_start": "07:30", "tolerance": 10, "remote": 12, "enabled": True,
                 "window_start": "07:00", "window_end": "16:00", "duration": 450}


@pytest.mark.parametrize("patch", [{"work_start": ""}, {"work_start": "25:00"}, {"work_start": "8am"},
                                   {"tolerance_minutes": -1}, {"tolerance_minutes": 121}, {"remote_days_per_year": 400},
                                   {"shift_hours": 0}, {"shift_hours": "x"}, {"shift_duration_minutes": 30},
                                   {"window_start": "17:00", "window_end": "08:00"}])
def test_attendance_bad_values_are_refused(patch):
    refused(canonical._attendance_input, patch, STORED)
