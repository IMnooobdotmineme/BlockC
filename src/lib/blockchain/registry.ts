import "server-only";
import { Contract, FetchRequest, Interface, JsonRpcProvider, Transaction, Wallet, isAddress, ZeroAddress, keccak256 } from "ethers";
import { certificateRegistryAbi } from "./registry-abi";
import { certificateTimestamps, generateCertificateHash, normalizeCertificateId, type CertificateHashInput } from "./certificate-hash";

export async function connectToSepolia() {
  const url = process.env.SEPOLIA_RPC_URL;
  if (!url) throw new Error("Configure SEPOLIA_RPC_URL on the server.");
  try {
    if (!["https:", "http:"].includes(new URL(url).protocol)) throw new Error();
  } catch { throw new Error("Invalid Sepolia RPC configuration."); }
  const request = new FetchRequest(url);
  request.timeout = 15_000;
  const provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1, pollingInterval: 1000 });
  try {
    if ((await provider.getNetwork()).chainId !== BigInt(11155111)) throw new Error();
    return provider;
  } catch {
    provider.destroy();
    throw new Error("Unable to connect to Ethereum Sepolia (chain ID 11155111).");
  }
}

/** Caller must destroy the returned provider when finished. Never import into client components. */
export async function loadCertificateRegistry(write = false) {
  const address = process.env.CERTIFICATE_CONTRACT_ADDRESS;
  if (!address || !isAddress(address) || address === ZeroAddress) throw new Error("Configure a valid CERTIFICATE_CONTRACT_ADDRESS.");
  const provider = await connectToSepolia();
  try {
    if (await provider.getCode(address) === "0x") throw new Error("No contract deployed at CERTIFICATE_CONTRACT_ADDRESS.");
    if (!write) return { provider, contract: new Contract(address, certificateRegistryAbi, provider) };
    const key = process.env.BLOCKCHAIN_PRIVATE_KEY;
    if (!key || !/^(0x)?[0-9a-fA-F]{64}$/.test(key)) throw new Error("Configure BLOCKCHAIN_PRIVATE_KEY privately in .env.");
    let wallet: Wallet;
    try { wallet = new Wallet(key.startsWith("0x") ? key : `0x${key}`, provider); }
    catch { throw new Error("Invalid blockchain signing configuration."); }
    const contract = new Contract(address, certificateRegistryAbi, wallet);
    if ((await contract.owner()).toLowerCase() !== wallet.address.toLowerCase() && !await contract.authorizedIssuers(wallet.address)) {
      throw new Error("The server wallet is not an authorized issuer.");
    }
    return { provider, contract };
  } catch {
    provider.destroy();
    // RPC errors may contain credential-bearing URLs. Do not propagate their raw details.
    throw new Error("Unable to load CertificateRegistry. Check contract address, server wallet, and issuer authorization.");
  }
}

export type PreparedRegistration = {
  signedTransaction: string;
  transactionHash: string;
  certificateHash: string;
  nonce: number;
  walletAddress: string;
  contractAddress: string;
  chainId: number;
};

export function blockchainWriterIdentity() {
  const key = process.env.BLOCKCHAIN_PRIVATE_KEY;
  if (!key || !/^(0x)?[0-9a-fA-F]{64}$/.test(key)) throw new Error("Invalid server signing configuration.");
  try { return new Wallet(key.startsWith("0x") ? key : `0x${key}`).address.toLowerCase(); }
  catch { throw new Error("Invalid server signing configuration."); }
}

