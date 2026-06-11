import { getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getTeamCode, getTeamId, teamDoc } from "./team.js";

// Cached Claude analyses live at teams/{teamId}/analyses/{playerId} (or _lineup).
// Functions run on Netlify; set ANTHROPIC_API_KEY + FIREBASE_* there.
// Re-run only when new at-bats exist since lastAnalyzedAbCount.
// Every request carries teamId + team code; the functions verify them so the
// endpoints can't be hit by anyone who isn't on a team.

export async function getCachedAnalysis(key) {
  try {
    const snap = await getDoc(teamDoc("analyses", key));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

async function ensureTeamCode() {
  let code = getTeamCode();
  if (!code) {
    // Phones that joined before codes were stored locally: read it off the team doc
    try {
      const snap = await getDoc(teamDoc());
      code = snap.exists() ? snap.data().code : null;
      if (code) localStorage.setItem("bp.teamCode", String(code));
    } catch {
      code = null;
    }
  }
  return code;
}

export async function runAnalysis(key, endpoint, payload, abCount) {
  const teamCode = await ensureTeamCode();
  const res = await fetch(`/.netlify/functions/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, teamId: getTeamId(), teamCode }),
  });
  if (res.status === 403) throw new Error("Coach Z is locked — rejoin with your team number.");
  if (!res.ok) throw new Error(`Coach Z is unavailable (${res.status})`);
  const data = await res.json();
  if (!data.text) throw new Error(data.error || "No analysis returned");
  const record = { text: data.text, lastAnalyzedAbCount: abCount, updatedAt: serverTimestamp() };
  setDoc(teamDoc("analyses", key), record).catch(() => {});
  return record;
}
