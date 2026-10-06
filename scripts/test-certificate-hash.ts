import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { test } from "node:test";
import { Interface } from "ethers";
import { canonicalCertificateData, certificateTimestamps, generateCertificateHash, type CertificateHashInput } from "../src/lib/blockchain/certificate-hash";
import { certificateRegistryAbi } from "../src/lib/blockchain/registry-abi";

const certificate: CertificateHashInput = {
  certificateId: "CERT-2026-0001", recipientName: "José Student", certificateTitle: "Completion",
  courseName: "Computer Science", organizationName: "Demo University", issueDate: "2026-01-01", expirationDate: "2026-12-31",
};
test("canonical encoding has a fixed version and field order", () => {
  const expected = '["certificate-v1","CERT-2026-0001","José Student","Completion","Computer Science","Demo University","2026-01-01","2026-12-31"]';
  assert.equal(canonicalCertificateData(certificate), expected);
  assert.equal(generateCertificateHash(certificate), `0x${createHash("sha256").update(expected, "utf8").digest("hex")}`);
});
test("Unicode NFC, whitespace, ID casing, and database Date values normalize identically", () => {
  const other = { ...certificate, certificateId: " cert-2026-0001 ", recipientName: "  Jose\u0301\tStudent\n", courseName: "Computer   Science", issueDate: new Date("2026-01-01T00:00:00Z"), expirationDate: new Date("2026-12-31T00:00:00Z") };
  assert.equal(generateCertificateHash(other), generateCertificateHash(certificate));
});
test("each committed field changes the hash and text casing remains meaningful", () => {
  for (const [key, value] of Object.entries({ certificateId: "CERT-2026-0002", recipientName: "Other Student", certificateTitle: "completion", courseName: "Mathematics", organizationName: "Other University", issueDate: "2026-01-02", expirationDate: "2027-01-01" })) {
    assert.notEqual(generateCertificateHash({ ...certificate, [key]: value }), generateCertificateHash(certificate));
  }
});
test("recipient email, status, and blockchain metadata are excluded", () => {
  const extra = { ...certificate, recipientEmail: "private@example.edu", status: "REVOKED", blockchainTxHash: "ignored" };
  assert.equal(generateCertificateHash(extra), generateCertificateHash(certificate));
});
test("invalid dates, reversed dates, and malformed IDs fail", () => {
  assert.throws(() => generateCertificateHash({ ...certificate, issueDate: "2026-02-30" }));
  assert.throws(() => generateCertificateHash({ ...certificate, expirationDate: "2025-12-31" }));
  assert.throws(() => generateCertificateHash({ ...certificate, certificateId: "not-an-id" }));
});
test("timestamps preserve Bangkok inclusive-day expiration", () => {
  const result = certificateTimestamps(certificate);
  assert.equal(result.issuedAt, BigInt(Date.parse("2025-12-31T17:00:00Z") / 1000));
  assert.equal(result.expirationAt, BigInt(Date.parse("2026-12-31T17:00:00Z") / 1000));
});
test("server ABI matches compiled contract functions, errors, and events", async () => {
  const artifact = JSON.parse(await readFile("blockchain/artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json", "utf8"));
  const expected = new Interface(artifact.abi);
  const actual = new Interface(certificateRegistryAbi);
  for (const fragment of actual.fragments) {
    assert.ok(expected.fragments.some(other => other.format("full") === fragment.format("full")), fragment.format("full"));
  }
});
test("deployment with missing credentials exits before contacting a network", async () => {
  await assert.rejects(
    promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/deploy-contract.ts"], {
      env: { ...process.env, SEPOLIA_RPC_URL: "", BLOCKCHAIN_PRIVATE_KEY: "" }, timeout: 15_000,
    }),
    (error: unknown) => {
      const result = error as { code: number; stderr: string };
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Deployment skipped: configure SEPOLIA_RPC_URL/);
      return true;
    },
  );
});
