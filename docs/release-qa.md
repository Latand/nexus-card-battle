# Booster Onboarding Release QA

This checklist covers the owned-card booster onboarding release.

## Acceptance Coverage

- Fresh guest onboarding E2E: `tests/onboarding-reveal.spec.ts` covers first booster opening, reload with one opened booster, second booster opening, the ten-card deck-ready screen, collection edit entry, and AI battle entry from the saved starter deck.
- Removed data/mechanics regression: `tests/data-regression.spec.ts` and `tests/boosterOpening.test.ts` assert that active data, default gameplay, starter boosters, and rendered starter onboarding UI do not expose `C.O.R.R.` or `copy-clan-bonus`.
- Durable profile state: player profile and booster tests cover MongoDB-style profile ownership, starter booster history, duplicate/unknown deck rejection, and ignoring legacy deck payloads.
- Docker Compose startup: `docker-compose.yml` starts the app plus MongoDB, persists MongoDB in `nexus_mongodb_data`, and supports `MONGODB_URI` override for external databases.

## Verification Commands

Run the narrow release checks:

```bash
bun run lint
bun run test
docker compose config --quiet
MONGODB_URI=mongodb://external.example:27017/custom docker compose config --quiet
bun run test:e2e -- tests/onboarding-reveal.spec.ts tests/data-regression.spec.ts
```

Run the broader release checks before shipping:

```bash
bun run build
bun run test:e2e
```

## Residual Technical Debt

- Telegram MVP identity is not server-validated yet. The client sends `Telegram.WebApp.initDataUnsafe.user.id`, and the server treats that Telegram id as profile identity input after shape validation. Add Telegram `initData` HMAC verification before this identity can be trusted for production-grade account ownership.
- PvP WebSocket joins validate the submitted deck against the submitted collection ids. Loading profile ownership server-side for socket joins is a future hardening step.
- Guest identity is browser-local and stored under `nexus:player-guest-id:v1`; clearing browser storage creates a new guest profile.
- Legacy CloudStorage and `sessionStorage` deck values are intentionally ignored. MongoDB player profiles are the durable source of truth for owned cards, opened starter boosters, and saved decks.
