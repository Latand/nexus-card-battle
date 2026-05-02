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
