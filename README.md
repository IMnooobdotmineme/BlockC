# Blockchain Certificate Verification System

University assignment project for organization-issued digital certificates, Ethereum Sepolia registration, downloadable PDF certificates, QR-linked public verification, revocation, and recipient notifications.

## Technology

Next.js 16 App Router (`src/`), TypeScript, Tailwind CSS 4, PostgreSQL/Prisma 7, bcryptjs sessions, Solidity 0.8.28/Hardhat 3, ethers.js 6, pdf-lib/fontkit, qrcode, and Nodemailer. The application is a school-project implementation, with manual recovery rather than automatic background workers.

## Prerequisites

- Node.js 24 LTS (the project was tested with Node 24.11.0) and npm.
- A running PostgreSQL development database named `blockchain_certificates` and a database user able to apply migrations.
- Sepolia RPC endpoint, a dedicated test wallet with Sepolia ETH, and a deployed `CertificateRegistry` address for real issuance/revocation.
- Optional local SMTP capture for notifications. Automated tests use their own local EVM and SMTP server, not real Sepolia or externally delivered mail.

## Fresh-checkout setup

From the **project folder**, run these PowerShell commands. Keep an existing `.env`; do not overwrite it:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd ci
```

Edit `.env` privately using the placeholders in `.env.example`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL; URL-encode credentials and use the actual local port |
| `DEMO_ADMIN_PASSWORD` | Development seed password: at least 12 characters and at most 72 UTF-8 bytes |
| `NEXT_PUBLIC_APP_URL` | Public verification origin, usually `http://localhost:3000` locally |
| `SEPOLIA_RPC_URL` | Server-only Sepolia RPC endpoint |
| `BLOCKCHAIN_PRIVATE_KEY` | Server-only dedicated test wallet signing key |
| `CERTIFICATE_CONTRACT_ADDRESS` | Public deployed registry address |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Server-only SMTP configuration; user/password may both be empty for local capture |

The original Windows development database uses port **5433**; use the port of your installation (often 5432), not a copied credential. Create the development database if it does not exist, then run:

```powershell
npm.cmd run db:migrate
npm.cmd run db:generate
npm.cmd run db:seed
npm.cmd run blockchain:compile
npm.cmd run blockchain:check
npm.cmd run dev
```

Open `http://localhost:3000`. Demo organization: **Demo University**, email **admin@demo.edu**. The password is your local `DEMO_ADMIN_PASSWORD`; it is never embedded in source. The seed hashes it with bcrypt and avoids duplicate accounts. No seed creates fake on-chain records.

### Contract deployment

An existing deployment can be reused. Only when deploying a new registry, configure RPC and signing key privately, fund the test wallet, and manually run:

```powershell
npm.cmd run blockchain:compile
npm.cmd run blockchain:test
npm.cmd run blockchain:deploy
```

Save the printed public address in `CERTIFICATE_CONTRACT_ADDRESS` and restart the app. Never redeploy just to fix email configuration. The deployment script rejects missing credentials and non-Sepolia chain IDs. Writes consume Sepolia test ETH.

### Local notifications

In another terminal:

```powershell
npm.cmd run email:dev
```

Set SMTP host to `127.0.0.1`, port to `1025`, user/password to empty, and from to `Demo University <certificates@demo.edu>`. Restart Next.js. Visit `http://127.0.0.1:8025` to inspect captured messages; this loopback-only inbox never forwards email externally. See [SMTP and revocation details](docs/revocation-email.md).

## Routes

| Route | Access / purpose |
| --- | --- |
| `/` | Public home |
| `/login` | Organization login |
| `/dashboard` | Private organization counts |
| `/issue-certificate` | Private issuance form |
| `/certificates` | Private organization records |
| `/certificates/[id]` | Private detail, download, recovery, revoke, email retry; `id` is the internal database ID |
| `/api/certificates/[id]/pdf` | Owner-protected PDF download |
| `/verify` | Public certificate-ID entry |
| `/verify/[certificateId]` | Live public database/blockchain verification; uses readable `CERT-YYYY-NNNN` ID |

## Validation

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run blockchain:typecheck
npm.cmd run blockchain:test
npm.cmd run blockchain:hash-test
npm.cmd run test:integration
npm.cmd run security:scan
```

`test:integration` first compiles the contract and creates the production build. It then tests PostgreSQL, a local simulator, a temporary production HTTP port, and captured SMTP. It also checks real login/logout, database dashboard counts, PDF rendering/QR decoding, verification statuses, ownership, recovery, and email failure. It sends **no Sepolia writes and no real emails**. Temporary records are removed; annual counters stay advanced to avoid ID reuse. The database URL must target a local development database.

Standalone production build/run:

```powershell
npm.cmd run build
npm.cmd run start
```

Production sessions use Secure cookies; deploy behind HTTPS. A production host must support Node server execution, database connectivity, and the transaction-confirmation duration. Do not claim a hosted public app unless you have actually deployed and tested it.

## Consistency and limits

Signed issuance/revocation transactions are persisted before broadcast and recovered using the same hash/nonce. PostgreSQL confirmation follows successful chain confirmation. Email delivery is independent of certificate success and has owner-only retry. SMTP acceptance does not guarantee inbox delivery or exactly-once delivery after a crash. Legacy database-only records are not automatically registered or asserted authentic. Public verification never exposes recipient email. Personal certificate fields remain off-chain, but recipient name and other permitted details are intentionally public through the verification page.

## Submission materials

- [Final report draft with assignment sections and ER diagram](docs/final-report.md)
- [Screenshot, video, GitHub, and personal submission checklists](docs/submission-checklist.md)
- [Final validation evidence and remaining manual tasks](docs/final-validation.md)
- [Authentication](docs/authentication.md), [PDF/QR](docs/pdf-certificates.md), [contract/hashing](docs/blockchain.md), [issuance/recovery](docs/blockchain-integration.md), [revocation/email](docs/revocation-email.md)

Do not commit `.env`, private keys, SMTP credentials, database dumps, session cookies, or captured private email. `security:scan` checks tracked files plus Git-eligible project candidates and scoped history; its report contains only counts, file names, and credential types. Review staged files and screenshots manually before publishing. The repository and video must be uploaded by the student after the submission review.

## Demo Organization Login

**Email:** admin@demo.edu  
**Password:** Set locally in `.env` using `DEMO_ADMIN_PASSWORD`

For security, the real password is not included in this repository.
