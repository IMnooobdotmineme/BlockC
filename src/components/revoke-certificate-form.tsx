"use client";
import { useActionState } from "react";
import { revokeCertificateAction } from "@/app/actions/notifications-revocation";

export function RevokeCertificateForm({ id, pendingRevocation }: { id: string; pendingRevocation: boolean }) {
  const [state, action, pending] = useActionState(revokeCertificateAction, { message: "", error: false });
  return <form action={action} onSubmit={event => { if (!pendingRevocation && !window.confirm("Revoke this certificate permanently? This cannot be undone.")) event.preventDefault(); }}>
    <input type="hidden" name="id" value={id} />
    <button className="btn-danger mt-4" disabled={pending}>{pending ? "Waiting for revocation confirmation…" : pendingRevocation ? "Check / resume revocation" : "Revoke Certificate"}</button>
    {state.message && <p role="status" className={`mt-3 text-sm ${state.error ? "text-rose-700" : "text-teal-700"}`}>{state.message}</p>}
  </form>;
}
