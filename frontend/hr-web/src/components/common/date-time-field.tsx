"use client";

// One date / time picker for the whole site — same calendar and time grid as the employee app
// (employee-app/src/components/date-time.tsx): Gregorian whatever the OS calendar, Arabic labels, brand colours.
// Tap on an empty field fills today / now and opens the picker on it. Values: "yyyy-mm-dd" and "HH:MM".
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAYS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]; // Sunday first
const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

type Common = {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  title?: string;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
};

function Popup({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="ariba-dt-ov" onMouseDown={onClose}>
      <div className="ariba-dt-panel" role="dialog" onMouseDown={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  );
}

function Trigger({ id, kind, value, placeholder, disabled, style, onOpen }: {
  id?: string; kind: "date" | "time"; value: string; placeholder?: string; disabled?: boolean; style?: React.CSSProperties; onOpen: () => void;
}) {
  return (
    <button type="button" id={id} className={`ariba-dt${value ? "" : " empty"}`} disabled={disabled} style={style} onClick={onOpen}>
      <i className={`ti ${kind === "date" ? "ti-calendar" : "ti-clock"}`} aria-hidden />
      <span className="v">{value || placeholder || (kind === "date" ? "اختر التاريخ" : "اختر الوقت")}</span>
    </button>
  );
}

export function Calendar({ title, value, onPick, min, max }: { title?: string; value: string; onPick: (iso: string) => void; min?: string; max?: string }) {
  const today = isoDate(new Date());
  const sel = value || today;
  const [view, setView] = useState(() => ({ y: Number(sel.slice(0, 4)), m: Number(sel.slice(5, 7)) - 1 }));
  // days → tap the header for years → pick a year → months → pick a month → days
  const [mode, setMode] = useState<"days" | "years" | "months">("days");
  const [page, setPage] = useState(() => Number(sel.slice(0, 4)) - 7);
  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const move = (n: number) => {
    if (mode === "years") return setPage((p) => p + n * 12);
    if (mode === "months") return setView(({ y, m }) => ({ y: y + n, m }));
    setView(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  };
  const head = mode === "years" ? `${page} – ${page + 11}` : mode === "months" ? String(view.y) : `${MONTHS[view.m]} ${view.y}`;
  return (
    <>
      {title && <div className="ariba-dt-title">{title}</div>}
      <div className="ariba-dt-head">
        <button type="button" onClick={() => move(-1)} aria-label="السابق"><i className="ti ti-chevron-right" /></button>
        <button type="button" className="ym" onClick={() => { setPage(view.y - 7); setMode(mode === "days" ? "years" : "days"); }}>
          {head} <i className={`ti ${mode === "days" ? "ti-chevron-down" : "ti-chevron-up"}`} aria-hidden />
        </button>
        <button type="button" onClick={() => move(1)} aria-label="التالي"><i className="ti ti-chevron-left" /></button>
      </div>
      {mode === "years" && (
        <div className="ariba-dt-chips three">
          {Array.from({ length: 12 }, (_, i) => page + i).map((y) => (
            <button key={y} type="button" className={y === view.y ? "on" : ""} onClick={() => { setView((v) => ({ ...v, y })); setMode("months"); }}>{y}</button>
          ))}
        </div>
      )}
      {mode === "months" && (
        <div className="ariba-dt-chips three">
          {MONTHS.map((n, i) => (
            <button key={n} type="button" className={i === view.m ? "on" : ""} onClick={() => { setView((v) => ({ ...v, m: i })); setMode("days"); }}>{n}</button>
          ))}
        </div>
      )}
      {mode === "days" && (
        <div className="ariba-dt-grid">
          {DAYS.map((d) => <span key={d} className="wd">{d}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const iso = `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
            const off = (max && iso > max) || (min && iso < min);
            return (
              <button key={i} type="button" disabled={!!off} onClick={() => onPick(iso)}
                className={`day${iso === sel ? " on" : ""}${iso === today ? " today" : ""}`}>{d}</button>
            );
          })}
        </div>
      )}
      <div className="ariba-dt-foot">
        <button type="button" className="pill" onClick={() => { setView({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }); setMode("days"); onPick(today); }}>اليوم</button>
      </div>
    </>
  );
}

export function TimeGrid({ title, value, onPick, onDone }: { title?: string; value: string; onPick: (v: string) => void; onDone: () => void }) {
  const [h, m] = (value || hhmm(new Date())).split(":").map(Number);
  const set = (hh: number, mm: number) => onPick(`${pad((hh + 24) % 24)}:${pad((mm + 60) % 60)}`);
  return (
    <>
      {title && <div className="ariba-dt-title">{title}</div>}
      <div className="ariba-dt-time">{`${pad(h)}:${pad(m)}`}</div>
      <div className="ariba-dt-time12">{`${h % 12 || 12}:${pad(m)} ${h < 12 ? "صباحاً" : "مساءً"}`}</div>
      <div className="ariba-dt-lbl">الساعة</div>
      <div className="ariba-dt-chips">
        {Array.from({ length: 24 }, (_, i) => <button key={i} type="button" className={i === h ? "on" : ""} onClick={() => set(i, m)}>{pad(i)}</button>)}
      </div>
      <div className="ariba-dt-lbl">الدقيقة</div>
      <div className="ariba-dt-chips">
        {Array.from({ length: 12 }, (_, i) => <button key={i} type="button" className={i * 5 === m ? "on" : ""} onClick={() => set(h, i * 5)}>{pad(i * 5)}</button>)}
      </div>
      <div className="ariba-dt-chips two">
        <button type="button" onClick={() => set(h, m - 1)}>− دقيقة</button>
        <button type="button" onClick={() => set(h, m + 1)}>+ دقيقة</button>
      </div>
      <div className="ariba-dt-foot"><button type="button" className="pill solid" onClick={onDone}>تم</button></div>
    </>
  );
}

export function DateField({ value, onChange, id, title, placeholder, disabled, style, min, max }: Common & { min?: string; max?: string }) {
  const [open, setOpen] = useState(false);
  const show = () => { if (!value) onChange(isoDate(new Date())); setOpen(true); };
  return (
    <>
      <Trigger id={id} kind="date" value={value} placeholder={placeholder} disabled={disabled} style={style} onOpen={show} />
      <Popup open={open} onClose={() => setOpen(false)}>
        <Calendar title={title} value={value} min={min} max={max} onPick={(d) => { onChange(d); setOpen(false); }} />
      </Popup>
    </>
  );
}

export function TimeField({ value, onChange, id, title, placeholder, disabled, style }: Common) {
  const [open, setOpen] = useState(false);
  const show = () => { if (!value) onChange(hhmm(new Date())); setOpen(true); };
  return (
    <>
      <Trigger id={id} kind="time" value={value} placeholder={placeholder} disabled={disabled} style={style} onOpen={show} />
      <Popup open={open} onClose={() => setOpen(false)}>
        <TimeGrid title={title} value={value} onPick={onChange} onDone={() => setOpen(false)} />
      </Popup>
    </>
  );
}
