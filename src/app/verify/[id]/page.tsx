import Link from "next/link";
import { connection } from "next/server";
import { PublicShell, PageHeading } from "@/components/ui";
import { verifyPublicCertificate } from "@/lib/public-verification";
import { formatCertificateDate } from "@/lib/certificate-display";

export const runtime = "nodejs";
const presentations = {
  VALID: { title: "Certificate valid", message: "The certificate matches its blockchain record and is neither revoked nor expired.", color: "border-teal-200 bg-teal-50 text-teal-900" },
  EXPIRED: { title: "Certificate expired", message: "The certificate is authentic, but its expiration date has passed.", color: "border-amber-200 bg-amber-50 text-amber-900" },
  REVOKED: { title: "Certificate revoked", message: "This credential has been revoked and must not be accepted as valid.", color: "border-rose-200 bg-rose-50 text-rose-900" },
  INVALID: { title: "Certificate invalid", message: "The certificate was not found, has no matching blockchain record, or its data could not be authenticated.", color: "border-rose-200 bg-rose-50 text-rose-900" },
  UNAVAILABLE: { title: "Verification temporarily unavailable", message: "We cannot complete live verification right now. Please try again later. This is not a valid verification result.", color: "border-slate-200 bg-slate-50 text-slate-900" },
};
const yesNo = (value: boolean | null) => value === null ? "Not checked" : value ? "Yes" : "No";
export default async function VerificationResult({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const result = await verifyPublicCertificate(id);
  const presentation = presentations[result.status];
  const certificate = result.certificate;
  const details = certificate ? [
    ["Certificate ID", certificate.certificateId], ["Recipient Name", certificate.recipientName],
    ["Certificate Title", certificate.certificateTitle], ["Course / Program", certificate.courseName],
    ["Organization", certificate.organizationName], ["Issue Date", formatCertificateDate(certificate.issueDate)],
    ["Expiration Date", formatCertificateDate(certificate.expirationDate)],
  ] : [["Certificate ID", id.slice(0, 64)]];
  const transaction = certificate?.blockchainTxHash;
  return <PublicShell><div className="mx-auto max-w-3xl py-6 sm:py-10">
    <Link href="/verify" className="text-sm font-medium text-teal-700">← Verify another certificate</Link>
    <div className="mt-7"><PageHeading eyebrow="Public credential record" title="Verification Result" description="Certificate details checked against PostgreSQL and the Ethereum Sepolia registry." /></div>
    <section role="status" className={`mb-6 rounded-2xl border p-6 ${presentation.color}`}>
      <h2 className="text-xl font-semibold">{presentation.title}</h2><p className="mt-2 text-sm">{presentation.message}</p>
      <p className="mt-3 text-xs font-bold">Final status: {result.status === "UNAVAILABLE" ? "Verification temporarily unavailable" : result.status}</p>
    </section>
    <section className="panel p-6 sm:p-8"><h2 className="text-lg font-semibold">Certificate information</h2>
      <dl className="mt-6 grid gap-6 sm:grid-cols-2">
        {details.map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-2 break-words font-medium">{value}</dd></div>)}
        <div><dt className="text-xs font-medium text-slate-500">Blockchain record exists</dt><dd className="mt-2 font-semibold">{yesNo(result.blockchainExists)}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500">Hash matches</dt><dd className="mt-2 font-semibold">{yesNo(result.hashMatches)}</dd></div>
        <div className="border-t border-slate-100 pt-6 sm:col-span-2"><dt className="text-xs font-medium text-slate-500">Blockchain Transaction</dt><dd className="mt-2 break-all rounded-xl bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-600">{transaction ?? "No confirmed transaction recorded"}</dd>{transaction && /^0x[0-9a-fA-F]{64}$/.test(transaction) && <Link className="mt-3 inline-block text-sm text-teal-700 underline" href={`https://sepolia.etherscan.io/tx/${transaction}`} target="_blank" rel="noopener noreferrer">View transaction on Sepolia Etherscan ↗</Link>}</div>
        <div className="border-t border-slate-100 pt-6 sm:col-span-2"><dt className="text-xs font-medium text-slate-500">Certificate Hash (regenerated SHA-256)</dt><dd className="mt-2 break-all rounded-xl bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-600">{result.regeneratedHash ?? "Not available"}</dd></div>
      </dl>
    </section>
  </div></PublicShell>;
}
