# Nexus Card Battle

Telegram Mini App card battle built with Next.js and a custom Node/WebSocket server.

Players build a deck, fight AI locally, or queue into a live PvP match. Inside Telegram, the app reads the current user from `Telegram.WebApp`, opens in fullscreen when supported, and uses MongoDB-backed player profiles for durable player state.

## Features

- Owned-card deck builder with read-only full-base browsing and MongoDB-backed player profile API.
- AI battle mode for single-player testing.
- Human-vs-human matchmaking over `/ws`.
- Telegram Mini App integration for user names, fullscreen launch, and Telegram-id profile lookup.
- Docker-ready production server that serves both Next.js and WebSocket traffic.

## Battle Rules

- A deck must contain at least 9 cards.
- Each battle hand contains 4 cards.
- Each fighter starts with 12 health and 12 energy.
- Battles last up to 4 rounds, unless a fighter reaches 0 health earlier.
- Attack is calculated as `power * (energy + 1)`.
- The higher attack wins the round, and the winning card deals damage.
- The first actor alternates after every round.

## Development

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

`bun run dev` starts the custom Node server, so local PvP uses the same `/ws` path as production.

AI battle mode calls OpenRouter from a server route when `OPENROUTER_API_KEY` is set in `.env`. The default model is `openai/gpt-5.4-nano`; override it with `OPENROUTER_MODEL` if needed. The server sends the full public battle state, hidden-information rules, and a `choose_battle_move` tool schema for selecting `cardId`, `energy`, and `damageBoost`. If the key or provider is unavailable, the app uses an emergency local strategy without exposing the key to the browser.

## Production

Use the Docker/self-host path for PvP, because the arena needs a long-lived WebSocket server:

```bash
docker compose up -d --build
```

By default Compose binds the app to `127.0.0.1:3010` and the container listens on `3000`.
Compose also starts MongoDB with the persistent `nexus_mongodb_data` volume and provides `MONGODB_URI=mongodb://mongo:27017/nexus-card-battle` to the app. Set `MONGODB_URI` in the shell to point the app at a different MongoDB instance.
Compose also passes `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_TITLE`, and `OPENROUTER_TIMEOUT_MS` from the shell or `.env` into the app container.
See [docs/deploy.md](docs/deploy.md) for the Nginx WebSocket proxy block.

## Known Limitations

MongoDB-backed player profiles are the source of truth for owned cards, starter booster history, and saved decks. Deck edits are saved through the player profile API and must use known, unique, owned cards with at least 9 cards. Legacy CloudStorage and `sessionStorage` deck keys may still exist in old clients, but they are ignored without being imported, merged, or deleted.

Telegram profiles currently use the client-provided `Telegram.WebApp.initDataUnsafe.user.id` for MVP bootstrap. Server-side Telegram `initData` HMAC verification is intentionally deferred and should be added before treating Telegram identity as trusted.

## Verification

```bash
bun run lint
bun run test
docker compose config --quiet
MONGODB_URI=mongodb://external.example:27017/custom docker compose config --quiet
bun run test:e2e -- tests/onboarding-reveal.spec.ts tests/data-regression.spec.ts
bun run build
bun run test:e2e
```

See [docs/release-qa.md](docs/release-qa.md) for the booster onboarding release QA checklist.
