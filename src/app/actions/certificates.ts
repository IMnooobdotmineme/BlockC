"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createBlockchainCertificate, completeCertificateRegistration } from "@/lib/certificate-issuance";
import { requireOrganization } from "@/lib/session";
import { validateCertificate, type IssueState } from "@/lib/certificate-validation";

export async function issueCertificate(_previous: IssueState, formData: FormData): Promise<IssueState> {
  const organization = await requireOrganization();
  const { values, errors, issueDate, expirationDate } = validateCertificate(formData);
  if (Object.keys(errors).length || !issueDate || !expirationDate) return { errors, error: "Check the highlighted fields.", values };
  let id: string;
  try {
    const certificate = await createBlockchainCertificate(organization, values, issueDate, expirationDate);
    id = certificate.id;
    if (certificate.state !== "CONFIRMED") {
      revalidatePath("/dashboard");
      revalidatePath("/certificates");
      return { errors: {}, error: certificate.state === "PENDING" ? "Blockchain confirmation is pending. Open the saved record to check registration; do not submit this form again." : "Blockchain registration failed. The saved record is not blockchain-issued. Open it for recovery details.", values, recordId: id, certificateId: certificate.certificateId };
    }
  } catch {
    return { errors: {}, error: "Issuance could not be completed. Check your certificate list before trying again; a pending record may already have been saved.", values };
  }
  revalidatePath("/dashboard");
  revalidatePath("/certificates");
  redirect(`/certificates/${id}`);
}

export async function checkCertificateRegistration(formData: FormData) {
  const organization = await requireOrganization();
  const id = formData.get("id");
  if (typeof id !== "string" || !id || id.length > 128) return;
  try { await completeCertificateRegistration(organization.id, id); }
  catch { /* Keep errors private; the detail page always shows the persisted registration state. */ }
  revalidatePath(`/certificates/${id}`);
  revalidatePath("/certificates");
  revalidatePath("/dashboard");
}
