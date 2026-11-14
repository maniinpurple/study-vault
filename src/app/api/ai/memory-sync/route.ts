import { runMemorySync } from "@/lib/ai-jobs";
import { aiJobHandler } from "@/lib/api-route";
import { memorySyncRequestSchema } from "@/lib/brain-prompt";

/** "Update memory": compress a subject's cards + attempt notes into the Subject Memory and refine the persona. */
export const POST = aiJobHandler(memorySyncRequestSchema, runMemorySync);
