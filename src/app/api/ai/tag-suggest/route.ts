import { runTagSuggest } from "@/lib/ai-jobs";
import { aiJobHandler } from "@/lib/api-route";
import { tagSuggestRequestSchema } from "@/lib/brain-prompt";

/** Adaptive error tagging: CREATE / RENAME suggestions from the learner's notes, honouring past decline feedback. */
export const POST = aiJobHandler(tagSuggestRequestSchema, runTagSuggest);
