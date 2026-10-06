-- CreateEnum
CREATE TYPE "RevocationStatus" AS ENUM ('NONE', 'PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ISSUED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('NOT_SENT', 'SENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "revocationStatus" "RevocationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "revocationTxHash" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CertificateRevocationJob" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "signedTransaction" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "nonce" BIGINT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateRevocationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateNotification" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'NOT_SENT',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CertificateRevocationJob_certificateId_key" ON "CertificateRevocationJob"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateRevocationJob_transactionHash_key" ON "CertificateRevocationJob"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateRevocationJob_chainId_walletAddress_nonce_key" ON "CertificateRevocationJob"("chainId", "walletAddress", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateNotification_certificateId_kind_key" ON "CertificateNotification"("certificateId", "kind");

-- AddForeignKey
ALTER TABLE "CertificateRevocationJob" ADD CONSTRAINT "CertificateRevocationJob_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateNotification" ADD CONSTRAINT "CertificateNotification_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
