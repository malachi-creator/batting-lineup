import { LEAGUE_DIVISION, LEAGUE_HR_LIMIT } from "./league.js";

const AUTO_START_KEY = "bp.autoStart";

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function getAutoStartEnabled() {
  return localStorage.getItem(AUTO_START_KEY) !== "0";
}

export function setAutoStartEnabled(on) {
  localStorage.setItem(AUTO_START_KEY, on ? "1" : "0");
}

export function findScheduleForDate(schedule, date) {
  return schedule.find((s) => s.date === date) || null;
}

export function gameForSchedule(games, scheduleId) {
  return games.find((g) => g.scheduleId === scheduleId) || null;
}

export function shouldAutoStart({ schedule, games, activeGame, autoStartEnabled }) {
  if (!autoStartEnabled || activeGame) return null;
  const entry = findScheduleForDate(schedule, todayISO());
  if (!entry) return null;
  if (gameForSchedule(games, entry.id)) return null;
  return entry;
}

export function buildGameFromSchedule(entry, presentPlayerIds) {
  return {
    date: entry.date,
    opponent: entry.opponent?.trim() || null,
    leagueDivision: LEAGUE_DIVISION,
    hrLimit: LEAGUE_HR_LIMIT,
    present: presentPlayerIds,
    final: false,
    usScore: null,
    themScore: null,
    result: null,
    scheduleId: entry.id,
  };
}

export function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function calendarDays(year, month) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push(date);
  }
  return cells;
}

export function formatScheduleDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatScheduleMeta(entry) {
  return [entry?.time, entry?.location].filter(Boolean).join(" · ");
}

export function upcomingSchedule(schedule, fromDate = todayISO()) {
  return [...schedule]
    .filter((s) => s.date >= fromDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}
