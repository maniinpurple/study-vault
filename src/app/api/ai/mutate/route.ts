import { runMutation } from "@/lib/ai-jobs";
import { aiJobHandler } from "@/lib/api-route";
import { mutateRequestSchema } from "@/lib/synth-prompt";

/** Review arena "New numbers": a verified numeric variant of the card's question (light tier). */
export const POST = aiJobHandler(mutateRequestSchema, runMutation);
