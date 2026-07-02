import dotenv from "dotenv";
import { loadConfigFromEnv, getContractAddresses } from "@medvault/core";

dotenv.config();

export interface IndexerConfig {
  port: number;
  mongodbUri: string;
  redisUrl: string;
  subgraphUrl: string;
  rpcUrl: string;
  networkKey: "sepolia" | "hardhat";
  syncIntervalMs: number;
  reconcileIntervalMs: number;
  cacheTtlSec: number;
  /** Bearer secret for data routes; empty = public (dev only). */
  apiSecret: string;
  /** When true, GET /health remains public even when apiSecret is set. */
  healthPublic: boolean;
  /** Wallet for on-chain unpin attestations (optional). */
  indexerPrivateKey: string;
  /** When false, skip eth_getLogs RPC sync (subgraph-only). */
  rpcSyncEnabled: boolean;
  /** Blocks to look back on startup / reset. */
  rpcLookbackBlocks: number;
  /** Max block span per eth_getLogs request. */
  rpcChunkBlocks: number;
  /** Pause between consecutive getLogs calls (free-tier RPC friendly). */
  rpcScanDelayMs: number;
  /** When true, only scan RPC-only events (SilentApply, Document*). */
  rpcMinimal: boolean;
  contracts: {
    trialManager: string;
    eligibilityEngine: string;
    consentManager: string;
    sponsorIncentiveVault: string;
    patientDocumentStore: string;
  };
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return defaultValue;
  return raw !== "false" && raw !== "0" && raw !== "no";
}

export function loadIndexerConfig(): IndexerConfig {
  const core = loadConfigFromEnv();
  const networkKey = core.networkKey;

  const net = getContractAddresses(networkKey);
  if (!net) {
    throw new Error(`No contract addresses for network: ${networkKey}`);
  }

  return {
    port: Number(process.env.INDEXER_PORT ?? 3300),
    mongodbUri: requireEnv("MONGODB_URI", "mongodb://127.0.0.1:27017/medvault"),
    redisUrl: requireEnv("REDIS_URL", "redis://127.0.0.1:6379"),
    subgraphUrl: requireEnv("MEDVAULT_SUBGRAPH_URL", core.subgraphUrl || process.env.VITE_SUBGRAPH_URL),
    rpcUrl: core.rpcUrl,
    networkKey,
    syncIntervalMs: Number(process.env.INDEXER_SYNC_INTERVAL_MS ?? 60_000),
    reconcileIntervalMs: Number(process.env.INDEXER_RECONCILE_INTERVAL_MS ?? 60_000),
    cacheTtlSec: Number(process.env.INDEXER_CACHE_TTL_SEC ?? 60),
    apiSecret: process.env.INDEXER_API_SECRET?.trim() ?? "",
    healthPublic: process.env.INDEXER_HEALTH_PUBLIC !== "false",
    indexerPrivateKey: process.env.INDEXER_PRIVATE_KEY?.trim() ?? "",
    rpcSyncEnabled: envBool("INDEXER_RPC_SYNC", true),
    rpcLookbackBlocks: Number(process.env.INDEXER_RPC_LOOKBACK_BLOCKS ?? 50),
    rpcChunkBlocks: Number(process.env.INDEXER_RPC_CHUNK_BLOCKS ?? 100),
    rpcScanDelayMs: Number(process.env.INDEXER_RPC_SCAN_DELAY_MS ?? 800),
    rpcMinimal: envBool("INDEXER_RPC_MINIMAL", true),
    contracts: {
      trialManager: net.TrialManager,
      eligibilityEngine: net.EligibilityEngine,
      consentManager: net.ConsentManager,
      sponsorIncentiveVault: net.SponsorIncentiveVault,
      patientDocumentStore: net.PatientDocumentStore ?? "0x0000000000000000000000000000000000000000",
    },
  };
}
