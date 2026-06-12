// Coach Z — AI batting order adjustment. Returns a reordered lineup the app can apply.

const { verifyTeam, corsHeaders } = require("./_shared");

const SYSTEM_PROMPT = `You are a slow-pitch softball coach optimizing a rec-league batting order.
You receive each player's current lineup slot and season stats (PA, OBP,
AVG, SLG, contact mix, out mix).

Rules for a good slow-pitch order:
- Alternate speed and power so runners keep moving
- Never stack 3 low-OBP hitters in a row
- The best OBP guys should bat in spots 1-4
- The slowest high-OBP guy bats 3
- Keep players with very few PA near their current spot unless stats clearly support a move

Return the full optimized order (every player exactly once) via the submit_lineup tool.
Include 2-4 concrete changes in "changes" when moves are warranted. If the order is already
solid, return the same order and say so in the explanation. Plain language, no jargon.`;

const SUBMIT_LINEUP_TOOL = {
  name: "submit_lineup",
  description: "Submit the optimized batting order for the team.",
  input_schema: {
    type: "object",
    properties: {
      explanation: {
        type: "string",
        description: "Brief coaching summary of the order and why (120 words max).",
      },
      order: {
        type: "array",
        description: "Full batting order from leadoff (slot 1) through cleanup.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Player name exactly as provided." },
            slot: { type: "integer", description: "Batting slot, starting at 1." },
          },
          required: ["name", "slot"],
        },
      },
      changes: {
        type: "array",
        description: "Notable slot moves from the current order.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            from: { type: "integer" },
            to: { type: "integer" },
            reason: { type: "string" },
          },
          required: ["name", "from", "to", "reason"],
        },
      },
    },
    required: ["explanation", "order"],
  },
};

function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function buildAdjustedLineup(inputLineup, aiOrder) {
  const byName = new Map();
  for (const player of inputLineup) {
    const key = normalizeName(player.name);
    if (!key) continue;
    if (byName.has(key)) {
      throw new Error(`duplicate player name in lineup: ${player.name}`);
    }
    byName.set(key, player);
  }

  const seen = new Set();
  const adjusted = [];

  for (const entry of aiOrder) {
    const key = normalizeName(entry.name);
    const player = byName.get(key);
    if (!player) {
      throw new Error(`unknown player in AI order: ${entry.name}`);
    }
    if (seen.has(key)) {
      throw new Error(`duplicate player in AI order: ${entry.name}`);
    }
    seen.add(key);
    adjusted.push({
      ...player,
      slot: entry.slot,
    });
  }

  if (seen.size !== byName.size) {
    throw new Error("AI order is missing one or more players");
  }

  adjusted.sort((a, b) => a.slot - b.slot);
  return adjusted;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  try {
    const { lineup, teamId, teamCode } = JSON.parse(event.body || "{}");
    if (!Array.isArray(lineup) || lineup.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "lineup required" }) };
    }
    if (!lineup.every((p) => p && p.name)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "each lineup entry needs a name" }) };
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
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        tools: [SUBMIT_LINEUP_TOOL],
        tool_choice: { type: "tool", name: "submit_lineup" },
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
      return {
        statusCode: res.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: data.error?.message || "Anthropic API error" }),
      };
    }

    const toolBlock = (data.content || []).find((b) => b.type === "tool_use" && b.name === "submit_lineup");
    if (!toolBlock || !toolBlock.input) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: "AI did not return a lineup adjustment" }),
      };
    }

    const { explanation, order, changes = [] } = toolBlock.input;
    let adjustedLineup;
    try {
      adjustedLineup = buildAdjustedLineup(lineup, order);
    } catch (e) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: e.message }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        text: explanation,
        lineup: adjustedLineup,
        changes,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
