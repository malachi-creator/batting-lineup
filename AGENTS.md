# Coach Z

Netlify serverless functions that power "Coach Z", an AI slow-pitch softball coach.
Two HTTP functions in `netlify/functions/` proxy requests to the Anthropic API
(server-side key) after verifying a team via the Firestore REST API:

- `analyze-batter` — per-player swing/at-bat pattern analysis.
- `lineup-check` — team batting-order review.
- `_shared.js` — `verifyTeam()` (Firestore REST) and CORS headers.

There is no frontend, `package.json`, `netlify.toml`, lint config, or test suite in
this repo; it is functions-only.

## Cursor Cloud specific instructions

- Run locally with the Netlify CLI: `netlify dev --offline` (serves functions at
  `http://localhost:8888/.netlify/functions/<name>`, static server on 3999). No
  `netlify.toml` exists; the CLI auto-detects `netlify/functions` and logs
  `Loaded function ...`. The "No app server detected / static server" message is
  expected (there is no frontend). No `netlify login`/link is required for `dev`.
- The functions read env vars at runtime: `ANTHROPIC_API_KEY`,
  `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`. These are NOT configured in this
  environment (they belong to the production Netlify deploy). Without them,
  `verifyTeam()` returns false, so any valid request is correctly rejected with
  `403 {"error":"team verification failed"}`. Reaching the Anthropic call
  requires real Firebase creds + a matching Firestore `teams/<id>` doc.
- Reachable code paths to sanity-check the dev server end-to-end without secrets:
  `OPTIONS` -> 200 (CORS preflight); `POST {}` -> 400 (`... required`); `POST`
  with a valid body -> 403 (verifyTeam gate). Use `curl`.
- `_shared.js` uses ESM `export` while the handlers use CommonJS `require`/
  `exports.handler`. This mismatch is fine: Netlify's function bundler (esbuild)
  handles the interop. Do not "fix" it for raw `node` — the functions are meant
  to run under the Netlify runtime.
- `netlify` is installed as a user-global npm package (npm prefix
  `~/.npm-global`, on `PATH` via `~/.bashrc`).
