let initialized = false;

async function ensureTablesExist(prisma) {
  if (initialized) return;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || '';
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    return;
  }
  try {
    // Execute idempotent table creation in case db push was skipped
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT UNIQUE NOT NULL,
        "password" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "Application" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "company" TEXT NOT NULL,
        "jobTitle" TEXT NOT NULL,
        "jobUrl" TEXT,
        "status" TEXT NOT NULL DEFAULT 'WISHLIST',
        "appliedDate" TIMESTAMP(3),
        "location" TEXT,
        "salary" TEXT,
        "source" TEXT,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "StatusHistory" (
        "id" TEXT PRIMARY KEY,
        "applicationId" TEXT NOT NULL REFERENCES "Application"("id") ON DELETE CASCADE,
        "status" TEXT NOT NULL,
        "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "tokenHash" TEXT UNIQUE NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "usedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "Reminder" (
        "id" TEXT PRIMARY KEY,
        "applicationId" TEXT NOT NULL REFERENCES "Application"("id") ON DELETE CASCADE,
        "dueDate" TIMESTAMP(3) NOT NULL,
        "message" TEXT NOT NULL,
        "isCompleted" BOOLEAN NOT NULL DEFAULT false
      );
      CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
    `);
    initialized = true;
    console.log('[DB] PostgreSQL schema verified and tables ready.');
  } catch (err) {
    console.warn('[DB] Schema check notice:', err.message);
  }
}

module.exports = { ensureTablesExist };

