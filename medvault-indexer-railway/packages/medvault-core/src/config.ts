export type NetworkKey = "sepolia" | "hardhat";

export interface MedVaultConfig {
  networkKey: NetworkKey;
  rpcUrl: string;
  subgraphUrl: string;
  /** When true, skip on-chain sponsor verification (testnet convenience). */
  sponsorOpenAccess?: boolean;
  relayerUrl?: string;
  maxEthPerTx?: string;
  /** When true, write tools are disabled even if MCP_PRIVATE_KEY is set. */
  readOnly?: boolean;
}

export const ETHEREUM_SEPOLIA_CHAIN_ID = 11155111n;
export const DEFAULT_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MedVaultConfig {
  const rpcUrl = env.SEPOLIA_RPC_URL?.trim() || DEFAULT_RPC_URL;
  const subgraphUrl = env.MEDVAULT_SUBGRAPH_URL?.trim() || env.VITE_SUBGRAPH_URL?.trim() || "";
  const networkKey = (env.MEDVAULT_NETWORK?.trim() as NetworkKey) || "sepolia";
  const sponsorOpenAccess = env.MEDVAULT_SPONSOR_OPEN_ACCESS === "true";
  const relayerUrl = env.MEDVAULT_RELAYER_URL?.trim();
  const maxEthPerTx = env.MCP_MAX_ETH_PER_TX?.trim();
  const readOnly = env.MCP_READ_ONLY === "true";

  return {
    networkKey: networkKey === "hardhat" ? "hardhat" : "sepolia",
    rpcUrl,
    subgraphUrl,
    sponsorOpenAccess,
    relayerUrl,
    maxEthPerTx,
    readOnly,
  };
}
