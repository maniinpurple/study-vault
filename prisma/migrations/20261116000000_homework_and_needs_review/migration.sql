-- Homework tracker on sources, and the "needs review" flag on problems. Additive only: existing rows get the defaults.

-- AlterTable
ALTER TABLE "exam_uploads" ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deadline" DATE;

-- AlterTable
ALTER TABLE "mistake_cards" ADD COLUMN     "needs_review" BOOLEAN NOT NULL DEFAULT false;
