import { ethers } from "ethers";

export const VAULT_EIP712_DOMAIN = {
  name: "MedVault SponsorIncentiveVault",
  version: "1",
} as const;

export function deriveEphemeralWallet(identitySecret: bigint | string): ethers.Wallet {
  const identitySecretStr = typeof identitySecret === "bigint" ? identitySecret.toString() : identitySecret;
  const privateKey = ethers.keccak256(ethers.toUtf8Bytes(`medvault:ephemeral:${identitySecretStr}`));
  return new ethers.Wallet(privateKey);
}

export async function deriveEphemeralAddress(identitySecret: bigint | string): Promise<string> {
  return deriveEphemeralWallet(identitySecret).getAddress();
}

export async function signRegisterAuthorization(
  identitySecret: bigint | string,
  chainId: bigint,
  vaultAddress: string,
  params: {
    trialId: bigint;
    nullifier: bigint;
    permitHolder: string;
    nonce: bigint;
    deadline: bigint;
  }
): Promise<string> {
  const wallet = deriveEphemeralWallet(identitySecret);
  return wallet.signTypedData(
    {
      name: VAULT_EIP712_DOMAIN.name,
      version: VAULT_EIP712_DOMAIN.version,
      chainId,
      verifyingContract: vaultAddress,
    },
    {
      RegisterAuthorization: [
        { name: "trialId", type: "uint256" },
        { name: "nullifier", type: "uint256" },
        { name: "permitHolder", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    {
      trialId: params.trialId,
      nullifier: params.nullifier,
      permitHolder: params.permitHolder,
      nonce: params.nonce,
      deadline: params.deadline,
    }
  );
}
