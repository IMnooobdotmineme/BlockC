# Step 9: certificate revocation and recipient notifications

## Revocation and ownership

The private `/certificates/[internalDatabaseId]` page offers **Revoke Certificate** only for a confirmed registration owned by the logged-in organization, when database status is not already REVOKED. The browser confirms that revocation is permanent. Server actions authenticate the session again and query by both record ID and authenticated organization ID. Browser-supplied organization IDs are ignored. Missing and foreign records produce the same safe error. Duplicate revocation of a database-revoked record is rejected.

The service reads the current on-chain record and checks its hash against the saved certificate fields. It signs `revokeCertificate(certificateId)` locally and commits a durable `CertificateRevocationJob` before sending. Issuance and revocation share the same PostgreSQL advisory lock and nonce allocator, considering reservations in both job tables. No SQL transaction remains open while waiting for blockchain confirmation.

After a successful receipt (one confirmation) and an on-chain revoked flag, one SQL transaction changes Certificate.status to REVOKED, records `revocationStatus=CONFIRMED`, `revocationTxHash`, and `revokedAt`, and queues a revocation email. Organization details, list, and dashboard are revalidated. Public verification already prioritizes blockchain/database revocation over expiration, so the existing PDF QR link reports REVOKED without regenerating the QR code. PDF generation and authentication are preserved; regenerated PDFs reflect the updated database status.

## Blockchain/database consistency

- Preparation/RPC/funding failures before intent persistence do not mark the certificate revoked. An attempt without a saved transaction can be retried on the same record.
- Once a signed intent exists, send uncertainty, timeout, or restart preserves PENDING. **Check / resume revocation** validates and resubmits the exact signed transaction or checks its existing receipt. It uses the same nonce/hash and cannot create a second revocation.
- A mined reverted receipt marks only the revocation attempt FAILED; certificate status remains unchanged. A failed mined attempt requires administrator review rather than automatic replacement.
- If the chain succeeds but the database finalization fails, recovery observes the chain's revoked flag and reconciles PostgreSQL. Public verification can already show REVOKED while database recovery is pending.
- If an authorized wallet revoked externally, a matching on-chain record can also reconcile the database. Transaction attribution is recorded only when the stored job's own successful receipt is known; otherwise the hash remains null rather than attributing another wallet's transaction.

PostgreSQL and Ethereum cannot commit atomically. Durable intent plus owner-triggered reconciliation gives eventual consistency. Keep the configured signing wallet dedicated to application writes and recover earlier pending nonces before adding more transactions. Automatic background reconciliation, gas-fee replacement, and nonce-conflict repair remain future work. The existing contract is reused; no contract redeployment is needed.

## Email flow and privacy

Nodemailer sends plain-text SMTP notifications. Successful issuance queues an ISSUED notification atomically with database confirmation; successful revocation queues REVOKED atomically with the status update. After commit, the service attempts delivery. Issuance messages include recipient name, title, course, organization, readable certificate ID, issue/expiration dates, and public verification URL. Revocation messages identify the credential and organization, say it was revoked, and provide the same URL. Internal database/organization IDs, session data, signed transactions, credentials, and private keys are excluded. Recipient email is used privately as the envelope recipient and remains absent from public database selections and verification HTML/RSC responses.

`CertificateNotification` is unique per certificate and kind. Status is NOT_SENT, SENDING, SENT, or FAILED, with attempt count, sent timestamp, a two-minute delivery lease, and safe error code. Sent notifications are not resent on ordinary retries. A compare-and-set lease prevents simultaneous delivery attempts. Failed/unsent notifications can be retried by their organization on the detail page. A stuck SENDING attempt becomes retryable after two minutes. An unsent issuance email is suppressed if the certificate is already revoked, avoiding a delayed misleading issuance notice.

SMTP failures never revert blockchain or certificate status. Missing configuration, rejected email, or connection errors store `NOTIFICATION_DELIVERY_FAILED`; raw SMTP responses and credentials are never printed or returned. SENT means the SMTP server accepted the email, not proof of inbox delivery. SMTP cannot provide atomic exactly-once delivery with PostgreSQL: a crash after SMTP acceptance but before saving SENT can cause a duplicate on retry. Stable Message-ID, unique records, and leases reduce duplicate attempts but do not eliminate that crash window. There is no bounce tracking or automatic email worker yet.

