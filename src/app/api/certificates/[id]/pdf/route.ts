import { getOrganization } from "@/lib/session";
import { getOrganizationCertificate } from "@/lib/certificates";
import { generateCertificatePdf } from "@/lib/certificate-pdf";

export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const organization = await getOrganization();
    if (!organization) return Response.json({ error: "Please log in to download this certificate." }, { status: 401, headers: privateHeaders });
    const { id } = await params;
    const certificate = await getOrganizationCertificate(organization.id, id);
    // Same response for foreign and missing records avoids disclosing another tenant's records.
    if (!certificate) return Response.json({ error: "Certificate not found." }, { status: 404, headers: privateHeaders });
    if (["PENDING", "FAILED"].includes(certificate.blockchainStatus)) return Response.json({ error: "Confirm blockchain registration before downloading this certificate." }, { status: 409, headers: privateHeaders });
    const bytes = await generateCertificatePdf(certificate);
    const filename = certificate.certificateId.replace(/[^A-Za-z0-9_-]/g, "_");
    return new Response(new Uint8Array(bytes), { headers: {
      ...privateHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Content-Length": String(bytes.byteLength),
    } });
  } catch {
    // Do not return database errors, certificate data, or credentials to the browser.
    return Response.json({ error: "PDF generation failed. Please try again later." }, { status: 500, headers: privateHeaders });
  }
}
