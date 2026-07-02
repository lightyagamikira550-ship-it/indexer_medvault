/** Canonical protocol contract catalog (sync with src/lib/protocolContracts.ts). */

export type ContractAccent = "emerald" | "blue" | "purple" | "amber" | "teal" | "rose" | "violet";

export interface ProtocolContractEntry {
  id: string;
  name: string;
  accent: ContractAccent;
  role: string;
  summary: string;
  keyFunctions: string[];
  related?: string[];
  quirks?: string[];
}

export const PROTOCOL_CONTRACTS: ProtocolContractEntry[] = [
  {
    id: "02",
    name: "MedVaultRegistry.sol",
    accent: "blue",
    role: "Patient vault & Semaphore bridge",
    summary:
      "Patient-facing registry: Semaphore stage, relayer-gated finalize/cancel, salted profile registration.",
    keyFunctions: [
      "registerPatient(..., profileSaltCommitment, ...)",
      "registerPatientViaRelayer(...) onlyAuthorizedRelayer",
      "stageAnonymousApply(...)",
      "finalizeAnonymousApplyWithProof(...) open (P3.2)",
      "cancelAnonymousApplyStage(...) onlyAuthorizedRelayer",
      "scheduleRelayerAuth / applyRelayerAuth",
    ],
    related: ["AnonymousPatientRegistry", "EligibilityEngine"],
    quirks: [
      "P3.1: authorizedRelayers timelock allowlist. P3.2: patient EOA may finalize directly; payout is FHE.select-gated.",
    ],
  },
  {
    id: "03",
    name: "AnonymousPatientRegistry.sol",
    accent: "teal",
    role: "Commitment-keyed ciphertext store",
    summary: "Encrypted profiles keyed by Semaphore commitment; production salt commitment required.",
    keyFunctions: ["registerPatient(..., profileSaltCommitment, ...)", "registerPatientClear (Hardhat only)"],
    related: ["MedVaultRegistry", "EligibilityEngine"],
    quirks: ["Rejects zero and deterministic profile salt commitments on production path."],
  },
  {
    id: "06",
    name: "SponsorRegistry.sol",
    accent: "amber",
    role: "Sponsor allowlist",
    summary: "Verified sponsor allowlist with encrypted institutional IDs and timelocked auditor role.",
    keyFunctions: ["addSponsor(address)", "scheduleAuditor / applyAuditor", "isVerifiedSponsor(address)"],
  },
  {
    id: "09",
    name: "SponsorIncentiveVault.sol",
    accent: "purple",
    role: "Escrow & payouts",
    summary: "Trial escrow, permit-holder-only pool registration, paginated milestone staging, pull-claim confirmReceipt.",
    keyFunctions: [
      "fundTrial(...)",
      "registerAnonymousParticipant (permit holder only)",
      "registerAnonymousParticipantFor (EIP-712)",
      "distributePartialPaginated(...)",
      "prepareEntitlementProof / confirmReceipt",
      "pruneUnconfirmedSlots",
      "claimParticipantRewards",
    ],
    related: ["TrialMilestoneManager", "MedVaultAutomation"],
    quirks: [
      "Sponsor cannot call registerAnonymousParticipant.",
      "distributePartial reverts when participant count > 20.",
      "distributePartial* stages only — cETH on confirmReceipt.",
    ],
  },
  {
    id: "11",
    name: "StakingManager.sol",
    accent: "emerald",
    role: "Private yield",
    summary: "Public Aave stake and confidential stake via stakeAndLock (ERC-7984 operator pull).",
    keyFunctions: ["stake()", "stakeAndLock(encryptedUnits, inputProof)"],
    related: ["ConfidentialETH"],
    quirks: ["requestConfidentialStake / completeConfidentialStake revert Use stakeAndLock."],
  },
  {
    id: "12",
    name: "ConfidentialETH7984.sol",
    accent: "blue",
    role: "IERC7984 encrypted ETH wrapper",
    summary: "Confidential balances, withdraw flows, failed-withdraw escrow recovery.",
    keyFunctions: ["deposit()", "completeWithdraw", "claimFailedWithdraw()"],
    quirks: [
      "pendingFailedWithdrawWei escrow on failed ETH send; completePublicExit failures credit owner, not stealth recipient.",
    ],
  },
  {
    id: "13",
    name: "MedVaultAutomation.sol",
    accent: "rose",
    role: "CRE trial finalization",
    summary: "Keeper upkeep for trial expiry and vault distribution; capped expired-trial prune.",
    keyFunctions: ["checkUpkeep(bytes)", "performUpkeep(bytes)"],
    quirks: ["MAX_PRUNE_PER_UPKEEP = 10 per upkeep."],
  },
  {
    id: "15",
    name: "PatientDocumentStore.sol",
    accent: "teal",
    role: "Hybrid IPFS + FHE document keys",
    summary: "IPFS CID + FHE AES key chunks; atomic revokeAccess rotates CID+key; sponsor pull for decrypt ACL.",
    keyFunctions: ["recordDocumentCid", "revokeAccess", "pullSponsorKeyAccess", "getKeyForSponsor"],
    quirks: ["rotateDocument/updateDocumentKey revert; use atomic revokeAccess. Old IPFS CID must be unpinned off-chain."],
  },
];

/** Legacy entry points that hard-revert — do not call from new integrations. */
export const DEPRECATED_CONTRACT_FUNCTIONS = [
  { contract: "MedVaultRegistry", fn: "applyToTrial(...)", replacement: "stageAnonymousApply + relayer finalize" },
  { contract: "StakingManager", fn: "requestConfidentialStake / completeConfidentialStake", replacement: "stakeAndLock" },
  { contract: "SponsorIncentiveVault", fn: "registerParticipant(uint256,address)", replacement: "registerAnonymousParticipant (permit holder) or registerAnonymousParticipantFor" },
  { contract: "PatientDocumentStore", fn: "updateDocumentKey(...)", replacement: "revokeAccess (atomic with new CID + key)" },
  { contract: "PatientDocumentStore", fn: "rotateDocument(...)", replacement: "revokeAccess (atomic with new CID + key)" },
];
