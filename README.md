# MedVault Indexer — Standalone Railway Deploy

Self-contained package for hosting the MedVault **read-cache indexer** from a **separate GitHub account**. Includes `@medvault/indexer` + `@medvault/core`. No dependency on the main medvault monorepo.

The subgraph stays canonical; this service adds faster reads (Redis cache) and indexes a few RPC-only events (`SilentApply`, `DocumentRecorded`).

---

## Folder structure

```text
medvault-indexer-railway/
├── Dockerfile              # Railway build (do not change unless you know why)
├── package.json
├── package-lock.json       # required for Docker npm ci
├── tsconfig.json
├── .env.example            # copy values to Railway Variables
├── .dockerignore
├── .gitignore
├── src/                    # indexer source (13 files)
└── packages/
    └── medvault-core/      # contract addresses, ABIs, config helpers
        ├── data/
        └── src/
```

**Upload the whole folder** to GitHub. Do **not** upload `node_modules/` or `dist/` — Docker builds those.

---

## Step 1 — GitHub

1. Create a new empty repo on your second GitHub account (e.g. `your-account/indexer`).
2. Upload this folder:
   - GitHub → **Add file** → **Upload files** → drag all contents, **or**
   - `git init`, `git add .`, `git commit`, `git push`
3. Confirm these exist in the repo root: `Dockerfile`, `package.json`, `package-lock.json`, `src/`, `packages/medvault-core/`.

---

## Step 2 — Railway project

Create **3 services** in one Railway project:

| Service | Type |
|---------|------|
| **indexer** | GitHub repo (this folder) |
| **Mongo** | Database → MongoDB |
| **Redis** | Database → Redis |

### Indexer service settings

| Setting | Value |
|---------|--------|
| Root Directory | *(blank)* |
| Builder | **Dockerfile** |
| Dockerfile path | `/Dockerfile` |
| Healthcheck path | `/health` |
| Serverless | **OFF** (indexer runs background sync) |

### Generate public domain

**Networking** → **Public Networking** → **Generate Domain**

Test after deploy:

```bash
curl https://YOUR-RAILWAY-DOMAIN.up.railway.app/health
```

Expected: `{"ok":true,"service":"medvault-indexer"}`

Wait ~30s, then:

```bash
curl https://YOUR-RAILWAY-DOMAIN.up.railway.app/trials
```

---

## Step 3 — Environment variables

Set these on the **indexer** service (not Vercel). See `.env.example`.

```env
INDEXER_PORT=${{PORT}}
MONGODB_URI=${{Mongo.MONGO_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
MEDVAULT_SUBGRAPH_URL=https://api.studio.thegraph.com/query/1755644/medvault/v0.2.0
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
MEDVAULT_NETWORK=sepolia
```

### Mongo URL: private vs public

| Indexer runs on… | Use |
|------------------|-----|
| **Railway** (same project as Mongo) | **Private** `MONGO_URL` → `${{Mongo.MONGO_URL}}` |
| **Your PC** (local dev) | **Public** `MONGO_PUBLIC_URL` |

Replace `Mongo` and `Redis` with your actual Railway service names if different.

### Do NOT set yet

```env
# INDEXER_API_SECRET=...
```

The med-vault.xyz frontend does not send Bearer tokens yet. If you set this, the browser falls back to the subgraph silently.

---

## Step 4 — Connect to med-vault.xyz (optional)

The indexer has no CORS headers. Proxy through Vercel (same-origin).

**1. `vercel.json`** — add **before** the SPA catch-all `/(.*)`:

```json
{
  "source": "/indexer/:path*",
  "destination": "https://YOUR-RAILWAY-DOMAIN.up.railway.app/:path*"
}
```

**2. Vercel env:**

```env
VITE_INDEXER_URL=https://med-vault.xyz/indexer
```

**3. Redeploy** the frontend (Vite reads env at build time).

**4. Browser check:** `https://med-vault.xyz/indexer/health`

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/alerts` | Subgraph vs Mongo desync alerts |
| GET | `/trials` | Trial list (`?active=true` optional) |
| GET | `/sponsor/:addr/stats` | Sponsor dashboard aggregates |
| GET | `/trial/:id/applications` | Applications for one trial |

---

## Local test (optional)

Requires Mongo + Redis running locally:

```bash
npm install
npm run build
MONGODB_URI=mongodb://127.0.0.1:27017/medvault \
REDIS_URL=redis://127.0.0.1:6379 \
MEDVAULT_SUBGRAPH_URL=https://api.studio.thegraph.com/query/1755644/medvault/v0.2.0 \
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY \
npm start
```

Open `http://127.0.0.1:3300/health`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails `COPY packages/...` | Ensure `packages/medvault-core/` was uploaded |
| Build fails `npm ci` | Ensure `package-lock.json` is in repo root |
| Deploy crash on start | Check `MONGODB_URI` and `REDIS_URL` (use private URLs on Railway) |
| `/health` OK, app ignores indexer | Set `VITE_INDEXER_URL` on Vercel + use `/indexer` proxy, not Railway URL directly |
| `INDEXER_API_SECRET` set | Remove it until frontend supports Bearer auth |
| Empty `/trials` at first | Normal — sync runs every 15s |

---

## What this is NOT

- Not the main medvault repo — safe to host on a different GitHub account
- Not required for the app to work — without it, the frontend uses The Graph subgraph only
- Not where you put `OPENAI_API_KEY` or Pinata keys — those are separate services

---

## Checklist

- [ ] Folder uploaded to GitHub (includes `packages/medvault-core/`)
- [ ] Railway: Mongo + Redis + indexer deployed
- [ ] Variables set (`INDEXER_PORT=${{PORT}}`, private Mongo/Redis URLs)
- [ ] Public domain generated
- [ ] `curl .../health` returns OK
- [ ] (Optional) Vercel proxy + `VITE_INDEXER_URL` + redeploy
