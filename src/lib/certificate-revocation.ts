import "server-only";
import { prisma } from "./prisma";
import { blockchainWriterIdentity, prepareCertificateRevocation, submitPreparedRevocation, readCertificateOnBlockchain, type PreparedRevocation } from "./blockchain/registry";
import { nextReservedNonce } from "./blockchain/nonce";
import { generateCertificateHash } from "./blockchain/certificate-hash";
import { deliverCertificateNotification, queueNotification } from "./certificate-email";

export const revocationDependencies = { writerIdentity: blockchainWriterIdentity, prepare: prepareCertificateRevocation, submit: submitPreparedRevocation, read: readCertificateOnBlockchain };

export async function revokeOrganizationCertificate(organizationId: string, id: string, deps = revocationDependencies) {
  let certificate = await prisma.certificate.findFirst({ where: { id, organizationId }, include: { revocationJob: true } });
  if (!certificate) throw new Error("Certificate not found.");
  if (certificate.status === "REVOKED") throw new Error("This certificate is already revoked.");
  if (certificate.blockchainStatus !== "CONFIRMED") throw new Error("Confirm blockchain registration before revoking.");
  let transactionHash: string | null = null;
  try {
    const record = await deps.read(certificate.certificateId);
    if (!record || record.certificateHash.toLowerCase() !== generateCertificateHash(certificate).toLowerCase()) throw new Error();
    if (!record.revoked) {
      if (certificate.revocationStatus === "FAILED" && certificate.revocationJob) return { state: "FAILED" as const };
      if (!certificate.revocationJob) {
        await prisma.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(8102026)`;
          const current = await tx.certificate.findFirstOrThrow({ where: { id, organizationId }, include: { revocationJob: true } });
          if (current.status === "REVOKED" || current.revocationJob) return;
          const minimumNonce = await nextReservedNonce(tx, deps.writerIdentity());
          const prepared = await deps.prepare(current.certificateId, minimumNonce);
          await tx.certificateRevocationJob.create({ data: { ...prepared, nonce: BigInt(prepared.nonce), certificateId: id } });
          await tx.certificate.update({ where: { id }, data: { revocationStatus: "PENDING" } });
        }, { timeout: 60_000, maxWait: 60_000 });
      }
      certificate = await prisma.certificate.findFirstOrThrow({ where: { id, organizationId }, include: { revocationJob: true } });
      if (certificate.status === "REVOKED") return { state: "CONFIRMED" as const };
      const job = certificate.revocationJob!;
      const prepared: PreparedRevocation = { ...job, nonce: Number(job.nonce) };
      const result = await deps.submit(prepared, certificate.certificateId);
      if (result.state === "FAILED") {
        await prisma.certificate.updateMany({ where: { id, organizationId, status: { not: "REVOKED" } }, data: { revocationStatus: "FAILED" } });
        return { state: "FAILED" as const };
      }
      transactionHash = result.transactionHash;
    } else if (certificate.revocationJob) {
      // Confirm our receipt before attributing an already-revoked record to this particular transaction.
      try {
        const result = await deps.submit({ ...certificate.revocationJob, nonce: Number(certificate.revocationJob.nonce) }, certificate.certificateId);
        if (result.state === "CONFIRMED") transactionHash = result.transactionHash;
      } catch { /* Chain state is confirmed revoked; transaction attribution can remain unknown. */ }
    }
    await prisma.$transaction(async tx => {
      await tx.certificate.update({ where: { id }, data: { status: "REVOKED", revocationStatus: "CONFIRMED", revocationTxHash: transactionHash, revokedAt: new Date() } });
      await queueNotification(tx, id, "REVOKED");
    });
    await deliverCertificateNotification(organizationId, id, "REVOKED");
    return { state: "CONFIRMED" as const };
  } catch {
    const current = await prisma.certificate.findFirst({ where: { id, organizationId }, include: { revocationJob: true } });
    if (current?.status === "REVOKED") return { state: "CONFIRMED" as const };
    if (!current?.revocationJob) {
      await prisma.certificate.updateMany({ where: { id, organizationId, status: { not: "REVOKED" }, revocationJob: { is: null } }, data: { revocationStatus: "FAILED" } });
      return { state: "FAILED" as const };
    }
    return { state: "PENDING" as const };
  }
}
