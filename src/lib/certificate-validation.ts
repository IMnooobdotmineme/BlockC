export type CertificateInput = {
  recipientName: string;
  recipientEmail: string;
  certificateTitle: string;
  courseName: string;
  issueDate: string;
  expirationDate: string;
};
export type CertificateErrors = Partial<Record<keyof CertificateInput, string>>;
export type IssueState = { errors: CertificateErrors; error: string; values?: CertificateInput; recordId?: string; certificateId?: string };

export function todayInBangkok(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01" || value > "9999-12-31") return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
export function validateCertificate(form: FormData) {
  const values = Object.fromEntries(["recipientName", "recipientEmail", "certificateTitle", "courseName", "issueDate", "expirationDate"].map(key => {
    const value = form.get(key);
    return [key, typeof value === "string" ? value.trim() : ""];
  })) as CertificateInput;
  const errors: CertificateErrors = {};
  for (const field of ["recipientName", "certificateTitle", "courseName"] as const) {
    if (!values[field]) errors[field] = "This field is required.";
    else if (values[field].length > 200) errors[field] = "Use at most 200 characters.";
  }
  if (!values.recipientEmail || values.recipientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.recipientEmail)) errors.recipientEmail = "Enter a valid recipient email.";
  const issueDate = parseDate(values.issueDate);
  const expirationDate = parseDate(values.expirationDate);
  if (!issueDate) errors.issueDate = "Enter a valid issue date.";
  if (!expirationDate) errors.expirationDate = "Enter a valid expiration date.";
  if (issueDate && expirationDate && expirationDate < issueDate) errors.expirationDate = "Expiration date cannot be before issue date.";
  return { values, errors, issueDate, expirationDate };
}

export function initialCertificateStatus(expirationDate: Date, now = new Date()): "VALID" | "EXPIRED" {
  return expirationDate < new Date(`${todayInBangkok(now)}T00:00:00.000Z`) ? "EXPIRED" : "VALID";
}
