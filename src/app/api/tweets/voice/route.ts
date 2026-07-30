import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ensureSchema } from "@/lib/db";
import { ensureContentSchema, getSetting, setSetting } from "@/lib/content";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VoiceGuide = z.object({
  guide: z.string().describe("A concrete tweet-writing style guide (300-500 words): tone, structure patterns, opening hooks, sentence rhythm, formatting habits (line breaks, lists, emoji policy), topics to lean into, things to avoid. Written as direct instructions to a copywriter."),
});

// GET → current examples + derived guide
export async function GET() {
  await ensureSchema();
  await ensureContentSchema();
  const [examples, guide] = await Promise.all([getSetting("voice_examples"), getSetting("voice_guide")]);
  return NextResponse.json({ examples: examples ?? "", guide: guide ?? "" });
}

// POST { examples } → save examples, analyze into a style guide
export async function POST(req: NextRequest) {
  await ensureSchema();
  await ensureContentSchema();
  const body = await req.json().catch(() => null);
  if (typeof body?.examples !== "string" || body.examples.trim().length < 20) {
    return NextResponse.json({ error: "Paste some example tweets / accounts first" }, { status: 400 });
  }

  await setSetting("voice_examples", body.examples);

  const client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
  let response;
  try {
    response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `Below are tweets, accounts, and notes the user admires — spanning business, regenerative medicine, preventative medicine, and AI. Study them and produce a style guide for writing tweets in a voice inspired by these (not copying any single one). The tweets will be for the founder of a peptide manufacturing company whose audience is clinic owners and practitioners.\n\n---\n${body.examples}\n---\n\nAnalyze: hook styles, sentence length and rhythm, degree of opinion vs. neutrality, use of numbers/specifics, formatting (line breaks, lists), how they build authority, CTA habits. Then write the guide.`,
      },
    ],
    output_config: { format: zodOutputFormat(VoiceGuide) },
    });
  } catch (e) {
    const msg = (e as Error).message;
    const busy = msg.includes("529") || msg.includes("overloaded") || msg.includes("timed out");
    return NextResponse.json({ error: busy ? "AI service is busy right now — try again in a minute." : msg }, { status: 503 });
  }

  const guide = response.parsed_output?.guide;
  if (!guide) return NextResponse.json({ error: "Analysis failed" }, { status: 502 });

  await setSetting("voice_guide", guide);
  return NextResponse.json({ guide });
}
