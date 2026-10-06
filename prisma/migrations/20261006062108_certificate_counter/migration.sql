-- CreateTable
CREATE TABLE "CertificateCounter" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CertificateCounter_pkey" PRIMARY KEY ("year")
);
