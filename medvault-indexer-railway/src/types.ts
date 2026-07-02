/** Idempotent event key: tx hash + log index (no PHI — public chain metadata only). */
export type EventKey = `${string}-${number}`;

export function eventKey(txHash: string, logIndex: number): EventKey {
  return `${txHash.toLowerCase()}-${logIndex}` as EventKey;
}

export interface IndexedTrial {
  _id: string;
  trialId: string;
  sponsor: string;
  name: string;
  phase?: string;
  location?: string;
  compensation?: string;
  active: boolean;
  endTime?: string;
  createdAt?: string;
  encryptedCriteria?: boolean;
  eventKey: EventKey;
  source: "rpc" | "subgraph";
  updatedAt: number;
}

export interface IndexedApplication {
  _id: string;
  trialId: string;
  nullifier?: string;
  patient?: string;
  status: string;
  submittedAt?: string;
  eventKey: EventKey;
  source: "rpc" | "subgraph";
  updatedAt: number;
}

export interface IndexedConsent {
  _id: string;
  trialId: string;
  patient: string;
  granted: boolean;
  validEpoch?: string;
  expiresAt?: string;
  eventKey: EventKey;
  source: "rpc" | "subgraph";
  updatedAt: number;
}

export interface IndexedReward {
  _id: string;
  trialId: string;
  milestoneIndex?: number;
  distributedAt?: string;
  eventKey: EventKey;
  source: "rpc" | "subgraph";
  updatedAt: number;
}

export interface IndexedDocument {
  _id: string;
  trialId: string;
  nullifier: string;
  /** IPFS CID hash or ciphertext handle — never plaintext PHI */
  cidHash?: string;
  patientBlinded?: string;
  eventKey: EventKey;
  source: "rpc" | "subgraph";
  updatedAt: number;
}

export interface IndexerDesyncAlert {
  type: "IndexerDesync";
  at: number;
  entity: string;
  mongoCount: number;
  subgraphCount: number;
  details?: string;
}
