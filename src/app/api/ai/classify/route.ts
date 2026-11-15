import { runClassify } from "@/lib/ai-jobs";
import { aiJobHandler } from "@/lib/api-route";
import { classifyRequestSchema } from "@/lib/skills-prompt";

/** Upload dialog "Tự động điền bằng AI": classify the first page with the signed-in user's own key. */
export const POST = aiJobHandler(classifyRequestSchema, runClassify);
