import { ethers } from "ethers";
import type { IndexerConfig } from "./config.js";
import type { IndexerDb } from "./db.js";
import type { IndexerCache } from "./cache.js";
import { fetchSubgraph } from "./reconcile.js";
import { eventKey } from "./types.js";
import { DocumentUnpinWorker } from "./documentUnpin.js";

const TRIAL_MANAGER_ABI = [
  "event TrialCreated(uint256 indexed trialId, address indexed sponsor, string name, uint256 endTime, bool encryptedCriteria)",
];
const ELIGIBILITY_ENGINE_ABI = [
  "event EligibilityProofVerified(uint256 indexed nullifier, uint256 indexed trialId, bytes32 attestationResultHash, bytes32 attestationFheStageHash, bytes32 attestationCriteriaSchemaHash, bool eligible)",
  "event SilentApply(uint256 indexed nullifier, uint256 indexed trialId)",
  "event AnonymousApplicationStatusUpdated(uint256 indexed nullifier, uint256 indexed trialId, uint8 status)",
];
const CONSENT_MANAGER_ABI = ["event ConsentChanged()"];
const VAULT_ABI = [
  "event RewardsDistributed(uint256 indexed trialId)",
  "event MilestoneRewardsDistributed(uint256 indexed trialId, uint256 milestoneIndex)",
];
const DOCUMENT_STORE_ABI = [
  "event DocumentRecorded(uint256 indexed nullifier, uint256 indexed trialId, bytes32 cidHash, bytes32 patientBlinded)",
  "event DocumentLegacyHandleRevoked(uint256 indexed nullifier, uint256 indexed trialId, bytes32 indexed oldCidHash, bytes32 oldKeyHandleHash0, bytes32 oldKeyHandleHash1, bytes32 oldKeyHandleHash2, bytes32 oldKeyHandleHash3, string oldCid)",
];

const SUBGRAPH_TRIALS = `
  query IndexerSyncTrials($first: Int!, $skip: Int!) {
    trials(first: $first, skip: $skip, orderBy: createdAt) {
      id
      name
      phase
      location
      compensation
      active
      endTime
      createdAt
      encryptedCriteria
      sponsor { id }
    }
  }
`;

const SUBGRAPH_APPLICATIONS = `
  query IndexerSyncApplications($first: Int!, $skip: Int!) {
    anonymousSubmissions(first: $first, skip: $skip, orderBy: submittedAt) {
      id
      trialId
      nullifier
      status
      submittedAt
      txHash
    }
    applications(first: $first, skip: $skip, orderBy: updatedAt) {
      id
      patient
      status
      updatedAt
      txHash
      trial { id }
    }
  }
`;

const SUBGRAPH_CONSENTS = `
  query IndexerSyncConsents($first: Int!, $skip: Int!) {
    consents(first: $first, skip: $skip, orderBy: lastUpdatedAt) {
      id
      patient
      granted
      validEpoch
      expiresAt
      txHash
      trial { id }
    }
  }
`;

