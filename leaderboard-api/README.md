# Solar Strike Leaderboard API

A tiny Cloudflare Worker that backs the universal leaderboard.

## Deploy (one-time, ~5 min)

```bash
# 1. Install wrangler (Cloudflare's CLI)
npm install -g wrangler

# 2. Sign in (opens browser, free CF account if you don't have one)
wrangler login

# 3. Create the KV namespace (paste returned id into wrangler.toml)
cd ~/Projects/solar-strike-redux/leaderboard-api
wrangler kv:namespace create SCORES

# 4. Deploy
wrangler deploy
```

After deploy, wrangler prints a URL like:
  `https://solar-strike-leaderboard.<your-handle>.workers.dev`

Paste that URL into `src/sketch.js` as `LEADERBOARD_API_URL`.

## Endpoints

- `GET /scores` — top 20 entries
- `POST /scores` — body: `{name, score, completed, agent}`

## Seed Hermes' entry (optional)

```bash
curl -X POST https://solar-strike-leaderboard.<your-handle>.workers.dev/scores \
  -H 'Content-Type: application/json' \
  -d '{"name":"HERMES 🧀","score":42069,"completed":true,"agent":true}'
```
