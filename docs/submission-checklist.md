# Final submission checklist

Use one fictional demonstration certificate: capture its confirmed/VALID screens first, then revoke that same certificate for the REVOKED screens. This minimizes real Sepolia writes to one issuance and one revocation. Automated tests use the local EVM and captured SMTP, with no real transactions or email delivery.

## Screenshot checklist

Save figures in your report working folder using these names. Use a consistent desktop viewport; optionally add one mobile screenshot at roughly 390px width. Screenshots are to be captured manually, not claimed as already produced.

| Done | Suggested filename | Page / view | Evidence and caption |
| --- | --- | --- | --- |
| [ ] | `01-homepage.png` | `/` | Project title, description, Verify and Organization Login buttons |
| [ ] | `02-login.png` | `/login` | Organization login form; password blank/hidden |
| [ ] | `03-dashboard.png` | `/dashboard` | Signed-in organization and real total/confirmed status counts |
| [ ] | `04-issue-form.png` | `/issue-certificate` | Required fields, read-only session organization, fictional recipient |
| [ ] | `05-certificate-detail.png` | `/certificates/[internalId]` | Confirmed on Sepolia, readable ID, real hash/transaction, download button |
| [ ] | `06-certificate-list.png` | `/certificates` | Organization-owned records, dates/status, View links |
| [ ] | `07-certificate-pdf.png` | Downloaded PDF viewer | Landscape layout, recipient/course/organization, ID/dates/status, readable QR |
| [ ] | `08-valid-verification.png` | `/verify/[readableId]`, logged out | VALID, Blockchain record exists Yes, Hash matches Yes; no recipient email |
| [ ] | `09-sepolia-transaction.png` | Detail's Sepolia explorer link | Successful real registration receipt, public transaction hash and contract |
| [ ] | `10-revoked-verification.png` | Same public verification URL after revoke | REVOKED for the same ID; existing PDF QR resolves to this result |
| [ ] | `11-email-notification.png` | `http://127.0.0.1:8025` local captured inbox | Issuance notification and verification URL; fictional recipient only |
| [ ] | `12-revocation-email.png` (optional) | Local captured inbox | Revocation notice for the same certificate |
| [ ] | `13-responsive.png` (optional) | Home or verify at mobile width | Readable content and wrapped hashes without page-wide overflow |

Add a one-sentence caption and refer to each figure in section 7 of the report. Capture the dashboard again after revocation if comparing before/after counts. Local captured email must be described as development SMTP evidence, not proof of delivery to an external mailbox.

Before capture: close `.env`, provider key pages, wallet export screens, request-cookie panels, and credential-bearing terminal windows. Use fictional data; crop/redact actual recipient email from private screens if it is not a demo address. Public transaction/contract hashes are suitable for the report. Keep original public hashes and IDs consistent across screenshots.

## Demo video checklist

- [ ] Introduce project name and purpose on the homepage.
- [ ] Open login; demonstrate successful organization sign-in without displaying/reading the password aloud.
- [ ] Show the dashboard and explain total versus confirmed status counts.
- [ ] Issue one fictional certificate; show automatic organization and ID assignment.
- [ ] Explain the pending state while Sepolia confirms; trim waiting time in the recording if needed without faking confirmation.
- [ ] Show confirmed detail, SHA-256 commitment, transaction hash, and explorer receipt.
- [ ] Download and open the PDF; show its QR code.
- [ ] Scan the QR using a phone or use its public verification URL; verify while logged out/in a separate private browser window.
- [ ] Explain VALID, record existence, hash matching, and the absence of recipient email.
- [ ] Return to the owning organization; revoke that same certificate and confirm the permanent action.
- [ ] Show the revocation receipt and updated organization status/counts.
- [ ] Reopen the same public URL/QR; show REVOKED.
- [ ] Show issuance and revocation notification in the local captured SMTP inbox, stating that no external email is sent in this development mode.
- [ ] Briefly explain pending-transaction recovery and independent failed-email retry; use automated evidence or an existing failed notification rather than unnecessary new Sepolia writes.
- [ ] Demonstrate logout and protected-page redirect.
- [ ] Review the recording for visible credentials, cookies, private personal data, and browser notifications.
- [ ] Upload manually, set the visibility/access required by the assignment, and test the final video link while logged out.

