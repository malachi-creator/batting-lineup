// Coach Z — team-level batting order review.

const { verifyTeam, corsHeaders } = require("./_shared");

const SYSTEM_PROMPT = `You are a slow-pitch softball coach reviewing a rec-league batting order.
You receive each player's current lineup slot and season stats (PA, OBP,
AVG, SLG, contact mix, out mix).

Rules for a good slow-pitch order:
- Alternate speed and power so runners keep moving
- Never stack 3 low-OBP hitters in a row
- The best OBP guys should bat in spots 1-4
- The slowest high-OBP guy bats 3

Flag the 2-4 most impactful order changes as concrete swaps ("move X
from 7th to 2nd because..."). If the order is already solid, say so and
note the one thing to watch. Players with very few PA: mention the small
sample rather than recommending big moves around them. 150 words max,
plain language, no jargon.`;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  try {
    const { lineup, teamId, teamCode } = JSON.parse(event.body || "{}");
    if (!Array.isArray(lineup) || lineup.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "lineup required" }) };
    }
    if (!(await verifyTeam(teamId, teamCode))) {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: "team verification failed" }) };
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Current batting order with season stats:\n${JSON.stringify(lineup, null, 1)}`,
          },
        ],
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
