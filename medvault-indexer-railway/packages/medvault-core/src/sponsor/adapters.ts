import { ethers } from "ethers";
import {
  getEligibilityEngine,
  getSponsorIncentiveVault,
  getSponsorRegistry,
  getTrialMilestoneManager,
  getTrialManager,
} from "../contracts/index.js";
import { signRegisterAuthorization } from "./vaultEip712.js";
import {
  parseParticipantCreditFailures,
  type ParticipantCreditFailure,
} from "./vaultDistributionEvents.js";

export type { ParticipantCreditFailure };

export async function fundTrialPool(signer: ethers.Signer, trialId: string, amountEth: string) {
  const vault = getSponsorIncentiveVault(signer);
  const tx = await vault.fundTrial(trialId, { value: ethers.parseEther(amountEth) });
  await tx.wait();
  const funded = await vault.getTotalDeposited(trialId);
  return ethers.formatEther(funded);
}

/** Sponsor may publish trial-level encrypted pool size echo (non-sensitive aggregate). */
export async function publishEncryptedPoolSize(signer: ethers.Signer, trialId: string) {
  const vault = getSponsorIncentiveVault(signer);
  const tx = await vault.makeEncryptedPoolSizePublic(BigInt(trialId));
  await tx.wait();
}

export async function setTrialMilestones(
  signer: ethers.Signer,
  trialId: string,
  milestones: { name: string; weight: number; deadline: number }[]
) {
  const mm = getTrialMilestoneManager(signer);
  const tx = await mm.setMilestones(
    trialId,
    milestones.map((m) => m.name),
    milestones.map((m) => m.weight),
    milestones.map((m) => m.deadline)
  );
  await tx.wait();
}

export async function updateTrialApplicationStatus(
  signer: ethers.Signer,
  trialId: string,
  patientAddress: string,
  newStatus: number,
  decisionMessage: string
) {
  const engine = getEligibilityEngine(signer);
  const hexMessage = ethers.hexlify(ethers.toUtf8Bytes(decisionMessage || "No message provided"));
  const tx = await engine.updateApplicationStatus(trialId, patientAddress, newStatus, hexMessage);
  await tx.wait();
  if (newStatus === 2) {
    const vault = getSponsorIncentiveVault(signer);
    const regTx = await vault.registerParticipant(BigInt(trialId), patientAddress);
    await regTx.wait();
  }
}

export async function distributePartialMilestone(
  signer: ethers.Signer,
  trialId: string,
  milestoneIndex: number
): Promise<{ txHash: string; creditFailures: ParticipantCreditFailure[] }> {
  const vault = getSponsorIncentiveVault(signer);
  const tx = await vault.distributePartialPaginated(trialId, milestoneIndex, 0, 50);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Distribution transaction failed");
  const creditFailures = parseParticipantCreditFailures(receipt, await vault.getAddress());
  return { txHash: receipt.hash, creditFailures };
}

export type RegisterAnonymousParticipantOptions = {
  /**
   * Semaphore identity secret scalar (`identity.secretScalar`).
   * Required when the connected signer is not the decrypt permit holder — routes via
   * `registerAnonymousParticipantFor` (gasless EIP-712).
   */
  identitySecret?: bigint | string;
};

