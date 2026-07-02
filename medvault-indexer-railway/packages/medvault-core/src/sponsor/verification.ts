import { ethers } from "ethers";
import { getSponsorRegistry } from "../contracts/index.js";

export interface SponsorVerificationResult {
  address: string;
  isVerified: boolean;
  isAdmin: boolean;
  sponsorName: string | null;
}

export async function getSponsorVerification(
  provider: ethers.Provider,
  sponsorAddress: string,
  sponsorOpenAccess = false
): Promise<SponsorVerificationResult> {
  const address = sponsorAddress.toLowerCase();
  if (sponsorOpenAccess) {
    return { address, isVerified: true, isAdmin: true, sponsorName: null };
  }
  const registry = getSponsorRegistry(provider);
  const [verified, sponsorData, owner] = await Promise.all([
    registry.isVerifiedSponsor(sponsorAddress) as Promise<boolean>,
    registry.sponsors(sponsorAddress) as Promise<{ name: string; verified: boolean }>,
    registry.owner() as Promise<string>,
  ]);
  return {
    address,
    isVerified: Boolean(verified),
    isAdmin: owner.toLowerCase() === address,
    sponsorName: verified && sponsorData?.name ? sponsorData.name : null,
  };
}

export async function assertSponsorCanWrite(
  signer: ethers.Signer,
  sponsorOpenAccess = false
): Promise<SponsorVerificationResult> {
  const address = await signer.getAddress();
  const provider = signer.provider;
  if (!provider) {
    throw new Error("Signer has no provider");
  }
  const result = await getSponsorVerification(provider, address, sponsorOpenAccess);
  if (!result.isVerified && !result.isAdmin) {
    throw new Error(
      "Wallet is not a verified sponsor. Set MEDVAULT_SPONSOR_OPEN_ACCESS=true for testnet-only bypass, or get allowlisted on SponsorRegistry."
    );
  }
  return result;
}
