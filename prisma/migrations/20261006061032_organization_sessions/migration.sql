-- CreateTable
CREATE TABLE "OrganizationSession" (
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "OrganizationSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "OrganizationSession_organizationId_idx" ON "OrganizationSession"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationSession_expiresAt_idx" ON "OrganizationSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "OrganizationSession" ADD CONSTRAINT "OrganizationSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
