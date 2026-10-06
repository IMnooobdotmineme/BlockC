import { StatusBadge } from "./ui";
import type { DisplayStatus } from "@/lib/certificate-display";

export const registrationLabels = { UNREGISTERED: "Not registered", PENDING: "Confirmation pending", CONFIRMED: "Confirmed on Sepolia", FAILED: "Registration failed" };
export function RegistrationStatus({ registration, status, revocation }: { registration: keyof typeof registrationLabels; status: DisplayStatus; revocation?: string }) {
  if (registration === "CONFIRMED") return <div><StatusBadge status={status} />{status !== "REVOKED" && (revocation === "PENDING" || revocation === "FAILED") && <p className="mt-2 text-xs text-amber-800">{revocation === "PENDING" ? "Revocation pending" : "Revocation attempt failed"}</p>}</div>;
  return <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">{registrationLabels[registration]}</span>;
}
