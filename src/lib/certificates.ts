import "server-only";
import { prisma } from "./prisma";
import { todayInBangkok } from "./certificate-validation";

export async function refreshExpiredCertificates(organizationId: string) {
  return prisma.certificate.updateMany({
    where: { organizationId, status: "VALID", expirationDate: { lt: new Date(`${todayInBangkok()}T00:00:00.000Z`) } },
    data: { status: "EXPIRED" },
  });
}
export async function getOrganizationCertificates(organizationId: string) {
  await refreshExpiredCertificates(organizationId);
  return prisma.certificate.findMany({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}
export async function getOrganizationCertificate(organizationId: string, id: string) {
  await refreshExpiredCertificates(organizationId);
  return prisma.certificate.findFirst({ where: { id, organizationId }, include: { blockchainJob: { select: { transactionHash: true } }, revocationJob: { select: { transactionHash: true } }, notifications: { select: { kind: true, status: true, attempts: true, sentAt: true }, orderBy: { createdAt: "asc" } } } });
}
export async function getOrganizationDashboard(organizationId: string) {
  await refreshExpiredCertificates(organizationId);
  const [valid, expired, revoked, recent, total] = await prisma.$transaction([
    prisma.certificate.count({ where: { organizationId, status: "VALID", blockchainStatus: "CONFIRMED" } }),
    prisma.certificate.count({ where: { organizationId, status: "EXPIRED", blockchainStatus: "CONFIRMED" } }),
    prisma.certificate.count({ where: { organizationId, status: "REVOKED", blockchainStatus: "CONFIRMED" } }),
    prisma.certificate.findMany({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 3 }),
    prisma.certificate.count({ where: { organizationId } }),
  ]);
  const counts = { VALID: valid, EXPIRED: expired, REVOKED: revoked };
  return { counts, total, recent };
}