For a phone to open a local QR URL, `localhost` refers to the phone itself. If demonstrating on another device, use a trusted reachable app origin in `NEXT_PUBLIC_APP_URL`, restart the app, and regenerate the PDF. Otherwise use the QR's decoded URL in the same computer/browser and state that this is a local demo. Do not claim the application is publicly hosted unless it actually is.

## GitHub preparation checklist

Current preparation finding: Git resolves to `C:/Users/ASUS`, not this project; there are **zero project-tracked files and zero project commits**. `.env` is ignored, but this is not yet a publish-ready project repository. No history was rewritten or repository made public.

- [ ] Create/choose a repository rooted at `C:\Users\ASUS\Documents\BlockChain`, not the parent user directory. If using an existing project clone, preserve its history; do not overwrite/reinitialize it.
- [ ] Verify `git rev-parse --show-toplevel` reports the project directory.
- [ ] Keep `.env`/`.env.*` ignored and `.env.example` tracked with placeholders only.
- [ ] Exclude database dumps, wallet exports/private keys, SMTP credentials, RPC API credentials, session cookies, generated clients/build output, and private captured mail/media.
- [ ] Confirm the README's fresh-checkout setup, database port, seed, contract reuse/deployment, local SMTP, route IDs, and validation commands.
- [ ] Run `npm.cmd run security:scan`; inspect its counts/findings, without copying secret values into the report or chat.
- [ ] Stage only intended project files; review `git diff --cached --stat` and inspect staged content locally. Do not paste raw staged content containing secrets into chat.
- [ ] Confirm no `.env` file is staged. If a secret was ever committed, stop publication and rotate it; deleting the current file alone does not remove it from history.
- [ ] Preserve normal commit history; do not force-push or manufacture historical commits. This project currently has no history to preserve.
- [ ] Re-run the scan after staging so it also checks the actual tracked file set. The initial scan included untracked submission candidates because the tracked set was empty.
- [ ] Create the intended GitHub project repository and connect its remote manually. Use your normal credential manager, not a token embedded in the remote URL.
- [ ] Publish only after reviewing source and all intended screenshots/report/video; verify public access while logged out.
- [ ] Insert the real public repository URL in final-report section 9.

For this specific **new/uncommitted project** case, these are personal actions to run from the project folder after local review:

```powershell
Set-Location -LiteralPath 'C:\Users\ASUS\Documents\BlockChain'
git init
git rev-parse --show-toplevel
git check-ignore .env
npm.cmd run security:scan
git add .
git diff --cached --stat
npm.cmd run security:scan
# Inspect staged contents privately before committing.
git commit -m "Complete university certificate verification project"
# Add your actual project GitHub remote and push normally after creating it.
```

Do not run `git init` if the project already has a valid repository with history. No Git commit, remote, or public publication has been performed by the agent. A heuristic secret scan is supporting evidence, not a guarantee about unreviewed media, private dependencies, or future changes.

## Personal actions before submission

1. Configure local captured SMTP using [revocation-email.md](revocation-email.md), run `npm.cmd run email:dev` and `npm.cmd run dev` in separate terminals.
2. Check the configured registry with `npm.cmd run blockchain:check`. One real issue/revoke demonstration is still needed: there was no saved confirmed certificate during the final read-only Sepolia check.
3. Issue one disposable fictional credential, capture VALID and explorer/PDF/email evidence, then revoke it and capture the revoked result/email. Never reveal the wallet key or full RPC credentials.
4. Create/verify the project-root repository, stage/review/scan, commit normally, and publish manually. Keep the seed password and local config private.
5. Fill repository URL, name/student ID, actual individual contributions, screenshots/captions, and video URL in `docs/final-report.md`.
6. Convert the Mermaid architecture/ER diagrams into images if your PDF exporter does not render them, then export the complete report to PDF and inspect every page for clipped tables, missing figures, placeholders, or secrets.
7. Record/upload the demo manually; verify both public links while logged out and submit the assignment PDF, repository link, and video link according to your university instructions.
