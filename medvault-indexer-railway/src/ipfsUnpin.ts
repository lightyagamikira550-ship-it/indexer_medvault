/**
 * Best-effort Pinata unpin for legacy CIDs after `DocumentLegacyHandleRevoked`.
 */
const PINATA_UNPIN_URL = "https://api.pinata.cloud/pinning/unpin";

export function resolvePinataKeys(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.PINATA_API_KEY?.trim() || process.env.VITE_PINATA_API_KEY?.trim();
  const apiSecret =
    process.env.PINATA_API_SECRET?.trim() || process.env.VITE_PINATA_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

export async function unpinCidFromPinata(cid: string): Promise<void> {
  const keys = resolvePinataKeys();
  if (!keys) {
    throw new Error("Pinata credentials missing — set PINATA_API_KEY and PINATA_API_SECRET.");
  }
  const res = await fetch(`${PINATA_UNPIN_URL}/${encodeURIComponent(cid)}`, {
    method: "DELETE",
    headers: {
      pinata_api_key: keys.apiKey,
      pinata_secret_api_key: keys.apiSecret,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata unpin failed (${res.status}): ${text}`);
  }
}
