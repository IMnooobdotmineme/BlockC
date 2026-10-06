import "dotenv/config";
import { readFile } from "node:fs/promises";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

class DeploymentConfigurationError extends Error {}

async function main() {
  const url = process.env.SEPOLIA_RPC_URL;
  const key = process.env.BLOCKCHAIN_PRIVATE_KEY;
  if (!url || !key) throw new DeploymentConfigurationError("Deployment skipped: configure SEPOLIA_RPC_URL and BLOCKCHAIN_PRIVATE_KEY privately in .env.");
  try {
    if (!["https:", "http:"].includes(new URL(url).protocol) || !/^(0x)?[0-9a-fA-F]{64}$/.test(key)) throw new Error();
  } catch { throw new DeploymentConfigurationError("Deployment skipped: invalid RPC or signing configuration."); }
  let artifact;
  try { artifact = JSON.parse(await readFile("blockchain/artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json", "utf8")); }
  catch { throw new DeploymentConfigurationError("Compile the contract first: npm run blockchain:compile."); }
  const provider = new JsonRpcProvider(url);
  try {
    if ((await provider.getNetwork()).chainId !== BigInt(11155111)) throw new DeploymentConfigurationError("Deployment requires Ethereum Sepolia (chain ID 11155111).");
    const wallet = new Wallet(key.startsWith("0x") ? key : `0x${key}`, provider);
    if (await provider.getBalance(wallet.address) === BigInt(0)) throw new DeploymentConfigurationError("Fund the deployment wallet with Sepolia test ETH first.");
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy();
    const receipt = await contract.deploymentTransaction()!.wait(1, 120_000);
    if (!receipt || receipt.status !== 1) throw new Error("Deployment confirmation failed; inspect the wallet's transactions before retrying.");
    console.log(`CertificateRegistry deployed: ${await contract.getAddress()}`);
    console.log(`Transaction: ${receipt.hash}`);
    console.log(`Set CERTIFICATE_CONTRACT_ADDRESS=${await contract.getAddress()} in .env.`);
  } finally { provider.destroy(); }
}

main().catch((error: unknown) => {
  // Never print raw ethers errors: they can contain RPC credentials and transaction data.
  console.error(error instanceof DeploymentConfigurationError ? error.message : "Deployment did not complete. Check signing configuration and RPC availability. Inspect wallet transactions before retrying after a timeout.");
  process.exitCode = 1;
});
