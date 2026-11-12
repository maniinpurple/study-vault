-- AlterTable
ALTER TABLE "exam_uploads" ADD COLUMN     "page_storage_paths" TEXT[] DEFAULT ARRAY[]::TEXT[];
