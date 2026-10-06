import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/** Call while holding the shared pg_advisory_xact_lock(8102026). */
export async function nextReservedNonce(tx: Prisma.TransactionClient, walletAddress: string) {
  const where = { walletAddress, chainId: 11155111 };
  const [issued, revoked] = await Promise.all([
    tx.certificateBlockchainJob.aggregate({ where, _max: { nonce: true } }),
    tx.certificateRevocationJob.aggregate({ where, _max: { nonce: true } }),
  ]);
  return Math.max(-1, Number(issued._max.nonce ?? -1), Number(revoked._max.nonce ?? -1)) + 1;
}
