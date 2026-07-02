import type { Provider } from "ethers";
import { getContractAddresses, getContract } from "../contracts/index.js";

export interface WiringCheckResult {
  network: string;
  addresses: Record<string, string>;
  vault: {
    owner: string;
    milestoneManager: string;
    automationContract: string;
  };
  automation: {
    vault: string;
    chainlinkForwarder: string;
    firstActiveTrialId: string | null;
  };
  milestoneManagerVault: string;
  trialManagerAutomation: string;
}

export async function checkWiring(
  provider: Provider,
  networkKey = "sepolia"
): Promise<WiringCheckResult> {
  const addresses = getContractAddresses(networkKey);
  if (!addresses) {
    throw new Error(`No addresses for network ${networkKey}`);
  }

  const vault = getContract("SponsorIncentiveVault", provider, networkKey);
  const automation = getContract("MedVaultAutomation", provider, networkKey);
  const mm = getContract("TrialMilestoneManager", provider, networkKey);
  const tm = getContract("TrialManager", provider, networkKey);

  let firstActiveTrialId: string | null = null;
  try {
    const id = await automation.activeTrialIds(0);
    firstActiveTrialId = id.toString();
  } catch {
    firstActiveTrialId = null;
  }

  return {
    network: networkKey,
    addresses,
    vault: {
      owner: String(await vault.owner()),
      milestoneManager: String(await vault.milestoneManager()),
      automationContract: String(await vault.automationContract()),
    },
    automation: {
      vault: String(await automation.vault()),
      chainlinkForwarder: String(await automation.chainlinkForwarder()),
      firstActiveTrialId,
    },
    milestoneManagerVault: String(await mm.vault()),
    trialManagerAutomation: String(await tm.automationContract()),
  };
}
