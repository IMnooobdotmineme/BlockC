import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";

export default defineConfig({
  plugins: [hardhatEthers, hardhatNodeTestRunner],
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  paths: { sources: "./contracts", tests: { nodejs: "./test" }, artifacts: "./artifacts", cache: "./cache" },
});
