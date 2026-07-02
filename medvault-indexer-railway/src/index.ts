import { loadIndexerConfig } from "./config.js";
import { IndexerDb } from "./db.js";
import { IndexerCache } from "./cache.js";
import { IndexerSync } from "./sync.js";
import { IndexerReconcile } from "./reconcile.js";
import { createIndexerApi, startIndexerApi } from "./api.js";

async function main(): Promise<void> {
  const config = loadIndexerConfig();
  const db = new IndexerDb(config.mongodbUri);
  const cache = new IndexerCache(config.redisUrl, config.cacheTtlSec);

  await db.connect();
  await cache.connect();

  const sync = new IndexerSync(config, db, cache);
  const reconcile = new IndexerReconcile(config, db);
  const app = createIndexerApi(config, db, cache);

  await sync.start();
  reconcile.start();
  startIndexerApi(app, config.port);

  const shutdown = async () => {
    sync.stop();
    reconcile.stop();
    await cache.close();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("[Indexer] fatal", err);
  process.exit(1);
});
