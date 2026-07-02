import { ethers } from "ethers";
import { buildSponsorCriteriaInputs } from "../fhe/buildSponsorCriteriaInputs.js";
import { getSponsorIncentiveVault, getTrialManager, getTrialMilestoneManager } from "../contracts/index.js";
import { normalizeTxError } from "../errors/trialManagerRevert.js";

export interface CreateTrialParams {
  name: string;
  phase: string;
  location: string;
  compensation: string;
  minAge: number;
  maxAge: number;
  requiresDiabetes: boolean;
  minHb: number;
  genderRequirement: number;
  minHeight: number;
  maxWeight: number;
  requiresNonSmoker: boolean;
  requiresNormalBP: boolean;
  durationSeconds: number;
  milestones?: { name: string; weight: number; deadlineOffsetSec: number }[];
  fundingAmountEth?: string;
}

export interface CreateTrialEncryptedOptions {
  /** JSON-RPC URL for Zama FHE encrypt (defaults to SEPOLIA_RPC_URL / MEDVAULT_RPC_URL). */
  rpcUrl?: string;
}

export interface CreateTrialResult {
  trialId: string;
  txHashes: string[];
}

export function computeMilestoneDeadlines(
  milestones: { deadlineOffsetSec: number }[],
  trialDurationSeconds: number
): number[] {
  const now = Math.floor(Date.now() / 1000) + 15;
  const absoluteDeadlines: number[] = [];
  for (let i = 0; i < milestones.length; i++) {
    let absolute = now + milestones[i].deadlineOffsetSec;
    if (i > 0 && absolute <= absoluteDeadlines[i - 1]) {
      absolute = absoluteDeadlines[i - 1] + 1;
    }
    const maxAllowed = now - 15 + trialDurationSeconds;
    if (absolute > maxAllowed) {
      absolute = maxAllowed;
    }
    if (i > 0 && absolute <= absoluteDeadlines[i - 1]) {
      throw new Error("Trial duration is too short for the number of milestones.");
    }
    absoluteDeadlines.push(absolute);
  }
  return absoluteDeadlines;
}

async function resolveRpcUrl(rpcUrl?: string): Promise<string> {
  const url =
    rpcUrl?.trim() ||
    process.env.SEPOLIA_RPC_URL?.trim() ||
    process.env.MEDVAULT_RPC_URL?.trim() ||
    process.env.VITE_SEPOLIA_RPC_URL?.trim();
  if (!url) {
    throw new Error(
      "rpcUrl required for encrypted trial creation — pass options.rpcUrl or set SEPOLIA_RPC_URL"
    );
  }
  return url;
}

function parseTrialCreatedId(
  receipt: ethers.TransactionReceipt,
  trialManager: ethers.Contract
): string {
  const event = receipt.logs
    .map((log) => {
      try {
        return trialManager.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "TrialCreated");

  if (!event?.args) {
    throw new Error("Could not find TrialCreated event in receipt");
  }
  return event.args.trialId.toString();
}

async function applyMilestonesAndFunding(
  signer: ethers.Signer,
  trialId: string,
  params: CreateTrialParams,
  txHashes: string[]
): Promise<void> {
  if (params.milestones?.length) {
    const mm = getTrialMilestoneManager(signer);
    const deadlines = computeMilestoneDeadlines(params.milestones, params.durationSeconds);
    const milestoneTx = await mm.setMilestones(
      trialId,
      params.milestones.map((m) => m.name),
      params.milestones.map((m) => m.weight),
      deadlines
    );
    const mReceipt = await milestoneTx.wait();
    txHashes.push(mReceipt!.hash);
  }

  if (params.fundingAmountEth && parseFloat(params.fundingAmountEth) > 0) {
    const vault = getSponsorIncentiveVault(signer);
    const fundingTx = await vault.fundTrial(trialId, {
      value: ethers.parseEther(params.fundingAmountEth),
    });
    const fReceipt = await fundingTx.wait();
    txHashes.push(fReceipt!.hash);
  }
}

/**
 * @deprecated Hardhat-only (chainid 31337). Use {@link createTrialEncrypted} on Sepolia/mainnet.
 */
export async function createTrialOnChainPlaintext(
  signer: ethers.Signer,
  params: CreateTrialParams
): Promise<CreateTrialResult> {
  if (!params.name?.trim()) {
    throw new Error("Trial name is required");
  }
  const txHashes: string[] = [];
  const trialManager = getTrialManager(signer);

  try {
    const tx = await trialManager.createTrial(
      params.name,
      params.phase,
      params.location,
      params.compensation,
      params.minAge,
      params.maxAge,
      params.requiresDiabetes,
      params.minHb,
      params.genderRequirement,
      params.minHeight,
      params.maxWeight,
      params.requiresNonSmoker,
      params.requiresNormalBP,
      params.durationSeconds
    );
    const receipt = await tx.wait();
    txHashes.push(receipt!.hash);
    const trialId = parseTrialCreatedId(receipt!, trialManager);
    await applyMilestonesAndFunding(signer, trialId, params, txHashes);
    return { trialId, txHashes };
  } catch (err) {
    throw new Error(normalizeTxError(err));
  }
}

/**
 * Create a trial with FHE-encrypted eligibility criteria (production / Sepolia path).
 */
export async function createTrialEncrypted(
  signer: ethers.Signer,
  params: CreateTrialParams,
  options: CreateTrialEncryptedOptions = {}
): Promise<CreateTrialResult> {
  if (!params.name?.trim()) {
    throw new Error("Trial name is required");
  }
  const txHashes: string[] = [];
  const trialManager = getTrialManager(signer);
  const sponsorAddress = await signer.getAddress();
  const tmAddr = await trialManager.getAddress();
  const rpcUrl = await resolveRpcUrl(options.rpcUrl);

  try {
    const encMaxWeight = params.maxWeight > 0 ? params.maxWeight : 65535;
    const encrypted = await buildSponsorCriteriaInputs(rpcUrl, tmAddr, sponsorAddress, {
      minAge: params.minAge,
      maxAge: params.maxAge,
      requiresDiabetes: params.requiresDiabetes,
      minHb: params.minHb,
      genderRequirement: params.genderRequirement,
      minHeight: params.minHeight,
      maxWeight: encMaxWeight,
      requiresNonSmoker: params.requiresNonSmoker,
      requiresNormalBP: params.requiresNormalBP,
    });

    const tx = await trialManager.createTrialWithEncryptedCriteria(
      params.name,
      params.phase,
      params.location,
      params.compensation,
      encrypted.minAge,
      encrypted.maxAge,
      encrypted.requiresDiabetes,
      encrypted.minHb,
      encrypted.genderRequirement,
      encrypted.minHeight,
      encrypted.maxWeight,
      encrypted.requiresNonSmoker,
      encrypted.requiresNormalBP,
      encrypted.inputProof,
      params.durationSeconds
    );
    const receipt = await tx.wait();
    txHashes.push(receipt!.hash);
    const trialId = parseTrialCreatedId(receipt!, trialManager);
    await applyMilestonesAndFunding(signer, trialId, params, txHashes);
    return { trialId, txHashes };
  } catch (err) {
    throw new Error(normalizeTxError(err));
  }
}

/**
 * @deprecated Use {@link createTrialEncrypted} on production networks.
 */
export const createTrialOnChain = createTrialEncrypted;
