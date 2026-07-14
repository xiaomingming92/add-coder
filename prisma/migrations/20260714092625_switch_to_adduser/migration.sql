/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "DevOperation" DROP CONSTRAINT "DevOperation_userId_fkey";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "AddUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,

    CONSTRAINT "AddUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AddUser_username_key" ON "AddUser"("username");

-- AddForeignKey
ALTER TABLE "DevOperation" ADD CONSTRAINT "DevOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AddUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AddUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
