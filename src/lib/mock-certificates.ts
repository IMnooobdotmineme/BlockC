export type CertificateStatus = "Valid" | "Expired" | "Revoked";
export const certificates: { id: string; recipient: string; title: string; organization: string; issueDate: string; expirationDate: string; status: CertificateStatus; transaction: string }[] = [
  { id: "CERT-2026-001", recipient: "Alex Morgan", title: "Introduction to Blockchain", organization: "Northbridge University", issueDate: "2026-09-01", expirationDate: "2028-09-01", status: "Valid", transaction: "0x" + "a1".repeat(32) },
  { id: "CERT-2025-002", recipient: "Jamie Lee", title: "Web Development Fundamentals", organization: "Northbridge University", issueDate: "2025-03-15", expirationDate: "2026-03-15", status: "Expired", transaction: "0x" + "b2".repeat(32) },
  { id: "CERT-2026-003", recipient: "Taylor Chen", title: "Data Analytics Essentials", organization: "Northbridge University", issueDate: "2026-08-10", expirationDate: "2028-08-10", status: "Revoked", transaction: "0x" + "c3".repeat(32) },
  { id: "CERT-2026-004", recipient: "Sam Rivera", title: "Cybersecurity Foundations", organization: "Northbridge University", issueDate: "2026-09-20", expirationDate: "2028-09-20", status: "Valid", transaction: "0x" + "d4".repeat(32) },
];
export function formatDate(value: string) { return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z")); }