const SUBGRAPH_REWARDS = `
  query IndexerSyncRewards($first: Int!, $skip: Int!) {
    auditLogs(first: $first, skip: $skip, where: { action_in: ["RewardsDistributed", "MilestoneRewardsDistributed"] }) {
      id
      trialId
      transactionHash
      timestamp
      action
    }
  }
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return (
    text.includes("Too Many Requests") ||
    text.includes("-32005") ||
    text.includes("rate limit") ||
    text.includes("BAD_DATA")
  );
}

export class IndexerSync {
  private provider: ethers.JsonRpcProvider;
  private lastSyncedBlock = 0;
  private running = false;
  private unpinWorker: DocumentUnpinWorker | null;

  constructor(
    private config: IndexerConfig,
    private db: IndexerDb,
    private cache: IndexerCache
  ) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const signer = config.indexerPrivateKey
      ? new ethers.Wallet(config.indexerPrivateKey, this.provider)
      : null;
    this.unpinWorker =
      config.contracts.patientDocumentStore !== ethers.ZeroAddress
        ? new DocumentUnpinWorker(config.contracts.patientDocumentStore, this.provider, signer)
        : null;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    if (this.config.rpcSyncEnabled) {
      try {
        const head = await this.provider.getBlockNumber();
        this.lastSyncedBlock = Math.max(0, head - this.config.rpcLookbackBlocks);
      } catch (err) {
        console.warn("[IndexerSync] RPC head lookup failed; subgraph-only until next tick", err);
      }
    }

    try {
      await this.syncOnce();
    } catch (err) {
      console.error("[IndexerSync] initial sync error (API already up)", err);
    }
    this.schedule();
  }

  stop(): void {
    this.running = false;
  }

  private schedule(): void {
    if (!this.running) return;
    setTimeout(async () => {
      try {
        await this.syncOnce();
      } catch (err) {
        console.error("[IndexerSync] sync error", err);
      }
      this.schedule();
    }, this.config.syncIntervalMs);
  }

  async syncOnce(): Promise<void> {
    await this.syncFromSubgraph();
    if (!this.config.rpcSyncEnabled) return;
    try {
      await this.syncFromRpc();
    } catch (err) {
      console.warn("[IndexerSync] RPC sync skipped this tick", err);
    }
  }

  private async paginateSubgraph<T>(
    query: string,
    extract: (data: Record<string, unknown>) => T[]
  ): Promise<T[]> {
    const pageSize = 100;
    const all: T[] = [];
    for (let skip = 0; skip < 10_000; skip += pageSize) {
      const data = await fetchSubgraph<Record<string, unknown>>(this.config.subgraphUrl, query, {
        first: pageSize,
        skip,
      });
      if (!data) break;
      const batch = extract(data);
      all.push(...batch);
      if (batch.length < pageSize) break;
    }
    return all;
  }

  async syncFromSubgraph(): Promise<void> {
    if (!this.config.subgraphUrl) return;

    const trials = await this.paginateSubgraph(SUBGRAPH_TRIALS, (d) => (d.trials as unknown[]) ?? []);
    for (const t of trials as Array<Record<string, string | boolean | { id: string }>>) {
      const trialId = String(t.id);
      const key = eventKey(`subgraph-trial-${trialId}`, 0);
      await this.db.upsertTrial({
        _id: trialId,
        trialId,
        sponsor: String((t.sponsor as { id: string })?.id ?? "").toLowerCase(),
        name: String(t.name ?? ""),
        phase: String(t.phase ?? ""),
        location: String(t.location ?? ""),
        compensation: String(t.compensation ?? ""),
        active: Boolean(t.active),
        endTime: t.endTime != null ? String(t.endTime) : undefined,
        createdAt: t.createdAt != null ? String(t.createdAt) : undefined,
        encryptedCriteria: Boolean(t.encryptedCriteria),
        eventKey: key,
        source: "subgraph",
        updatedAt: Date.now(),
      });
    }

    const apps = await this.paginateSubgraph(SUBGRAPH_APPLICATIONS, (d) => [
      ...(((d.anonymousSubmissions as unknown[]) ?? []) as object[]),
      ...(((d.applications as unknown[]) ?? []) as object[]),
    ]);
    for (const a of apps as Array<Record<string, unknown>>) {
      const trialId = String(a.trialId ?? (a.trial as { id: string })?.id ?? "");
      const id = String(a.id ?? `${trialId}-${a.nullifier ?? a.patient}`);
      const tx = String(a.txHash ?? `subgraph-app-${id}`);
      const key = eventKey(tx, 0);
      await this.db.upsertApplication({
        _id: id,
        trialId,
        nullifier: a.nullifier != null ? String(a.nullifier) : undefined,
        patient: a.patient != null ? String(a.patient).toLowerCase() : undefined,
        status: String(a.status ?? "Pending"),
        submittedAt: a.submittedAt != null ? String(a.submittedAt) : a.updatedAt != null ? String(a.updatedAt) : undefined,
        eventKey: key,
        source: "subgraph",
        updatedAt: Date.now(),
      });
    }

    const consents = await this.paginateSubgraph(SUBGRAPH_CONSENTS, (d) => (d.consents as unknown[]) ?? []);
    for (const c of consents as Array<Record<string, unknown>>) {
      const trialId = String((c.trial as { id: string })?.id ?? "");
      const patient = String(c.patient ?? "").toLowerCase();
      const id = String(c.id ?? `${patient}-${trialId}`);
      const tx = String(c.txHash ?? `subgraph-consent-${id}`);
      await this.db.upsertConsent({
        _id: id,
        trialId,
        patient,
        granted: Boolean(c.granted),
        validEpoch: c.validEpoch != null ? String(c.validEpoch) : undefined,
        expiresAt: c.expiresAt != null ? String(c.expiresAt) : undefined,
        eventKey: eventKey(tx, 0),
        source: "subgraph",
        updatedAt: Date.now(),
      });
    }

    const rewards = await this.paginateSubgraph(SUBGRAPH_REWARDS, (d) => (d.auditLogs as unknown[]) ?? []);
    for (const r of rewards as Array<Record<string, unknown>>) {
      const trialId = String(r.trialId ?? "");
      const tx = String(r.transactionHash ?? r.id ?? `subgraph-reward-${trialId}`);
      await this.db.upsertReward({
        _id: String(r.id ?? `${trialId}-${tx}`),
        trialId,
        distributedAt: r.timestamp != null ? String(r.timestamp) : undefined,
        eventKey: eventKey(tx, 0),
        source: "subgraph",
        updatedAt: Date.now(),
      });
    }

    await this.cache.invalidateTags(["trials"]);
  }

  async syncFromRpc(): Promise<void> {
    const head = await this.provider.getBlockNumber();
    const from = this.lastSyncedBlock + 1;
    if (from > head) return;

    const chunk = Math.max(1, this.config.rpcChunkBlocks);
    const to = Math.min(head, from + chunk - 1);
    const invalidatedTags = new Set<string>();
    const minimal = this.config.rpcMinimal;

    if (!minimal) {
      await this.scanContract(
        this.config.contracts.trialManager,
        TRIAL_MANAGER_ABI,
        "TrialCreated",
        from,
        to,
        async (log, parsed) => {
          const trialId = parsed.args.trialId.toString();
          const sponsor = String(parsed.args.sponsor).toLowerCase();
          const key = eventKey(log.transactionHash, log.index);
          await this.db.upsertTrial({
            _id: trialId,
            trialId,
            sponsor,
            name: parsed.args.name,
            active: true,
            endTime: parsed.args.endTime.toString(),
            encryptedCriteria: Boolean(parsed.args.encryptedCriteria),
            eventKey: key,
            source: "rpc",
            updatedAt: Date.now(),
          });
          invalidatedTags.add("trials");
          invalidatedTags.add(`sponsor:${sponsor}`);
        }
      );

      await this.scanContract(
        this.config.contracts.eligibilityEngine,
        ELIGIBILITY_ENGINE_ABI,
        "EligibilityProofVerified",
        from,
        to,
        async (log, parsed) => {
          const trialId = parsed.args.trialId.toString();
          const nullifier = parsed.args.nullifier.toString();
          const id = `${nullifier}-${trialId}`;
          const key = eventKey(log.transactionHash, log.index);
          await this.db.upsertApplication({
            _id: id,
            trialId,
            nullifier,
            status: parsed.args.eligible ? "Pending" : "Rejected",
            submittedAt: String((await log.getBlock())?.timestamp ?? 0),
            eventKey: key,
            source: "rpc",
            updatedAt: Date.now(),
          });
          invalidatedTags.add(`applications:${trialId}`);
          invalidatedTags.add("trials");
        }
      );
    }

    // RPC-only: not in hosted subgraph schema
    await this.scanContract(
      this.config.contracts.eligibilityEngine,
      ELIGIBILITY_ENGINE_ABI,
      "SilentApply",
      from,
      to,
      async (log, parsed) => {
        const trialId = parsed.args.trialId.toString();
        const nullifier = parsed.args.nullifier.toString();
        const id = `silent-${nullifier}-${trialId}`;
        const key = eventKey(log.transactionHash, log.index);
        await this.db.upsertApplication({
          _id: id,
          trialId,
          nullifier,
          status: "Accepted",
          submittedAt: String((await log.getBlock())?.timestamp ?? 0),
          eventKey: key,
          source: "rpc",
          updatedAt: Date.now(),
        });
        invalidatedTags.add(`applications:${trialId}`);
      }
    );

    if (!minimal) {
      await this.scanContract(
        this.config.contracts.consentManager,
        CONSENT_MANAGER_ABI,
        "ConsentChanged",
        from,
        to,
        async (log) => {
          const key = eventKey(log.transactionHash, log.index);
          const block = await log.getBlock();
          await this.db.upsertConsent({
            _id: key,
            trialId: "0",
            patient: ethers.ZeroAddress,
            granted: true,
            eventKey: key,
            source: "rpc",
            updatedAt: block?.timestamp ?? Date.now(),
          });
          invalidatedTags.add("trials");
        }
      );

      await this.scanContract(
        this.config.contracts.sponsorIncentiveVault,
        VAULT_ABI,
        "RewardsDistributed",
        from,
        to,
        async (log, parsed) => {
          const trialId = parsed.args.trialId.toString();
          const key = eventKey(log.transactionHash, log.index);
          await this.db.upsertReward({
            _id: key,
            trialId,
            eventKey: key,
            source: "rpc",
            updatedAt: Date.now(),
          });
          invalidatedTags.add(`trial:${trialId}`);
        }
      );

      await this.scanContract(
        this.config.contracts.sponsorIncentiveVault,
        VAULT_ABI,
        "MilestoneRewardsDistributed",
        from,
        to,
        async (log, parsed) => {
          const trialId = parsed.args.trialId.toString();
          const key = eventKey(log.transactionHash, log.index);
          await this.db.upsertReward({
            _id: key,
            trialId,
            milestoneIndex: Number(parsed.args.milestoneIndex),
            eventKey: key,
            source: "rpc",
            updatedAt: Date.now(),
          });
          invalidatedTags.add(`trial:${trialId}`);
        }
      );
    }

    const docAddr = this.config.contracts.patientDocumentStore;
    if (docAddr && docAddr !== ethers.ZeroAddress) {
      await this.scanContract(
        docAddr,
        DOCUMENT_STORE_ABI,
        "DocumentRecorded",
        from,
        to,
        async (log, parsed) => {
          const trialId = parsed.args.trialId.toString();
          const nullifier = parsed.args.nullifier.toString();
          const key = eventKey(log.transactionHash, log.index);
          await this.db.upsertDocument({
            _id: `${nullifier}-${trialId}`,
            trialId,
            nullifier,
            cidHash: parsed.args.cidHash,
            patientBlinded: parsed.args.patientBlinded,
            eventKey: key,
            source: "rpc",
            updatedAt: Date.now(),
          });
          invalidatedTags.add(`applications:${trialId}`);
        }
      );

      await this.scanContract(
        docAddr,
        DOCUMENT_STORE_ABI,
        "DocumentLegacyHandleRevoked",
        from,
        to,
        async (log, parsed) => {
          if (!this.unpinWorker) return;
          const payload = this.unpinWorker.parseLegacyRevokeLog(log);
          if (!payload) return;
          try {
            await this.unpinWorker.processLegacyRevoke(payload);
          } catch (err) {
            console.error("[IndexerSync] legacy unpin failed", err);
          }
          const trialId = parsed.args.trialId.toString();
          invalidatedTags.add(`applications:${trialId}`);
        }
      );
    }

    if (invalidatedTags.size > 0) {
      await this.cache.invalidateTags([...invalidatedTags] as Parameters<IndexerCache["invalidateTags"]>[0]);
    }

    this.lastSyncedBlock = to;
  }

  private async scanContract(
    address: string,
    abi: string[],
    eventName: string,
    from: number,
    to: number,
    handler: (log: ethers.Log, parsed: ethers.LogDescription) => Promise<void>
  ): Promise<void> {
    const iface = new ethers.Interface(abi);
    const topic = iface.getEvent(eventName)!.topicHash;
    const logs = await this.getLogsWithRetry({ address, fromBlock: from, toBlock: to, topics: [topic] });
    for (const log of logs) {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed) continue;
      await handler(log, parsed);
    }
    if (this.config.rpcScanDelayMs > 0) {
      await sleep(this.config.rpcScanDelayMs);
    }
  }

  private async getLogsWithRetry(filter: ethers.Filter): Promise<ethers.Log[]> {
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.provider.getLogs(filter);
      } catch (err) {
        if (!isRateLimitError(err) || attempt === maxAttempts - 1) throw err;
        const backoff = this.config.rpcScanDelayMs * (attempt + 2);
        console.warn(`[IndexerSync] getLogs rate-limited, retry in ${backoff}ms`, err);
        await sleep(backoff);
      }
    }
    return [];
  }
}
