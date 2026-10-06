import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import jsQR from "jsqr";
import { ContractFactory, JsonRpcProvider, Transaction, Wallet, keccak256 } from "ethers";
import { hash } from "bcryptjs";
import { SMTPServer } from "smtp-server";
import { revokeOrganizationCertificate, revocationDependencies } from "../src/lib/certificate-revocation";
import { deliverCertificateNotification } from "../src/lib/certificate-email";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import config from "../blockchain/hardhat.config";
import { prisma } from "../src/lib/prisma";
import { createBlockchainCertificate, completeCertificateRegistration, issuanceDependencies } from "../src/lib/certificate-issuance";
import { verifyPublicCertificate, verificationDependencies } from "../src/lib/public-verification";
import { certificateTimestamps, generateCertificateHash } from "../src/lib/blockchain/certificate-hash";
import { todayInBangkok } from "../src/lib/certificate-validation";

test("Steps 8–9 PostgreSQL/local EVM/captured SMTP integration (no real writes or emails)", { timeout: 180_000 }, async t => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname), "Integration tests require a local development PostgreSQL database.");
  const hre = await createHardhatRuntimeEnvironment(config, { config: path.resolve("blockchain/hardhat.config.ts") }, path.resolve("blockchain"));
  const server = await hre.network.createServer({ override: { chainId: 11155111 } }, "127.0.0.1", 0);
  const address = await server.listen();
  const provider = new JsonRpcProvider(`http://127.0.0.1:${address.port}`);
  // Random test-only wallet, funded by the local simulator; no hardcoded private keys.
  const owner = Wallet.createRandom().connect(provider);
  const original = { rpc: process.env.SEPOLIA_RPC_URL, key: process.env.BLOCKCHAIN_PRIVATE_KEY, contract: process.env.CERTIFICATE_CONTRACT_ADDRESS };
  const smtpOriginal = Object.fromEntries(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"].map(key => [key, process.env[key]]));
  const messages: string[] = [];
  let rejectEmail = false;
  const smtp = new SMTPServer({ disabledCommands: ["AUTH", "STARTTLS"], onData(stream, _session, callback) {
    const chunks: Buffer[] = [];
    stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => {
      if (rejectEmail) return callback(new Error("Simulated delivery failure"));
      const raw = Buffer.concat(chunks).toString("utf8");
      messages.push(raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_all, hex: string) => String.fromCharCode(parseInt(hex, 16))));
      callback();
    });
    stream.on("error", () => callback(new Error("Local capture failure")));
  } });
  smtp.on("error", () => { /* Never print raw SMTP errors or message bodies. */ });
  await new Promise<void>(resolve => smtp.listen(0, "127.0.0.1", resolve));
  // SMTPServer exposes its underlying listening server only through this runtime property.
  const smtpPort = (smtp as unknown as { server: { address(): { port: number } } }).server.address().port;
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtpPort);
  process.env.SMTP_USER = "";
  process.env.SMTP_PASSWORD = "";
  process.env.SMTP_FROM = "Test University <certificates@example.edu>";
  const organizations: string[] = [];
  let chainClosed = false;
  try {
    await provider.send("hardhat_setBalance", [owner.address, "0x3635C9ADC5DEA00000"]);
    const artifact = JSON.parse(await readFile("blockchain/artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json", "utf8"));
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, owner).deploy();
    await contract.waitForDeployment();
    const alternateSigner = await provider.getSigner(0);
    await (await contract.getFunction("setIssuerAuthorization")(await alternateSigner.getAddress(), true, { nonce: 1 })).wait();
    process.env.SEPOLIA_RPC_URL = `http://127.0.0.1:${address.port}`;
    process.env.BLOCKCHAIN_PRIVATE_KEY = owner.privateKey;
    process.env.CERTIFICATE_CONTRACT_ADDRESS = await contract.getAddress();
    const suffix = randomBytes(8).toString("hex");
    const fixturePassword = randomBytes(24).toString("base64url");
    const passwordHash = await hash(fixturePassword, 12);
    const organization = await prisma.organization.create({ data: { name: `Step8 University ${suffix}`, email: `step8-${suffix}@example.edu`, passwordHash } });
    organizations.push(organization.id);
    const other = await prisma.organization.create({ data: { name: `Other University ${suffix}`, email: `other-step8-${suffix}@example.edu`, passwordHash } });
    organizations.push(other.id);
    const today = todayInBangkok();
    const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const values = { recipientName: "Integration Student", recipientEmail: "private-recipient@example.edu", certificateTitle: "Blockchain Integration", courseName: "Computer Science", issueDate: day(-30), expirationDate: day(30) };
    const issue = (overrides = {}, deps = issuanceDependencies) => {
      const input = { ...values, ...overrides };
      return createBlockchainCertificate(organization, input, new Date(`${input.issueDate}T00:00:00Z`), new Date(`${input.expirationDate}T00:00:00Z`), deps);
    };
    let issued!: Awaited<ReturnType<typeof issue>>;
    await t.test("successful issuance saves matching hash and confirmed transaction in PostgreSQL", async () => {
      issued = await issue();
      assert.equal(issued.state, "CONFIRMED");
      const saved = await prisma.certificate.findUniqueOrThrow({ where: { id: issued.id }, include: { blockchainJob: true } });
      assert.equal(saved.blockchainStatus, "CONFIRMED");
      assert.equal(saved.certificateHash, generateCertificateHash(saved));
      assert.equal(saved.blockchainTxHash, saved.blockchainJob!.transactionHash);
      assert.equal((await provider.getTransactionReceipt(saved.blockchainTxHash!))!.status, 1);
      assert.equal(saved.organizationId, organization.id);
    });
    await t.test("valid public verification excludes recipient email", async () => {
      const result = await verifyPublicCertificate(issued.certificateId);
      assert.equal(result.status, "VALID");
      assert.equal(result.blockchainExists, true);
      assert.equal(result.hashMatches, true);
      assert.ok(result.certificate);
      assert.equal("recipientEmail" in result.certificate, false);
      assert.ok(!JSON.stringify(result).includes(values.recipientEmail));
    });
    await t.test("issuance email includes only public certificate details and verification URL", async () => {
      const notification = await prisma.certificateNotification.findUniqueOrThrow({ where: { certificateId_kind: { certificateId: issued.id, kind: "ISSUED" } } });
      assert.equal(notification.status, "SENT");
      assert.equal(messages.length, 1);
      for (const value of [issued.certificateId, values.recipientName, values.certificateTitle, values.courseName, organization.name, `/verify/${issued.certificateId}`]) assert.ok(messages[0].includes(value));
      assert.ok(!messages[0].includes(organization.id));
      assert.ok(!messages[0].includes(owner.privateKey));
      await deliverCertificateNotification(organization.id, issued.id, "ISSUED");
      assert.equal(messages.length, 1, "A sent notification must not be duplicated.");
    });
    await t.test("unknown and malformed IDs return INVALID", async () => {
      assert.equal((await verifyPublicCertificate("CERT-1900-9999")).status, "INVALID");
      assert.equal((await verifyPublicCertificate("bad-id")).status, "INVALID");
    });
    await t.test("expired authentic certificate returns EXPIRED", async () => {
      const expired = await issue({ expirationDate: day(-1) });
      assert.equal(expired.state, "CONFIRMED");
      assert.equal((await verifyPublicCertificate(expired.certificateId)).status, "EXPIRED");
    });
    await t.test("database revocation takes precedence", async () => {
      await prisma.certificate.update({ where: { id: issued.id }, data: { status: "REVOKED" } });
      assert.equal((await verifyPublicCertificate(issued.certificateId)).status, "REVOKED");
      await prisma.certificate.update({ where: { id: issued.id }, data: { status: "VALID" } });
    });
    await t.test("tampered database fields or stored hash return INVALID", async () => {
      await prisma.certificate.update({ where: { id: issued.id }, data: { recipientName: "Tampered Student" } });
      const result = await verifyPublicCertificate(issued.certificateId);
      assert.equal(result.status, "INVALID");
      assert.equal(result.hashMatches, false);
      await prisma.certificate.update({ where: { id: issued.id }, data: { recipientName: values.recipientName, certificateHash: `0x${"00".repeat(32)}` } });
      assert.equal((await verifyPublicCertificate(issued.certificateId)).status, "INVALID");
      const restored = await prisma.certificate.findUniqueOrThrow({ where: { id: issued.id } });
      await prisma.certificate.update({ where: { id: issued.id }, data: { certificateHash: generateCertificateHash(restored) } });
    });
    await t.test("RPC failure returns UNAVAILABLE, never VALID", async () => {
      const unavailable = { ...verificationDependencies, readBlockchain: async () => { throw new Error("simulated RPC outage"); } };
      const result = await verifyPublicCertificate(issued.certificateId, unavailable);
      assert.equal(result.status, "UNAVAILABLE");
      assert.equal(result.hashMatches, null);
      assert.equal(result.blockchainExists, null);
    });
    await t.test("failed preparation preserves a failed record without any broadcast", async () => {
      const failed = await issue({}, { ...issuanceDependencies, prepare: async () => { throw new Error("simulated funding/RPC failure"); } });
      assert.equal(failed.state, "FAILED");
      const saved = await prisma.certificate.findUniqueOrThrow({ where: { id: failed.id }, include: { blockchainJob: true } });
      assert.equal(saved.blockchainJob, null);
      assert.equal(saved.blockchainTxHash, null);
      assert.equal((await verifyPublicCertificate(failed.certificateId)).status, "INVALID");
      assert.equal((await completeCertificateRegistration(organization.id, failed.id)).state, "CONFIRMED");
    });
    await t.test("uncertain broadcast retains durable intent; recovery uses same ID/hash/nonce", async () => {
      const pending = await issue({}, { ...issuanceDependencies, submit: async () => { throw new Error("simulated crash before broadcast"); } });
      assert.equal(pending.state, "PENDING");
      const before = await prisma.certificate.findUniqueOrThrow({ where: { id: pending.id }, include: { blockchainJob: true } });
      assert.ok(before.blockchainJob);
      assert.equal(before.blockchainTxHash, null);
      assert.equal((await completeCertificateRegistration(organization.id, pending.id)).state, "CONFIRMED");
      const after = await prisma.certificate.findUniqueOrThrow({ where: { id: pending.id }, include: { blockchainJob: true } });
      assert.equal(after.blockchainTxHash, before.blockchainJob.transactionHash);
      assert.equal(after.blockchainJob!.nonce, before.blockchainJob.nonce);
    });
    await t.test("confirmed chain write followed by uncertainty recovers without duplicate registration", async () => {
      const pending = await issue({}, { ...issuanceDependencies, submit: async (...args) => { await issuanceDependencies.submit(...args); throw new Error("simulated failure after confirmation"); } });
      assert.equal(pending.state, "PENDING");
      assert.equal((await completeCertificateRegistration(organization.id, pending.id)).state, "CONFIRMED");
      const events = await contract.queryFilter(contract.getEvent("CertificateRegistered"));
      assert.equal(events.filter(event => "args" in event && event.args[0] === pending.certificateId).length, 1);
    });
    await t.test("foreign organization cannot recover another organization's record", async () => {
      await assert.rejects(completeCertificateRegistration(other.id, issued.id), /Certificate not found/);
    });
    await t.test("concurrent issuance allocates unique IDs and wallet nonces", async () => {
      const results = await Promise.all([issue(), issue(), issue()]);
      for (const result of results) assert.equal(result.state, "CONFIRMED");
      assert.equal(new Set(results.map(result => result.certificateId)).size, 3);
      const jobs = await prisma.certificateBlockchainJob.findMany({ where: { certificateId: { in: results.map(result => result.id) } } });
      assert.equal(new Set(jobs.map(job => job.nonce.toString())).size, 3);
    });
    await t.test("blockchain revocation returns REVOKED without changing database status", async () => {
      await (await contract.getFunction("revokeCertificate")(issued.certificateId)).wait();
      assert.equal((await verifyPublicCertificate(issued.certificateId)).status, "REVOKED");
    });
    await t.test("confirmed reverted registration is FAILED, not pending or successful", async () => {
      const reverted = await issue({}, { ...issuanceDependencies, submit: async (prepared, certificate) => {
        const dates = certificateTimestamps(certificate);
        // Another authorized issuer wins the ID after gas estimation but before our broadcast.
        await (await contract.connect(alternateSigner).getFunction("registerCertificate")(certificate.certificateId, generateCertificateHash(certificate), dates.issuedAt, dates.expirationAt)).wait();
        return issuanceDependencies.submit(prepared, certificate);
      } });
      assert.equal(reverted.state, "FAILED");
      const saved = await prisma.certificate.findUniqueOrThrow({ where: { id: reverted.id }, include: { blockchainJob: true } });
      assert.equal(saved.blockchainStatus, "FAILED");
      assert.equal(saved.blockchainTxHash, null);
      assert.equal((await provider.getTransactionReceipt(saved.blockchainJob!.transactionHash))!.status, 0);
    });
    await t.test("revocation enforces ownership and blocks duplicates; confirms DB and email", async () => {
      const target = await issue({ expirationDate: day(-1) });
      await assert.rejects(revokeOrganizationCertificate(other.id, target.id), /Certificate not found/);
      const result = await revokeOrganizationCertificate(organization.id, target.id);
      assert.equal(result.state, "CONFIRMED");
      const saved = await prisma.certificate.findUniqueOrThrow({ where: { id: target.id }, include: { revocationJob: true } });
      assert.equal(saved.status, "REVOKED");
      assert.equal(saved.revocationStatus, "CONFIRMED");
      assert.equal(saved.revocationTxHash, saved.revocationJob!.transactionHash);
      assert.equal((await provider.getTransactionReceipt(saved.revocationTxHash!))!.status, 1);
      assert.equal((await verifyPublicCertificate(target.certificateId)).status, "REVOKED", "Revocation must override expiration.");
      const email = await prisma.certificateNotification.findUniqueOrThrow({ where: { certificateId_kind: { certificateId: target.id, kind: "REVOKED" } } });
      assert.equal(email.status, "SENT");
      const content = messages.find(message => message.includes(target.certificateId) && message.includes("has been revoked"));
      assert.ok(content && content.includes(organization.name) && content.includes(`/verify/${target.certificateId}`));
      const count = messages.length;
      await assert.rejects(revokeOrganizationCertificate(organization.id, target.id), /already revoked/);
      assert.equal(messages.length, count);
    });
    await t.test("revocation preparation failure does not change certificate status; same-record retry works", async () => {
      const target = await issue();
      const failure = await revokeOrganizationCertificate(organization.id, target.id, { ...revocationDependencies, prepare: async () => { throw new Error("simulated chain outage"); } });
      assert.equal(failure.state, "FAILED");
      assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: target.id } })).status, "VALID");
      assert.equal((await verifyPublicCertificate(target.certificateId)).status, "VALID");
      assert.equal((await revokeOrganizationCertificate(organization.id, target.id)).state, "CONFIRMED");
    });
    await t.test("mined revocation failure does not mark the database revoked", async () => {
      const target = await issue();
      const result = await revokeOrganizationCertificate(organization.id, target.id, { ...revocationDependencies, prepare: async (...args) => {
        const prepared = await revocationDependencies.prepare(...args);
        const transaction = Transaction.from(prepared.signedTransaction);
        transaction.signature = null;
        transaction.gasLimit = BigInt(26000); // Above intrinsic gas, below successful contract execution.
        const signedTransaction = await owner.signTransaction(transaction);
        return { ...prepared, signedTransaction, transactionHash: keccak256(signedTransaction) };
      } });
      assert.equal(result.state, "FAILED");
      const saved = await prisma.certificate.findUniqueOrThrow({ where: { id: target.id }, include: { revocationJob: true } });
      assert.equal(saved.status, "VALID");
      assert.equal(saved.revocationStatus, "FAILED");
      assert.equal(saved.revocationTxHash, null);
      assert.equal((await provider.getTransactionReceipt(saved.revocationJob!.transactionHash))!.status, 0);
      assert.equal((await verifyPublicCertificate(target.certificateId)).status, "VALID");
    });
    await t.test("revocation send uncertainty preserves durable intent and recovers same transaction", async () => {
      const target = await issue();
      const pending = await revokeOrganizationCertificate(organization.id, target.id, { ...revocationDependencies, submit: async () => { throw new Error("simulated uncertain send"); } });
      assert.equal(pending.state, "PENDING");
      const before = await prisma.certificate.findUniqueOrThrow({ where: { id: target.id }, include: { revocationJob: true } });
      assert.equal(before.status, "VALID");
      assert.equal(before.revocationStatus, "PENDING");
      assert.equal((await revokeOrganizationCertificate(organization.id, target.id)).state, "CONFIRMED");
      const after = await prisma.certificate.findUniqueOrThrow({ where: { id: target.id } });
      assert.equal(after.revocationTxHash, before.revocationJob!.transactionHash);
    });
    await t.test("confirmation followed by uncertainty reconciles revocation without a second write", async () => {
      const target = await issue();
      await revokeOrganizationCertificate(organization.id, target.id, { ...revocationDependencies, submit: async (...args) => { await revocationDependencies.submit(...args); throw new Error("simulated post-confirmation crash"); } });
      assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: target.id } })).status, "VALID");
      assert.equal((await verifyPublicCertificate(target.certificateId)).status, "REVOKED");
      assert.equal((await revokeOrganizationCertificate(organization.id, target.id)).state, "CONFIRMED");
      const events = await contract.queryFilter(contract.getEvent("CertificateRevoked"));
      assert.equal(events.filter(event => "args" in event && event.args[0] === target.certificateId).length, 1);
    });
    await t.test("email failures do not roll back issuance or revocation and can be retried", async () => {
      rejectEmail = true;
      const target = await issue();
      assert.equal(target.state, "CONFIRMED");
      let notification = await prisma.certificateNotification.findUniqueOrThrow({ where: { certificateId_kind: { certificateId: target.id, kind: "ISSUED" } } });
      assert.equal(notification.status, "FAILED");
      assert.equal(notification.lastError, "NOTIFICATION_DELIVERY_FAILED");
      rejectEmail = false;
      assert.equal(await deliverCertificateNotification(other.id, target.id, "ISSUED"), "NOT_SENT");
      assert.equal(await deliverCertificateNotification(organization.id, target.id, "ISSUED"), "SENT");
      rejectEmail = true;
      assert.equal((await revokeOrganizationCertificate(organization.id, target.id)).state, "CONFIRMED");
      assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: target.id } })).status, "REVOKED");
      notification = await prisma.certificateNotification.findUniqueOrThrow({ where: { certificateId_kind: { certificateId: target.id, kind: "REVOKED" } } });
      assert.equal(notification.status, "FAILED");
      rejectEmail = false;
      const before = messages.length;
      await Promise.all([deliverCertificateNotification(organization.id, target.id, "REVOKED"), deliverCertificateNotification(organization.id, target.id, "REVOKED")]);
      assert.equal(messages.length, before + 1, "Concurrent retries must claim one delivery lease.");
      assert.equal((await verifyPublicCertificate(target.certificateId)).status, "REVOKED");
    });
    await t.test("HTTP issuance, public privacy, ownership, PDFs, and recovery protection", { timeout: 90_000 }, async () => {
      const probe = createServer();
      await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
      const port = (probe.address() as { port: number }).port;
      await new Promise<void>(resolve => probe.close(() => resolve()));
      const base = `http://127.0.0.1:${port}`;
      const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: "ignore", windowsHide: true, env: { ...process.env } });
      try {
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch { /* Wait for local server startup. */ }
          if (child.exitCode !== null) break;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        assert.ok(ready, "Local Next.js test server must start.");
        const cookieFor = async (organizationId: string) => {
          const token = randomBytes(32).toString("base64url");
          await prisma.organizationSession.create({ data: { tokenHash: createHash("sha256").update(token).digest("hex"), organizationId, expiresAt: new Date(Date.now() + 3600000) } });
          return `organization_session=${token}`;
        };
        const cookie = await cookieFor(organization.id);
        const foreignCookie = await cookieFor(other.id);
        const get = (url: string, auth?: string) => fetch(`${base}${url}`, { redirect: "manual", headers: auth ? { Cookie: auth } : {} });
        const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
        const actionData = (html: string, field: string) => {
          const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0]).find(value => field === "Logout" ? value.includes("Logout") : value.includes(`name="${field}"`));
          assert.ok(form);
          const data = new FormData();
          for (const input of form.matchAll(/<input\b[^>]*>/g)) {
            const name = input[0].match(/\bname="([^"]*)"/)?.[1];
            const value = input[0].match(/\bvalue="([^"]*)"/)?.[1] ?? "";
            if (name?.startsWith("$ACTION")) data.append(decode(name), decode(value));
          }
          assert.ok([...data.keys()].some(name => name.startsWith("$ACTION")));
          return data;
        };
        const issueHtml = await (await get("/issue-certificate", cookie)).text();
        const makeData = (overrides = {}) => {
          const data = actionData(issueHtml, "recipientName");
          for (const [key, value] of Object.entries({ ...values, ...overrides })) data.set(key, value);
          return data;
        };
        const post = (url: string, data: FormData, auth?: string) => fetch(`${base}${url}`, { method: "POST", body: data, redirect: "manual", headers: { Origin: base, ...(auth ? { Cookie: auth } : {}) } });
        // Exercise the actual login/logout actions instead of relying only on fixture sessions.
        const loginHtml = await (await get("/login")).text();
        const badLogin = actionData(loginHtml, "email");
        badLogin.set("email", organization.email);
        badLogin.set("password", "intentionally-incorrect-test-password");
        const deniedLogin = await post("/login", badLogin);
        assert.equal(deniedLogin.status, 200);
        assert.ok((await deniedLogin.text()).includes("Invalid email or password."));
        const login = actionData(loginHtml, "email");
        login.set("email", organization.email);
        login.set("password", fixturePassword);
        const loginResponse = await post("/login", login);
        assert.equal(loginResponse.status, 303);
        assert.equal(new URL(loginResponse.headers.get("location")!, base).pathname, "/dashboard");
        const setCookie = loginResponse.headers.getSetCookie().find(value => value.startsWith("organization_session="));
        assert.ok(setCookie && /httponly/i.test(setCookie) && /samesite=lax/i.test(setCookie) && /;\s*secure/i.test(setCookie));
        const loginCookie = setCookie.split(";")[0];
        const logoutData = actionData(await (await get("/dashboard", loginCookie)).text(), "Logout");
        const logoutResponse = await post("/dashboard", logoutData, loginCookie);
        assert.equal(logoutResponse.status, 303);
        assert.equal((await get("/dashboard", loginCookie)).status, 307);
        assert.equal((await post("/issue-certificate", makeData())).status, 303);
        const invalid = await post("/issue-certificate", makeData({ recipientEmail: "bad-email" }), cookie);
        assert.equal(invalid.status, 200);
        assert.ok((await invalid.text()).includes("Check the highlighted fields."));
        const response = await post("/issue-certificate", makeData({ organizationId: other.id, organizationName: "Forged Organization" }), cookie);
        assert.equal(response.status, 303);
        const location = new URL(response.headers.get("location")!, base).pathname;
        const saved = await prisma.certificate.findUniqueOrThrow({ where: { id: location.split("/").at(-1)! } });
        assert.equal(saved.organizationId, organization.id);
        assert.equal(saved.organizationName, organization.name);
        assert.equal(saved.blockchainStatus, "CONFIRMED");
        const detail = await get(location, cookie);
        assert.equal(detail.status, 200);
        assert.ok((await detail.text()).includes(saved.blockchainTxHash!));
        assert.equal((await get(location, foreignCookie)).status, 404);
        assert.equal((await get(location)).status, 307);
        const publicResponse = await get(`/verify/${saved.certificateId}`);
        assert.equal(publicResponse.status, 200);
        const publicHtml = await publicResponse.text();
        assert.ok(publicHtml.includes("Certificate valid"));
        assert.ok(publicHtml.includes(saved.certificateHash!));
        assert.ok(!publicHtml.includes(values.recipientEmail));
        assert.ok(!publicHtml.includes("recipientEmail"));
        assert.equal((await get(`/api/certificates/${saved.id}/pdf`)).status, 401);
        assert.equal((await get(`/api/certificates/${saved.id}/pdf`, foreignCookie)).status, 404);
        const pdf = await get(`/api/certificates/${saved.id}/pdf`, cookie);
        assert.equal(pdf.status, 200);
        assert.equal(pdf.headers.get("content-type"), "application/pdf");
        const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
        const loadedPdf = await PDFDocument.load(pdfBytes);
        assert.equal(loadedPdf.getPageCount(), 1);
        assert.ok(loadedPdf.getPage(0).getWidth() > loadedPdf.getPage(0).getHeight());
        const renderTask = getDocument({ data: pdfBytes.slice(), useSystemFonts: false, standardFontDataUrl: path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts").replaceAll("\\", "/") + "/" });
        try {
          const document = await renderTask.promise;
          const page = await document.getPage(1);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
          const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(new Uint8ClampedArray(pixels.data), canvas.width, canvas.height);
          assert.ok(qr, "The QR must decode from the actual downloaded PDF.");
          const qrUrl = new URL(qr.data);
          assert.equal(qrUrl.origin, new URL(process.env.NEXT_PUBLIC_APP_URL!).origin);
          assert.equal(qrUrl.pathname, `/verify/${saved.certificateId}`);
          assert.ok((await (await get(qrUrl.pathname)).text()).includes("Certificate valid"));
        } finally { await renderTask.destroy(); }
        const failed = await issue({}, { ...issuanceDependencies, prepare: async () => { throw new Error("simulated pre-broadcast failure"); } });
        assert.equal((await get(`/api/certificates/${failed.id}/pdf`, cookie)).status, 409);
        const failedHtml = await (await get(`/certificates/${failed.id}`, cookie)).text();
        const foreignRecovery = actionData(failedHtml, "id");
        foreignRecovery.set("id", failed.id);
        await post(`/certificates/${failed.id}`, foreignRecovery, foreignCookie);
        assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: failed.id } })).blockchainStatus, "FAILED");
        const recovery = actionData(failedHtml, "id");
        recovery.set("id", failed.id);
        await post(`/certificates/${failed.id}`, recovery, cookie);
        assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: failed.id } })).blockchainStatus, "CONFIRMED");
        const revocationHtml = await (await get(location, cookie)).text();
        assert.ok(revocationHtml.includes("Revoke Certificate"));
        const foreignRevocation = actionData(revocationHtml, "id");
        foreignRevocation.set("id", saved.id);
        await post(location, foreignRevocation, foreignCookie);
        assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: saved.id } })).status, "VALID");
        const revocation = actionData(revocationHtml, "id");
        revocation.set("id", saved.id);
        rejectEmail = true;
        await post(location, revocation, cookie);
        rejectEmail = false;
        const revoked = await prisma.certificate.findUniqueOrThrow({ where: { id: saved.id } });
        assert.equal(revoked.status, "REVOKED");
        assert.ok(revoked.revocationTxHash);
        const revokedHtml = await (await get(location, cookie)).text();
        assert.ok(revokedHtml.includes(revoked.revocationTxHash));
        assert.ok(!revokedHtml.includes("Revoke Certificate"));
        assert.ok((await (await get(`/verify/${saved.certificateId}`)).text()).includes("Certificate revoked"));
        assert.ok((await (await get("/certificates", cookie)).text()).includes("Revoked"));
        assert.ok((await (await get("/dashboard", cookie)).text()).includes("Revoked Certificates"));
        const expectedCounts = {
          "Total Certificates": await prisma.certificate.count({ where: { organizationId: organization.id } }),
          "Valid Certificates": await prisma.certificate.count({ where: { organizationId: organization.id, blockchainStatus: "CONFIRMED", status: "VALID" } }),
          "Expired Certificates": await prisma.certificate.count({ where: { organizationId: organization.id, blockchainStatus: "CONFIRMED", status: "EXPIRED" } }),
          "Revoked Certificates": await prisma.certificate.count({ where: { organizationId: organization.id, blockchainStatus: "CONFIRMED", status: "REVOKED" } }),
        };
        const dashboardHtml = (await (await get("/dashboard", cookie)).text()).replace(/<!--.*?-->/g, "");
        for (const [label, count] of Object.entries(expectedCounts)) assert.equal(Number(dashboardHtml.match(new RegExp(`${label}</h2><p[^>]*>(\\d+)</p>`))?.[1]), count);
        const notificationRetry = actionData(revokedHtml, "kind");
        notificationRetry.set("id", saved.id);
        notificationRetry.set("kind", "REVOKED");
        await post(location, notificationRetry, foreignCookie);
        assert.equal((await prisma.certificateNotification.findUniqueOrThrow({ where: { certificateId_kind: { certificateId: saved.id, kind: "REVOKED" } } })).status, "FAILED");
        const ownerRetry = actionData(revokedHtml, "kind");
        ownerRetry.set("id", saved.id);
        ownerRetry.set("kind", "REVOKED");
        await post(location, ownerRetry, cookie);
        assert.equal((await prisma.certificateNotification.findUniqueOrThrow({ where: { certificateId_kind: { certificateId: saved.id, kind: "REVOKED" } } })).status, "SENT");
        // A real RPC outage must render unavailable, including when the preceding check was valid.
        await server.close();
        chainClosed = true;
        const outageHtml = await (await get(`/verify/${saved.certificateId}`)).text();
        assert.ok(outageHtml.includes("Verification temporarily unavailable"));
        assert.ok(!outageHtml.includes("Certificate valid"));
      } finally {
        child.kill();
        if (child.exitCode === null) await new Promise<void>(resolve => child.once("exit", () => resolve()));
      }
    });
  } finally {
    await prisma.certificate.deleteMany({ where: { organizationId: { in: organizations } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
    await prisma.$disconnect();
    provider.destroy();
    if (!chainClosed) await server.close();
    await new Promise<void>(resolve => smtp.close(() => resolve()));
    for (const [key, value] of Object.entries(smtpOriginal)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    for (const [key, value] of Object.entries({ SEPOLIA_RPC_URL: original.rpc, BLOCKCHAIN_PRIVATE_KEY: original.key, CERTIFICATE_CONTRACT_ADDRESS: original.contract })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
