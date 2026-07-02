import { ethers } from "ethers";

export type ParticipantCreditFailure = {
  trialId: bigint;
  milestoneIndex: bigint;
  participant: string;
  reason: string;
};

const PARTICIPANT_CREDIT_FAILED_IFACE = new ethers.Interface([
  "event ParticipantCreditFailed(uint256 indexed trialId, uint256 indexed milestoneIndex, address indexed participant, bytes reason)",
]);

/** Decode Solidity revert bytes from ParticipantCreditFailed.reason. */
export function decodeCreditFailureReason(reason: string): string {
  if (!reason || reason === "0x") return "unknown error";
  try {
    if (reason.startsWith("0x08c379a0")) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["string"],
        ethers.dataSlice(reason, 4)
      );
      return String(decoded[0]);
    }
    if (reason.startsWith("0x4e487b71")) {
      const code = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256"],
        ethers.dataSlice(reason, 4)
      )[0];
      return `Panic(${code})`;
    }
    return reason.length > 42 ? `${reason.slice(0, 42)}…` : reason;
  } catch {
    return reason.length > 42 ? `${reason.slice(0, 42)}…` : reason;
  }
}

/** Parse ParticipantCreditFailed events emitted during a vault distribution transaction. */
export function parseParticipantCreditFailures(
  receipt: ethers.TransactionReceipt,
  vaultAddress: string
): ParticipantCreditFailure[] {
  const target = vaultAddress.toLowerCase();
  const failures: ParticipantCreditFailure[] = [];

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== target) continue;
    try {
      const parsed = PARTICIPANT_CREDIT_FAILED_IFACE.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed?.name !== "ParticipantCreditFailed") continue;
      failures.push({
        trialId: parsed.args.trialId as bigint,
        milestoneIndex: parsed.args.milestoneIndex as bigint,
        participant: ethers.getAddress(parsed.args.participant as string),
        reason: decodeCreditFailureReason(parsed.args.reason as string),
      });
    } catch {
      /* ignore unrelated logs */
    }
  }

  return failures;
}
