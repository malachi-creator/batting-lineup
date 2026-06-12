import React, { useMemo, useState } from "react";
import { addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { teamCol } from "../team.js";
import { Dialog } from "./Dialog.jsx";
import { tap } from "../haptics.js";
import {
  calendarDays,
  formatScheduleDate,
  formatScheduleMeta,
  gameForSchedule,
  getAutoStartEnabled,
  monthLabel,
  setAutoStartEnabled,
  todayISO,
  upcomingSchedule,
} from "../schedule.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ScheduleTab({ schedule, games, showToast }) {
  const today = todayISO();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(today);
  const [addOpponent, setAddOpponent] = useState("");
  const [addTime, setAddTime] = useState("");
  const [addLocation, setAddLocation] = useState("");
  const [autoStart, setAutoStart] = useState(getAutoStartEnabled);
  const [deleteEntry, setDeleteEntry] = useState(null);

  const scheduleByDate = useMemo(() => {
    const m = {};
    schedule.forEach((s) => {
      if (!m[s.date]) m[s.date] = [];
      m[s.date].push(s);
    });
    return m;
  }, [schedule]);

  const cells = useMemo(() => calendarDays(year, month), [year, month]);
  const upcoming = useMemo(() => upcomingSchedule(schedule), [schedule]);

  const shiftMonth = (delta) => {
    tap();
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const openAdd = (date) => {
    tap();
    setAddDate(date || today);
    setAddOpponent("");
    setAddTime("");
    setAddLocation("");
    setAddOpen(true);
  };

  const saveEntry = async () => {
    if (!addDate) return;
    tap(20);
    await addDoc(teamCol("schedule"), {
      date: addDate,
      opponent: addOpponent.trim() || null,
      time: addTime.trim() || null,
      location: addLocation.trim() || null,
      createdAt: serverTimestamp(),
    });
    setAddOpen(false);
    showToast(`Scheduled ${formatScheduleDate(addDate)}`);
  };

  const removeEntry = async () => {
    if (!deleteEntry) return;
    tap(20);
    await deleteDoc(doc(teamCol("schedule"), deleteEntry.id));
    setDeleteEntry(null);
    showToast("Removed from schedule");
  };

  const toggleAutoStart = () => {
    tap();
    const next = !autoStart;
    setAutoStart(next);
    setAutoStartEnabled(next);
    showToast(next ? "Auto-start on" : "Auto-start off");
  };

  const selectedEntries = selectedDate ? scheduleByDate[selectedDate] || [] : [];

  return (
    <div>
      <div className="schedule-header">
        <h2 style={{ fontSize: 26 }}>Schedule</h2>
        <button
          className={`toggle${autoStart ? " on" : ""}`}
          style={{ minHeight: 40, fontSize: 14, padding: "0 12px" }}
          onClick={toggleAutoStart}
        >
          Auto-start {autoStart ? "on" : "off"}
        </button>
      </div>

      <p className="muted" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
        Add league games here. On game day, the app opens straight into the live logger when auto-start is on.
      </p>

      <div className="card calendar-card">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
          <span className="cal-title">{monthLabel(year, month)}</span>
          <button className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
        </div>
        <div className="cal-weekdays">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((date, i) => {
            if (!date) return <span key={`pad-${i}`} className="cal-cell empty" />;
            const hasGame = !!scheduleByDate[date];
            const isToday = date === today;
            const isSelected = date === selectedDate;
            return (
              <button
                key={date}
                className={`cal-cell${hasGame ? " has-game" : ""}${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}
                onClick={() => {
                  tap();
                  setSelectedDate(date);
                }}
              >
                {Number(date.slice(8))}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="card">
          <h3>{formatScheduleDate(selectedDate)}</h3>
          {selectedEntries.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No game scheduled.</p>
          ) : (
            selectedEntries.map((entry) => {
              const linked = gameForSchedule(games, entry.id);
              return (
                <div key={entry.id} className="list-row">
                  <span className="grow">
                    <span style={{ fontFamily: "var(--font-cond)", fontSize: 18, fontWeight: 600 }}>
                      vs {entry.opponent || "TBD"}
                    </span>
                    {formatScheduleMeta(entry) && (
                      <span className="muted" style={{ display: "block", fontSize: 13 }}>{formatScheduleMeta(entry)}</span>
                    )}
                  </span>
                  {linked && (
                    <span className="muted" style={{ fontSize: 13, color: linked.final ? "var(--text-dim)" : "var(--green)" }}>
                      {linked.final ? "Played" : "● Live"}
                    </span>
                  )}
                  <button className="btn small danger" style={{ minHeight: 40, padding: "0 12px", fontSize: 14 }} onClick={() => setDeleteEntry(entry)}>
                    Remove
                  </button>
                </div>
              );
            })
          )}
          <button className="btn small" style={{ width: "100%", marginTop: 10 }} onClick={() => openAdd(selectedDate)}>
            + Add game
          </button>
        </div>
      )}

      <div className="card">
        <h3>Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No upcoming games — tap a day or add one below.</p>
        ) : (
          upcoming.map((entry) => {
            const linked = gameForSchedule(games, entry.id);
            const isToday = entry.date === today;
            return (
              <div
                key={entry.id}
                className="list-row row-tap"
                onClick={() => {
                  tap();
                  const [y, m] = entry.date.split("-").map(Number);
                  setYear(y);
                  setMonth(m - 1);
                  setSelectedDate(entry.date);
                }}
              >
                <span className="grow">
                  <span style={{ fontFamily: "var(--font-cond)", fontSize: 17, fontWeight: 600 }}>
                    {formatScheduleDate(entry.date)}
                    {isToday && <span style={{ color: "var(--green)", marginLeft: 6 }}>Today</span>}
                  </span>
                  <span className="muted" style={{ display: "block", fontSize: 13 }}>
                    vs {entry.opponent || "TBD"}
                    {formatScheduleMeta(entry) && ` · ${formatScheduleMeta(entry)}`}
                    {linked && (linked.final ? " · played" : " · live")}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>

      <button className="btn primary" style={{ width: "100%" }} onClick={() => openAdd()}>
        + Schedule game
      </button>

      <Dialog
        open={addOpen}
        title="Schedule game"
        confirmLabel="Save"
        cancelLabel="Cancel"
        onConfirm={saveEntry}
        onCancel={() => setAddOpen(false)}
      >
        <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} style={{ marginBottom: 10 }} />
        <input placeholder="Opponent (optional)" value={addOpponent} onChange={(e) => setAddOpponent(e.target.value)} style={{ marginBottom: 10 }} />
        <input placeholder="Time (e.g. 7:15 PM)" value={addTime} onChange={(e) => setAddTime(e.target.value)} style={{ marginBottom: 10 }} />
        <input placeholder="Field (optional)" value={addLocation} onChange={(e) => setAddLocation(e.target.value)} />
      </Dialog>

      <Dialog
        open={!!deleteEntry}
        title="Remove from schedule?"
        message={deleteEntry ? `${formatScheduleDate(deleteEntry.date)} vs ${deleteEntry.opponent || "TBD"}` : ""}
        confirmLabel="Remove"
        danger
        onConfirm={removeEntry}
        onCancel={() => setDeleteEntry(null)}
      />
    </div>
  );
}
