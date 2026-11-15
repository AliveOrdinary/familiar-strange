# @familiar.strange — "Why we do this"

An AI-drafted, human-reviewed Instagram account: short reels on the
anthropology of everyday life (why we tip, why gifts create obligation, why
we shake hands…), built from real sources and checked before anything posts.

## How it works

```
weekly ─▶ topic bank ─▶ NK approves topics (Telegram)
daily  ─▶ script draft + fact-check ─▶ review 1: script (Telegram)
       ─▶ archival images + voice ─▶ render (this repo) ─▶ review 2: video (Telegram)
       ─▶ publish to Instagram ─▶ daily stats ─▶ weekly learning summary
```

| Piece | Where |
|---|---|
| Orchestration, Claude calls, Telegram bot | n8n (homelab) — workflows in `n8n/` |
| Data + video storage | Supabase project `familiar-strange` — schema in `supabase/migrations/` |
| Rendering | `render/` — Remotion + Node server, Docker on the homelab |
| Voice | Kokoro (self-hosted, free) next to the render server; ElevenLabs optional |
| Publishing | Social Media Publisher v2.2 (n8n), Instagram only for now |

## Script contract

Every reel's `reels.script` is JSON in this shape. n8n writes it; the render
server reads it.

```json
{
  "hook":   { "say": "You tip the waiter. You don't tip the nurse. Why?",
              "show": "Why do we tip some people and not others?" },
  "beats":  [ { "say": "In 1925, Marcel Mauss noticed…", "show": "No gift is ever free",
                "image_query": "1920s market exchange photograph" } ],
  "payoff": { "say": "So a tip isn't really payment…",
              "show": "A tip is a gift pretending to be a payment." },
  "cta":    { "say": "Follow for more strange things we all do.",
              "show": "Follow for the strange things we all do." }
}
```

- `say` is narrated (and captioned); `show` is the on-screen line. They are
  deliberately different — the screen punches, the voice explains.
- 3–4 beats. `cta` is optional.
- Images live in the `assets` table, one row per line:
  `beat_index` 0 = hook, 1…n = beats, n+1 = payoff, n+2 = cta. A line with no
  image holds the previous one.

## Render server

See `render/` — `POST /render { "reel_id": "<uuid>" }` queues a render. The
reel moves `rendering` → `video_review` (with `video_url`) or `error`, and the
server POSTs the result to `CALLBACK_URL` if set.

Helpers for picking a voice: `GET /voices` and
`POST /audition { "text": "...", "voice": "am_michael" }` (returns an mp3).

### Deploy (Portainer)

Stacks → Add stack → Repository → this repo, compose path
`render/docker-compose.yml`, and set the variables from `render/.env.example`
in the stack's environment section.

### Develop

```
cd render && npm install
npm run studio     # visual preview with the sample script (no audio/images)
npm run server     # real renders; needs .env and a reachable Kokoro
```
