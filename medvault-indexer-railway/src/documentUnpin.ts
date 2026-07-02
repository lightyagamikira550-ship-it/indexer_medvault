import { ethers } from "ethers";
import { unpinCidFromPinata } from "./ipfsUnpin.js";

const DOCUMENT_STORE_ABI = [
  "event DocumentLegacyHandleRevoked(uint256 indexed nullifier, uint256 indexed trialId, bytes32 indexed oldCidHash, bytes32 oldKeyHandleHash0, bytes32 oldKeyHandleHash1, bytes32 oldKeyHandleHash2, bytes32 oldKeyHandleHash3, string oldCid)",
  "function postIndexerHeartbeat() external",
  "function attestLegacyCidUnpinned(uint256 _nullifier, uint256 _trialId, bytes32 _oldCidHash, string _oldCid) external",
  "function isUnpinIndexerActive(address _indexer) external view returns (bool)",
];

export interface LegacyRevokePayload {
  nullifier: bigint;
  trialId: bigint;
  oldCidHash: string;
  oldCid: string;
  txHash: string;
  logIndex: number;
}

export class DocumentUnpinWorker {
  private readonly iface = new ethers.Interface(DOCUMENT_STORE_ABI);
  private readonly processed = new Set<string>();

  constructor(
    private readonly documentStoreAddress: string,
    private readonly provider: ethers.JsonRpcProvider,
    private readonly signer: ethers.Wallet | null
  ) {}

  async processLegacyRevoke(payload: LegacyRevokePayload): Promise<"skipped" | "unpinned" | "attested"> {
    const key = `${payload.txHash}:${payload.logIndex}`;
    if (this.processed.has(key)) return "skipped";
    this.processed.add(key);

    if (!this.signer) {
      console.warn("[DocumentUnpin] INDEXER_PRIVATE_KEY unset — skipping unpin/attest");
      return "skipped";
    }

    try {
      await unpinCidFromPinata(payload.oldCid);
    } catch (err) {
      console.error("[DocumentUnpin] Pinata unpin failed", payload.oldCid, err);
      throw err;
    }

    const store = new ethers.Contract(this.documentStoreAddress, DOCUMENT_STORE_ABI, this.signer);
    const active: boolean = await store.isUnpinIndexerActive(this.signer.address);
    if (!active) {
      await (await store.postIndexerHeartbeat()).wait();
    }
    await (
      await store.attestLegacyCidUnpinned(
        payload.nullifier,
        payload.trialId,
        payload.oldCidHash,
        payload.oldCid
      )
    ).wait();
    return "attested";
  }

  parseLegacyRevokeLog(log: ethers.Log): LegacyRevokePayload | null {
    if (log.address.toLowerCase() !== this.documentStoreAddress.toLowerCase()) return null;
    const parsed = this.iface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed || parsed.name !== "DocumentLegacyHandleRevoked") return null;
    return {
      nullifier: parsed.args.nullifier,
      trialId: parsed.args.trialId,
      oldCidHash: parsed.args.oldCidHash,
      oldCid: parsed.args.oldCid,
      txHash: log.transactionHash,
      logIndex: log.index,
    };
  }
}
