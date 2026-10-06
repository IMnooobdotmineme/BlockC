import "server-only";
import { prisma } from "./prisma";
import { initialCertificateStatus, todayInBangkok, type CertificateInput } from "./certificate-validation";
import { generateCertificateHash, certificateTimestamps } from "./blockchain/certificate-hash";
import { blockchainWriterIdentity, prepareCertificateRegistration, submitPreparedRegistration, type PreparedRegistration } from "./blockchain/registry";
import { nextReservedNonce } from "./blockchain/nonce";
import { deliverCertificateNotification, queueNotification } from "./certificate-email";

export const issuanceDependencies = { writerIdentity: blockchainWriterIdentity, prepare: prepareCertificateRegistration, submit: submitPreparedRegistration };
type Dependencies = typeof issuanceDependencies;

/** Organization must come from the authenticated server session, never browser fields. */
export async function createBlockchainCertificate(organization: { id: string; name: string }, values: CertificateInput, issueDate: Date, expirationDate: Date, deps: Dependencies = issuanceDependencies) {
  const certificate = await prisma.$transaction(async tx => {
    const year = Number(todayInBangkok().slice(0, 4));
    const counter = await tx.certificateCounter.upsert({ where: { year }, create: { year, lastNumber: 1 }, update: { lastNumber: { increment: 1 } } });
    const data = { ...values, certificateId: `CERT-${year}-${String(counter.lastNumber).padStart(4, "0")}`,
      issueDate, expirationDate, organizationId: organization.id, organizationName: organization.name };
    const certificateHash = generateCertificateHash(data);
    certificateTimestamps(data);
    return tx.certificate.create({ data: { ...data, certificateHash, status: initialCertificateStatus(expirationDate), blockchainStatus: "PENDING" } });
  });
  return completeCertificateRegistration(organization.id, certificate.id, deps);
}

export async function completeCertificateRegistration(organizationId: string, id: string, deps: Dependencies = issuanceDependencies) {
  let certificate = await prisma.certificate.findFirst({ where: { id, organizationId }, include: { blockchainJob: true } });
  if (!certificate) throw new Error("Certificate not found.");
  if (certificate.blockchainStatus === "CONFIRMED") return { id, certificateId: certificate.certificateId, state: "CONFIRMED" as const };
  if (certificate.blockchainStatus === "UNREGISTERED") throw new Error("Legacy certificate has no blockchain registration intent.");
  if (certificate.blockchainStatus === "FAILED" && certificate.blockchainJob) return { id, certificateId: certificate.certificateId, state: "FAILED" as const };
  if (!certificate.blockchainJob) {
    try {
      // Database-wide wallet lock protects nonce reservation across processes and concurrent requests.
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(8102026)`;
        const current = await tx.certificate.findFirstOrThrow({ where: { id, organizationId }, include: { blockchainJob: true } });
        if (current.blockchainJob) return;
        const walletAddress = deps.writerIdentity();
        const minimumNonce = await nextReservedNonce(tx, walletAddress);
        const prepared = await deps.prepare(current, minimumNonce);
        await tx.certificateBlockchainJob.create({ data: { certificateId: id, signedTransaction: prepared.signedTransaction,
          transactionHash: prepared.transactionHash, nonce: BigInt(prepared.nonce), walletAddress: prepared.walletAddress,
          contractAddress: prepared.contractAddress, chainId: prepared.chainId } });
        await tx.certificate.update({ where: { id }, data: { blockchainStatus: "PENDING", certificateHash: prepared.certificateHash } });
      }, { timeout: 60_000, maxWait: 60_000 });
    } catch {
      // A competing recovery may have committed an intent; never mark such a record definitely failed.
      const current = await prisma.certificate.findFirstOrThrow({ where: { id, organizationId }, include: { blockchainJob: true } });
      if (!current.blockchainJob) {
        await prisma.certificate.updateMany({ where: { id, organizationId, blockchainJob: { is: null } }, data: { blockchainStatus: "FAILED" } });
        return { id, certificateId: current.certificateId, state: "FAILED" as const };
      }
    }
    certificate = await prisma.certificate.findFirstOrThrow({ where: { id, organizationId }, include: { blockchainJob: true } });
  }
  const job = certificate.blockchainJob!;
  const prepared: PreparedRegistration = { ...job, nonce: Number(job.nonce), certificateHash: certificate.certificateHash! };
  try {
    const result = await deps.submit(prepared, certificate);
    if (result.state === "FAILED") {
      await prisma.certificate.updateMany({ where: { id, organizationId, blockchainStatus: { not: "CONFIRMED" } }, data: { blockchainStatus: "FAILED" } });
      return { id, certificateId: certificate.certificateId, state: "FAILED" as const };
    }
    await prisma.$transaction(async tx => {
      await tx.certificate.update({ where: { id }, data: { blockchainStatus: "CONFIRMED", blockchainTxHash: result.transactionHash, certificateHash: result.certificateHash } });
      await queueNotification(tx, id, "ISSUED");
    });
    await deliverCertificateNotification(organizationId, id, "ISSUED");
    return { id, certificateId: certificate.certificateId, state: "CONFIRMED" as const };
  } catch {
    // Preserve intent and ID if a send, confirmation, or final database update is uncertain.
    return { id, certificateId: certificate.certificateId, state: "PENDING" as const };
  }
}
