import type { IndexerDesyncAlert } from "./types.js";

const alerts: IndexerDesyncAlert[] = [];
const listeners = new Set<(alert: IndexerDesyncAlert) => void>();

export function emitIndexerDesync(alert: Omit<IndexerDesyncAlert, "type" | "at">): IndexerDesyncAlert {
  const full: IndexerDesyncAlert = {
    type: "IndexerDesync",
    at: Date.now(),
    ...alert,
  };
  alerts.push(full);
  if (alerts.length > 100) alerts.shift();
  console.error("[IndexerDesync]", JSON.stringify(full));
  for (const fn of listeners) {
    try {
      fn(full);
    } catch (err) {
      console.error("[IndexerDesync] listener error", err);
    }
  }
  return full;
}

export function getIndexerDesyncAlerts(): IndexerDesyncAlert[] {
  return [...alerts];
}

export function onIndexerDesync(listener: (alert: IndexerDesyncAlert) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetIndexerDesyncAlerts(): void {
  alerts.length = 0;
}
