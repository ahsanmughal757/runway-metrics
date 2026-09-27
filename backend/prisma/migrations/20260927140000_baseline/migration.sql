-- Baseline migration.
--
-- Squashed on purpose: the previous baseline was generated before the model was
-- understood and there is no production data, so replaying a chain of throwaway
-- migrations would only preserve our own confusion. This is the one honest
-- starting point.
--
-- Everything below the "-- Prisma generated" marker is hand written. Those are
-- the invariants the schema language cannot state, and each one exists because
-- the application got it wrong at least once.

-- Prisma generated
-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'CHURNED');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('COMPANY_SETTINGS', 'MEMBER', 'CUSTOMER', 'METRIC_SNAPSHOT', 'INVITE', 'REPORT', 'SHARE_LINK');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'IMPORTED', 'INVITED', 'ACCEPTED', 'REVOKED', 'GENERATED', 'SHARED', 'VIEWED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "runwayGreenMonths" INTEGER NOT NULL DEFAULT 12,
    "runwayYellowMonths" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "mrr" DECIMAL(16,2) NOT NULL,
    "newMrr" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "expansionMrr" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "contractionMrr" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "churnedMrr" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "churnedCustomers" INTEGER NOT NULL DEFAULT 0,
    "totalCustomers" INTEGER NOT NULL DEFAULT 0,
    "burnRate" DECIMAL(16,2) NOT NULL,
    "cash" DECIMAL(16,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "signupMonth" TIMESTAMP(3) NOT NULL,
    "churnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMonthlyValue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "mrr" DECIMAL(16,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMonthlyValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diff" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "CompanyMembership_companyId_idx" ON "CompanyMembership"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMembership_userId_companyId_key" ON "CompanyMembership"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE INDEX "Invite_companyId_idx" ON "Invite"("companyId");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- CreateIndex
CREATE INDEX "MetricSnapshot_companyId_month_idx" ON "MetricSnapshot"("companyId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_companyId_month_key" ON "MetricSnapshot"("companyId", "month");

-- CreateIndex
CREATE INDEX "Customer_companyId_signupMonth_idx" ON "Customer"("companyId", "signupMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_externalId_key" ON "Customer"("companyId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_id_companyId_key" ON "Customer"("id", "companyId");

-- CreateIndex
CREATE INDEX "CustomerMonthlyValue_companyId_month_idx" ON "CustomerMonthlyValue"("companyId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMonthlyValue_customerId_month_key" ON "CustomerMonthlyValue"("customerId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_companyId_idx" ON "ShareLink"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_changedAt_idx" ON "AuditLog"("companyId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMonthlyValue" ADD CONSTRAINT "CustomerMonthlyValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMonthlyValue" ADD CONSTRAINT "CustomerMonthlyValue_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "Customer"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand written invariants

-- Months are the only time axis in this product. If a row can hold
-- 2026-03-17 then "this month's MRR" stops being well defined, ordering stops
-- matching the calendar, and cohort maths silently double counts. Normalising
-- is currently the application's job; make the database refuse anything else.
ALTER TABLE "MetricSnapshot"
  ADD CONSTRAINT "MetricSnapshot_month_is_first_of_month"
  CHECK ("month" = date_trunc('month', "month"));

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_signupMonth_is_first_of_month"
  CHECK ("signupMonth" = date_trunc('month', "signupMonth"));

ALTER TABLE "CustomerMonthlyValue"
  ADD CONSTRAINT "CustomerMonthlyValue_month_is_first_of_month"
  CHECK ("month" = date_trunc('month', "month"));

-- A customer is churned exactly when we know when they left. Without this the
-- cohort report has to guess, and the two columns drift apart in practice.
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_churned_at_matches_status"
  CHECK (("status" = 'CHURNED') = ("churnedAt" IS NOT NULL));

-- Runway zones are thresholds, so they have to be ordered, and neither is
-- meaningful at zero.
ALTER TABLE "Company"
  ADD CONSTRAINT "Company_runway_thresholds_ordered"
  CHECK ("runwayGreenMonths" > 0
     AND "runwayYellowMonths" > 0
     AND "runwayYellowMonths" <= "runwayGreenMonths");

-- Revenue, cash and burn are amounts, not deltas. A negative MRR is a bug that
-- should be impossible to store, not a value to render. CustomerMonthlyValue
-- is deliberately excluded: a credit note legitimately pushes one month
-- negative, and the invoice, not the schema, should decide that.
ALTER TABLE "MetricSnapshot"
  ADD CONSTRAINT "MetricSnapshot_amounts_non_negative"
  CHECK ("mrr" >= 0 AND "cash" >= 0 AND "burnRate" >= 0);

ALTER TABLE "ShareLink"
  ADD CONSTRAINT "ShareLink_view_count_non_negative"
  CHECK ("viewCount" >= 0);

-- Email is the login identity, so one address means one account regardless of
-- how it was typed. Normalise on write, then refuse anything unnormalised.
ALTER TABLE "User"
  ADD CONSTRAINT "User_email_normalised"
  CHECK ("email" = lower(btrim("email")));

ALTER TABLE "Invite"
  ADD CONSTRAINT "Invite_email_normalised"
  CHECK ("email" = lower(btrim("email")));

-- At most one live invitation per address per company. Prisma cannot express a
-- partial index, and without this two admins clicking send produce two
-- invitations that both work.
CREATE UNIQUE INDEX "Invite_companyId_email_pending_key"
  ON "Invite"("companyId", "email")
  WHERE "status" = 'PENDING';

-- An invitation that expires on arrival is a bug, and a session that expires
-- before it was issued is worse.
ALTER TABLE "Invite"
  ADD CONSTRAINT "Invite_expires_after_creation"
  CHECK ("expiresAt" > "createdAt");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_expires_after_creation"
  CHECK ("expiresAt" > "createdAt");

ALTER TABLE "ShareLink"
  ADD CONSTRAINT "ShareLink_expires_after_creation"
  CHECK ("expiresAt" > "createdAt");

-- Prisma maintains updatedAt in the client, which means any bulk or raw write
-- silently leaves a stale timestamp behind. The connector sync in a later phase
-- will be exactly such a write, so make the database own the column instead.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_set_updated_at" BEFORE UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "Company_set_updated_at" BEFORE UPDATE ON "Company"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "CompanyMembership_set_updated_at" BEFORE UPDATE ON "CompanyMembership"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "MetricSnapshot_set_updated_at" BEFORE UPDATE ON "MetricSnapshot"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "Customer_set_updated_at" BEFORE UPDATE ON "Customer"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER "CustomerMonthlyValue_set_updated_at" BEFORE UPDATE ON "CustomerMonthlyValue"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
