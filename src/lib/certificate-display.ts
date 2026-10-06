export type DisplayStatus = "Valid" | "Expired" | "Revoked" | "VALID" | "EXPIRED" | "REVOKED";
export function statusLabel(status: DisplayStatus): "Valid" | "Expired" | "Revoked" {
  return { VALID: "Valid", EXPIRED: "Expired", REVOKED: "Revoked", Valid: "Valid", Expired: "Expired", Revoked: "Revoked" }[status] as "Valid" | "Expired" | "Revoked";
}
export function formatCertificateDate(date: Date) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
