"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { issueCertificate } from "@/app/actions/certificates";
import type { CertificateInput, IssueState } from "@/lib/certificate-validation";

const fields: { name: keyof CertificateInput; label: string; type: string; placeholder?: string }[] = [
  { name: "recipientName", label: "Recipient Full Name", type: "text", placeholder: "Alex Morgan" },
  { name: "recipientEmail", label: "Recipient Email", type: "email", placeholder: "alex@example.com" },
  { name: "certificateTitle", label: "Certificate Title", type: "text", placeholder: "Introduction to Blockchain" },
  { name: "courseName", label: "Course / Program Name", type: "text", placeholder: "Digital Technology" },
  { name: "issueDate", label: "Issue Date", type: "date" },
  { name: "expirationDate", label: "Expiration Date", type: "date" },
];
export function IssueCertificateForm({ organizationName }: { organizationName: string }) {
  const [state, action, pending] = useActionState<IssueState, FormData>(issueCertificate, { errors: {}, error: "" });
  const [issueDate, setIssueDate] = useState("");
  return <form action={action} className="panel p-6 sm:p-8">
    <h2 className="text-lg font-semibold">Certificate details</h2>
    <p className="mt-2 text-sm text-slate-500">Your certificate is saved and registered on Ethereum Sepolia. Confirmation can take up to two minutes.</p>
    <div className="mt-7 grid gap-5 sm:grid-cols-2">
      {fields.map(field => <label key={field.name} className="field-label">{field.label}
        <input className="input" name={field.name} type={field.type} placeholder={field.placeholder} defaultValue={state.values?.[field.name]} min={field.name === "expirationDate" ? issueDate || state.values?.issueDate || undefined : undefined} maxLength={field.type === "email" ? 254 : field.type === "text" ? 200 : undefined} onChange={field.name === "issueDate" ? event => setIssueDate(event.target.value) : undefined} required aria-invalid={Boolean(state.errors[field.name])} aria-describedby={state.errors[field.name] ? `${field.name}-error` : undefined} />
        {state.errors[field.name] && <span id={`${field.name}-error`} className="mt-2 block text-xs text-rose-700">{state.errors[field.name]}</span>}
      </label>)}
      <div className="sm:col-span-2"><label htmlFor="issuing-organization" className="field-label">Organization Name</label><input id="issuing-organization" className="input bg-slate-50" value={organizationName} readOnly /><p className="mt-2 text-xs text-slate-500">Your signed-in organization is used automatically.</p></div>
    </div>
    {state.error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{state.error}</p>}
    {state.recordId && <Link className="btn-secondary mt-4" href={`/certificates/${state.recordId}`}>Open saved record {state.certificateId}</Link>}
    <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-100 pt-6"><button className="btn-primary disabled:cursor-wait disabled:opacity-60" type="submit" disabled={pending || Boolean(state.recordId)}>{pending ? "Waiting for blockchain…" : "Issue Certificate"}</button><Link className="btn-secondary" href="/certificates">View Certificates</Link></div>
  </form>;
}