/** Signs only. The application must persist this intent before submitting it. */
export async function prepareCertificateRegistration(certificate: CertificateHashInput, minimumNonce = 0): Promise<PreparedRegistration> {
  const certificateId = normalizeCertificateId(certificate.certificateId);
  const certificateHash = generateCertificateHash(certificate);
  const { issuedAt, expirationAt } = certificateTimestamps(certificate);
  const { provider, contract } = await loadCertificateRegistry(true);
  try {
    const wallet = contract.runner as Wallet;
    const nonce = Math.max(await wallet.getNonce("pending"), minimumNonce);
    const call = await contract.registerCertificate.populateTransaction(certificateId, certificateHash, issuedAt, expirationAt);
    const transaction = await wallet.populateTransaction({ ...call, nonce });
    const signedTransaction = await wallet.signTransaction(transaction);
    return { signedTransaction, transactionHash: keccak256(signedTransaction), certificateHash, nonce,
      walletAddress: wallet.address.toLowerCase(), contractAddress: (await contract.getAddress()).toLowerCase(), chainId: 11155111 };
  } catch { throw new Error("Unable to prepare registration. Check Sepolia connectivity, wallet funding, and duplicate IDs."); }
  finally { provider.destroy(); }
}

/** Re-sends only the exact persisted transaction; a timeout is never proof of failure. */
export async function submitPreparedRegistration(prepared: PreparedRegistration, certificate: CertificateHashInput) {
  const transaction = Transaction.from(prepared.signedTransaction);
  const timestamps = certificateTimestamps(certificate);
  const data = new Interface(certificateRegistryAbi).encodeFunctionData("registerCertificate", [normalizeCertificateId(certificate.certificateId), generateCertificateHash(certificate), timestamps.issuedAt, timestamps.expirationAt]);
  if (transaction.hash !== prepared.transactionHash || transaction.from?.toLowerCase() !== prepared.walletAddress ||
      transaction.to?.toLowerCase() !== prepared.contractAddress || transaction.chainId !== BigInt(11155111) ||
      transaction.nonce !== prepared.nonce || transaction.value !== BigInt(0) || transaction.data !== data ||
      prepared.contractAddress !== process.env.CERTIFICATE_CONTRACT_ADDRESS?.toLowerCase()) {
    throw new Error("Stored registration intent does not match this certificate or configured contract.");
  }
  const { provider, contract } = await loadCertificateRegistry();
  try {
    let receipt = await provider.getTransactionReceipt(prepared.transactionHash);
    if (!receipt) {
      // Already-known transactions and uncertain send errors are resolved using the precomputed hash.
      try { await provider.broadcastTransaction(prepared.signedTransaction); } catch { /* Check receipt, not the send error. */ }
      receipt = await provider.waitForTransaction(prepared.transactionHash, 1, 120_000);
    }
    if (!receipt) throw new Error();
    if (receipt.status !== 1) return { state: "FAILED" as const };
    const record = await contract.getCertificate(normalizeCertificateId(certificate.certificateId));
    if (record.certificateHash.toLowerCase() !== prepared.certificateHash.toLowerCase() ||
        record.issuer.toLowerCase() !== prepared.walletAddress || record.issuedAt !== timestamps.issuedAt || record.expirationAt !== timestamps.expirationAt) throw new Error();
    return { state: "CONFIRMED" as const, transactionHash: receipt.hash, certificateHash: prepared.certificateHash };
  } catch { throw new Error("Registration confirmation unavailable. Keep this pending certificate and check it again; do not issue a replacement."); }
  finally { provider.destroy(); }
}

export async function registerCertificateOnBlockchain(certificate: CertificateHashInput) {
  const prepared = await prepareCertificateRegistration(certificate);
  const result = await submitPreparedRegistration(prepared, certificate);
  if (result.state !== "CONFIRMED") throw new Error("Blockchain registration reverted.");
  return { transactionHash: result.transactionHash, certificateHash: result.certificateHash };
}

export async function readCertificateOnBlockchain(id: string) {
  const certificateId = normalizeCertificateId(id);
  const { provider, contract } = await loadCertificateRegistry();
  try {
    const block = await provider.getBlock("latest");
    if (!block) throw new Error();
    // All reads use the same block so existence, payload, and chain clock are consistent.
    if (!await contract.certificateExists(certificateId, { blockTag: block.number })) return null;
    const value = await contract.getCertificate(certificateId, { blockTag: block.number });
    return { certificateId: String(value.certificateId), certificateHash: String(value.certificateHash), issuer: String(value.issuer), issuedAt: BigInt(value.issuedAt), expirationAt: BigInt(value.expirationAt), revoked: Boolean(value.revoked), checkedAt: BigInt(block.timestamp) };
  } catch { throw new Error("Unable to read the blockchain certificate."); }
  finally { provider.destroy(); }
}

