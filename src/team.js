import { collection, doc } from "firebase/firestore";
import { db } from "./firebase.js";

// Multi-tenant: every team gets its own teams/{teamId} tree, unlocked by a
// numeric team code on first launch. Beer Pressure's code is 2337 ("BEER")
// and keeps the original teams/beer-pressure path.

export const BEER_PRESSURE_ID = "beer-pressure";
export const BEER_PRESSURE_CODE = "2337";

let currentTeamId = localStorage.getItem("bp.teamId") || null;

export const getTeamId = () => currentTeamId;
export const getTeamName = () => localStorage.getItem("bp.teamName") || "";
export const getTeamCode = () => localStorage.getItem("bp.teamCode") || "";

export function setTeam(id, name, code) {
  currentTeamId = id;
  localStorage.setItem("bp.teamId", id);
  localStorage.setItem("bp.teamName", name || "");
  if (code) localStorage.setItem("bp.teamCode", String(code));
}

export function clearTeam() {
  currentTeamId = null;
  localStorage.removeItem("bp.teamId");
  localStorage.removeItem("bp.teamName");
  localStorage.removeItem("bp.teamCode");
}

export const teamCol = (...segs) => collection(db, "teams", currentTeamId, ...segs);
export const teamDoc = (...segs) => doc(db, "teams", currentTeamId, ...segs);
