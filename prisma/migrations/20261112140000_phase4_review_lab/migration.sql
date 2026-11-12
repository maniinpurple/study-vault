-- AlterTable
ALTER TABLE "card_attempt_logs" ADD COLUMN     "variant_question_latex" TEXT;

-- AlterTable
ALTER TABLE "ai_synthesized_problems" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verification_latex" TEXT;

