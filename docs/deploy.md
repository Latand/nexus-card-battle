# Deploy

The app is prepared for two deployment paths:

- Vercel can build the Next.js UI, but the human-vs-human arena needs a long-lived WebSocket server. Use the Docker/self-host path for PvP.
- Docker Compose runs one Node process that serves Next.js and `/ws` on the same internal port.

## Docker Compose

```bash
docker compose up -d --build
```

Defaults:

- Container port: `3000`
- Host bind: `127.0.0.1:3010`
- Override with `APP_HOST` and `APP_PORT`

Example:

```bash
APP_PORT=3025 docker compose up -d --build
```

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
