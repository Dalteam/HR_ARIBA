"use client";

// Punch locations (مواقع البصمة) — port of #pg-loc / js/main/14-locations.js.
import { useEffect, useState } from "react";
import { LinkedEmployees } from "@/components/hr/linked-employees";
import { Modal } from "@/components/hr/modal";
import { PageState } from "@/components/hr/not-built";
import { useToast } from "@/components/common/toast";
import { getLookups } from "@/lib/employees";
import { createLocation, deleteLocation, listLocations, updateLocation, type Location, type LocationType } from "@/lib/locations";

const TYPE_LABEL: Record<LocationType, string> = { hq: "مقر رئيسي", project: "مشروع", remote: "عن بعد" };
const TYPE_ICON: Record<LocationType, string> = { hq: "ti-building", project: "ti-crane", remote: "ti-home-laptop" };
const TYPE_COLOR: Record<LocationType, string> = { hq: "#0ea5e9", project: "#f59e0b", remote: "#10b981" };

const mapsLink = (lat: string, lng: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
const mapsEmbed = (lat: string, lng: string) => `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&output=embed`;

const lbl: React.CSSProperties = { fontSize: 11, color: "var(--mu)", fontWeight: 600, display: "block", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, marginBottom: 10, border: "1px solid var(--bd)", borderRadius: 8, background: "var(--c2)", color: "var(--tx)", fontSize: 13 };

export default function Page() {
  const toast = useToast();
  const [locs, setLocs] = useState<Location[] | null>(null);
  const [workplaces, setWorkplaces] = useState<{ id: string; name_ar: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [workplaceId, setWorkplaceId] = useState("");
  const [type, setType] = useState<LocationType>("hq");
  const [radius, setRadius] = useState("200");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listLocations(), getLookups()])
      .then(([l, k]) => {
        if (!alive) return;
        setLocs(l);
        setWorkplaces(k.workplaces);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [reloadTick]);

  function openAdd() {
    setEditId(null);
    setName("");
    setWorkplaceId("");
    setType("hq");
    setRadius("200");
    setLat("");
    setLng("");
    setOpen(true);
  }

  function openEdit(l: Location) {
    setEditId(l.id);
    setName(l.name);
    setWorkplaceId(l.workplace_id ?? "");
    setType(l.type);
    setRadius(String(l.radius_m));
    setLat(Number(l.latitude) ? String(Number(l.latitude)) : "");
    setLng(Number(l.longitude) ? String(Number(l.longitude)) : "");
    setOpen(true);
  }

  function gps() {
    if (!navigator.geolocation) return toast("GPS غير متاح", "err");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        toast("✓ تم تحديد موقعك", "ok");
      },
      () => toast("تعذر تحديد موقعك", "err"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function save() {
    if (!name.trim()) return toast("أدخل اسم الموقع", "err");
    const body = {
      name: name.trim(),
      workplace_id: workplaceId || null,
      type,
      radius_m: type === "remote" ? undefined : (parseInt(radius) || 200),
      latitude: type === "remote" ? 0 : parseFloat(lat) || 0,
      longitude: type === "remote" ? 0 : parseFloat(lng) || 0,
    };
    if (type !== "remote" && (!body.latitude || !body.longitude)) return toast("حدد الإحداثيات أو استخدم GPS", "err");
    try {
      if (editId) await updateLocation(editId, body);
      else await createLocation(body);
      toast(editId ? "✓ تم حفظ الموقع" : "✓ تم إضافة الموقع", "ok");
      setOpen(false);
      setReloadTick((t) => t + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  async function del(l: Location) {
    if (!window.confirm(`حذف الموقع «${l.name}»؟`)) return;
    try {
      await deleteLocation(l.id);
      toast("✓ تم حذف الموقع", "ok");
      setReloadTick((t) => t + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  if (error) return <PageState error={error} onRetry={() => setReloadTick((t) => t + 1)} />;
  if (!locs) return <PageState loading />;

  const previewLat = parseFloat(lat);
  const previewLng = parseFloat(lng);
  const hasCoords = Number.isFinite(previewLat) && Number.isFinite(previewLng) && previewLat >= -90 && previewLat <= 90 && previewLng >= -180 && previewLng <= 180;

  return (
    <div className="pg on" id="pg-loc">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div className="ct"><i className="ti ti-map-pin" /> مواقع البصمة الجغرافية</div>
          <div style={{ fontSize: 11, color: "var(--mu)" }}>تُستخدم هذه المواقع في تطبيق الموظف للبصمة الجغرافية</div>
        </div>
        <button type="button" className="btn bgr" onClick={openAdd}>
          <i className="ti ti-plus" /> إضافة موقع
        </button>
      </div>

      {locs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--mu)", padding: 30 }}>لا توجد مواقع بعد</div>
      ) : (
        <div id="LCG" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
          {locs.map((l) => {
            const c = TYPE_COLOR[l.type];
            return (
              <div key={l.id} style={{ background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 10, padding: 14, borderTop: `3px solid ${c}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${c}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className={`ti ${TYPE_ICON[l.type]}`} style={{ color: c, fontSize: 18 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: "var(--dm)" }}>{TYPE_LABEL[l.type]} — {l.workplace ?? "الكل"}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 8 }}>
                  {l.type === "remote" ? "بدون قيد موقع" : `📍 ${Number(l.latitude).toFixed(6)}, ${Number(l.longitude).toFixed(6)} | النطاق: ${l.radius_m}م`}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {l.type !== "remote" && (
                    <a className="btn bsm" target="_blank" rel="noopener" href={mapsLink(l.latitude, l.longitude)} style={{ flex: 1, textDecoration: "none" }}>
                      <i className="ti ti-brand-google-maps" /> Google Maps
                    </a>
                  )}
                  <button type="button" className="btn bsm" onClick={() => openEdit(l)}><i className="ti ti-edit" /> تعديل</button>
                  <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => del(l)}><i className="ti ti-trash" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <Modal title={editId ? "تعديل الموقع" : "إضافة موقع بصمة"} width={520} onClose={() => setOpen(false)}>
          <label style={lbl}>اسم الموقع *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inp} />
          <label style={lbl}>جهة العمل</label>
          <select value={workplaceId} onChange={(e) => setWorkplaceId(e.target.value)} style={inp}>
            <option value="">الكل</option>
            {workplaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name_ar}</option>
            ))}
          </select>
          <label style={lbl}>النوع</label>
          <select value={type} onChange={(e) => setType(e.target.value as LocationType)} style={inp}>
            <option value="hq">مقر رئيسي</option>
            <option value="project">مشروع</option>
            <option value="remote">عن بعد</option>
          </select>
          {type !== "remote" && (
            <>
              <label style={lbl}>النطاق (متر)</label>
              <input type="number" min={50} max={5000} value={radius} onChange={(e) => setRadius(e.target.value)} style={inp} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={lbl}>خط العرض</label>
                  <input type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>خط الطول</label>
                  <input type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} style={inp} />
                </div>
              </div>
              <button type="button" className="btn bsm" style={{ marginBottom: 10 }} onClick={gps}><i className="ti ti-map-pin" /> موقعي الحالي (GPS)</button>
              <div id="LMAP" style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--bd)" }}>
                {hasCoords ? (
                  <iframe title="Google Maps" src={mapsEmbed(lat, lng)} style={{ width: "100%", height: 240, border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                ) : (
                  <div style={{ padding: "30px 15px", textAlign: "center", color: "var(--mu)" }}>حدد الإحداثيات أو استخدم GPS</div>
                )}
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-start", marginTop: 14 }}>
            <button type="button" className="btn bgr" onClick={save}><i className="ti ti-check" /> حفظ</button>
            <button type="button" className="btn bsm" onClick={() => setOpen(false)}>إلغاء</button>
          </div>
        </Modal>
      )}
      {locs.length > 0 && <LinkedEmployees locs={locs} />}
    </div>
  );
}
