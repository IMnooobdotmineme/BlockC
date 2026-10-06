"use server";
import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/session";
import { revokeOrganizationCertificate } from "@/lib/certificate-revocation";
import { deliverCertificateNotification } from "@/lib/certificate-email";
import { prisma } from "@/lib/prisma";

export type OperationState = { message: string; error: boolean };
function recordId(data: FormData) {
  const id = data.get("id");
  return typeof id === "string" && id.length > 0 && id.length <= 128 ? id : null;
}
function refresh(id: string, publicId?: string) {
  revalidatePath(`/certificates/${id}`);
  revalidatePath("/certificates");
  revalidatePath("/dashboard");
  if (publicId) revalidatePath(`/verify/${publicId}`);
}

export async function revokeCertificateAction(_previous: OperationState, data: FormData): Promise<OperationState> {
  const organization = await requireOrganization();
  const id = recordId(data);
  if (!id) return { message: "Invalid certificate.", error: true };
  try {
    const certificate = await prisma.certificate.findFirst({ where: { id, organizationId: organization.id }, select: { status: true, blockchainStatus: true, certificateId: true } });
    if (!certificate) return { message: "Certificate not found.", error: true };
    if (certificate.status === "REVOKED") return { message: "This certificate is already revoked.", error: true };
    if (certificate.blockchainStatus !== "CONFIRMED") return { message: "Confirm registration before revoking.", error: true };
    const result = await revokeOrganizationCertificate(organization.id, id);
    refresh(id, certificate.certificateId);
    return result.state === "CONFIRMED" ? { message: "Certificate revoked. Check notification status below; email delivery does not affect revocation.", error: false }
      : { message: result.state === "PENDING" ? "Revocation confirmation is pending. Resume this saved revocation to check the same transaction." : "Revocation failed. The certificate has not been marked revoked. Check funding/connectivity and retry if no transaction was prepared.", error: true };
  } catch { return { message: "Revocation could not be completed. Check the saved revocation status before retrying.", error: true }; }
}

export async function retryNotificationAction(_previous: OperationState, data: FormData): Promise<OperationState> {
  const organization = await requireOrganization();
  const id = recordId(data);
  const kind = data.get("kind");
  if (!id || (kind !== "ISSUED" && kind !== "REVOKED")) return { message: "Invalid notification.", error: true };
  try {
    const certificate = await prisma.certificate.findFirst({ where: { id, organizationId: organization.id }, select: { id: true } });
    if (!certificate) return { message: "Certificate not found.", error: true };
    const status = await deliverCertificateNotification(organization.id, id, kind);
    refresh(id);
    return { message: status === "SENT" ? "Notification accepted by the email server." : status === "SENDING" ? "A delivery attempt is already running. Try again after two minutes if it remains stuck." : "Notification was not sent. Check SMTP configuration and retry. Certificate status is unchanged.", error: status !== "SENT" };
  } catch { return { message: "Notification retry unavailable. Certificate status is unchanged.", error: true }; }
}
