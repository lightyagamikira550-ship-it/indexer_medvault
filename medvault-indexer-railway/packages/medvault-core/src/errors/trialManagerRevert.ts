const TRIAL_MANAGER_ERRORS: Record<string, string> = {
  "0x1d9e9485":
    "This wallet is not a verified sponsor. A protocol admin must add your address on SponsorRegistry before you can create trials.",
  "0x9529f506": "Trial duration exceeds the maximum allowed (5 years).",
  "0xced2d3b5": "TrialManager's SponsorRegistry pointer is invalid or misconfigured.",
  "0xabb34bc7": "That trial does not exist.",
};

function extractRevertData(err: unknown): string | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const d = (cur as { data?: unknown }).data;
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) {
      return d;
    }
    cur =
      (cur as { error?: unknown }).error ??
      (cur as { info?: { error?: unknown } }).info?.error ??
      null;
  }
  return null;
}

export function friendlyTrialManagerRevert(err: unknown): string | null {
  const data = extractRevertData(err);
  if (!data) return null;
  const selector = data.slice(0, 10).toLowerCase();
  return TRIAL_MANAGER_ERRORS[selector] ?? null;
}

export function normalizeTxError(err: unknown): string {
  const friendly = friendlyTrialManagerRevert(err);
  if (friendly) return friendly;
  const e = err as { reason?: string; shortMessage?: string; message?: string };
  return e.reason ?? e.shortMessage ?? e.message ?? String(err);
}
