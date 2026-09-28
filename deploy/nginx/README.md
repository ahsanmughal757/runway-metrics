# nginx — operator runbook

This directory is the entire web tier for the VPS deployment: it serves the built
SPA, terminates TLS, and proxies `/api/` to the API container. It also carries the
document's security headers, because `backend/src/main.ts:36` disables helmet's
CSP on the stated assumption that nginx owns it.

## Assumptions baked into the config — reconcile these first

| Assumption | Where | If it is wrong |
| --- | --- | --- |
| API is reachable as `api:4000` on the compose network | `upstream runway_api` | `env.ts:94` defaults `PORT` to 4000. Change the `server` line to match the real port *and* the service name in compose. |
| SPA is served from the domain root | `vite.config.ts` sets no `base` | If a base path is ever added, every `/assets/` reference above has to change with it. |
| `api` publishes **no** host port | — | If it does, everything this config isolates is bypassable from the internet. That is a compose change, not an nginx one. |
| Build output at `/usr/share/nginx/html` | `root` in the 443 server | Baked in by the `web` target in the root `Dockerfile`, not mounted. If either side moves, move both — a `root` pointing at an empty directory 404s every deep link. |

## This configuration is baked into the image, not mounted

`default.conf` and `snippets/` are copied in by the `Dockerfile`'s `web` target,
and the stock server block is removed so it cannot answer first. Only
`deploy/certs` is mounted, because certificates are per-deployment and rotate.

Two consequences worth knowing before changing anything:

- **Editing this config requires a rebuild**, not a reload. The reload commands
  below reload the *running* container's copy; if you edited the file on disk and
  reloaded without rebuilding, you reloaded the old config and changed nothing.
- **A fresh clone cannot start `web` at all.** nginx refuses a config whose
  `ssl_certificate` is missing, so get the certificate (next section) before the
  first `docker compose up`. That is deliberate: a front door that quietly falls
  back to plain HTTP because a certificate was forgotten is the exact failure
  this layer exists to prevent.

There is one volume in the `web` service:

```yaml
volumes:
  - ./deploy/certs:/etc/nginx/certs:ro
```

### Startup ordering — nginx will not boot before `api` resolves

Verified, not theoretical: `nginx -t` fails with

```
[emerg] host not found in upstream "api:4000"
```

because nginx resolves upstream names at **config parse time**, not per request.
If the `web` container starts first, it crash-loops until `api` is on the compose
network; `restart: unless-stopped` will get it there, but the log is alarming and
the first deploy looks broken. compose already handles this — the `web` service
has:

```yaml
depends_on:
  api:
    condition: service_healthy
```

which is stronger than `service_started`: it also means nginx is not started
against an API that is up but not yet answering, so the first requests do not
502.

The alternative — a `resolver` plus a variable in `proxy_pass` — makes nginx
start regardless, at the cost of the `upstream` keepalive pool, because a
variable target cannot be pooled. Not worth it here.

## Pointing it at a real domain and cert

1. Replace `runway.example.com` in both `server` blocks. It appears twice on
   purpose: the redirect uses `$server_name`, so the two must agree.
2. Get a certificate before the first start — nginx will not start without one:

   ```bash
   # DNS must already resolve. Use the webroot method because default.conf
   # already serves /.well-known/acme-challenge/ over plain HTTP.
   certbot certonly --webroot -w /var/www/certbot -d runway.example.com
   ```

   Then point `ssl_certificate` at
   `/etc/letsencrypt/live/runway.example.com/fullchain.pem` and
   `privkey.pem`, or copy them into `/etc/nginx/certs/`. Use **fullchain**, not
   the leaf: a missing intermediate is a browser warning, and once HSTS is cached
   the user cannot click through it.
3. Renewals need a reload hook, otherwise nginx keeps serving the old cert until
   it is next restarted:

   ```bash
   # /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
   #!/bin/sh
   docker compose exec web nginx -s reload
   ```

## Validate, then reload

```bash
# Always validate before a reload. An invalid config takes the whole site down
# on the next reload, and reload is the only way to pick up a new one.
docker compose exec web nginx -t
docker compose exec web nginx -s reload
```

`nginx -t` exits non-zero and prints the offending line. It does **not** reload
anything, so it is safe to run against a live container.

To check the config without a running container — what CI should run. Assumes
bash, because the deploy target is a Linux VPS:

```bash
# --add-host stands in for the compose network, which is the only reason `api`
# resolves at all. Without it `nginx -t` fails on "host not found in upstream",
# which is the ordering trap above rather than a defect in the config.
docker run --rm --add-host api:127.0.0.1 \
  -v "$PWD/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/snippets:/etc/nginx/snippets:ro" \
  -v "$PWD/../certs:/etc/nginx/certs:ro" \
  nginx:alpine nginx -t
```

A certificate has to exist before this can pass: nginx refuses to load a config
whose `ssl_certificate` is missing, so `deploy/certs/` cannot be empty.

## Rollback

A reload is reversible; the file on disk is the previous revision only if you
still have it. The reliable version does not depend on that:

```bash
git stash                       # or: git checkout <last-good-sha> -- deploy/nginx
docker compose up -d --force-recreate web
```

Recreating is the honest rollback, because `nginx -s reload` cannot un-apply a
config that has already broken something at request time, only one that fails to
parse. `restart: unless-stopped` on the service will come back on its own after
a config error, which is a safety net and not a strategy.

## Verify the thing that was actually broken

Before this config existed, every deep link 404'd on a hard refresh. Check it
with a real request, not by clicking around — the SPA's own navigation never hits
the fallback:

```bash
curl -sI https://runway.example.com/metrics | head -1   # expect HTTP/2 200
curl -s  https://runway.example.com/metrics | grep -c '<div id="root">'  # expect 1
curl -sI https://runway.example.com/assets/ | head -1   # expect 404, not HTML
curl -sI https://runway.example.com/health/ready | head -1  # expect 404 by design
```

The last one is intentional: readiness does a live `SELECT 1` and is meant to be
reached over the compose network by the healthcheck, not from the internet. An
uptime monitor pointed at it would otherwise get a permanent 200 from the SPA
fallback and report green forever.

## Known follow-ups, deliberately not done here

- **`trust proxy` is set, and the value here is the correct one.** Phase 6 added
  `TRUST_PROXY_HOPS` to `backend/src/config/env.ts` and applied it in `main.ts`;
  it defaults to `1` and `backend/.env.example` sets it to `1` explicitly. One
  hop is this nginx, the only thing permitted to reach the api service. Do not
  raise it: the value is how many proxies Express walks back through
  `X-Forwarded-For`, so a higher number lets a client forge its own client IP and
  walk past the per-IP login rate limit.
- **Brotli** is commented out in `default.conf` because the stock nginx image has
  no `ngx_brotli` module and the directive is a startup failure rather than a
  warning. Switch to an image that ships it to turn it on; ~15-20% smaller assets.
- **Google Fonts** are the app's only external dependency (`frontend/index.html`).
  Self-hosting them would remove them from `style-src`/`font-src`/`COEP` and from
  the critical rendering path. It is a frontend change.
