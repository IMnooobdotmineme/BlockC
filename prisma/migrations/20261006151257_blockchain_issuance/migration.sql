-- CreateEnum
CREATE TYPE "BlockchainRegistrationStatus" AS ENUM ('UNREGISTERED', 'PENDING', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "blockchainStatus" "BlockchainRegistrationStatus" NOT NULL DEFAULT 'UNREGISTERED';

-- CreateTable
CREATE TABLE "CertificateBlockchainJob" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "signedTransaction" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "nonce" BIGINT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateBlockchainJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CertificateBlockchainJob_certificateId_key" ON "CertificateBlockchainJob"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateBlockchainJob_transactionHash_key" ON "CertificateBlockchainJob"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateBlockchainJob_chainId_walletAddress_nonce_key" ON "CertificateBlockchainJob"("chainId", "walletAddress", "nonce");

-- AddForeignKey
ALTER TABLE "CertificateBlockchainJob" ADD CONSTRAINT "CertificateBlockchainJob_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
