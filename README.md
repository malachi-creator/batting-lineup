# Pezley Batting Tracker (Beer Pressure)

PWA for tracking slow-pitch softball batting stats. Log every at-bat in 3 taps —
result, field zone, detail — and let Coach Z (Claude) tell each player what's
going on with their swing.

Standalone project — its own Firebase + Netlify site, not Pezley Portal.

## Stack

- React + Vite, mobile-first PWA (installs to home screen, works offline)
- Firebase Firestore — all data under `teams/{teamId}/...`
- Netlify functions proxy the Anthropic API (`ANTHROPIC_API_KEY` env var,
  never client-side), model `claude-sonnet-4-5`
- AI endpoints are gated: every request carries the team's join code, verified
  server-side against the team doc (Firestore REST). Setting `ai: false` on a
  team doc kills AI for that team. Responses are cached per player and only
  re-run when new at-bats exist.

## One-time setup

### 1. Firebase

1. Create a Firebase project (or use your existing one).
2. Enable **Firestore** (Native mode).
3. Register a **Web app** → copy the config object.
4. Enable **Anonymous Authentication** (optional — app tolerates it being off).
5. Deploy rules from this repo:

```bash
npm install -g firebase-tools   # or use npx
firebase login
firebase use --add              # pick your project
firebase deploy --only firestore:rules
```

Rules live in `firestore.rules`. They're a prototype open-access model for rec-league use — review before a public launch.

### 2. Environment variables

Copy `.env.example` → `.env` and fill in your Firebase web app config:

```bash
cp .env.example .env
```

| Variable | Where |
|----------|-------|
| `VITE_FIREBASE_*` (6 vars) | `.env` locally + Netlify **build** env |
| `FIREBASE_PROJECT_ID` | Netlify env (same as `VITE_FIREBASE_PROJECT_ID`) |
| `FIREBASE_API_KEY` | Netlify env (same as `VITE_FIREBASE_API_KEY`) |
| `ANTHROPIC_API_KEY` | Netlify env only |

In Netlify: **Site configuration → Environment variables**. Scope the `VITE_*` vars to **Build** (or All).

### 3. Netlify (Git deploy — recommended)

Connect your Git repo in Netlify → **Add new site → Import an existing project**.

Settings (already in `netlify.toml`):

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

Import env vars from `netlify.env` (Site configuration → Environment variables → Import).

Every push to your main branch auto-deploys the app **and** Coach Z functions.

**Manual deploy** (app only, no functions):

```bash
npm run drop    # builds → netlify-drop/ folder
# drag netlify-drop onto Netlify → Deploys
```

## Develop

```bash
npm install
cp .env.example .env          # fill in Firebase config
npm run dev                   # app only — Coach Z needs functions
npx netlify dev               # app + functions (recommended)
```

Mock mode (no Firebase at all):

```bash
VITE_MOCK=1 npm run dev
```

## Teams & players (multi-tenant)

- First launch asks for a **team number**. Each team's data is fully isolated
  under its own `teams/{teamId}` tree.
- **Beer Pressure's number is 2337** ("BEER" on a phone keypad) — it binds to
  the `teams/beer-pressure` path on first join.
- "New team" generates a fresh 4-digit code; anyone with the code is on the
  team (rec-league trust model, no passwords).
- The **Me** tab is the player area: pick your name once (saved per phone) and
  land on your own spray chart / stats every time. Switch team from Roster.

## Data model

```
teams/{teamId}                       name, code (join number), createdAt
teams/{teamId}/players/{playerId}    name, orderIndex, active
teams/{teamId}/games/{gameId}        date, opponent?, present[], final, usScore?, themScore?, result? (W|L|T)
teams/{teamId}/games/{gameId}/atBats/{abId}
    playerId, seq, result (1B|2B|3B|HR|BB|OUT|ROE),
    zone (LF|CF|RF|IF_L|IF_M|IF_R|null), contact (HARD|MED|WEAK|null),
    outType (K|GO|FO|PO|LO|FC|null), rbi, twoOuts, createdAt,
    loc ({a, d}|null) — exact tap spot: a = angle° (-45 LF line … +45 RF
    line), d = depth (0 home … 1 fence). Zone is derived from it.
teams/{teamId}/analyses/{playerId|_lineup}   cached Coach Z text + lastAnalyzedAbCount
```

All stats (OBP/AVG/SLG, spray, out mix, contact trend) are recomputed
client-side from raw at-bats — nothing derived is stored.

## Offline

Firestore persistent local cache queues writes with no signal and syncs when
back online; the service worker (`public/sw.js`) caches the app shell and fonts
so the app opens in the dugout.

note: node_modules is symlinked to node_modules.nosync so iCloud doesn't sync it.
