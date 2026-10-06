"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function VerifyForm() {
  const router = useRouter();
  const [id, setId] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (id.trim()) router.push(`/verify/${encodeURIComponent(id.trim().toUpperCase())}`);
  }
  return <form onSubmit={submit}><label className="field-label">Certificate ID<input className="input font-mono" name="certificateId" value={id} onChange={event => setId(event.target.value)} placeholder="CERT-2026-0001" required maxLength={64} pattern={".*\\S.*"} /></label><button type="submit" className="btn-primary mt-5 w-full">Verify Certificate →</button><p className="mt-5 text-xs leading-6 text-slate-500">Enter the ID printed on your certificate, or open its QR link using your phone&apos;s camera.</p></form>;
}
