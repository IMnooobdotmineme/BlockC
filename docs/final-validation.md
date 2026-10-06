# Final validation — Step 10

Date: **6 October 2026 (Asia/Bangkok)**. Tests validate the existing implementation, with small UI/message fixes only; no major application feature or schema/contract change was added in Step 10.

## Evidence scope

Automated integration uses actual local PostgreSQL, a simulator-funded random wallet/local EVM with Sepolia chain ID, an ephemeral production Next.js port, and captured SMTP. It never sends to the configured real Sepolia contract/wallet or external email addresses. Test records are cleaned up and counters are not reused. The final public verification/PDF QR tests now use live database/contract behavior, replacing stale mock-only assertions.

Read-only Sepolia access succeeded and the deployed contract was found at public address `0x3B980578276bbB81F85Fd7368655bD4ccE1b77ee`. No saved CONFIRMED certificate was available for an existing-record live check. Consequently a real issue/revoke demonstration remains a **manual submission task**; a successful local EVM test must not be presented as a new real Sepolia transaction.

## Functional coverage

| Function | Automated evidence |
| --- | --- |
| Organization login/logout | Actual server-action login, wrong-password rejection, production cookie flags, logout, old-cookie protected redirect |
| Dashboard counts | Rendered counts compared to organization-scoped SQL counts; status counts include confirmed registrations |
| Certificate issuance / PostgreSQL | Actual server action and service validation, session organization, unique IDs, hashes and successful receipts saved |
| Blockchain registration | Real local EVM transactions; duplicate/authorization tests; read-only actual Sepolia contract check |
| PDF download | Owner-only HTTP response, valid single-page landscape PDF |
| QR verification | QR decoded from the rendered downloaded PDF and followed to the real verification route |
| Public verification | Valid, expired, revoked, invalid/tampered, unknown, and unavailable states |
| Expiration | Date-derived expiry and authentic expired credentials; revocation takes precedence |
| Revocation | Successful and genuinely mined failed transactions, DB update only after confirmation, duplicate/foreign-owner rejection |
| Issuance/revocation email | Nodemailer delivers required content to local SMTP capture; no external delivery |
| Retry/recovery | Same signed transaction/hash/nonce after send uncertainty or post-confirmation failure; notification failure/concurrent retry lease |
| Unauthorized access | Missing sessions, foreign detail/PDF/action access, recipient email omitted from public HTML/data |

## Final command results

- `npm.cmd run lint`: PASS.
- `npm.cmd run typecheck`: PASS (Prisma generation, Next route types, TypeScript).
- `npm.cmd run blockchain:typecheck`: PASS.
- `npm.cmd run blockchain:test`: PASS — 12 contract tests.
- `npm.cmd run blockchain:hash-test`: PASS — 8 hash/ABI/deployment-guard tests.
- `npm.cmd run test:integration`: PASS — 23 test results, including the final expanded HTTP/login/count/PDF-QR checks. Its prerequisite also compiled the contract and completed the production build.
- `npm.cmd run security:scan`: PASS — 98 Git-eligible submission candidates checked, zero tracked project files, no credential findings, `.env` ignored. Re-run after staging before publication.
- `npm.cmd run blockchain:check`: PASS — real Sepolia connection, deployed contract, wallet authorization, and positive test-ETH balance; read-only, no transaction sent.

The integration runner's top-level test contributes one of the 23 results. Keep screenshots of your own final terminal summaries if the assignment requires test evidence. Do not expose `.env` or credential-bearing commands in those screenshots.

## UI review

Existing responsive grids, mobile organization navigation, scrollable tables, wrapped hashes, semantic labels, keyboard focus outlines, and status colors were retained. Small polish: shared danger-button styling, consistent disabled button styling, and a clear download message for unconfirmed registration. No broad redesign was made. Desktop/mobile visual screenshots remain a student capture task rather than fabricated evidence.

## Secret scan and repository status

The scanner checks project-tracked files, nonignored submission candidates, and available scoped Git patches for configured secret copies and common credential patterns. `.env` is confirmed ignored. It reports only counts, file names, and variable types; local secret values and raw Git/provider errors are not printed. Binary media are not text-scanned, so screenshots/video/database exports require manual review.

Git currently resolves to the parent `C:/Users/ASUS` repository, whose branch has no commits. There are zero project-tracked files and no project history to certify. No reset/rebase/commit/publish was performed. Create or select the proper project-root repository and repeat the scan after staging. A clean candidate scan is not a claim that a public repository already exists or that unreviewed history/media are safe.

## Remaining submission tasks and limitations

- Capture the required figures, real Sepolia issue/revoke evidence, and demo video; fill real repository/video URLs and individual contribution details.
- Review the generated PDF report, diagrams, public links, and staged repository before submitting.
- Existing limitations remain: shared signing wallet, manual recovery instead of workers, no gas replacement/bounce tracking, and SMTP acceptance rather than exactly-once/inbox guarantees. These are documented assignment boundaries, not newly added features.
- No runtime/test failure remains in the completed final checks. Publication readiness remains conditional on the personal repository/media/link review above.
