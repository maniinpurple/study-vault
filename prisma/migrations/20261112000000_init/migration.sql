-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "language" AS ENUM ('VI', 'EN');

-- CreateEnum
CREATE TYPE "theme_preference" AS ENUM ('OBSIDIAN', 'DARK_GRAY', 'LIGHT');

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('SUPABASE', 'CREDENTIALS');

-- CreateEnum
CREATE TYPE "ai_provider" AS ENUM ('GEMINI', 'OPENAI', 'ANTHROPIC', 'CUSTOM');

-- CreateEnum
CREATE TYPE "file_kind" AS ENUM ('PDF', 'IMAGE');

-- CreateEnum
CREATE TYPE "upload_status" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ocr_status" AS ENUM ('MANUAL', 'PENDING', 'PROCESSING', 'NEEDS_REVIEW', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "card_state" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateEnum
CREATE TYPE "rating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateEnum
CREATE TYPE "tag_origin" AS ENUM ('BASE', 'USER', 'AI_ACCEPTED');

-- CreateEnum
CREATE TYPE "tag_assigner" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "tag_suggestion_kind" AS ENUM ('CREATE', 'RENAME', 'MERGE');

-- CreateEnum
CREATE TYPE "suggestion_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "synthesis_mode" AS ENUM ('CLONE', 'MIX');

-- CreateEnum
CREATE TYPE "exam_prep_status" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "auth_provider" "auth_provider" NOT NULL DEFAULT 'SUPABASE',
    "password_hash" TEXT,
    "ui_language" "language" NOT NULL DEFAULT 'VI',
    "default_ai_output_language" "language" NOT NULL DEFAULT 'VI',
    "theme" "theme_preference" NOT NULL DEFAULT 'OBSIDIAN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "desired_retention" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "maximum_interval" INTEGER NOT NULL DEFAULT 36500,
    "fsrs_weights" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "enable_fuzz" BOOLEAN NOT NULL DEFAULT true,
    "daily_new_limit" INTEGER NOT NULL DEFAULT 20,
    "daily_review_limit" INTEGER NOT NULL DEFAULT 200,
    "onboarded_at" TIMESTAMP(3),
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_api_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "label" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "encryption_key_id" TEXT NOT NULL,
    "key_hint" VARCHAR(8) NOT NULL,
    "base_url" TEXT,
    "default_model" TEXT,
    "vision_model" TEXT,
    "ai_output_language" "language",
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "last_validated_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ai_personas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weaknesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "learning_habits" JSONB,
    "preferences" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "source_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "is_stale" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "last_sync_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ai_personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "ai_output_language" "language",
    "preferred_api_key_id" UUID,
    "exam_date" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "memory_summary" TEXT,
    "memory_insights" JSONB,
    "memory_version" INTEGER NOT NULL DEFAULT 0,
    "memory_source_card_count" INTEGER NOT NULL DEFAULT 0,
    "memory_stale" BOOLEAN NOT NULL DEFAULT false,
    "memory_updated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_uploads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID,
    "title" TEXT NOT NULL,
    "source_label" TEXT,
    "file_kind" "file_kind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_bucket" TEXT,
    "storage_path" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "page_count" INTEGER,
    "sha256" TEXT NOT NULL,
    "status" "upload_status" NOT NULL DEFAULT 'UPLOADED',
    "error_message" TEXT,
    "exam_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mistake_cards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "topic_id" UUID,
    "exam_upload_id" UUID,
    "title" TEXT,
    "question_latex" TEXT NOT NULL,
    "user_answer_latex" TEXT,
    "correct_answer_latex" TEXT,
    "solution_latex" TEXT,
    "source_page" INTEGER,
    "crop_box" JSONB,
    "figure_box" JSONB,
    "diagram_image_path" TEXT,
    "original_crop_path" TEXT,
    "ocr_status" "ocr_status" NOT NULL DEFAULT 'MANUAL',
    "ocr_model" TEXT,
    "ocr_confidence" DOUBLE PRECISION,
    "ocr_raw_text" TEXT,
    "is_high_yield" BOOLEAN NOT NULL DEFAULT false,
    "high_yield_note" TEXT,
    "state" "card_state" NOT NULL DEFAULT 'NEW',
    "due" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsed_days" INTEGER NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "learning_steps" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "last_review_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mistake_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_attempt_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "rating" "rating" NOT NULL,
    "note" TEXT,
    "user_answer_latex" TEXT,
    "time_spent_ms" INTEGER,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state_before" "card_state" NOT NULL,
    "state_after" "card_state" NOT NULL,
    "stability_before" DOUBLE PRECISION NOT NULL,
    "stability_after" DOUBLE PRECISION NOT NULL,
    "difficulty_before" DOUBLE PRECISION NOT NULL,
    "difficulty_after" DOUBLE PRECISION NOT NULL,
    "retrievability" DOUBLE PRECISION,
    "elapsed_days" INTEGER NOT NULL,
    "scheduled_days" INTEGER NOT NULL,
    "learning_steps" INTEGER NOT NULL,
    "due_before" TIMESTAMP(3) NOT NULL,
    "due_after" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_attempt_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adaptive_tags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID,
    "scope_key" TEXT NOT NULL DEFAULT 'global',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "i18n_key" TEXT,
    "description" TEXT,
    "color" TEXT,
    "origin" "tag_origin" NOT NULL DEFAULT 'USER',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "merged_into_id" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adaptive_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mistake_card_tags" (
    "card_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "assigned_by" "tag_assigner" NOT NULL DEFAULT 'USER',
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mistake_card_tags_pkey" PRIMARY KEY ("card_id","tag_id")
);

