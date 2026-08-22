import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureContentSchema, BRAND_VOICE, TWEET_RESEARCH_BRIEF, getSetting } from "@/lib/content";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TweetDraft = z.object({
  tweets: z.array(
    z.object({
      text: z.string(),
      voice: z.enum(["spartan", "professional"]),
      source_note: z.string(),
    })
  ),
});

// Daily cron: keep 2 fresh tweet drafts in the approval queue.
export async function GET() {
  await ensureSchema();
  await ensureContentSchema();
  const db = getDb();
  const queued = await db.execute(`SELECT COUNT(*) AS c FROM tweets WHERE status = 'queued'`);
  const have = Number((queued.rows[0] as { c?: number })?.c ?? 0);
  if (have >= 3) return NextResponse.json({ skipped: true, queued: have });

  const recent = await db.execute(`SELECT text FROM tweets ORDER BY id DESC LIMIT 20`);
  const voiceGuide = await getSetting("voice_guide");
  const client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
  let response;
  try {
    response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 3000,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    messages: [
      {
        role: "user",
        content: `You write tweets for the founder of Golden Lotus Labs.\n\n${BRAND_VOICE.gll}${voiceGuide ? `\n\nVOICE GUIDE — follow this style closely:\n${voiceGuide}` : ""}\n\n${TWEET_RESEARCH_BRIEF}\n\nDraft 2 tweets for today.\n\nAvoid repeating:\n${(recent.rows as unknown as { text: string }[]).map((t) => `- ${t.text.slice(0, 80)}`).join("\n") || "(none)"}`,
      },
    ],
    output_config: { format: zodOutputFormat(TweetDraft) },
    });
  } catch (e) {
    const msg = (e as Error).message;
    const busy = msg.includes("529") || msg.includes("overloaded") || msg.includes("timed out");
    return NextResponse.json({ error: busy ? "AI service is busy right now — try again in a minute." : msg }, { status: 503 });
  }
  const parsed = response.parsed_output;
  let added = 0;
  for (const t of parsed?.tweets ?? []) {
    await db.execute({
      sql: `INSERT INTO tweets (text, voice, source_note) VALUES (?, ?, ?)`,
      args: [t.text.slice(0, 280), t.voice, t.source_note],
    });
    added++;
  }
  return NextResponse.json({ added, queued: have + added });
}
