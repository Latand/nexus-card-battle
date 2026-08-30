# Deploy

The app is prepared for two deployment paths:

- Vercel can build the Next.js UI, but the human-vs-human arena needs a long-lived WebSocket server. Use the Docker/self-host path for PvP.
- Docker Compose runs one Node process that serves Next.js and `/ws` on the same internal port.

## Docker Compose

```bash
docker compose up -d --build
```

Compose starts two services:

- `mongo`: MongoDB 7 with the persistent `nexus_mongodb_data` volume.
- `nexus-card-battle`: the production Node/Next.js/WebSocket server.

Defaults:

- Container port: `3000`
- Host bind: `127.0.0.1:3010`
- Override with `APP_HOST` and `APP_PORT`
- App MongoDB URI: `mongodb://mongo:27017/nexus-card-battle`
- Override the app database by setting `MONGODB_URI` before `docker compose up`
- Telegram Mini App auth requires `TELEGRAM_BOT_TOKEN`
- Player session cookies are signed with `NEXUS_SESSION_SECRET`; set it to a long random value before production deploys

The app waits for the Compose MongoDB healthcheck before starting. When `MONGODB_URI` is not set in the shell, the app uses the in-Compose `mongo` hostname. To use an external MongoDB instance instead:

```bash
MONGODB_URI=mongodb://mongo.example.internal:27017/nexus-card-battle docker compose up -d --build
```

Port override example:

```bash
APP_PORT=3025 docker compose up -d --build
```

Validate the Compose file without starting services:

```bash
docker compose config --quiet
MONGODB_URI=mongodb://external.example:27017/custom docker compose config --quiet
```

## Botfather Deployment

Production currently runs from the `BotfatherDEV` SSH host.

- Remote path: `/home/botfather/bots/nexus-card-battle`
- Git remote: `git@github.com:Latand/nexus-card-battle.git`
- Host bind: `127.0.0.1:3010`
- App container: `nexus-card-battle`
- Mongo container: `nexus-card-battle-mongo`
- Mongo volume: `nexus-card-battle_nexus_mongodb_data`

Use one persistent login shell so the working directory and command output stay easy to audit:

```bash
ssh -tt BotfatherDEV 'bash -l'
cd /home/botfather/bots/nexus-card-battle
```

Update to the latest `main` with a clean fast-forward only:

```bash
git fetch origin main --prune
git status --short --branch
git rev-parse HEAD origin/main
git log --oneline --decorate HEAD..origin/main --max-count=20
git merge --ff-only origin/main
git status --short --branch
git rev-parse HEAD
```

Validate and deploy with Docker Compose:

```bash
docker compose config --quiet
docker compose up -d --build
```

Post-deploy checks:

```bash
for i in {1..30}; do
  h=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' nexus-card-battle 2>/dev/null || true)
  echo "app_health=$h"
  [ "$h" = healthy ] && break
  sleep 2
done

docker compose ps
curl -fsS -o /tmp/nexus-root.html -w 'root:%{http_code}\n' http://127.0.0.1:3010/
curl -fsS -o /tmp/nexus-boosters.json -w 'boosters:%{http_code}\n' http://127.0.0.1:3010/api/boosters
wc -c /tmp/nexus-root.html /tmp/nexus-boosters.json
docker compose logs --tail=120 nexus-card-battle | grep -Ei 'error|exception|failed' || true
docker compose logs --tail=120 mongo | grep -Ei 'error|exception|failed' || true
```

Do not print `.env` files or environment dumps in the terminal output. If `git status` is dirty or `git merge --ff-only` fails, stop and inspect before deploying.

## Nginx

Put Nginx in front of the Compose port. The WebSocket endpoint is `/ws`, so the proxy must pass upgrade headers.

```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 443 ssl http2;
  server_name example.com;

  location / {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
  }
}
```

## CloudFront and Cloudflare

Keep the public app, `/api/*`, and `/ws` on one HTTPS origin. The arena authenticates Telegram players inside the WebSocket protocol with Telegram-signed `initData`; the server verifies its signature, age, and claimed player identity before queueing.

The session cookie remains `HttpOnly; Secure; SameSite=Lax`. Embedded Telegram clients can omit that cookie from the WebSocket upgrade, so arena authentication does not depend on its presence. Guest sessions and HTTP mutations still use the signed cookie.

For CloudFront, configure separate uncached behaviors for `/api/*` and `/ws`:

- Use the `CachingDisabled` managed cache policy for both behaviors.
- Attach an origin request policy that forwards all viewer cookies, or allowlists `nexus_player_session`. CloudFront removes viewer cookies and origin `Set-Cookie` headers when cookie forwarding is disabled.
- For `/ws`, use the `AllViewer` managed origin request policy or explicitly forward `Sec-WebSocket-Key` and `Sec-WebSocket-Version`. Forwarding the remaining `Sec-WebSocket-*` headers is recommended.
- Use HTTPS from viewer to edge and from edge to origin.

For Cloudflare, keep Network > WebSockets enabled and add cache bypass rules for `/api/*` and `/ws`. Remove any response-header transform that strips `Set-Cookie`; an Edge TTL override can otherwise strip that header from cache-eligible responses.

References: [CloudFront WebSockets](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.websockets.html), [CloudFront cookie forwarding](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Cookies.html), and [Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/).

Verification from an embedded client should show:

1. `POST /api/player` returns `200` and a `Set-Cookie` response header.
2. `/ws` upgrades with `101`.
3. The first `join_human` frame includes `telegramInitData` for a Telegram player.
4. A valid signed identity receives `queued` or `match_ready`; a missing or invalid credential receives the arena authentication error.

## Publish To GitHub

Create an empty GitHub repository, then from this folder:

```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

If the remote already exists:

```bash
git remote set-url origin git@github.com:<you>/<repo>.git
git push -u origin main
```
