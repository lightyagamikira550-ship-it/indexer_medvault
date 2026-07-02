import type { Request, Response, NextFunction } from "express";

export interface IndexerAuthConfig {
  /** When set, data routes require `Authorization: Bearer <secret>`. */
  apiSecret: string;
  /** When true (default), `GET /health` stays public for orchestration probes. */
  healthPublic: boolean;
}

function extractBearer(req: Request): string | undefined {
  return req.headers.authorization?.replace(/^Bearer\s+/i, "").trim() || undefined;
}

/**
 * Bearer-token gate for indexer HTTP routes.
 * Mirrors relayer `RELAYER_PIN_SECRET` pattern (`relayer/server.js`).
 */
export function createIndexerAuthMiddleware(config: IndexerAuthConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.apiSecret) {
      next();
      return;
    }

    if (config.healthPublic && req.path === "/health") {
      next();
      return;
    }

    const token = extractBearer(req);
    if (!token || token !== config.apiSecret) {
      res.status(401).json({ error: "Unauthorized", code: "INDEXER_AUTH_REQUIRED" });
      return;
    }

    next();
  };
}
