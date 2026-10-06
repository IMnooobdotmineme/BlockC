import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { formatCertificateDate, statusLabel } from "./certificate-display";

export type PdfCertificate = {
  certificateId: string;
  certificateTitle: string;
  recipientName: string;
  courseName: string;
  organizationName: string;
  issueDate: Date;
  expirationDate: Date;
  status: "VALID" | "EXPIRED" | "REVOKED";
};

export function verificationUrl(certificateId: string, appUrl = process.env.NEXT_PUBLIC_APP_URL) {
  if (!appUrl) throw new Error("APP_URL_NOT_CONFIGURED");
  const base = new URL(appUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("INVALID_APP_URL");
  const url = new URL(`/verify/${encodeURIComponent(certificateId)}`, base).toString();
  if (url.length > 2000) throw new Error("VERIFICATION_URL_TOO_LONG");
  return url;
}

export async function certificateQrCode(certificateId: string, appUrl?: string) {
  const url = verificationUrl(certificateId, appUrl);
  const png = await QRCode.toBuffer(url, { type: "png", width: 512, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return { url, png };
}

let fontBytes: Promise<Buffer[]> | undefined;
function getFontBytes() {
  fontBytes ??= Promise.all(["NotoSans.ttf", "NotoSansThai.ttf"].map(file => readFile(path.join(process.cwd(), "assets", "fonts", file))));
  return fontBytes;
}

// Word-wrap long fields, including long unbroken names, without dropping characters.
export function wrapPdfText(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ""; }
    for (const character of word) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ""; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateCertificatePdf(certificate: PdfCertificate) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [latinBytes, thaiBytes] = await getFontBytes();
  const [latin, thai, bold] = await Promise.all([
    doc.embedFont(latinBytes, { subset: true }),
    doc.embedFont(thaiBytes, { subset: true }),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);
  const page = doc.addPage([841.89, 595.28]);
  const teal = rgb(0.05, 0.39, 0.36);
  const ink = rgb(0.07, 0.11, 0.18);
  const muted = rgb(0.37, 0.42, 0.47);
  const fontFor = (text: string) => /[\u0e00-\u0e7f]/.test(text) ? thai : latin;
  const clean = (text: string) => text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  function fittedText(text: string, x: number, y: number, width: number, size: number, maxLines: number, centered = false, color = ink, height = 60) {
    text = clean(text);
    const font = fontFor(text);
    for (const character of text) if (!font.getCharacterSet().includes(character.codePointAt(0)!)) throw new Error("UNSUPPORTED_PDF_CHARACTER");
    let lines = wrapPdfText(text, font, size, width);
    while ((lines.length > maxLines || (lines.length - 1) * size * 1.35 > height) && size > 8) { size -= 0.5; lines = wrapPdfText(text, font, size, width); }
    if (lines.length > maxLines || (lines.length - 1) * size * 1.35 > height) throw new Error("PDF_TEXT_TOO_LONG");
    lines.forEach((line, index) => page.drawText(line, { x: centered ? x + (width - font.widthOfTextAtSize(line, size)) / 2 : x, y: y - index * size * 1.35, font, size, color }));
  }
  const label = (text: string, x: number, y: number) => page.drawText(text, { x, y, font: bold, size: 8, color: muted });
  page.drawRectangle({ x: 26, y: 26, width: 789.89, height: 543.28, borderColor: teal, borderWidth: 1.5 });
  page.drawRectangle({ x: 36, y: 36, width: 769.89, height: 523.28, borderColor: rgb(0.84, 0.88, 0.87), borderWidth: 0.5 });
  page.drawRectangle({ x: 26, y: 26, width: 7, height: 543.28, color: teal });
  fittedText(certificate.organizationName, 72, 515, 697.89, 17, 2, true, teal);
  page.drawText("DIGITAL CERTIFICATE", { x: 348, y: 468, font: bold, size: 11, color: muted });
  fittedText(certificate.certificateTitle, 72, 429, 697.89, 32, 3, true);
  fittedText("Presented to", 72, 343, 697.89, 12, 1, true, muted);
  fittedText(certificate.recipientName, 72, 311, 697.89, 31, 3, true, teal, 50);
  fittedText("Course / Program", 72, 236, 697.89, 10, 1, true, muted);
  fittedText(certificate.courseName, 100, 215, 641.89, 14, 3, true, ink, 27);
  page.drawLine({ start: { x: 72, y: 172 }, end: { x: 769.89, y: 172 }, thickness: 0.7, color: rgb(0.82, 0.87, 0.86) });
  label("CERTIFICATE ID", 72, 150);
  fittedText(certificate.certificateId, 72, 131, 500, 13, 1);
  label("ISSUE DATE", 72, 104);
  fittedText(formatCertificateDate(certificate.issueDate), 72, 87, 165, 11, 1);
  label("EXPIRATION DATE", 252, 104);
  fittedText(formatCertificateDate(certificate.expirationDate), 252, 87, 165, 11, 1);
  label("STATUS", 432, 104);
  const statusColor = { VALID: teal, EXPIRED: rgb(0.57, 0.34, 0.04), REVOKED: rgb(0.67, 0.12, 0.22) }[certificate.status];
  fittedText(statusLabel(certificate.status), 432, 87, 145, 12, 1, false, statusColor);
  const { url, png } = await certificateQrCode(certificate.certificateId);
  const qr = await doc.embedPng(png);
  page.drawImage(qr, { x: 649, y: 57, width: 112, height: 112 });
  fittedText("Scan to verify", 643, 43, 125, 8, 1, true, muted);
  fittedText("Public verification currently shows demo records.", 72, 49, 535, 8, 1, false, muted);
  doc.setTitle(`${certificate.certificateTitle} - ${certificate.certificateId}`);
  doc.setAuthor(certificate.organizationName);
  doc.setSubject(`Certificate record. QR verification URL: ${url}`);
  doc.setCreator("Blockchain Certificate Verification System");
  return doc.save();
}
