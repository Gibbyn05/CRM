import Anthropic from "@anthropic-ai/sdk";

// Delt Anthropic-klient. Modellen kan overstyres med ANTHROPIC_MODEL;
// standard er claude-opus-4-8.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
