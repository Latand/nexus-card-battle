# Нексус Battle Prototype

Playable Next.js prototype of a Нексус-inspired card battle.

## Battle Rules

- 8 total cards, split into 4 cards for the player and 4 for the opponent.
- Each fighter starts with 12 health and 12 energy.
- The battle lasts 4 rounds, unless someone reaches 0 health earlier.
- Attack is calculated as `power * (energy + 1)`.
- The higher attack wins the round. Equal attack is resolved randomly.
- The winning card deals its damage to the enemy fighter.
- The first actor alternates after every round.
- Cards include early prototype abilities inspired by known Нексус clan bonuses.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run dev` starts the custom Node server, so local PvP uses the same `/ws` path as production.

## Deployment

The self-hosted target is Docker Compose behind your Nginx:

```bash
docker compose up -d --build
```

By default Compose binds the app to `127.0.0.1:3010` and the container listens on `3000`.
See [docs/deploy.md](docs/deploy.md) for the Nginx WebSocket proxy block and GitHub publishing notes.

## Verification

```bash
npm run lint
npm run build
```