## SMTP configuration

Add these server-only settings to the ignored root `.env`; placeholders are in `.env.example`:

```dotenv
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM=""
```

`NEXT_PUBLIC_APP_URL` remains the public origin for verification links. Keep SMTP credentials out of source control and never prefix them with NEXT_PUBLIC_. Use port 465 for implicit TLS; other remote ports require STARTTLS. Loopback-only development SMTP can be unauthenticated without TLS. Both user and password must be configured together or both left empty. TLS certificate verification is retained; SMTP protocol logging, external attachment URLs, and filesystem attachment access are disabled. See [Nodemailer SMTP configuration](https://nodemailer.com/smtp).

## Test email locally without delivering real messages

1. In one project-root terminal, run `npm.cmd run email:dev`. The bundled capture server binds SMTP to **127.0.0.1:1025** and a local inbox to **127.0.0.1:8025**. Messages remain in memory (latest 30), are escaped for display, and are never forwarded. Restart clears the inbox. SMTP message bodies and credentials are not printed to the console.
2. In `.env`, set:

   ```dotenv
   SMTP_HOST="127.0.0.1"
   SMTP_PORT="1025"
   SMTP_USER=""
   SMTP_PASSWORD=""
   SMTP_FROM="Demo University <certificates@demo.edu>"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```

3. Restart the Next.js development server (`npm.cmd run dev`) in another terminal. Keep existing database and Sepolia settings. Open `http://127.0.0.1:8025` for captured mail. Do not run another capture tool on the same ports. [Mailpit](https://mailpit.axllent.org/docs/install/) is an optional alternative using the same default ports.
4. Log in at `/login` as `admin@demo.edu` using your local seed password. Issue one certificate with a test recipient address. Wait for confirmed registration. Its private detail page should show issuance email SENT; refresh the local inbox to inspect its text and verification link. The email stays local, but real Sepolia issuance consumes test ETH.
5. Stop the capture server and retry a new issuance/revocation to test SMTP failure. Certificate status should still be successful while notification status shows FAILED. Restart the capture server and click **Retry notification** on the private detail page. You can also reuse an existing failed notification instead of making an unnecessary blockchain write.

## Test revocation

1. Open `/certificates` and select a certificate that has **Confirmed on Sepolia** and is not revoked. Prefer a disposable certificate; revocation is permanent.
2. Click **Revoke Certificate**, confirm the prompt, and wait for confirmation. This consumes Sepolia test ETH.
3. Confirm REVOKED status, the stored revocation transaction hash, and its Sepolia explorer receipt on the detail page. The organization list and dashboard should reflect the updated status.
4. Open `/verify/[readableCertificateId]` while logged out, or scan the existing PDF QR. It must show REVOKED, including if the credential is also expired. Check the local inbox for the revocation email.
5. If confirmation is pending, use **Check / resume revocation** on the saved record. Do not create a new transaction manually. The revoke button disappears after confirmed database revocation.

## Migration and automated validation

Migration `20261006160542_revocation_notifications` adds three certificate fields, the revocation job table, notification table, and RevocationStatus/NotificationKind/EmailStatus enums. Existing records are preserved. Another local checkout can run:

```powershell
npm.cmd run db:migrate
npm.cmd run db:generate
npm.cmd run blockchain:test
npm.cmd run test:integration
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run blockchain:typecheck
```

Integration tests compile and build first, use real local PostgreSQL, a simulator-funded random wallet, an ephemeral local EVM/Next.js port, and an in-process SMTP capture server. The test process overrides all SMTP and blockchain settings before operations; no real Sepolia transactions or externally delivered emails occur. Fixtures and notification/job records are removed; annual counters remain advanced to avoid ID reuse.

Tests cover successful issuance/revocation emails, owner/foreign/duplicate actions, actual confirmed and mined failed revocations, pending/restart recovery, public revocation-over-expiration, notification failure and retry/concurrency, transaction/hash persistence, public recipient-email privacy, HTTP actions, PDF ownership, and RPC outages.

Suggested Step 10 scope (not implemented): automated recovery/notification workers, operational monitoring, delivery/bounce handling, and deployment hardening. Define the next feature scope before adding it.
