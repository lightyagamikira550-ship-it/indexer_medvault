import { ethers } from "ethers";
import addresses from "../../data/addresses.json" with { type: "json" };
import AnonymousPatientRegistryAbi from "../../data/abis/AnonymousPatientRegistry.json" with { type: "json" };
import TrialManagerAbi from "../../data/abis/TrialManager.json" with { type: "json" };
import ConsentManagerAbi from "../../data/abis/ConsentManager.json" with { type: "json" };
import EligibilityEngineAbi from "../../data/abis/EligibilityEngine.json" with { type: "json" };
import ConfidentialETHAbi from "../../data/abis/ConfidentialETH.json" with { type: "json" };
import SponsorIncentiveVaultAbi from "../../data/abis/SponsorIncentiveVault.json" with { type: "json" };
import DataAccessLogAbi from "../../data/abis/DataAccessLog.json" with { type: "json" };
import TrialMilestoneManagerAbi from "../../data/abis/TrialMilestoneManager.json" with { type: "json" };
import SponsorRegistryAbi from "../../data/abis/SponsorRegistry.json" with { type: "json" };
import MedVaultAutomationAbi from "../../data/abis/MedVaultAutomation.json" with { type: "json" };
import StakingManagerAbi from "../../data/abis/StakingManager.json" with { type: "json" };
import MedVaultRegistryAbi from "../../data/abis/MedVaultRegistry.json" with { type: "json" };
import EncryptedScoreLeaderboardAbi from "../../data/abis/EncryptedScoreLeaderboard.json" with { type: "json" };
import HonkVerifierAbi from "../../data/abis/HonkVerifier.json" with { type: "json" };
import HonkVerifierEncryptedAbi from "../../data/abis/HonkVerifierEncrypted.json" with { type: "json" };

export type ContractName =
  | "AnonymousPatientRegistry"
  | "TrialManager"
  | "ConsentManager"
  | "EligibilityEngine"
  | "ConfidentialETH"
  | "SponsorIncentiveVault"
  | "DataAccessLog"
  | "TrialMilestoneManager"
  | "SponsorRegistry"
  | "MedVaultAutomation"
  | "StakingManager"
  | "MedVaultRegistry"
  | "EncryptedScoreLeaderboard"
  | "HonkVerifier"
  | "HonkVerifierEncrypted";

export { addresses };

export const getContractAddresses = (network = "sepolia") => {
  return (addresses as Record<string, Record<string, string>>)[network];
};

export const resolveNetworkKey = (chainId?: bigint | number): "sepolia" | "hardhat" => {
  if (chainId === undefined) return "sepolia";
  const normalized = typeof chainId === "number" ? BigInt(chainId) : chainId;
  if (normalized === 11155111n) return "sepolia";
  if (normalized === 31337n) return "hardhat";
  throw new Error(`Unsupported chainId: ${normalized.toString()}`);
};

const getAbi = (abiData: unknown) => {
  return Array.isArray(abiData) ? abiData : (abiData as { abi: unknown }).abi;
};

const abiMap: Record<ContractName, unknown> = {
  AnonymousPatientRegistry: AnonymousPatientRegistryAbi,
  TrialManager: TrialManagerAbi,
  ConsentManager: ConsentManagerAbi,
  EligibilityEngine: EligibilityEngineAbi,
  ConfidentialETH: ConfidentialETHAbi,
  SponsorIncentiveVault: SponsorIncentiveVaultAbi,
  DataAccessLog: DataAccessLogAbi,
  TrialMilestoneManager: TrialMilestoneManagerAbi,
  SponsorRegistry: SponsorRegistryAbi,
  MedVaultAutomation: MedVaultAutomationAbi,
  StakingManager: StakingManagerAbi,
  MedVaultRegistry: MedVaultRegistryAbi,
  EncryptedScoreLeaderboard: EncryptedScoreLeaderboardAbi,
  HonkVerifier: HonkVerifierAbi,
  HonkVerifierEncrypted: HonkVerifierEncryptedAbi,
};

export const getContract = (
  contractName: ContractName,
  signerOrProvider: ethers.Signer | ethers.Provider,
  networkOrChainId?: string | bigint | number
) => {
  const network =
    networkOrChainId === undefined
      ? "sepolia"
      : typeof networkOrChainId === "string"
        ? networkOrChainId
        : resolveNetworkKey(networkOrChainId);
  const networkAddresses = getContractAddresses(network);
  if (!networkAddresses) {
    throw new Error(`No addresses found for network: ${network}`);
  }
  const address = networkAddresses[contractName];
  if (!address) {
    throw new Error(`Address for ${contractName} not found on network: ${network}`);
  }
  if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
    throw new Error(`Invalid or zero address for ${contractName} on network: ${network}`);
  }
  const abi = getAbi(abiMap[contractName]);
  return new ethers.Contract(address, abi as ethers.InterfaceAbi, signerOrProvider);
};

export const getTrialManager = (signer: ethers.Signer | ethers.Provider, chainId?: bigint | number) =>
  getContract("TrialManager", signer, chainId);
export const getSponsorIncentiveVault = (signer: ethers.Signer | ethers.Provider, chainId?: bigint | number) =>
  getContract("SponsorIncentiveVault", signer, chainId);
export const getTrialMilestoneManager = (signer: ethers.Signer | ethers.Provider, chainId?: bigint | number) =>
  getContract("TrialMilestoneManager", signer, chainId);
export const getEligibilityEngine = (signer: ethers.Signer | ethers.Provider, chainId?: bigint | number) =>
  getContract("EligibilityEngine", signer, chainId);
export const getSponsorRegistry = (signer: ethers.Signer | ethers.Provider, chainId?: bigint | number) =>
  getContract("SponsorRegistry", signer, chainId);
export const getDataAccessLog = (signer: ethers.Signer | ethers.Provider, chainId?: bigint | number) =>
  getContract("DataAccessLog", signer, chainId);
export const getMedVaultAutomation = (signer: ethers.Signer | ethers.Provider, chainId?: bigint | number) =>
  getContract("MedVaultAutomation", signer, chainId);
