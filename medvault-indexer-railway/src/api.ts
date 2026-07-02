import express, { Express, Request, Response } from "express";
import type { IndexerConfig } from "./config.js";
import type { IndexerDb } from "./db.js";
import type { IndexerCache } from "./cache.js";
import { getIndexerDesyncAlerts } from "./alerts.js";
import { createIndexerAuthMiddleware } from "./auth.js";

export function createIndexerApi(config: IndexerConfig, db: IndexerDb, cache: IndexerCache): Express {
  const app = express();

  app.use(
    createIndexerAuthMiddleware({
      apiSecret: config.apiSecret,
      healthPublic: config.healthPublic,
    })
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "medvault-indexer" });
  });

  app.get("/alerts", (_req: Request, res: Response) => {
    res.json({ alerts: getIndexerDesyncAlerts() });
  });

  app.get("/trials", async (req: Request, res: Response) => {
    try {
      const activeOnly = req.query.active === "true";
      const cacheKey = `trials:${activeOnly ? "active" : "all"}`;
      const cached = await cache.get<unknown>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const filter = activeOnly ? { active: true } : {};
      const trials = await db
        .trials()
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();

      const payload = {
        trials: trials.map((t) => ({
          id: t.trialId,
          name: t.name,
          phase: t.phase ?? "",
          location: t.location ?? "",
          compensation: t.compensation ?? "",
          active: t.active,
          endTime: t.endTime ?? "0",
          createdAt: t.createdAt ?? "0",
          sponsor: { id: t.sponsor, name: "" },
        })),
      };

      await cache.set(cacheKey, payload, ["trials"], config.cacheTtlSec);
      res.json(payload);
    } catch (err) {
      console.error("[IndexerAPI] GET /trials", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/sponsor/:addr/stats", async (req: Request, res: Response) => {
    try {
      const sponsor = String(req.params.addr).toLowerCase();
      const cacheKey = `sponsor-stats:${sponsor}`;
      const cached = await cache.get<unknown>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const trials = await db.trials().find({ sponsor }).toArray();
      const trialIds = trials.map((t) => t.trialId);

      const [applications, consents, rewards] = await Promise.all([
        db.applications().find({ trialId: { $in: trialIds } }).toArray(),
        db.consents().find({ trialId: { $in: trialIds } }).toArray(),
        db.rewards().find({ trialId: { $in: trialIds } }).toArray(),
      ]);

      const payload = {
        sponsor: {
          id: sponsor,
          name: "",
          trials: trials.map((t) => ({
            id: t.trialId,
            name: t.name,
            active: t.active,
            applications: applications
              .filter((a) => a.trialId === t.trialId)
              .map((a) => ({ id: a._id, status: a.status })),
            eligibilityResults: [],
            consents: consents.filter((c) => c.trialId === t.trialId).map((c) => ({ id: c._id })),
            anonymousSubmissions: applications
              .filter((a) => a.trialId === t.trialId && a.nullifier)
              .map((a) => ({
                id: a._id,
                status: a.status,
                stagedAt: null,
                submittedAt: a.submittedAt ?? "0",
                statusUpdatedAt: a.submittedAt ?? "0",
                fhePropensityCommittedAt: null,
              })),
            propensitySignals: [],
          })),
        },
        stats: {
          trialCount: trials.length,
          applicationCount: applications.length,
          consentCount: consents.length,
          rewardEvents: rewards.length,
        },
      };

      await cache.set(cacheKey, payload, cache.tagsForSponsor(sponsor), config.cacheTtlSec);
      res.json(payload);
    } catch (err) {
      console.error("[IndexerAPI] GET /sponsor/:addr/stats", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/trial/:id/applications", async (req: Request, res: Response) => {
    try {
      const trialId = String(req.params.id);
      const cacheKey = `trial-apps:${trialId}`;
      const cached = await cache.get<unknown>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const applications = await db.applications().find({ trialId }).sort({ submittedAt: -1 }).toArray();
      const payload = {
        trialId,
        applications: applications.map((a) => ({
          id: a._id,
          trialId: a.trialId,
          nullifier: a.nullifier ?? null,
          patient: a.patient ?? null,
          status: a.status,
          submittedAt: a.submittedAt ?? "0",
        })),
      };

      await cache.set(cacheKey, payload, cache.tagsForTrial(trialId), config.cacheTtlSec);
      res.json(payload);
    } catch (err) {
      console.error("[IndexerAPI] GET /trial/:id/applications", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return app;
}

export function startIndexerApi(app: Express, port: number): void {
  app.listen(port, () => {
    console.log(`[IndexerAPI] listening on :${port}`);
  });
}
