import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { certificateQrCode, generateCertificatePdf, verificationUrl, type PdfCertificate } from "../src/lib/certificate-pdf";
import { todayInBangkok } from "../src/lib/certificate-validation";
import { formatCertificateDate } from "../src/lib/certificate-display";

const base = new URL(process.env.AUTH_TEST_URL ?? "http://localhost:3001");
assert(["localhost", "127.0.0.1"].includes(base.hostname), "PDF tests must use localhost.");
const connectionString = process.env.DATABASE_URL!;
const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
const organizations: string[] = [];
const suffix = randomBytes(8).toString("hex");
const expectedUrl = (id: string) => new URL(`/verify/${encodeURIComponent(id)}`, process.env.NEXT_PUBLIC_APP_URL).toString();

async function render(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false, standardFontDataUrl: path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts").replaceAll("\\", "/") + "/" });
  const document = await task.promise;
  assert.equal(document.numPages, 1);
  const page = await document.getPage(1);
  const text = (await page.getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  const image = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  assert(decoded, "QR code must scan from the rendered PDF page.");
  const png = await canvas.encode("png");
  await task.destroy();
  return { text, qrUrl: decoded.data, png };
}
async function fixture(name: string) {
  const organization = await prisma.organization.create({ data: { name, email: `pdf-${name.replace(/\s/g, "")}-${suffix}@example.com`, passwordHash: await hash(randomBytes(24).toString("base64url"), 12) } });
  organizations.push(organization.id);
  const token = randomBytes(32).toString("base64url");
  await prisma.organizationSession.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), organizationId: organization.id, expiresAt: new Date(Date.now() + 3600000) } });
  return { organization, cookie: `organization_session=${token}` };
}
async function request(id: string, cookie?: string) { return fetch(new URL(`/api/certificates/${id}/pdf`, base), { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} }); }

async function main() {
  assert.equal(verificationUrl("CERT-2026-0001", "https://example.edu/"), "https://example.edu/verify/CERT-2026-0001");
  assert.throws(() => verificationUrl("CERT-2026-0001", "javascript:alert(1)"));
  assert.throws(() => verificationUrl("CERT-2026-0001", "https://user:secret@example.edu"));
  const qr = await certificateQrCode("CERT-2026-0001");
  const image = PNG.sync.read(qr.png);
  assert.equal(jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data, expectedUrl("CERT-2026-0001"));
  const input: PdfCertificate = { certificateId: "CERT-2026-0001", certificateTitle: "Introduction to Blockchain", recipientName: "Alex Morgan", courseName: "Digital Technology", organizationName: "Demo University", issueDate: new Date("2026-09-01T00:00:00Z"), expirationDate: new Date("2028-09-01T00:00:00Z"), status: "VALID" };
  const preview = await generateCertificatePdf(input);
  const parsed = await PDFDocument.load(preview);
  assert.equal(parsed.getPageCount(), 1);
  assert(parsed.getPage(0).getWidth() > parsed.getPage(0).getHeight());
  const rendered = await render(preview);
  for (const value of [input.certificateId, input.certificateTitle, input.recipientName, input.courseName, input.organizationName, formatCertificateDate(input.issueDate), formatCertificateDate(input.expirationDate), "Valid"]) assert(rendered.text.includes(value), "PDF must contain every required field.");
  assert.equal(rendered.qrUrl, expectedUrl(input.certificateId));
  await mkdir("test-artifacts", { recursive: true });
  await writeFile("test-artifacts/certificate-preview.pdf", preview);
  await writeFile("test-artifacts/certificate-preview.png", rendered.png);
  const long = await render(await generateCertificatePdf({ ...input, certificateTitle: "W".repeat(200), recipientName: "W".repeat(200), courseName: "W".repeat(200) }));
  assert(long.text.replace(/\s/g, "").includes("W".repeat(200)));
  const thai = await render(await generateCertificatePdf({ ...input, recipientName: "สมชาย ใจดี", certificateTitle: "หลักสูตรเทคโนโลยี", courseName: "วิทยาการคอมพิวเตอร์", organizationName: "มหาวิทยาลัยตัวอย่าง" }));
  assert(thai.text.includes("สมชาย"));
  await writeFile("test-artifacts/certificate-thai-preview.png", thai.png);
  console.log("PASS: one-page landscape PDF, required fields, English/Thai fonts, long-field wrapping, and QR scan from actual rendered PDF.");

  const owner = await fixture("PDF Test University");
  const foreign = await fixture("Other PDF University");
  const certificate = await prisma.certificate.create({ data: { certificateId: `PDF-TEST-${suffix}`, recipientName: input.recipientName, recipientEmail: "recipient@example.com", certificateTitle: input.certificateTitle, courseName: input.courseName, organizationName: owner.organization.name, organizationId: owner.organization.id, issueDate: input.issueDate, expirationDate: input.expirationDate, status: "VALID" } });
  assert.equal((await request(certificate.id)).status, 401);
  assert.equal((await request(certificate.id, "organization_session=" + "x".repeat(43))).status, 401);
  const denied = await request(certificate.id, foreign.cookie);
  assert.equal(denied.status, 404);
  const missing = await request("missing-certificate", owner.cookie);
  assert.equal(missing.status, 404);
  assert.equal(await denied.text(), await missing.text(), "Missing/foreign records must not disclose ownership.");
  for (const status of ["VALID", "EXPIRED", "REVOKED"] as const) {
    await prisma.certificate.update({ where: { id: certificate.id }, data: { status } });
    const response = await request(certificate.id, owner.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert(response.headers.get("content-disposition")!.includes(`${certificate.certificateId}.pdf`));
    assert(response.headers.get("cache-control")!.includes("no-store"));
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
    const result = await render(bytes);
    assert(result.text.includes(status.charAt(0) + status.slice(1).toLowerCase()));
    assert.equal(result.qrUrl, expectedUrl(certificate.certificateId));
  }
  const yesterday = new Date(new Date(todayInBangkok() + "T00:00:00Z").getTime() - 86400000);
  await prisma.certificate.update({ where: { id: certificate.id }, data: { status: "VALID", expirationDate: yesterday } });
  assert.equal((await request(certificate.id, owner.cookie)).status, 200);
  assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } })).status, "EXPIRED");
  const detail = await fetch(new URL(`/certificates/${certificate.id}`, base), { headers: { Cookie: owner.cookie } });
  assert((await detail.text()).includes("Download PDF Certificate"));
  await prisma.certificate.update({ where: { id: certificate.id }, data: { certificateTitle: "Unsupported emoji 😀" } });
  const failure = await request(certificate.id, owner.cookie);
  assert.equal(failure.status, 500);
  assert.equal((await failure.json()).error, "PDF generation failed. Please try again later.");
  // Legacy PDF fixtures have no blockchain registration, so public verification must not authenticate them.
  const verification = await (await fetch(new URL(`/verify/${certificate.certificateId}`, base))).text();
  assert(!verification.includes("Certificate valid"));
  assert(!verification.includes(certificate.recipientEmail));
  assert((await (await fetch(new URL("/verify/CERT-2026-001", base))).text()).includes("Certificate invalid"));
  console.log("PASS: authenticated downloads, owner-only access, missing records, all statuses, expiration refresh, safe generation errors, and real verification privacy.");
}
main().catch(() => { console.error("PDF/QR test failed. No credentials or session cookies were printed."); process.exitCode = 1; }).finally(async () => {
  await prisma.certificate.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
  await prisma.$disconnect();
  console.log("Temporary PDF test records removed. Preview files are in ignored test-artifacts/.");
});
