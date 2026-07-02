# MedVault Indexer (standalone Railway deploy)

Self-contained copy of `@medvault/indexer` + `@medvault/core` for deploying from a **separate GitHub account** to Railway. No dependency on the main medvault monorepo.

## What's included

- `src/` — indexer HTTP API, Mongo sync, Redis cache
- `packages/medvault-core/` — contract addresses, config, subgraph helpers
- `Dockerfile` — production build for Railway

## Railway setup

1. Create a new GitHub repo and push this folder.
2. Railway → **New Project** → deploy from that repo.
3. Settings:
   - **Root Directory:** *(blank)*
   - **Dockerfile path:** `/Dockerfile`
   - **Healthcheck path:** `/health`
   - **Serverless:** OFF
4. Add **MongoDB** and **Redis** services in the same Railway project.
5. Set variables on the **indexer** service:

```env
INDEXER_PORT=${{PORT}}
MONGODB_URI=${{Mongo.MONGO_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
MEDVAULT_SUBGRAPH_URL=https://api.studio.thegraph.com/query/1755644/medvault/v0.2.0
SEPOLIA_RPC_URL=<your Sepolia RPC>
MEDVAULT_NETWORK=sepolia
```

Replace `Mongo` / `Redis` with your actual Railway service names if different.

6. **Generate Domain** under Public Networking.
7. Test: `curl https://YOUR-DOMAIN/health`

## Connect to med-vault.xyz (Vercel)

Add to `vercel.json` **before** the SPA catch-all:

```json
{
  "source": "/indexer/:path*",
  "destination": "https://YOUR-RAILWAY-DOMAIN/:path*"
}
```

Set on Vercel:

```env
VITE_INDEXER_URL=https://med-vault.xyz/indexer
```

Redeploy the frontend.

## Local test (optional)

```bash
npm install
npm run build
# Requires local Mongo + Redis
MONGODB_URI=mongodb://127.0.0.1:27017/medvault REDIS_URL=redis://127.0.0.1:6379 npm start
```

## API routes

| Method | Path |
|--------|------|
| GET | `/health` |
| GET | `/alerts` |
| GET | `/trials` |
| GET | `/sponsor/:addr/stats` |
| GET | `/trial/:id/applications` |