export async function registerAnonymousParticipantByNullifier(
  signer: ethers.Signer,
  trialId: string,
  nullifier: bigint,
  options?: RegisterAnonymousParticipantOptions
) {
  /** MED-3: direct `registerAnonymousParticipant` reverts unless `msg.sender` is the permit holder. */
  const vault = getSponsorIncentiveVault(signer);
  const engine = getEligibilityEngine(signer);
  const tid = BigInt(trialId);
  const permitHolder = await engine.getDecryptPermitHolder(nullifier, tid);
  if (permitHolder && permitHolder !== ethers.ZeroAddress) {
    const alreadyRegistered = await vault.isParticipantRegistered(tid, permitHolder);
    if (alreadyRegistered) return;
  }

  const provider = signer.provider;
  if (!provider) throw new Error("Wallet provider not available");

  const signerAddress = (await signer.getAddress()).toLowerCase();
  const holderIsSigner =
    permitHolder &&
    permitHolder !== ethers.ZeroAddress &&
    permitHolder.toLowerCase() === signerAddress;

  if (!holderIsSigner) {
    if (!options?.identitySecret) {
      throw new Error(
        "MED-3: signer is not the decrypt permit holder. Pass options.identitySecret (Semaphore identity.secretScalar) for gasless registerAnonymousParticipantFor, or use relayer POST /relay/register-anon."
      );
    }
    if (!permitHolder || permitHolder === ethers.ZeroAddress) {
      throw new Error("No reward permit holder found for this anonymous application.");
    }
    const vaultAddress = await vault.getAddress();
    const chainId = (await provider.getNetwork()).chainId;
    const nonce = BigInt(Date.now());
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const signature = await signRegisterAuthorization(options.identitySecret, chainId, vaultAddress, {
      trialId: tid,
      nullifier,
      permitHolder,
      nonce,
      deadline,
    });
    const tx = await vault.registerAnonymousParticipantFor(
      tid,
      nullifier,
      permitHolder,
      nonce,
      deadline,
      signature
    );
    await tx.wait();
    return;
  }

  const tx = await vault.registerAnonymousParticipant(tid, nullifier);
  await tx.wait();
}

export async function reclaimUndistributedPool(signer: ethers.Signer, trialId: string) {
  const vault = getSponsorIncentiveVault(signer);
  const tx = await vault.reclaimUndistributed(BigInt(trialId));
  await tx.wait();
}

export async function reclaimAbandonedToOwnerPool(signer: ethers.Signer, trialId: string) {
  const vault = getSponsorIncentiveVault(signer);
  const tx = await vault.reclaimAbandonedToOwner(BigInt(trialId));
  await tx.wait();
}

export async function claimReclaimedPool(signer: ethers.Signer, trialId: string) {
  const vault = getSponsorIncentiveVault(signer);
  const tx = await vault.claimReclaimed(BigInt(trialId));
  await tx.wait();
}

export type TrialPoolReclaimStatus = {
  poolFunded: boolean;
  participantCount: number;
  screeningDistributed: boolean;
  reclaimFinalized: boolean;
  trialEnded: boolean;
  gracePeriodElapsed: boolean;
  sponsorVerified: boolean;
  /** Coarse hint without sponsor authorization */
  canReclaimHint: boolean;
  sponsorAuthorized: boolean;
  vaultOwnerAuthorized: boolean;
  canAbandonedReclaim: boolean;
  trialSponsor: string | null;
  /** Sponsor-only; null when unauthorized */
  totalDepositedWei: string | null;
  totalFunded: string | null;
  canReclaim: boolean | null;
  reclaimableWei: string | null;
  reclaimableEth: string | null;
  pendingReclaimWei: string | null;
  pendingReclaimEth: string | null;
  pendingReclaimRecipient: string | null;
  amountsRestrictedReason: string | null;
  privacyNote: string;
};

async function resolveSignerAddress(
  signerOrProvider: ethers.Signer | ethers.Provider
): Promise<string | null> {
  if (!("getAddress" in signerOrProvider) || typeof signerOrProvider.getAddress !== "function") {
    return null;
  }
  try {
    return (await signerOrProvider.getAddress()).toLowerCase();
  } catch {
    return null;
  }
}

