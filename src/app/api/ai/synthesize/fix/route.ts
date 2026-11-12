import { runSynthesisFix } from "@/lib/ai-jobs";
import { aiJobHandler } from "@/lib/api-route";
import { fixRequestSchema } from "@/lib/synth-prompt";

/** "Report & fix with AI": re-verify a synthesized problem against the student's report and correct it if needed. */
export const POST = aiJobHandler(fixRequestSchema, runSynthesisFix);
