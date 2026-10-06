import "server-only";
import nodemailer from "nodemailer";
import type { Certificate, NotificationKind, Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { formatCertificateDate } from "./certificate-display";

export function notificationMessage(certificate: Certificate, kind: NotificationKind) {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) throw new Error("Invalid public app URL.");
  const url = new URL(`/verify/${encodeURIComponent(certificate.certificateId)}`, origin.origin).href;
  const issued = kind === "ISSUED";
  return {
    to: { name: certificate.recipientName, address: certificate.recipientEmail },
    subject: issued ? "Your certificate has been issued" : "Your certificate has been revoked",
    messageId: `<${certificate.certificateId.toLowerCase()}.${kind.toLowerCase()}@certifychain.local>`,
    text: [
      `Hello ${certificate.recipientName},`, "",
      issued ? "Your certificate has been issued and confirmed on the blockchain." : "Your certificate has been revoked and must no longer be used as a valid credential.", "",
      `Certificate ID: ${certificate.certificateId}`, `Certificate title: ${certificate.certificateTitle}`,
      `Organization: ${certificate.organizationName}`,
      ...(issued ? [`Course / Program: ${certificate.courseName}`, `Issue date: ${formatCertificateDate(certificate.issueDate)}`, `Expiration date: ${formatCertificateDate(certificate.expirationDate)}`] : []),
      "", `Public verification: ${url}`,
    ].join("\n"),
  };
}

export async function sendRecipientNotification(certificate: Certificate, kind: NotificationKind) {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !from || /[\r\n]/.test(from)) throw new Error("SMTP_NOT_CONFIGURED");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (Boolean(user) !== Boolean(pass)) throw new Error("SMTP_NOT_CONFIGURED");
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  const transport = nodemailer.createTransport({ host, port, secure: port === 465,
    requireTLS: !local && port !== 465, auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true });
  try {
    const info = await transport.sendMail({ from, ...notificationMessage(certificate, kind) });
    if (!info.accepted?.length || info.rejected?.length) throw new Error("SMTP_REJECTED");
  } finally { transport.close(); }
}

export async function queueNotification(tx: Prisma.TransactionClient, id: string, kind: NotificationKind) {
  return tx.certificateNotification.upsert({ where: { certificateId_kind: { certificateId: id, kind } }, create: { certificateId: id, kind }, update: {} });
}

export async function deliverCertificateNotification(organizationId: string, id: string, kind: NotificationKind, send = sendRecipientNotification) {
  // Notification failures must never propagate into issuance/revocation success handling.
  try {
    const certificate = await prisma.certificate.findFirst({ where: { id, organizationId } });
    if (!certificate || certificate.blockchainStatus !== "CONFIRMED" || (kind === "REVOKED" && certificate.status !== "REVOKED")) return "NOT_SENT";
    const notification = await prisma.certificateNotification.findUnique({ where: { certificateId_kind: { certificateId: id, kind } } });
    if (!notification) return "NOT_SENT";
    if (notification.status === "SENT") return "SENT";
    if (kind === "ISSUED" && certificate.status === "REVOKED") {
      await prisma.certificateNotification.updateMany({ where: { id: notification.id, status: { not: "SENT" } }, data: { status: "FAILED", lastError: "ISSUANCE_SUPERSEDED_BY_REVOCATION" } });
      return "FAILED";
    }
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 120_000);
    const claim = await prisma.certificateNotification.updateMany({ where: { id: notification.id, status: { not: "SENT" }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { status: "SENDING", leaseUntil, attempts: { increment: 1 }, lastError: null } });
    if (!claim.count) return "SENDING";
    try {
      await send(certificate, kind);
      await prisma.certificateNotification.updateMany({ where: { id: notification.id, leaseUntil }, data: { status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null } });
      return "SENT";
    } catch {
      await prisma.certificateNotification.updateMany({ where: { id: notification.id, leaseUntil }, data: { status: "FAILED", leaseUntil: null, lastError: "NOTIFICATION_DELIVERY_FAILED" } });
      return "FAILED";
    }
  } catch { return "FAILED"; }
}
