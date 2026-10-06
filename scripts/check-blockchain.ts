import "dotenv/config";
import type { Wallet } from "ethers";
import { loadCertificateRegistry } from "../src/lib/blockchain/registry";

async function main() {
  const { provider, contract } = await loadCertificateRegistry(true);
  try {
    const address = await (contract.runner as Wallet).getAddress();
    console.log("Sepolia connection, deployed contract, and signing wallet authorization: OK.");
    console.log(`Wallet has Sepolia ETH: ${await provider.getBalance(address) > BigInt(0) ? "Yes" : "No"}.`);
    console.log("Read-only preflight complete; no transaction was sent.");
  } finally { provider.destroy(); }
}
main().catch(() => { console.error("Blockchain preflight failed. Check server-only .env configuration, RPC availability, contract deployment, and wallet authorization."); process.exitCode = 1; });
