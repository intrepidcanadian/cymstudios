# Deploying CYM Studio

The site runs on a **Vultr VPS**: Nginx reverse proxy → Next.js on `localhost:3000`
under PM2, with Let's Encrypt for TLS. There is no serverless platform involved —
environment variables live in a file on the box, and cron jobs are entries in the
system crontab.

---

## First-time provisioning

One script does the whole box. Edit the config block at the top of
[`deploy/setup-vps.sh`](deploy/setup-vps.sh) first (`DOMAIN`, `REPO_URL`), then:

```bash
ssh root@<vps-ip>
```

```bash
bash setup-vps.sh
```

It creates a non-root `cymapp` user, installs Node 20 / Nginx / Certbot /
fail2ban, clones the repo to `/var/www/cymstudio`, builds, starts PM2 with boot
persistence, configures Nginx, issues the TLS cert, installs the cron jobs, and
enables the firewall.

Afterwards, fill in `/var/www/cymstudio/.env.local` — the script seeds it from
`.env.example` at mode 600 but cannot know your secrets.

---

## Deploying updates

From your **local** machine, once changes are pushed to `main`:

```bash
bash deploy/deploy.sh root@<vps-ip>
```

That SSHes in, pulls `main`, runs `npm ci`, rebuilds, and restarts PM2.

Two `NODE_OPTIONS` in that script are load-bearing, not incidental:

- `--max-old-space-size=1792` — a Next 14 production build needs ~1.5 GB heap;
  Vultr's 1.9 GB tier OOMs at Node's default limit.
- `--dns-result-order=ipv4first` — `next/font/google` fetches fonts at build
  time, and IPv6 resolves on Vultr but stalls, failing the font download.

---

## Environment variables

There is no dashboard. Variables live in `/var/www/cymstudio/.env.local`
(mode 600, owned by `cymapp`), which takes precedence over `.env`.

```bash
nano /var/www/cymstudio/.env.local
```

A change only takes effect once PM2 reloads the environment — a plain
`pm2 restart` keeps the old values:

```bash
pm2 restart cymstudio --update-env
```

See [SETUP.md](SETUP.md) for what each variable does.

---

## Cron jobs

Installed by step 14b of `setup-vps.sh`, all invoked through
[`deploy/cron-hit.sh`](deploy/cron-hit.sh):

| Endpoint | Schedule | Why |
|---|---|---|
| `/api/sync-brands` | daily 04:00 | Refreshes the catalogue. Must run inside the 48h rebate freshness window, or the USD margin rebate silently disables itself for every product. |
| `/api/cron/resolve-pending-orders` | every 15 min | Finalizes stuck/timed-out orders, reconciles the rebate. |
| `/api/cron/refresh-exchange-rates` | every 8h | Keeps the FX cache warm. Must fire more often than `STALE_CACHE_MAX_AGE_MS` (12h) or a quiet period 503s non-USD checkout. |

`cron-hit.sh` resolves `CRON_SECRET` from the app's env files at runtime and
calls `http://localhost:3000` directly, bypassing Nginx and TLS. **Never add a
crontab line with the bearer token inline.** If one leaks, rotate `CRON_SECRET`
in `.env.local` and `pm2 restart cymstudio --update-env`.

Entries are tagged `# CYM-CRON` so re-running the setup script replaces them
rather than duplicating them.

---

## Database migrations

Supabase is separate from the VPS and is **not** touched by a deploy. Apply
migrations *before* deploying code that depends on them — the app writes new
columns on the very first request.

```bash
npx supabase db query --linked -f supabase/migrations/<file>.sql
```

Then verify against the live schema (read-only):

```bash
node --env-file=.env supabase/audit_schema.mjs
```

The audit goes through PostgREST, the same path the app uses, so it also catches
a stale schema cache — a column can exist in Postgres and still 500 the app
until PostgREST reloads.

> `supabase/migrations/` is currently gitignored, so migration files do not
> travel with a deploy and must be applied by hand. That gap is why migrations
> 004, 005 and 006 exist — each repairs columns that were added directly in the
> dashboard and subsequently lost.

---

## Health checks

```bash
pm2 status
```

```bash
pm2 logs cymstudio --lines 100
```

```bash
tail -f /var/log/cym-refresh-rates.log /var/log/cym-resolve-orders.log
```

---

## Troubleshooting

**App won't start after deploy** — `pm2 logs cymstudio`. Usually a missing env
var: the build succeeds and the route throws at runtime.

**Build OOMs** — check `NODE_OPTIONS` survived any edits to `deploy.sh`.

**Env change had no effect** — you need `--update-env` on the restart.

**Purchases 500 immediately** — almost always an unapplied migration. Run the
schema audit above.

**502 from Nginx** — the Node process is down. `pm2 status`, then
`pm2 restart cymstudio`.
