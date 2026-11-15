import { runAnalyze } from "@/lib/ai-jobs";
import { aiJobHandler } from "@/lib/api-route";
import { analyzeRequestSchema } from "@/lib/skills-prompt";

/** Review "Phân tích dạng toán": sub-topic, problem type and core concept (light tier). */
export const POST = aiJobHandler(analyzeRequestSchema, runAnalyze);
