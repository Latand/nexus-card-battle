# Nexus Card Battle

Telegram Mini App card battle built with Next.js and a custom Node/WebSocket server.

Players build a deck, fight AI locally, or queue into a live PvP match. Inside Telegram, the app reads the current user from `Telegram.WebApp`, opens in fullscreen when supported, and uses MongoDB-backed player profiles for durable player state.

## Features

- Deck builder and MongoDB-backed player profile API.
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

## Production

Use the Docker/self-host path for PvP, because the arena needs a long-lived WebSocket server:

```bash
docker compose up -d --build
```

By default Compose binds the app to `127.0.0.1:3010` and the container listens on `3000`.
Compose also starts MongoDB with the persistent `nexus_mongodb_data` volume and provides `MONGODB_URI=mongodb://mongo:27017/nexus-card-battle` to the app. Set `MONGODB_URI` in the shell to point the app at a different MongoDB instance.
See [docs/deploy.md](docs/deploy.md) for the Nginx WebSocket proxy block.

## Verification

```bash
bun run lint
bun run test:profile
bun run build
bun run test:e2e
```
