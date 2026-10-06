import { DownloadCertificateButton } from "@/components/download-certificate-button";
import { CheckRegistrationButton } from "@/components/check-registration-button";
import { RegistrationStatus, registrationLabels } from "@/components/registration-status";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/session";
import { getOrganizationCertificate } from "@/lib/certificates";
import { formatCertificateDate } from "@/lib/certificate-display";
import { PageHeading } from "@/components/ui";
import { RevokeCertificateForm } from "@/components/revoke-certificate-form";
import { RetryNotificationForm } from "@/components/retry-notification-form";

export default async function CertificateDetails({ params }: { params: Promise<{ id: string }> }) {
  const organization = await requireOrganization();
  const { id } = await params;
  const certificate = await getOrganizationCertificate(organization.id, id);
  if (!certificate) notFound();
  const details = [
    ["Certificate ID", certificate.certificateId], ["Recipient Name", certificate.recipientName],
    ["Recipient Email", certificate.recipientEmail], ["Certificate Title", certificate.certificateTitle],
    ["Course / Program", certificate.courseName], ["Organization", certificate.organizationName],
    ["Issue Date", formatCertificateDate(certificate.issueDate)], ["Expiration Date", formatCertificateDate(certificate.expirationDate)],
  ];
  const confirmed = certificate.blockchainStatus === "CONFIRMED";
  const revocationHash = certificate.revocationTxHash ?? certificate.revocationJob?.transactionHash;
  const transactionHash = certificate.blockchainTxHash ?? certificate.blockchainJob?.transactionHash;
  const canRecover = certificate.blockchainStatus === "PENDING" || (certificate.blockchainStatus === "FAILED" && !certificate.blockchainJob);
  return <div className="max-w-3xl">
    <Link href="/certificates" className="text-sm font-medium text-teal-700">← Issued Certificates</Link>
    <div className="mt-7"><PageHeading eyebrow="Organization credential" title="Certificate Details" description="Your private certificate record and blockchain registration status." /></div>
    {!confirmed && <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <h2 className="font-semibold">{registrationLabels[certificate.blockchainStatus]}</h2>
      <p className="mt-2">{certificate.blockchainStatus === "PENDING" ? "This record is not confirmed as blockchain-issued. Check or resume the same transaction rather than issuing a replacement." : certificate.blockchainStatus === "FAILED" ? "Blockchain issuance failed. If no transaction was prepared, you can retry this saved record. A reverted transaction requires administrator review." : "This earlier database record has not been registered on the blockchain. Public verification will not authenticate it."}</p>
      {canRecover && <CheckRegistrationButton id={certificate.id} />}
    </section>}
    {(confirmed || certificate.blockchainStatus === "UNREGISTERED") && <DownloadCertificateButton id={certificate.id} />}
    {confirmed && <section className="panel mb-6 p-6"><h2 className="font-semibold">Certificate revocation</h2><p className="mt-2 text-sm text-slate-500">{certificate.status === "REVOKED" ? "This certificate is revoked. Public verification and its QR link show revoked status." : certificate.revocationStatus === "PENDING" ? "Revocation is awaiting confirmation. Resume the saved transaction instead of starting a new one." : certificate.revocationStatus === "FAILED" ? "The revocation attempt failed. Certificate status has not been changed to revoked." : "Revocation is permanent and requires a confirmed blockchain transaction."}</p>
      {certificate.status !== "REVOKED" && !(certificate.revocationStatus === "FAILED" && certificate.revocationJob) && <RevokeCertificateForm id={certificate.id} pendingRevocation={certificate.revocationStatus === "PENDING"} />}
      {certificate.revocationStatus === "FAILED" && certificate.revocationJob && <p className="mt-3 text-sm text-rose-700">A reverted transaction requires administrator review.</p>}
      {revocationHash && <div className="mt-4"><p className="text-xs text-slate-500">Revocation transaction{certificate.revocationTxHash ? "" : " (attempt; not confirmed successful)"}</p><p className="mt-2 break-all font-mono text-xs">{revocationHash}</p>{/^0x[0-9a-fA-F]{64}$/.test(revocationHash) && <Link className="mt-2 inline-block text-sm text-teal-700 underline" href={`https://sepolia.etherscan.io/tx/${revocationHash}`} target="_blank" rel="noopener noreferrer">View revocation on Sepolia Etherscan</Link>}</div>}
    </section>}
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-6"><h2 className="font-mono text-lg font-semibold">{certificate.certificateId}</h2><RegistrationStatus registration={certificate.blockchainStatus} status={certificate.status} /></div>
      <dl className="mt-6 grid gap-6 sm:grid-cols-2">
        {details.map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-2 break-words font-medium">{value}</dd></div>)}
        <div><dt className="text-xs font-medium text-slate-500">Blockchain registration status</dt><dd className="mt-2 font-medium">{registrationLabels[certificate.blockchainStatus]}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500">Public verification</dt><dd className="mt-2"><Link className="text-sm font-medium text-teal-700 underline" href={`/verify/${certificate.certificateId}`}>Open verification page ↗</Link></dd></div>
        <div className="border-t border-slate-100 pt-6 sm:col-span-2"><dt className="text-xs font-medium text-slate-500">Blockchain Transaction{!confirmed && transactionHash ? " (unconfirmed)" : ""}</dt><dd className="mt-2 break-all rounded-xl bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-600">{transactionHash ?? "Not recorded yet"}</dd>{transactionHash && /^0x[0-9a-fA-F]{64}$/.test(transactionHash) && <Link className="mt-3 inline-block text-sm text-teal-700 underline" href={`https://sepolia.etherscan.io/tx/${transactionHash}`} target="_blank" rel="noopener noreferrer">View transaction on Sepolia Etherscan ↗</Link>}</div>
        <div className="border-t border-slate-100 pt-6 sm:col-span-2"><dt className="text-xs font-medium text-slate-500">Certificate Hash</dt><dd className="mt-2 break-all rounded-xl bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-600">{certificate.certificateHash ?? "Not generated yet"}</dd></div>
      </dl>
    </section>
    <section className="panel mt-6 p-6"><h2 className="font-semibold">Recipient notifications</h2><p className="mt-2 text-sm text-slate-500">Email delivery is independent of certificate status. SENT means accepted by the SMTP server.</p>
      {!certificate.notifications.length && <p className="mt-4 text-sm text-slate-500">No notification queued for this record.</p>}
      {certificate.notifications.map(notification => <div key={notification.kind} className="mt-4 border-t border-slate-100 pt-4"><p className="text-sm font-medium">{notification.kind === "ISSUED" ? "Issuance email" : "Revocation email"}: {notification.status}</p><p className="mt-1 text-xs text-slate-500">Delivery attempts: {notification.attempts}</p>{notification.status !== "SENT" && !(notification.kind === "ISSUED" && certificate.status === "REVOKED") && <RetryNotificationForm id={certificate.id} kind={notification.kind} />}</div>)}
    </section>
  </div>;
}
