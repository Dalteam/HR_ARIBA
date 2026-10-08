from app.models import Role
from tests.conftest import auth


def test_locations_crud_and_v38_radius(client, make_user, ref):
    hr = make_user(Role.hr)
    staff = make_user(Role.employee)

    assert client.get("/api/v1/locations", headers=auth(hr)).json() == []
    assert client.post("/api/v1/locations", json={"name": "مقر أريبا"}, headers=auth(staff)).status_code == 403

    r = client.post(
        "/api/v1/locations",
        json={
            "name": "مقر أريبا الرئيسي",
            "workplace_id": str(ref.ariba.id),
            "type": "hq",
            "radius_m": 200,
            "latitude": 24.7136,
            "longitude": 46.6753,
        },
        headers=auth(hr),
    )
    assert r.status_code == 201
    loc = r.json()
    assert loc["radius_m"] == 1000  # V38: non-remote is forced to 1000 m
    assert loc["workplace"] == ref.ariba.name_ar
    loc_id = loc["id"]

    remote = client.post("/api/v1/locations", json={"name": "عمل عن بعد", "type": "remote"}, headers=auth(hr)).json()
    assert remote["radius_m"] == 999999
    assert float(remote["latitude"]) == 0.0

    updated = client.patch(f"/api/v1/locations/{loc_id}", json={"name": "مقر أريبا"}, headers=auth(hr)).json()
    assert updated["name"] == "مقر أريبا"

    assert len(client.get("/api/v1/locations", headers=auth(hr)).json()) == 2
    assert client.delete(f"/api/v1/locations/{loc_id}", headers=auth(hr)).status_code == 204
    assert len(client.get("/api/v1/locations", headers=auth(hr)).json()) == 1