export async function revokeCertificateOnBlockchain(id: string) {
  const prepared = await prepareCertificateRevocation(id);
  const result = await submitPreparedRevocation(prepared, id);
  if (result.state !== "CONFIRMED") throw new Error("Certificate revocation reverted.");
  return { transactionHash: result.transactionHash };
}

export type PreparedRevocation = Omit<PreparedRegistration, "certificateHash">;
export async function prepareCertificateRevocation(id: string, minimumNonce = 0): Promise<PreparedRevocation> {
  const certificateId = normalizeCertificateId(id);
  const { provider, contract } = await loadCertificateRegistry(true);
  try {
    const wallet = contract.runner as Wallet;
    const nonce = Math.max(await wallet.getNonce("pending"), minimumNonce);
    const call = await contract.revokeCertificate.populateTransaction(certificateId);
    const transaction = await wallet.populateTransaction({ ...call, nonce });
    const signedTransaction = await wallet.signTransaction(transaction);
    return { signedTransaction, transactionHash: keccak256(signedTransaction), nonce, walletAddress: wallet.address.toLowerCase(), contractAddress: (await contract.getAddress()).toLowerCase(), chainId: 11155111 };
  } catch { throw new Error("Unable to prepare revocation. Check wallet authorization, funding, and chain state."); }
  finally { provider.destroy(); }
}

export async function submitPreparedRevocation(prepared: PreparedRevocation, id: string) {
  const certificateId = normalizeCertificateId(id);
  const transaction = Transaction.from(prepared.signedTransaction);
  const data = new Interface(certificateRegistryAbi).encodeFunctionData("revokeCertificate", [certificateId]);
  if (transaction.hash !== prepared.transactionHash || transaction.from?.toLowerCase() !== prepared.walletAddress ||
      transaction.to?.toLowerCase() !== prepared.contractAddress || transaction.chainId !== BigInt(11155111) ||
      transaction.nonce !== prepared.nonce || transaction.value !== BigInt(0) || transaction.data !== data ||
      prepared.contractAddress !== process.env.CERTIFICATE_CONTRACT_ADDRESS?.toLowerCase()) throw new Error("Invalid stored revocation intent.");
  const { provider, contract } = await loadCertificateRegistry();
  try {
    let receipt = await provider.getTransactionReceipt(prepared.transactionHash);
    if (!receipt) {
      try { await provider.broadcastTransaction(prepared.signedTransaction); } catch { /* Resolve uncertain sends by hash. */ }
      receipt = await provider.waitForTransaction(prepared.transactionHash, 1, 120_000);
    }
    if (!receipt) throw new Error();
    if (receipt.status !== 1) return { state: "FAILED" as const };
    const record = await contract.getCertificate(certificateId);
    if (!record.revoked) throw new Error();
    return { state: "CONFIRMED" as const, transactionHash: receipt.hash };
  } catch { throw new Error("Revocation confirmation unavailable. Resume the saved transaction instead of creating another."); }
  finally { provider.destroy(); }
}

export async function verifyCertificateOnBlockchain(certificate: CertificateHashInput) {
  const certificateId = normalizeCertificateId(certificate.certificateId);
  const certificateHash = generateCertificateHash(certificate);
  const { provider, contract } = await loadCertificateRegistry();
  try {
    const result = await contract.verifyCertificate(certificateId, certificateHash);
    return { exists: Boolean(result.exists), hashMatches: Boolean(result.hashMatches), revoked: Boolean(result.revoked), expired: Boolean(result.expired) };
  } catch { throw new Error("Unable to verify the blockchain certificate."); }
  finally { provider.destroy(); }
}
