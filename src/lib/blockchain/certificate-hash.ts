import { createHash } from "node:crypto";

export type CertificateHashInput = {
  certificateId: string;
  recipientName: string;
  certificateTitle: string;
  courseName: string;
  organizationName: string;
  issueDate: Date | string;
  expirationDate: Date | string;
};

export function normalizeCertificateId(value: string) {
  const id = value.normalize("NFC").trim().toUpperCase();
  if (!/^CERT-\d{4}-\d{4,}$/.test(id) || id.length > 64) throw new Error("Invalid certificate ID.");
  return id;
}
function normalizeText(value: string) {
  if (typeof value !== "string") throw new Error("Certificate fields must be strings.");
  const text = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!text || /[\u0000-\u001f\u007f]/u.test(text)) throw new Error("Invalid certificate text.");
  return text;
}
export function normalizeCertificateDate(value: Date | string) {
  const day = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < "0001-01-01" || day > "9999-12-31") throw new Error("Use a valid YYYY-MM-DD date.");
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) throw new Error("Invalid calendar date.");
  return day;
}

export function canonicalCertificateData(certificate: CertificateHashInput) {
  const issueDate = normalizeCertificateDate(certificate.issueDate);
  const expirationDate = normalizeCertificateDate(certificate.expirationDate);
  if (expirationDate < issueDate) throw new Error("Expiration cannot precede issue date.");
  // Versioned fixed-order JSON array avoids delimiter and object-key ordering ambiguity.
  return JSON.stringify([
    "certificate-v1",
    normalizeCertificateId(certificate.certificateId),
    normalizeText(certificate.recipientName),
    normalizeText(certificate.certificateTitle),
    normalizeText(certificate.courseName),
    normalizeText(certificate.organizationName),
    issueDate,
    expirationDate,
  ]);
}

export function generateCertificateHash(certificate: CertificateHashInput) {
  return `0x${createHash("sha256").update(canonicalCertificateData(certificate), "utf8").digest("hex")}`;
}

export function certificateTimestamps(certificate: CertificateHashInput) {
  const issueDay = normalizeCertificateDate(certificate.issueDate);
  const expirationDay = normalizeCertificateDate(certificate.expirationDate);
  // Issue at Bangkok midnight; expiration is exclusive next-day Bangkok midnight.
  const issuedAt = Math.floor(new Date(`${issueDay}T00:00:00Z`).getTime() / 1000) - 7 * 3600;
  const expirationAt = Math.floor(new Date(`${expirationDay}T00:00:00Z`).getTime() / 1000) + 86400 - 7 * 3600;
  if (issuedAt <= 0 || expirationAt <= issuedAt) throw new Error("Invalid blockchain certificate dates.");
  return { issuedAt: BigInt(issuedAt), expirationAt: BigInt(expirationAt) };
}
