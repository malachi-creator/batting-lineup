// Coach Z — per-player swing analysis. Anthropic key stays server-side.

const { verifyTeam, corsHeaders } = require("../lib/shared");

const SYSTEM_PROMPT = `You are a slow-pitch softball hitting coach analyzing recreational league
data. You receive a player's at-bat log: result, field zone, contact
quality, out type. Identify the 2-3 strongest PATTERNS in the data and
give plain-language, practical fixes a casual player can actually use.

Pattern examples to look for:
- Heavy pull-side or opposite-field tendency combined with weak contact
  (late or early on the arc — slow-pitch timing)
- High pop-up or lazy fly rate (under the ball, dropping the back shoulder,
  trying to lift instead of driving the arc)
- High ground out rate to one side (rolling over, out front)
- Strikeouts in slow pitch (overswinging, chasing bad arcs, or taking
  hittable pitches — rare but worth flagging)
- Hard contact but low average (hitting it AT people — fine, stay the
  course, maybe aim at gaps)
- Safe reaches on error (ROE) or fielder's choice (FC) — counts as an
  at-bat but not a hit; note if they're masking weak contact

Result codes: 1B/2B/3B/HR are hits, BB is a walk, OUT is an out (with
out-type o: K/GO/FO/PO/LO), ROE is reached on error, FC is fielder's
choice (batter safe, another runner out).

Rules: 120 words max. Lead with the single biggest pattern. Give one
specific drill or swing thought per pattern. Encouraging but honest.
No jargon beyond what a rec player knows. If sample size is under 8
at-bats, say the read is early and keep advice lighter.

Zone codes: LF/CF/RF are outfield left/center/right. IF_L is the 3B-SS
side infield, IF_M is up the middle, IF_R is the 1B-2B side.

Some at-bats also carry "loc": [angle, depth] — the exact landing spot.
Angle: -45 is the left-field line, 0 dead center, +45 the right-field
line. Depth: 0 is home plate, ~0.5 the infield edge, 1.0 the fence.
Use it to spot finer patterns the zones hide (e.g. everything shallow,
or hugging one line, or warning-track flies that die at 0.9).`;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  try {
    const { name, atBats, playerStats, teamAverages, teamId, teamCode } = JSON.parse(event.body || "{}");
    if (!name || !Array.isArray(atBats) || atBats.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "name and atBats required" }) };
    }
    if (!(await verifyTeam(teamId, teamCode))) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "team verification failed" }) };
    }

    const userMsg =
      `Player: ${name}\n` +
      `Player season line: ${JSON.stringify(playerStats || {})}\n` +
      `Team averages for comparison: ${JSON.stringify(teamAverages || {})}\n` +
      `At-bat log (${atBats.length} PA, oldest first):\n${JSON.stringify(atBats)}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify({ error: data.error?.message || "Anthropic API error" }) };
    }
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
