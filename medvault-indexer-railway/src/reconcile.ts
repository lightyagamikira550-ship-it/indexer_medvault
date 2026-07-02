import type { IndexerConfig } from "./config.js";
import type { IndexerDb } from "./db.js";
import { emitIndexerDesync } from "./alerts.js";

const SUBGRAPH_TRIAL_COUNT = `
  query IndexerReconcileTrialCount {
    trials(first: 1000) { id }
  }
`;

async function fetchSubgraph<T>(url: string, query: string, variables?: Record<string, unknown>): Promise<T | null> {
  if (!url) return null;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  if (!response.ok) return null;
  const result = (await response.json()) as { data?: T; errors?: unknown[] };
  if (result.errors?.length) return null;
  return result.data ?? null;
}

export class IndexerReconcile {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private config: IndexerConfig,
    private db: IndexerDb
  ) {}

  start(): void {
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.config.reconcileIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<void> {
    const mongoCount = await this.db.countTrials();
    const mongoIds = await this.db.trialIds();

    const subgraphData = await fetchSubgraph<{ trials: { id: string }[] }>(
      this.config.subgraphUrl,
      SUBGRAPH_TRIAL_COUNT
    );
    if (!subgraphData?.trials) {
      return;
    }

    const subgraphIds = subgraphData.trials.map((t) => t.id).sort();
    const subgraphCount = subgraphIds.length;

    if (mongoCount !== subgraphCount) {
      emitIndexerDesync({
        entity: "trials",
        mongoCount,
        subgraphCount,
        details: `Trial count mismatch: mongo=${mongoCount} subgraph=${subgraphCount}`,
      });
      return;
    }

    const mongoSet = new Set(mongoIds);
    const missingInMongo = subgraphIds.filter((id) => !mongoSet.has(id));
    if (missingInMongo.length > 0) {
      emitIndexerDesync({
        entity: "trials",
        mongoCount,
        subgraphCount,
        details: `Missing trial IDs in MongoDB: ${missingInMongo.slice(0, 5).join(", ")}`,
      });
    }
  }
}

/** Exported for tests — compare two ID sets and emit alert on divergence. */
export function reconcileTrialIds(
  mongoIds: string[],
  subgraphIds: string[],
  emit = emitIndexerDesync
): boolean {
  const mongoCount = mongoIds.length;
  const subgraphCount = subgraphIds.length;
  if (mongoCount !== subgraphCount) {
    emit({
      entity: "trials",
      mongoCount,
      subgraphCount,
      details: "count mismatch",
    });
    return false;
  }
  const mongoSet = new Set(mongoIds);
  const missing = subgraphIds.filter((id) => !mongoSet.has(id));
  if (missing.length > 0) {
    emit({
      entity: "trials",
      mongoCount,
      subgraphCount,
      details: `missing: ${missing.join(",")}`,
    });
    return false;
  }
  return true;
}

export { fetchSubgraph };
