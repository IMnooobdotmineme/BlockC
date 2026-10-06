import "server-only";
import { prisma } from "./prisma";
import { certificateTimestamps, generateCertificateHash, normalizeCertificateId } from "./blockchain/certificate-hash";
import { readCertificateOnBlockchain } from "./blockchain/registry";

// Explicit allowlist: recipient email and organization/session secrets are never fetched.
export const publicCertificateSelect = {
  certificateId: true, recipientName: true, certificateTitle: true, courseName: true,
  organizationName: true, issueDate: true, expirationDate: true, status: true,
  certificateHash: true, blockchainTxHash: true,
} as const;
const loadCertificate = (certificateId: string) => prisma.certificate.findUnique({ where: { certificateId }, select: publicCertificateSelect });
export const verificationDependencies = { loadCertificate, readBlockchain: readCertificateOnBlockchain, now: () => new Date() };
export type VerificationStatus = "VALID" | "EXPIRED" | "REVOKED" | "INVALID" | "UNAVAILABLE";

export async function verifyPublicCertificate(id: string, deps = verificationDependencies) {
  let certificateId: string;
  try { certificateId = normalizeCertificateId(id); }
  catch { return { status: "INVALID" as VerificationStatus, certificate: null, blockchainExists: false, hashMatches: false, regeneratedHash: null }; }
  let certificate: Awaited<ReturnType<typeof loadCertificate>>;
  try { certificate = await deps.loadCertificate(certificateId); }
  catch { return { status: "UNAVAILABLE" as VerificationStatus, certificate: null, blockchainExists: null, hashMatches: null, regeneratedHash: null }; }
  if (!certificate) return { status: "INVALID" as VerificationStatus, certificate: null, blockchainExists: false, hashMatches: false, regeneratedHash: null };
  let regeneratedHash: string;
  let timestamps: ReturnType<typeof certificateTimestamps>;
  try { regeneratedHash = generateCertificateHash(certificate); timestamps = certificateTimestamps(certificate); }
  catch { return { status: "INVALID" as VerificationStatus, certificate, blockchainExists: null, hashMatches: false, regeneratedHash: null }; }
  try {
    const blockchain = await deps.readBlockchain(certificateId);
    const hashMatches = Boolean(blockchain && blockchain.certificateHash.toLowerCase() === regeneratedHash.toLowerCase());
    const metadataMatches = certificate.certificateHash?.toLowerCase() === regeneratedHash.toLowerCase();
    const timestampsMatch = blockchain?.issuedAt === timestamps.issuedAt && blockchain?.expirationAt === timestamps.expirationAt;
    let status: VerificationStatus;
    // Revocation takes precedence; it can never be overridden by a matching hash or unexpired date.
    if (certificate.status === "REVOKED" || blockchain?.revoked) status = "REVOKED";
    else if (!blockchain || !hashMatches || !metadataMatches || !timestampsMatch) status = "INVALID";
    else if (BigInt(Math.floor(deps.now().getTime() / 1000)) >= timestamps.expirationAt || blockchain.checkedAt >= timestamps.expirationAt) status = "EXPIRED";
    else status = "VALID";
    return { status, certificate, blockchainExists: Boolean(blockchain), hashMatches, regeneratedHash };
  } catch {
    return { status: "UNAVAILABLE" as VerificationStatus, certificate, blockchainExists: null, hashMatches: null, regeneratedHash };
  }
}
