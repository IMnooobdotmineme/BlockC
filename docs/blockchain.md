# Step 7: blockchain foundation

This document records the Step 7 foundation. [Step 8](blockchain-integration.md) now connects issuance/public verification and extends the backend with durable transaction preparation and recovery. The isolation notes below describe the earlier Step 7 state.

The existing UI, authentication, PostgreSQL issuance, PDFs, QR codes, and public demo verification are unchanged. These utilities are intentionally not called by any page or certificate-creation action yet.

## Architecture

PostgreSQL holds certificate details and recipient information. A server-only ethers.js module computes a deterministic SHA-256 commitment and sends it to `CertificateRegistry` on Ethereum Sepolia. The contract stores only certificate ID, bytes32 hash, issuer wallet, issue timestamp, expiration timestamp, and revocation flag. Personal data is not passed to the contract or emitted in events. A hash is a commitment, not encryption; anyone with the same original fields can recompute it.

The deploying wallet is the immutable contract owner and an authorized issuer. Only the owner can call `setIssuerAuthorization(address, bool)` to grant or remove other issuer permissions. Only owner/authorized wallets may register; duplicate IDs cannot overwrite records. The owner or original issuer (while still authorized) can revoke. Revocation is permanent. The server wallet represents the platform issuer at this stage; organization identity is still enforced by the application, not encoded in the contract. These helpers are not HTTP endpoints and must remain behind authenticated ownership checks when integrated in Step 8.

Hardhat 3 lives in the isolated ESM `blockchain/` package so the Next.js package format stays unchanged. Solidity is pinned to 0.8.28; compilation uses optimizer 200 runs and Cancun EVM. Tests use Hardhat's local simulated network and Node test runner, with no RPC credentials or ETH needed.

## Canonical hashing protocol: certificate-v1

SHA-256 hashes UTF-8 bytes of `JSON.stringify` of this fixed-order array, without pretty-printing:

```text
["certificate-v1", certificateId, recipientName, certificateTitle,
 courseName, organizationName, issueDate, expirationDate]
```

- ID: Unicode NFC, trim, uppercase, must match `CERT-YYYY-NNNN` (at least four sequence digits), maximum 64 characters.
- Four text fields: Unicode NFC; collapse consecutive JavaScript Unicode whitespace to one ASCII space; trim; preserve casing; reject empty values and remaining ASCII control characters.
- Dates: strict valid Gregorian `YYYY-MM-DD`. Prisma `Date` values use their UTC calendar component, matching existing date-only database storage. Arbitrary timestamp strings are rejected. Expiration cannot precede issue date.
- Output: lowercase 64-digit hex SHA-256 prefixed with `0x`, accepted as Solidity `bytes32`.
- Email, database IDs, status, transaction hash, and existing certificate hash are excluded. JSON array encoding avoids delimiter ambiguity and property-order dependency.

Blockchain timestamps are seconds since Unix epoch: issue date at Bangkok midnight (UTC+07:00), expiration at the start of the **following** Bangkok day. This preserves the existing inclusive expiration-date behavior. `issuedAt` is the certificate's issue date, not the registration block time. Already-expired certificates may be registered and immediately verify as expired. The contract treats IDs as exact strings; always use the backend ID normalizer when registering/looking up school-project IDs.

## Verification and revocation

`verifyCertificate(id, expectedHash)` returns four independent flags: exists, hashMatches, revoked, expired. A valid certificate requires `exists && hashMatches && !revoked && !expired`. A missing record returns all false. Expiration uses the chain timestamp and `block.timestamp >= expirationAt`; it needs no scheduled transaction. `getCertificate` returns the full stored tuple and rejects missing IDs. Registration and revocation emit `CertificateRegistered` and `CertificateRevoked`.

`src/lib/blockchain/registry.ts` exports `connectToSepolia`, `loadCertificateRegistry`, `registerCertificateOnBlockchain`, `readCertificateOnBlockchain`, `verifyCertificateOnBlockchain`, and `revokeCertificateOnBlockchain`. Reads require RPC + address; writes additionally need the signing key and issuer authorization. All connections enforce Sepolia chain ID 11155111. Register/revoke wait for one confirmation (120-second timeout). Registration returns `{ transactionHash, certificateHash }`. No helper updates PostgreSQL. On timeout, inspect chain state before retrying: a submitted transaction may still confirm. Provider errors are sanitized so credential-bearing URLs and keys are not logged.

## Sepolia setup and deployment

1. Create a dedicated development Ethereum wallet and switch it to Sepolia. Obtain an Ethereum Sepolia RPC endpoint from a provider. Fund the wallet with faucet **Sepolia test ETH**; deployment, registration, and revocation require gas. Reads do not require ETH. Never use a wallet holding real funds for this school project.
2. Add these server-only variables to the ignored root `.env`, privately in your editor:

   ```dotenv
   SEPOLIA_RPC_URL=""
   BLOCKCHAIN_PRIVATE_KEY=""
   CERTIFICATE_CONTRACT_ADDRESS=""
   ```

   Fill RPC and private key locally. Do not paste keys in chat, commit `.env`, or add `NEXT_PUBLIC_` to these variables. The key is a 32-byte hex value with optional `0x` prefix. Keep the address blank until deployed.
3. From the project root, run:

   ```powershell
   npm.cmd run blockchain:compile
   npm.cmd run blockchain:test
   npm.cmd run blockchain:hash-test
   npm.cmd run blockchain:typecheck
   npm.cmd run blockchain:deploy
   ```

4. Copy the printed contract address into `CERTIFICATE_CONTRACT_ADDRESS` in `.env` and restart the development server. The script prints only the public contract address and transaction hash. Missing credentials stop deployment; a non-Sepolia endpoint is rejected before sending. The deployment wallet becomes owner. Deployment is a manual action and is not part of application startup/build.

Compilation artifacts and Hardhat cache are ignored by Git and are regenerated by compilation. The deployment script consumes the compiled artifact; the backend uses a checked-in minimal ABI, whose signatures are checked against that artifact by the hash tests.

## Validation and Step 8

Contract tests cover registration/retrieval/events, duplicate rejection, matching/mismatching hashes, expiry boundary, owner and issuer revocation, unauthorized access, missing records, and invalid registration. Hash tests cover encoding, normalization, all seven fields, excluded metadata, calendar validation, timestamp conversion, and ABI consistency.

Step 8 can connect authenticated certificate issuance to registration, persist confirmed transaction/hash results in PostgreSQL, handle retries and reconciliation safely, and replace public mock verification with database lookup plus hash/on-chain checks. A future revocation flow must check organization ownership before using the shared signing wallet and synchronize on-chain/database status. None of those workflow changes are included here.
