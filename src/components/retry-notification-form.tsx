"use client";
import { useActionState } from "react";
import { retryNotificationAction } from "@/app/actions/notifications-revocation";

export function RetryNotificationForm({ id, kind }: { id: string; kind: "ISSUED" | "REVOKED" }) {
  const [state, action, pending] = useActionState(retryNotificationAction, { message: "", error: false });
  return <form action={action} className="mt-3"><input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value={kind} /><button className="btn-secondary disabled:opacity-50" disabled={pending}>{pending ? "Sending notification…" : "Retry notification"}</button>{state.message && <p role="status" className={`mt-3 text-sm ${state.error ? "text-rose-700" : "text-teal-700"}`}>{state.message}</p>}</form>;
}
