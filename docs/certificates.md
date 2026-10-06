# Certificate creation and storage (Step 5)

Login at `/login`, then open `/issue-certificate`. Complete recipient name/email,
certificate title, course/program, issue date, and expiration date. The organization
name is read-only and comes from your session. Submit to save and redirect to
`/certificates/[id]`, where `[id]` is the internal database ID. The readable
certificate ID is displayed on that page.

## ID allocation

`CertificateCounter` holds one atomic counter per Bangkok calendar year. An
upsert increments that year's counter inside the same PostgreSQL transaction as
the certificate insert. IDs look like `CERT-2026-0001`, are shared across all
organizations, and reset their number with a new year. Numbers above 9999 expand
automatically. The Certificate unique constraint is an additional safeguard.
The year is the creation year, not a date supplied by the browser. Deleting rows
does not recycle IDs. Tests consume numbers, so visible IDs may have gaps.

## Dates and status

Dates are validated on the server, including invalid calendar dates and
expiration-before-issue errors. Fields must be present, names/titles/programs
must be at most 200 characters, and email must be valid and at most 254 characters.

Dates are stored as PostgreSQL DATE columns. A certificate is valid through its
expiration date in Asia/Bangkok. It starts EXPIRED when expiration is before
today; otherwise it starts VALID. A submitted status is ignored. New certificates
cannot start REVOKED. Loading the dashboard, list, or detail page updates only
the signed-in organization's overdue VALID records to EXPIRED. REVOKED remains
REVOKED. No background expiration job or revocation action is added.

## Ownership and real data

The server action requires a valid session before validation or insertion.
Organization ID/name, certificate ID, and status submitted by the browser are
ignored. Each query and expiration update is filtered by the authenticated
organization ID. Detail lookups include both the internal certificate ID and
organization ID; foreign and missing certificates return 404. Unauthenticated
users redirect to `/login`. List rows, dashboard counts, and recent certificates
come from PostgreSQL. Blockchain transaction and certificate hash remain null.

Public `/verify` and `/verify/[id]` still use their original mock data. The home
page credential preview is also a sample. Issued database certificates are not yet
available through public verification. No blockchain, QR, PDF, email, or
revocation functionality has been added.

## Checks

```powershell
npm.cmd run db:generate
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start -- --port 3001
```

In another terminal:

```powershell
npx.cmd tsx scripts/test-certificates.ts
```

Tests use temporary organizations/sessions against the local server. They submit
real forms, validate error cases, check concurrent ID generation and ownership,
exercise expiration/counts, and confirm public verification stays mock-only.
Temporary data is removed, but counter increments are preserved. No credentials
or session cookies are printed.
