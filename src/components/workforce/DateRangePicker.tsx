"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${value}T12:00:00Z`);
const plus = (value: string, days: number) => {
  const d = date(value);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
};
const monthOf = (value: string) => `${value.slice(0, 7)}-01`;
const nextMonth = (value: string, step: number) => {
  const d = date(monthOf(value));
  d.setUTCMonth(d.getUTCMonth() + step);
  return iso(d);
};
const ordered = (a: string, b: string) =>
  a <= b ? { start: a, end: b } : { start: b, end: a };
const display = (value: string) =>
  value
    ? date(value).toLocaleDateString("ar-SA", {
        calendar: "gregory",
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export default function DateRangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
}) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Riyadh",
  });
  const [month, setMonth] = useState(monthOf(start || today)),
    [anchor, setAnchor] = useState<string | null>(null),
    [hover, setHover] = useState<string | null>(null);
  const [focusDay, setFocusDay] = useState(start || today);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const root = useRef<HTMLFieldSetElement>(null),
    keyboardFocus = useRef(false),
    suppressClick = useRef(false);
  const drag = useRef<{ start: string; last: string; moved: boolean } | null>(
    null,
  );
  const change = useRef(onChange);
  const id = useId();
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const finish = () => {
      const value = drag.current;
      drag.current = null;
      setDragStart(null);
      if (value?.moved) {
        change.current(ordered(value.start, value.last));
        setAnchor(null);
        setHover(null);
        suppressClick.current = true;
      }
    };
    const cancel = () => {
      drag.current = null;
      setDragStart(null);
      setHover(null);
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, []);
  useEffect(() => {
    if (keyboardFocus.current) {
      root.current
        ?.querySelector<HTMLButtonElement>(`button[data-day="${focusDay}"]`)
        ?.focus();
      keyboardFocus.current = false;
    }
  }, [focusDay, month]);
  function select(day: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setFocusDay(day);
    if (anchor) {
      onChange(ordered(anchor, day));
      setAnchor(null);
      setHover(null);
    } else {
      setAnchor(day);
      setHover(null);
      onChange({ start: day, end: day });
    }
  }
  function move(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    suppressClick.current = false;
    let target = "";
    if (event.key === "ArrowLeft") target = plus(day, 1);
    if (event.key === "ArrowRight") target = plus(day, -1);
    if (event.key === "ArrowDown") target = plus(day, 7);
    if (event.key === "ArrowUp") target = plus(day, -7);
    if (event.key === "Home") target = plus(day, -date(day).getUTCDay());
    if (event.key === "End") target = plus(day, 6 - date(day).getUTCDay());
    if (event.key === "PageDown" || event.key === "PageUp") {
      const m = nextMonth(day, event.key === "PageDown" ? 1 : -1);
      const last = date(nextMonth(m, 1));
      last.setUTCDate(0);
      target = `${m.slice(0, 8)}${String(Math.min(date(day).getUTCDate(), last.getUTCDate())).padStart(2, "0")}`;
    }
    if (!target) return;
    event.preventDefault();
    keyboardFocus.current = true;
    setFocusDay(target);
    setMonth(monthOf(target));
    if (anchor) setHover(target);
  }
  const preview =
    dragStart && hover
      ? ordered(dragStart, hover)
      : anchor && hover
        ? ordered(anchor, hover)
        : { start, end };
  const days =
    preview.start && preview.end
      ? Math.round(
          (date(preview.end).getTime() - date(preview.start).getTime()) /
            86400000,
        ) + 1
      : 0;
  return (
    <fieldset
      ref={root}
      onPointerLeave={() => {
        if (!drag.current) setHover(null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHover(null);
      }}
      dir="rtl"
      className="select-none rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-3 sm:p-4"
      data-date-range-picker
    >
      <legend className="px-2 text-sm font-bold text-[#102b57]">
        مدة المهمة
      </legend>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-white px-3 py-2">
            <strong>من </strong>
            {display(preview.start)}
          </span>
          <span className="rounded-lg bg-white px-3 py-2">
            <strong>إلى </strong>
            {display(preview.end)}
          </span>
          {days > 0 && (
            <span className="rounded-lg bg-sky-100 px-3 py-2 font-bold text-sky-900">
              {days === 1
                ? "يوم واحد"
                : days === 2
                  ? "يومان"
                  : `${days.toLocaleString("en-US")} أيام`}
            </span>
          )}
        </div>
        {start && (
          <button
            type="button"
            onClick={() => {
              drag.current = null;
              setDragStart(null);
              setAnchor(null);
              setHover(null);
              onChange({ start: "", end: "" });
            }}
            className="rounded-lg px-2 py-2 font-bold text-slate-600 hover:bg-white"
          >
            مسح المدة
          </button>
        )}
      </div>
      <div className="mb-2 flex justify-between gap-2">
        <button
          type="button"
          aria-label="الشهر السابق"
          onClick={() => {
            const m = nextMonth(month, -1);
            setMonth(m);
            setFocusDay(m);
          }}
          className="rounded-lg border bg-white px-3 py-2 hover:bg-sky-100"
        >
          →
        </button>
        <button
          type="button"
          onClick={() => {
            setMonth(monthOf(today));
            setFocusDay(today);
          }}
          className="rounded-lg px-3 py-2 text-xs font-bold text-sky-900 hover:bg-white"
        >
          اليوم
        </button>
        <button
          type="button"
          aria-label="الشهر التالي"
          onClick={() => {
            const m = nextMonth(month, 1);
            setMonth(m);
            setFocusDay(m);
          }}
          className="rounded-lg border bg-white px-3 py-2 hover:bg-sky-100"
        >
          ←
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[month, nextMonth(month, 1)].map((m, index) => {
          const first = date(m).getUTCDay();
          return (
            <section
              key={m}
              className={index ? "hidden sm:block" : ""}
              aria-labelledby={`${id}-${index}`}
            >
              <h3
                id={`${id}-${index}`}
                className="mb-3 text-center text-sm font-bold text-[#102b57]"
              >
                {date(m).toLocaleDateString("ar-SA", {
                  calendar: "gregory",
                  timeZone: "UTC",
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <div
                className="mb-1 grid grid-cols-7 text-center text-[11px] text-slate-500"
                aria-hidden="true"
              >
                {["أح", "إث", "ثل", "أر", "خم", "جم", "سب"].map((d) => (
                  <span key={d} className="py-1">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 42 }, (_, i) => {
                  const day = plus(m, i - first),
                    active = day.slice(0, 7) === m.slice(0, 7);
                  if (!active) return <span key={day} className="h-9" />;
                  const inRange =
                    !!preview.start &&
                    !!preview.end &&
                    day >= preview.start &&
                    day <= preview.end;
                  const edge = day === preview.start || day === preview.end;
                  return (
                    <button
                      type="button"
                      key={day}
                      data-day={day}
                      aria-label={display(day)}
                      aria-pressed={inRange}
                      aria-current={day === today ? "date" : undefined}
                      tabIndex={
                        day === focusDay || (index === 1 && day === m) ? 0 : -1
                      }
                      onKeyDown={(e) => move(e, day)}
                      onClick={() => select(day)}
                      onPointerDown={(e) => {
                        if (e.pointerType !== "mouse" || e.button !== 0) return;
                        suppressClick.current = false;
                        drag.current = { start: day, last: day, moved: false };
                      }}
                      onPointerEnter={(e) => {
                        if (e.pointerType !== "mouse") return;
                        if (drag.current && e.buttons === 1) {
                          drag.current.last = day;
                          drag.current.moved = day !== drag.current.start;
                          setDragStart(drag.current.start);
                          setHover(day);
                        } else if (anchor) setHover(day);
                      }}
                      className={`h-9 rounded-lg text-sm font-semibold outline-offset-2 transition focus-visible:outline-2 focus-visible:outline-sky-700 ${edge ? "bg-[#102b57] text-white" : inRange ? "bg-sky-100 text-sky-950" : "text-slate-700 hover:bg-sky-100"} ${day === today && !edge ? "ring-1 ring-inset ring-sky-500" : ""}`}
                    >
                      {date(day).getUTCDate()}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </fieldset>
  );
}
