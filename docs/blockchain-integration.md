# Step 8: issuance and public verification

Step 9 extends this flow with [revocation and email notifications](revocation-email.md). The original Step 8 scope below is retained for context; issuance now also queues a recipient notification after confirmation.

## Issuance

The `/issue-certificate` server action authenticates the organization and validates required fields, email, and calendar/date ordering. Browser-supplied organization IDs/names, certificate IDs, and status are ignored. It uses the authenticated organization and atomically increments the annual certificate counter while inserting a `PENDING` certificate with its deterministic SHA-256 hash. The seven-field `certificate-v1` protocol is unchanged; see [hash normalization](blockchain.md#canonical-hashing-protocol-certificate-v1).

The server signs the registry transaction locally, persists its signed bytes, precomputed transaction hash, chain/contract/wallet identity, and nonce in `CertificateBlockchainJob`, and commits before broadcasting. Nonces are reserved under a PostgreSQL advisory transaction lock and a `(chainId, walletAddress, nonce)` uniqueness constraint. Reservation considers both the RPC pending nonce and all durable jobs, protecting concurrent requests across application processes. Only four non-personal contract arguments are sent: ID, hash, issue timestamp, expiration timestamp. [ethers transaction population and broadcasting](https://docs.ethers.org/v6/single-page/) supply the gas/fee fields and send the signed transaction.

After a successful receipt with one confirmation and a matching on-chain record, PostgreSQL is updated to `CONFIRMED` and stores `blockchainTxHash` and `certificateHash`. Only then does issuance redirect to the detail page as successful. The detail page shows registration status, hashes, and the Sepolia explorer link. Pending/failed records receive an error and a link to the saved record; the form disables repeated submission after that response.

## Failure consistency and recovery

PostgreSQL and Ethereum cannot share one atomic transaction. This implementation uses a durable signed-transaction outbox and eventual reconciliation, not rollback of a successful chain write:

- **Failure before intent is committed:** no transaction has been broadcast; the record is `FAILED`. Owner can retry the same saved record using **Check / resume registration**.
- **Failure after intent is committed, send uncertainty, timeout, or restart:** retain `PENDING`, the same ID, signed intent, and reserved nonce. Do not delete the record or reuse the ID. A timeout never means definitely failed.
- **Chain confirmation succeeds but final database update fails:** keep the durable intent. Recovery fetches the same transaction receipt and finalizes PostgreSQL; it does not register a new ID.
- **Confirmed reverted receipt:** mark `FAILED`. This transaction cannot be resumed; administrator review is required. No automatic new transaction or replacement certificate is created.

The owner-only recovery action rechecks organization ownership server-side, validates the stored signed transaction against the certificate hash, function payload, contract, chain ID, nonce, and wallet, then checks the receipt or broadcasts the **same signed bytes** again. Re-broadcasting has the same transaction hash and cannot create a second registration. Stored intent is never serialized to client components, PDFs, or public verification. SQL transactions end before broadcasting/waiting, so no database lock is held during the confirmation wait.

Use the configured signing wallet exclusively for application writes. External transactions using its nonce can interfere with durable reservations. Resolve older pending records before issuing more: an unbroadcast earlier nonce or an underpriced transaction can hold later transactions in the queue. Fee replacement, background workers, automatic reconciliation, nonce-conflict repair, and multi-wallet operations are not implemented. Recovery is manual on the owner's detail page. Persisted jobs also bind to the original contract; changing the configured contract will block their replay rather than silently registering in another registry.

`BlockchainRegistrationStatus` is separate from `CertificateStatus`: `UNREGISTERED`, `PENDING`, `CONFIRMED`, `FAILED`. Existing records migrate to `UNREGISTERED`; they are not auto-registered or asserted authentic. The organization table and recent cards show pending/failed/legacy registration labels. Dashboard total includes every saved record; valid/expired/revoked cards include confirmed registrations only. These database counts do not perform live chain verification. Newly pending/failed records cannot download a certificate PDF; confirmed downloads retain the existing PDF/QR format. Legacy PDF downloads are preserved, and their QR verification correctly reports no authenticated registration.

## Public verification

`/verify` accepts the readable certificate ID. `/verify/[certificateId]` is request-time and requires no session. Existing PDF QR links automatically open it; no QR regeneration is required.

1. Normalize the ID and fetch the real certificate using an explicit public field allowlist. Recipient email, organization login credentials, sessions, signed intents, private key, and database/RPC secrets are excluded.
2. Recompute the deterministic SHA-256 hash from saved fields.
3. Read the real registry record and latest block timestamp from Sepolia.
4. Compare the recomputed hash to the on-chain hash and stored database hash, and check the on-chain issue/expiration timestamps against the date-derived values.
5. Check revocation and expiration. No public request changes database records or sends a blockchain transaction.

Results:

| Result | Rule |
| --- | --- |
| VALID | Database and chain records exist; hashes/timestamps match; neither revoked nor expired |
| EXPIRED | Authentic certificate whose expiration boundary has passed |
| REVOKED | Known certificate revoked in PostgreSQL or on-chain; revocation takes precedence over other completed-check results |
| INVALID | Unknown/malformed ID, missing chain record, mismatched hash/metadata/timestamps, or malformed stored data |
| Verification temporarily unavailable | A required database/RPC check cannot complete; authenticity is not asserted |

Expiration is at the next Bangkok midnight after the printed expiration date, using both the current server clock and the latest chain block timestamp. Revocation never becomes valid again through expiration handling. RPC failures use unknown/“Not checked” indicators, not misleading “No” or “Valid” values. Public details contain name/title/course/organization/dates and hash/transaction indicators, never recipient email. `Hash matches` specifically means recomputed hash equals on-chain hash; other authenticity checks can still make the final result invalid.

Changing recipient name, title, course, organization, or committed dates in PostgreSQL changes the regenerated commitment and produces INVALID. Altering the stored certificate hash or inconsistent on-chain dates also produces INVALID. Email and status are not part of the seven-field hash; database revocation remains an explicit overriding policy.

## Setup and testing

The local migration `20261006151257_blockchain_issuance` adds tracking fields and the durable job table. For another checkout/database:

```powershell
npm.cmd run db:migrate
npm.cmd run db:generate
npm.cmd run blockchain:check
npm.cmd run blockchain:test
npm.cmd run blockchain:hash-test
npm.cmd run test:integration
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run blockchain:typecheck
```

`blockchain:check` is a read-only Sepolia configuration/authorization/funding check. Integration tests compile/build first, then use real local PostgreSQL and a temporary Hardhat network with chain ID 11155111. They use a random simulator-funded wallet and an ephemeral production Next.js port; they never submit to the configured Sepolia wallet or contract. Test organizations, sessions, certificates, and durable jobs are cleaned up; certificate counters remain advanced to avoid ID reuse. `DATABASE_URL` must point to a local development PostgreSQL database. The test script requires the existing Node version supported by Hardhat 3. Production build is also run by the integration-test prerequisite.

To test a real Sepolia certificate: run `npm.cmd run dev`, log in as `admin@demo.edu` using your local seed password, submit `/issue-certificate`, and wait for confirmation. In `/certificates/[internalDatabaseId]`, check **Confirmed on Sepolia** plus both hashes. Open the public verification link or scan the PDF QR with your phone; the public route uses the readable `CERT-YYYY-NNNN` ID. A future expiration date should produce VALID. The explorer link shows the real receipt. This write consumes Sepolia test ETH. If confirmation is pending, recover the saved record instead of submitting again.

Environment variables are unchanged: `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `SEPOLIA_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`, and `CERTIFICATE_CONTRACT_ADDRESS`; `DEMO_ADMIN_PASSWORD` is only needed when seeding. No new secret is required.

Step 9 is now implemented; see [revocation and SMTP setup](revocation-email.md) for ownership, recovery, and notification failure handling.
