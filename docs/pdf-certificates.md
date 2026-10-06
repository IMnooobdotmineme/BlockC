# PDF certificates and QR codes (Step 6)

Set the public site origin in the root `.env`:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Keep it set to the actual public site address when hosting. This variable is
public and is not a secret. Restart development after changing it; rebuild for
production because Next.js can inline `NEXT_PUBLIC_` settings at build time.
The application origin is configured explicitly, not taken from request headers.

Login, issue a certificate if needed, open `/certificates/[id]`, and click
**Download PDF Certificate**. The button displays progress and safe error messages.

## PDF and QR generation

`GET /api/certificates/[id]/pdf` generates the PDF in the Node.js runtime, on
demand, with `pdf-lib`. The single A4 landscape page includes title, recipient,
course/program, organization, readable certificate ID, issue/expiration dates,
current status, and a QR code. Text wraps/shrinks to fit. Local Noto fonts support
English/Latin and Thai text without remote font requests during download; other
unsupported glyphs produce the handled generation error.

`qrcode` generates a black-and-white 512px PNG with a four-module quiet zone and
medium error correction. The image is embedded at print-friendly size. Its data
is an absolute URL such as `http://localhost:3000/verify/CERT-2026-0001`, using
the readable certificate ID rather than its internal database ID. URLs must use
HTTP/HTTPS and may not contain credentials. No QR scanner is implemented.

The PDF notes that public verification currently shows demo records. Scanning a
new database certificate may therefore show "Certificate not found" until public
verification is connected in a later step. PDFs are generated in memory; no
certificate files or QR images are stored in the database or on the server.

## Ownership and errors

The handler resolves the logged-in organization from its database-backed session.
It queries by both certificate ID and organization ID. Request-supplied ownership
values are never trusted. Expiration status is refreshed using the existing helper.

- Missing/expired session: 401.
- Missing certificate or another organization's certificate: identical 404.
- Database/PDF/config/font error: generic 500, without internal details.
- Success: application/pdf attachment, safe filename, private no-store cache,
  and nosniff header.

No blockchain, email, revocation action, or public database lookup is added.

## Checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start -- --port 3001
```

In a second terminal:

```powershell
node --conditions=react-server --import tsx scripts/test-pdf.ts
```

The tests inspect PDF text, dimensions and headers, render previews, decode QR
codes from the rendered PDFs, test long/Thai fields, check ownership and errors,
and ensure public verification remains mock-only. Temporary database rows are
removed. Preview PDF/PNG files are written to ignored `test-artifacts/`.
The react-server condition allows the test runner to load the server-only helper.
