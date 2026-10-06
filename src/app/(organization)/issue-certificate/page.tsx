import { requireOrganization } from "@/lib/session";
import { PageHeading } from "@/components/ui";
import { IssueCertificateForm } from "@/components/issue-certificate-form";
export default async function IssueCertificate() {
  const organization = await requireOrganization();
  return <div className="max-w-3xl"><PageHeading eyebrow="Create a credential" title="Issue Certificate" description="Create and save a certificate for a recipient under your organization." /><IssueCertificateForm organizationName={organization.name} /></div>;
}