-- CreateTable
CREATE TABLE "tag_suggestion_feedback" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID,
    "kind" "tag_suggestion_kind" NOT NULL,
    "target_tag_id" UUID,
    "merge_into_tag_id" UUID,
    "proposed_name" TEXT,
    "proposed_description" TEXT,
    "rationale" TEXT NOT NULL,
    "evidence_card_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "status" "suggestion_status" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "resulting_tag_id" UUID,
    "ai_provider" "ai_provider",
    "ai_model" TEXT,
    "output_language" "language" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "tag_suggestion_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_prep_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "exam_date" TIMESTAMP(3),
    "topic_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "tag_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "from_date" TIMESTAMP(3),
    "to_date" TIMESTAMP(3),
    "high_yield_only" BOOLEAN NOT NULL DEFAULT false,
    "include_synthesized" BOOLEAN NOT NULL DEFAULT true,
    "target_problem_count" INTEGER,
    "status" "exam_prep_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_prep_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_synthesized_problems" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "topic_id" UUID,
    "exam_prep_session_id" UUID,
    "mode" "synthesis_mode" NOT NULL,
    "question_latex" TEXT NOT NULL,
    "answer_latex" TEXT,
    "solution_latex" TEXT,
    "diagram_description" TEXT,
    "difficulty_estimate" DOUBLE PRECISION,
    "is_experimental" BOOLEAN NOT NULL DEFAULT true,
    "used_high_yield" BOOLEAN NOT NULL DEFAULT false,
    "output_language" "language" NOT NULL,
    "api_key_id" UUID,
    "ai_provider" "ai_provider" NOT NULL,
    "ai_model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "user_rating" INTEGER,
    "is_flagged_incorrect" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" TEXT,
    "promoted_card_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_synthesized_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_synthesized_problem_sources" (
    "problem_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_synthesized_problem_sources_pkey" PRIMARY KEY ("problem_id","card_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_api_keys_user_id_provider_idx" ON "user_api_keys"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "user_api_keys_user_id_label_key" ON "user_api_keys"("user_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "user_ai_personas_user_id_key" ON "user_ai_personas"("user_id");

-- CreateIndex
CREATE INDEX "subjects_user_id_sort_order_idx" ON "subjects"("user_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_user_id_slug_key" ON "subjects"("user_id", "slug");

-- CreateIndex
CREATE INDEX "topics_user_id_idx" ON "topics"("user_id");

-- CreateIndex
CREATE INDEX "topics_parent_id_idx" ON "topics"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_subject_id_slug_key" ON "topics"("subject_id", "slug");

-- CreateIndex
CREATE INDEX "exam_uploads_user_id_created_at_idx" ON "exam_uploads"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exam_uploads_user_id_sha256_key" ON "exam_uploads"("user_id", "sha256");

-- CreateIndex
CREATE INDEX "mistake_cards_user_id_due_idx" ON "mistake_cards"("user_id", "due");

-- CreateIndex
CREATE INDEX "mistake_cards_user_id_subject_id_due_idx" ON "mistake_cards"("user_id", "subject_id", "due");

-- CreateIndex
CREATE INDEX "mistake_cards_user_id_is_high_yield_idx" ON "mistake_cards"("user_id", "is_high_yield");

-- CreateIndex
CREATE INDEX "mistake_cards_topic_id_idx" ON "mistake_cards"("topic_id");

-- CreateIndex
CREATE INDEX "mistake_cards_exam_upload_id_idx" ON "mistake_cards"("exam_upload_id");

-- CreateIndex
CREATE INDEX "card_attempt_logs_user_id_reviewed_at_idx" ON "card_attempt_logs"("user_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "card_attempt_logs_card_id_attempt_number_key" ON "card_attempt_logs"("card_id", "attempt_number");

-- CreateIndex
CREATE INDEX "adaptive_tags_subject_id_idx" ON "adaptive_tags"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "adaptive_tags_user_id_scope_key_slug_key" ON "adaptive_tags"("user_id", "scope_key", "slug");

-- CreateIndex
CREATE INDEX "mistake_card_tags_tag_id_idx" ON "mistake_card_tags"("tag_id");

-- CreateIndex
CREATE INDEX "tag_suggestion_feedback_user_id_status_idx" ON "tag_suggestion_feedback"("user_id", "status");

-- CreateIndex
CREATE INDEX "tag_suggestion_feedback_subject_id_idx" ON "tag_suggestion_feedback"("subject_id");

-- CreateIndex
CREATE INDEX "exam_prep_sessions_user_id_subject_id_idx" ON "exam_prep_sessions"("user_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_synthesized_problems_promoted_card_id_key" ON "ai_synthesized_problems"("promoted_card_id");

-- CreateIndex
CREATE INDEX "ai_synthesized_problems_user_id_subject_id_created_at_idx" ON "ai_synthesized_problems"("user_id", "subject_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_synthesized_problems_exam_prep_session_id_idx" ON "ai_synthesized_problems"("exam_prep_session_id");

-- CreateIndex
CREATE INDEX "ai_synthesized_problem_sources_card_id_idx" ON "ai_synthesized_problem_sources"("card_id");

-- AddForeignKey
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ai_personas" ADD CONSTRAINT "user_ai_personas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_preferred_api_key_id_fkey" FOREIGN KEY ("preferred_api_key_id") REFERENCES "user_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_uploads" ADD CONSTRAINT "exam_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_uploads" ADD CONSTRAINT "exam_uploads_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake_cards" ADD CONSTRAINT "mistake_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake_cards" ADD CONSTRAINT "mistake_cards_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake_cards" ADD CONSTRAINT "mistake_cards_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake_cards" ADD CONSTRAINT "mistake_cards_exam_upload_id_fkey" FOREIGN KEY ("exam_upload_id") REFERENCES "exam_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_attempt_logs" ADD CONSTRAINT "card_attempt_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_attempt_logs" ADD CONSTRAINT "card_attempt_logs_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "mistake_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_tags" ADD CONSTRAINT "adaptive_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_tags" ADD CONSTRAINT "adaptive_tags_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_tags" ADD CONSTRAINT "adaptive_tags_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "adaptive_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake_card_tags" ADD CONSTRAINT "mistake_card_tags_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "mistake_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mistake_card_tags" ADD CONSTRAINT "mistake_card_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "adaptive_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_suggestion_feedback" ADD CONSTRAINT "tag_suggestion_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_suggestion_feedback" ADD CONSTRAINT "tag_suggestion_feedback_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_suggestion_feedback" ADD CONSTRAINT "tag_suggestion_feedback_target_tag_id_fkey" FOREIGN KEY ("target_tag_id") REFERENCES "adaptive_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_suggestion_feedback" ADD CONSTRAINT "tag_suggestion_feedback_merge_into_tag_id_fkey" FOREIGN KEY ("merge_into_tag_id") REFERENCES "adaptive_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_suggestion_feedback" ADD CONSTRAINT "tag_suggestion_feedback_resulting_tag_id_fkey" FOREIGN KEY ("resulting_tag_id") REFERENCES "adaptive_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_prep_sessions" ADD CONSTRAINT "exam_prep_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_prep_sessions" ADD CONSTRAINT "exam_prep_sessions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_synthesized_problems" ADD CONSTRAINT "ai_synthesized_problems_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_synthesized_problems" ADD CONSTRAINT "ai_synthesized_problems_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_synthesized_problems" ADD CONSTRAINT "ai_synthesized_problems_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_synthesized_problems" ADD CONSTRAINT "ai_synthesized_problems_exam_prep_session_id_fkey" FOREIGN KEY ("exam_prep_session_id") REFERENCES "exam_prep_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_synthesized_problems" ADD CONSTRAINT "ai_synthesized_problems_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "user_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_synthesized_problems" ADD CONSTRAINT "ai_synthesized_problems_promoted_card_id_fkey" FOREIGN KEY ("promoted_card_id") REFERENCES "mistake_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_synthesized_problem_sources" ADD CONSTRAINT "ai_synthesized_problem_sources_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "ai_synthesized_problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_synthesized_problem_sources" ADD CONSTRAINT "ai_synthesized_problem_sources_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "mistake_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