export async function getTrialPoolReclaimStatus(
  signerOrProvider: ethers.Signer | ethers.Provider,
  trialId: string,
  trialEndTimeSec?: string | number | null
): Promise<TrialPoolReclaimStatus> {
  const vault = getSponsorIncentiveVault(signerOrProvider);
  const tid = BigInt(trialId);
  const endSec = trialEndTimeSec != null ? Number(trialEndTimeSec) : 0;
  const trialEnded = endSec > 0 && Math.floor(Date.now() / 1000) >= endSec;

  const [participantCountBn, screeningDistributed, reclaimFinalized, poolFunded, pendingReclaimWeiBn, pendingRecipient] =
    await Promise.all([
      vault.getParticipantCount(tid),
      vault.isDistributed(tid),
      vault.reclaimFinalized(tid),
      vault.isPoolFunded(tid),
      vault.pendingReclaimWei(tid),
      vault.pendingReclaimRecipient(tid),
    ]);

  const participantCount = Number(participantCountBn);
  const noParticipants = participantCount === 0;
  const nowSec = Math.floor(Date.now() / 1000);
  let gracePeriodSec = 90 * 24 * 60 * 60;
  try {
    gracePeriodSec = Number(await vault.RECLAIM_GRACE_PERIOD());
  } catch {
    /* use default */
  }
  const gracePeriodElapsed =
    noParticipants || (endSec > 0 && nowSec >= endSec + gracePeriodSec);

  const pendingReclaimWei =
    pendingReclaimWeiBn > 0n ? pendingReclaimWeiBn.toString() : null;
  const pendingReclaimEth =
    pendingReclaimWeiBn > 0n ? ethers.formatEther(pendingReclaimWeiBn) : null;
  const pendingReclaimRecipient =
    pendingRecipient !== ethers.ZeroAddress ? pendingRecipient : null;

  let trialSponsor: string | null = null;
  try {
    const tm = getTrialManager(signerOrProvider);
    const trial = await tm.getTrial(tid);
    trialSponsor = String(trial.sponsor).toLowerCase();
  } catch {
    /* trial may not exist */
  }

  const signerAddress = await resolveSignerAddress(signerOrProvider);
  const sponsorAuthorized =
    Boolean(signerAddress && trialSponsor && signerAddress === trialSponsor);

  let sponsorVerified = true;
  if (trialSponsor) {
    try {
      const registry = getSponsorRegistry(signerOrProvider);
      sponsorVerified = await registry.isVerifiedSponsor(trialSponsor);
    } catch {
      sponsorVerified = true;
    }
  }

  let vaultOwnerAuthorized = false;
  if (signerAddress) {
    try {
      const vaultOwner = String(await vault.owner()).toLowerCase();
      vaultOwnerAuthorized = signerAddress === vaultOwner;
    } catch {
      vaultOwnerAuthorized = false;
    }
  }

  const canReclaimHint =
    trialEnded && !reclaimFinalized && poolFunded && (screeningDistributed || noParticipants);

  const canAbandonedReclaim =
    vaultOwnerAuthorized &&
    trialEnded &&
    gracePeriodElapsed &&
    poolFunded &&
    !reclaimFinalized &&
    trialSponsor != null &&
    !sponsorVerified &&
    pendingReclaimWeiBn === 0n;

  const privacyNote =
    "Pool amounts are sponsor-private on-chain. Public callers only see whether a pool is funded.";

  const shared = {
    poolFunded,
    participantCount,
    screeningDistributed,
    reclaimFinalized,
    trialEnded,
    gracePeriodElapsed,
    sponsorVerified,
    canReclaimHint,
    vaultOwnerAuthorized,
    canAbandonedReclaim,
    trialSponsor,
    pendingReclaimWei,
    pendingReclaimEth,
    pendingReclaimRecipient,
    privacyNote,
  };

  if (!sponsorAuthorized) {
    return {
      ...shared,
      sponsorAuthorized: false,
      totalDepositedWei: null,
      totalFunded: null,
      canReclaim: null,
      reclaimableWei: null,
      reclaimableEth: null,
      amountsRestrictedReason: signerAddress
        ? "Connected signer is not the trial sponsor; exact amounts are withheld"
        : "MCP_PRIVATE_KEY not set or signer unavailable; exact amounts are withheld",
    };
  }

  const totalDepositedWei = await vault.getTotalDeposited(tid);
  const reclaimableWei =
    totalDepositedWei > 0n && !reclaimFinalized && noParticipants ? totalDepositedWei : 0n;
  const canReclaim =
    sponsorVerified &&
    trialEnded &&
    !reclaimFinalized &&
    totalDepositedWei > 0n &&
    (screeningDistributed || noParticipants);

  return {
    ...shared,
    sponsorAuthorized: true,
    totalDepositedWei: totalDepositedWei.toString(),
    totalFunded: ethers.formatEther(totalDepositedWei),
    canReclaim,
    reclaimableWei: reclaimableWei.toString(),
    reclaimableEth: ethers.formatEther(reclaimableWei),
    amountsRestrictedReason: null,
  };
}

export async function deactivateTrial(signer: ethers.Signer, trialId: string) {
  const tm = getTrialManager(signer);
  const tx = await tm.deactivateTrial(BigInt(trialId));
  await tx.wait();
}
