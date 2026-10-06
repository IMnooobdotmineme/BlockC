"use client";
import { useFormStatus } from "react-dom";
import { checkCertificateRegistration } from "@/app/actions/certificates";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-secondary disabled:opacity-50" disabled={pending}>{pending ? "Checking confirmation…" : "Check / resume registration"}</button>;
}
export function CheckRegistrationButton({ id }: { id: string }) {
  return <form action={checkCertificateRegistration} className="mt-4"><input type="hidden" name="id" value={id} /><Submit /></form>;
}
