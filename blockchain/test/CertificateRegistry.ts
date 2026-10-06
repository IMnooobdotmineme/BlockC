import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("CertificateRegistry", () => {
  async function fixture() {
    const connection = await network.create();
    const { ethers } = connection;
    const [owner, issuer, stranger] = await ethers.getSigners();
    const registry = await ethers.deployContract("CertificateRegistry");
    const hash = ethers.sha256(ethers.toUtf8Bytes("canonical certificate"));
    const block = await ethers.provider.getBlock("latest");
    const issuedAt = block!.timestamp;
    const expirationAt = issuedAt + 3600;
    const id = "CERT-2026-0001";
    const register = async () => (await registry.getFunction("registerCertificate")(id, hash, issuedAt, expirationAt)).wait();
    return { connection, registry, owner, issuer, stranger, hash, id, issuedAt, expirationAt, register, ethers };
  }
  async function check(run: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
    const f = await fixture();
    try { await run(f); } finally { await f.connection.close(); }
  }
  it("registers, retrieves every field, and emits registration event", () => check(async f => {
    const receipt = await f.register();
    const value = await f.registry.getFunction("getCertificate")(f.id);
    assert.deepEqual(Array.from(value), [f.id, f.hash, f.owner.address, BigInt(f.issuedAt), BigInt(f.expirationAt), false]);
    assert.equal(await f.registry.getFunction("certificateExists")(f.id), true);
    const event = f.registry.interface.parseLog(receipt!.logs[0]);
    assert.equal(event!.name, "CertificateRegistered");
    assert.equal(event!.args.certificateHash, f.hash);
  }));
  it("rejects duplicate IDs", () => check(async f => {
    await f.register();
    await assert.rejects(f.register, /CertificateAlreadyExists/);
  }));
  it("verifies a correct hash", () => check(async f => {
    await f.register();
    assert.deepEqual(Array.from(await f.registry.getFunction("verifyCertificate")(f.id, f.hash)), [true, true, false, false]);
  }));
  it("rejects an incorrect hash through verification flags", () => check(async f => {
    await f.register();
    const wrong = f.ethers.sha256(f.ethers.toUtf8Bytes("changed"));
    assert.deepEqual(Array.from(await f.registry.getFunction("verifyCertificate")(f.id, wrong)), [true, false, false, false]);
  }));
  it("expires exactly at expirationAt", () => check(async f => {
    await f.register();
    await f.connection.provider.request({ method: "evm_setNextBlockTimestamp", params: [f.expirationAt] });
    await f.connection.provider.request({ method: "evm_mine", params: [] });
    assert.deepEqual(Array.from(await f.registry.getFunction("verifyCertificate")(f.id, f.hash)), [true, true, false, true]);
  }));
  it("revokes and emits an event; prevents repeat revocation", () => check(async f => {
    await f.register();
    const receipt = await (await f.registry.getFunction("revokeCertificate")(f.id)).wait();
    assert.equal(f.registry.interface.parseLog(receipt!.logs[0])!.name, "CertificateRevoked");
    assert.equal((await f.registry.getFunction("getCertificate")(f.id)).revoked, true);
    assert.deepEqual(Array.from(await f.registry.getFunction("verifyCertificate")(f.id, f.hash)), [true, true, true, false]);
    await assert.rejects(f.registry.getFunction("revokeCertificate")(f.id), /CertificateAlreadyRevoked/);
  }));
  it("rejects unauthorized revocation, including a different authorized issuer", () => check(async f => {
    await f.register();
    await (await f.registry.getFunction("setIssuerAuthorization")(f.stranger.address, true)).wait();
    await assert.rejects(f.registry.connect(f.stranger).getFunction("revokeCertificate")(f.id), /Unauthorized/);
  }));
  it("allows authorized issuer registration and issuer revocation", () => check(async f => {
    await (await f.registry.getFunction("setIssuerAuthorization")(f.issuer.address, true)).wait();
    const registry = f.registry.connect(f.issuer);
    await (await registry.getFunction("registerCertificate")(f.id, f.hash, f.issuedAt, f.expirationAt)).wait();
    assert.equal((await registry.getFunction("getCertificate")(f.id)).issuer, f.issuer.address);
    await (await registry.getFunction("revokeCertificate")(f.id)).wait();
  }));
  it("allows owner to revoke another issuer's certificate", () => check(async f => {
    await (await f.registry.getFunction("setIssuerAuthorization")(f.issuer.address, true)).wait();
    await (await f.registry.connect(f.issuer).getFunction("registerCertificate")(f.id, f.hash, f.issuedAt, f.expirationAt)).wait();
    await (await f.registry.getFunction("revokeCertificate")(f.id)).wait();
    assert.equal((await f.registry.getFunction("getCertificate")(f.id)).revoked, true);
  }));
  it("rejects unauthorized registration and issuer administration", () => check(async f => {
    const outsider = f.registry.connect(f.stranger);
    await assert.rejects(outsider.getFunction("registerCertificate")(f.id, f.hash, f.issuedAt, f.expirationAt), /Unauthorized/);
    await assert.rejects(outsider.getFunction("setIssuerAuthorization")(f.stranger.address, true), /Unauthorized/);
  }));
  it("handles missing records", () => check(async f => {
    assert.equal(await f.registry.getFunction("certificateExists")(f.id), false);
    assert.deepEqual(Array.from(await f.registry.getFunction("verifyCertificate")(f.id, f.hash)), [false, false, false, false]);
    await assert.rejects(f.registry.getFunction("getCertificate")(f.id), /CertificateNotFound/);
    await assert.rejects(f.registry.getFunction("revokeCertificate")(f.id), /CertificateNotFound/);
  }));
  it("rejects empty IDs, zero hashes, and invalid timestamps", () => check(async f => {
    const register = f.registry.getFunction("registerCertificate");
    await assert.rejects(register("", f.hash, f.issuedAt, f.expirationAt), /InvalidCertificate/);
    await assert.rejects(register(f.id, f.ethers.ZeroHash, f.issuedAt, f.expirationAt), /InvalidCertificate/);
    await assert.rejects(register(f.id, f.hash, f.issuedAt, f.issuedAt), /InvalidCertificate/);
  }));
});
