const STORAGE_KEY = "pezley-batting-v1";
const SETTINGS_KEY = "pezley-team-settings";

const lineupList = document.getElementById("lineup-list");
const template = document.getElementById("player-row-template");
const settingsPanel = document.getElementById("settings-panel");
const settingsToggle = document.getElementById("settings-toggle");
const teamIdInput = document.getElementById("team-id");
const teamCodeInput = document.getElementById("team-code");
const aiResult = document.getElementById("ai-result");
const aiText = document.getElementById("ai-text");
const aiChanges = document.getElementById("ai-changes");
const aiError = document.getElementById("ai-error");
const applyLineupBtn = document.getElementById("apply-lineup");

let pendingLineup = null;

const defaultPlayers = [
  { name: "Alex", PA: 42, OBP: 0.571, AVG: 0.525, SLG: 0.675 },
  { name: "Jordan", PA: 38, OBP: 0.526, AVG: 0.474, SLG: 0.605 },
  { name: "Casey", PA: 40, OBP: 0.5, AVG: 0.45, SLG: 0.58 },
  { name: "Riley", PA: 36, OBP: 0.472, AVG: 0.417, SLG: 0.528 },
  { name: "Morgan", PA: 34, OBP: 0.441, AVG: 0.382, SLG: 0.5 },
  { name: "Taylor", PA: 30, OBP: 0.4, AVG: 0.333, SLG: 0.467 },
  { name: "Jamie", PA: 28, OBP: 0.393, AVG: 0.321, SLG: 0.429 },
  { name: "Drew", PA: 22, OBP: 0.364, AVG: 0.273, SLG: 0.364 },
  { name: "Quinn", PA: 18, OBP: 0.333, AVG: 0.222, SLG: 0.333 },
];

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      teamId: teamIdInput.value.trim(),
      teamCode: teamCodeInput.value.trim(),
    })
  );
}

function loadPlayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {
    /* use defaults */
  }
  return defaultPlayers.map((p) => ({ ...p }));
}

function savePlayers(players) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}

function readPlayersFromDom() {
  return [...lineupList.querySelectorAll(".player-row")].map((row, index) => ({
    slot: index + 1,
    name: row.querySelector(".name").value.trim(),
    PA: Number(row.querySelector(".pa").value) || 0,
    OBP: Number(row.querySelector(".obp").value) || 0,
    AVG: Number(row.querySelector(".avg").value) || 0,
    SLG: Number(row.querySelector(".slg").value) || 0,
  }));
}

function renderPlayers(players) {
  lineupList.innerHTML = "";
  players.forEach((player, index) => {
    lineupList.appendChild(createPlayerRow({ ...player, slot: index + 1 }));
  });
  savePlayers(players);
}

function createPlayerRow(player) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".slot").textContent = player.slot;
  node.querySelector(".name").value = player.name || "";
  node.querySelector(".pa").value = player.PA ?? 0;
  node.querySelector(".obp").value = player.OBP ?? 0;
  node.querySelector(".avg").value = player.AVG ?? 0;
  node.querySelector(".slg").value = player.SLG ?? 0;

  node.querySelector(".move-up").addEventListener("click", () => movePlayer(node, -1));
  node.querySelector(".move-down").addEventListener("click", () => movePlayer(node, 1));
  node.querySelector(".remove").addEventListener("click", () => {
    node.remove();
    refreshSlots();
    savePlayers(readPlayersFromDom());
  });

  node.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => savePlayers(readPlayersFromDom()));
  });

  return node;
}

function movePlayer(row, direction) {
  const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling) return;
  if (direction < 0) lineupList.insertBefore(row, sibling);
  else lineupList.insertBefore(sibling, row);
  refreshSlots();
  savePlayers(readPlayersFromDom());
}

function refreshSlots() {
  [...lineupList.querySelectorAll(".player-row")].forEach((row, index) => {
    row.querySelector(".slot").textContent = index + 1;
  });
}

function clearAiState() {
  aiError.classList.add("hidden");
  aiError.textContent = "";
  pendingLineup = null;
  applyLineupBtn.classList.add("hidden");
  aiChanges.classList.add("hidden");
  aiChanges.innerHTML = "";
}

function showAiError(message) {
  aiError.textContent = message;
  aiError.classList.remove("hidden");
}

function getTeamCredentials() {
  const settings = loadSettings();
  return {
    teamId: teamIdInput.value.trim() || settings.teamId || "",
    teamCode: teamCodeInput.value.trim() || settings.teamCode || "",
  };
}

async function callAi(endpoint) {
  const players = readPlayersFromDom().filter((p) => p.name);
  if (players.length === 0) {
    showAiError("Add at least one player with a name.");
    return;
  }

  const { teamId, teamCode } = getTeamCredentials();
  if (!teamId || !teamCode) {
    showAiError("Open Team settings and enter your team ID and code.");
    settingsPanel.classList.remove("hidden");
    settingsToggle.setAttribute("aria-expanded", "true");
    return;
  }

  clearAiState();
  const reviewBtn = document.getElementById("review-lineup");
  const adjustBtn = document.getElementById("adjust-lineup");
  reviewBtn.disabled = true;
  adjustBtn.disabled = true;
  aiText.textContent = "Coach Z is thinking…";
  aiResult.classList.remove("hidden");

  try {
    const res = await fetch(`/.netlify/functions/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineup: players, teamId, teamCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }

    aiText.textContent = data.text || "No advice returned.";

    if (Array.isArray(data.changes) && data.changes.length) {
      aiChanges.classList.remove("hidden");
      aiChanges.innerHTML = data.changes
        .map(
          (c) =>
            `<li><span class="move">${c.name}</span>: ${c.from} → ${c.to} — ${c.reason}</li>`
        )
        .join("");
    }

    if (Array.isArray(data.lineup) && data.lineup.length) {
      pendingLineup = data.lineup;
      applyLineupBtn.classList.remove("hidden");
    }
  } catch (err) {
    aiResult.classList.add("hidden");
    showAiError(err.message);
  } finally {
    reviewBtn.disabled = false;
    adjustBtn.disabled = false;
  }
}

settingsToggle.addEventListener("click", () => {
  const open = settingsPanel.classList.toggle("hidden") === false;
  settingsToggle.setAttribute("aria-expanded", String(open));
});

document.getElementById("save-settings").addEventListener("click", () => {
  saveSettings();
  settingsPanel.classList.add("hidden");
  settingsToggle.setAttribute("aria-expanded", "false");
});

document.getElementById("add-player").addEventListener("click", () => {
  const players = readPlayersFromDom();
  players.push({ name: "", PA: 0, OBP: 0, AVG: 0, SLG: 0 });
  renderPlayers(players);
});

document.getElementById("review-lineup").addEventListener("click", () => callAi("lineup-check"));
document.getElementById("adjust-lineup").addEventListener("click", () => callAi("lineup-adjust"));

applyLineupBtn.addEventListener("click", () => {
  if (!pendingLineup) return;
  renderPlayers(
    pendingLineup.map((p, index) => ({
      name: p.name,
      PA: p.PA ?? 0,
      OBP: p.OBP ?? 0,
      AVG: p.AVG ?? 0,
      SLG: p.SLG ?? 0,
      slot: index + 1,
    }))
  );
  pendingLineup = null;
  applyLineupBtn.classList.add("hidden");
  aiText.textContent = "Suggested order applied. You can still tweak slots manually.";
  aiChanges.classList.add("hidden");
});

const settings = loadSettings();
teamIdInput.value = settings.teamId || "";
teamCodeInput.value = settings.teamCode || "";
renderPlayers(loadPlayers());
