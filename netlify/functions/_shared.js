// Shared helpers for Coach Z Netlify functions.

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

export async function verifyTeam(teamId, teamCode) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) {
    console.error("FIREBASE_PROJECT_ID and FIREBASE_API_KEY must be set in Netlify env");
    return false;
  }
  if (!teamId || !teamCode || /[/.]/.test(teamId)) return false;

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/teams/${encodeURIComponent(teamId)}?key=${FIREBASE_API_KEY}`
  );
  if (!res.ok) return false;

  const fields = (await res.json()).fields || {};
  if (fields.ai && fields.ai.booleanValue === false) return false;
  return fields.code && fields.code.stringValue === String(teamCode);
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};
