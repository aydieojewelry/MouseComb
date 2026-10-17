# MouseComb backend (PocketBase)

One small Go binary: PocketBase embedded as a framework, plus MouseComb's schema and sync rules. It stores data in SQLite next to the binary, uses about 30–60 MB of RAM idle, and serves:

| Collection | Holds | Access |
|---|---|---|
| `users` (built in) | email + password accounts | each user sees only themselves |
| `items` | every synced record: settings, snippets, bindings, workflows, extension data (`kind` tells them apart) | owner only |
| `devices` | PCs and phones signed in to an account | owner only |

Server-side rules in `main.go`:
- an item's `user`, `kind` and `key` can't change after creation;
- an update with an older `mtime` than the stored one is rejected with `409`, so an old offline edit never overwrites a newer one.

Schema lives in `migrations/` and runs automatically on start. New item kinds (for example from an extension) need no migration.

## Run locally

Requires Go 1.27+ (`GOTOOLCHAIN=auto` downloads it if needed).

```sh
cd services/pocketbase
go run . serve --http 127.0.0.1:8090
# admin UI: http://127.0.0.1:8090/_/  (create the first superuser from the link it prints)
```

The desktop app uses `http://127.0.0.1:8090` by default in development (Settings → Account → Server).

## Build a release binary

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o mousecomb-server .   # Linux x64 VM
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o mousecomb-server .   # Arm VM (Oracle Ampere)
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o mousecomb-server.exe .
```

No C compiler is needed (SQLite is pure Go here).

## Free 24/7 hosting

| Option | Cost | 24/7 | Notes |
|---|---|---|---|
| **Google Cloud Always Free e2-micro** | free within limits | yes | 1 small VM in `us-west1`, `us-central1` or `us-east1`, 30 GB disk, about 1 GB/month outbound traffic. Needs a billing account. Enough for personal use and early users. |
| **Oracle Cloud Always Free (Ampere A1)** | free | yes | Much bigger Arm VM. Needs a card at signup; idle free VMs can be reclaimed, so keep an eye on it. |
| A spare PC or Raspberry Pi + Cloudflare Tunnel | free | only while it's on | No open ports needed. |
| Render free, Fly.io, Railway | — | no | Free tiers sleep, need credits, or no longer exist for new accounts. |

Check each provider's current free-tier terms before relying on them; they change.

### Deploy on a VM (any of the above)

```sh
# on the VM, as a normal user
mkdir -p ~/mousecomb && cd ~/mousecomb
# copy mousecomb-server here, then:
sudo setcap 'cap_net_bind_service=+ep' ./mousecomb-server   # allow ports 80/443
./mousecomb-server serve api.yourdomain.com                  # gets an HTTPS certificate automatically
```

Point a DNS `A` record for `api.yourdomain.com` at the VM first (any free DNS, e.g. Cloudflare). Run it as a `systemd` service so it restarts on reboot (`deploy/mousecomb-server.service`).

### Backups
Admin UI → Settings → Backups: schedule daily backups to any S3-compatible storage (Cloudflare R2's free tier works).

## Why PocketBase (and when Firebase)
- **PocketBase** (default): free, open source, one binary, you own the data, easy to move between hosts, fast REST + realtime API that the Rust client talks to directly.
- **Firebase** (Spark plan): no server to run and no card needed, but the data lives in Google's format and you're tied to its pricing as you grow. The app talks to the backend through a `Backend` trait (`crates/mc-sync`), so a Firebase adapter can be added without touching the rest of the app.
