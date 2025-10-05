-- AlterTable
ALTER TABLE "public"."projects" ADD COLUMN     "isShopify" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "accessTokenEnc" DROP NOT NULL;
