import { runSynthesis } from "@/lib/ai-jobs";
import { aiJobHandler } from "@/lib/api-route";
import { synthesizeRequestSchema } from "@/lib/synth-prompt";

/** Scoped AI Problem Synthesizer (Mode A clone / Mode B mix) with mandatory self-verification (heavy tier). */
export const POST = aiJobHandler(synthesizeRequestSchema, runSynthesis);
