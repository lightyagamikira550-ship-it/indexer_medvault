/**
 * Encrypt sponsor trial criteria for `TrialManager.createTrialWithEncryptedCriteria`.
 * Uses `@zama-fhe/relayer-sdk/node` (same pattern as scripts/demo-fhe-lifecycle.mjs).
 */
import { ethers } from "ethers";
export interface SponsorCriteriaValues {
  minAge: number;
  maxAge: number;
  requiresDiabetes: boolean;
  minHb: number;
  genderRequirement: number;
  minHeight: number;
  maxWeight: number;
  requiresNonSmoker: boolean;
  requiresNormalBP: boolean;
}

export interface EncryptedSponsorCriteria {
  minAge: unknown;
  maxAge: unknown;
  requiresDiabetes: unknown;
  minHb: unknown;
  genderRequirement: unknown;
  minHeight: unknown;
  maxWeight: unknown;
  requiresNonSmoker: unknown;
  requiresNormalBP: unknown;
  inputProof: string;
}

export async function buildSponsorCriteriaInputs(
  rpcUrl: string,
  trialManagerAddress: string,
  sponsorAddress: string,
  criteria: SponsorCriteriaValues
): Promise<EncryptedSponsorCriteria> {
  const { createInstance, SepoliaConfig } = await import("@zama-fhe/relayer-sdk/node");
  const fhevm = await createInstance({ ...SepoliaConfig, network: rpcUrl });
  const input = fhevm.createEncryptedInput(trialManagerAddress, sponsorAddress);
  input.add8(criteria.minAge);
  input.add8(criteria.maxAge);
  input.addBool(criteria.requiresDiabetes);
  input.add16(criteria.minHb);
  input.add8(criteria.genderRequirement);
  input.add8(criteria.minHeight);
  input.add16(criteria.maxWeight);
  input.addBool(criteria.requiresNonSmoker);
  input.addBool(criteria.requiresNormalBP);
  const { handles, inputProof } = await input.encrypt();
  if (handles.length < 9) {
    throw new Error("Expected 9 encrypted criteria handles from FHE encrypt");
  }
  const proofHex =
    typeof inputProof === "string"
      ? inputProof
      : ethers.hexlify(inputProof);
  return {
    minAge: handles[0],
    maxAge: handles[1],
    requiresDiabetes: handles[2],
    minHb: handles[3],
    genderRequirement: handles[4],
    minHeight: handles[5],
    maxWeight: handles[6],
    requiresNonSmoker: handles[7],
    requiresNormalBP: handles[8],
    inputProof: proofHex,
  };
}
