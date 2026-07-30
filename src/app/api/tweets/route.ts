import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { TwitterApi } from "twitter-api-v2";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureContentSchema, BRAND_VOICE, TWEET_RESEARCH_BRIEF, getSetting } from "@/lib/content";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TweetDraft = z.object({
  tweets: z.array(
    z.object({
      text: z.string().describe("tweet text, under 270 chars, no hashtag spam (max 2)"),
      voice: z.enum(["spartan", "professional"]).describe("which voice this tweet was written in"),
      source_note: z.string().describe("one line: what topic/finding inspired this tweet and why the angle works"),
    })
  ),
});

// GET → tweet queue + history
export async function GET() {
  await ensureSchema();
  await ensureContentSchema();
  const r = await getDb().execute(
    `SELECT id, text, status, tweet_id, error, source_note, voice, created_at, posted_at FROM tweets ORDER BY id DESC LIMIT 50`
  );
  return NextResponse.json({ tweets: r.rows });
}

// POST { action: "generate", count? }        → draft tweets into the queue
// POST { action: "update", id, text }        → edit a queued tweet
// POST { action: "post", id }                → publish one queued tweet to X
// POST { action: "delete", id }              → remove from queue
export async function POST(req: NextRequest) {
  await ensureSchema();
  await ensureContentSchema();
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "Pass { action }" }, { status: 400 });

  if (body.action === "generate") {
    const recent = await db.execute(`SELECT text FROM tweets ORDER BY id DESC LIMIT 20`);
    const posts = await db.execute(
      `SELECT title, site, page_path FROM content_posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 5`
    );
    const voiceGuide = await getSetting("voice_guide");
    const client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
    let response;
  try {
    response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages: [
        {
          role: "user",
          content: `You write tweets for the founder of Golden Lotus Labs.\n\n${BRAND_VOICE.gll}${voiceGuide ? `\n\nVOICE GUIDE — follow this style closely:\n${voiceGuide}` : ""}\n\n${TWEET_RESEARCH_BRIEF}\n\nDraft ${body.count ?? 3} tweets.\n\nRecent published articles you may link to:\n${(posts.rows as unknown as { title: string; site: string; page_path: string }[]).map((p) => `- ${p.title} → https://${p.site === "quantis" ? "quantispeptides.com" : "www.goldenlotuslabs.com"}${p.page_path}?utm_source=twitter&utm_medium=social`).join("\n") || "(none yet)"}\n\nAvoid repeating these recent tweets:\n${(recent.rows as unknown as { text: string }[]).map((t) => `- ${t.text.slice(0, 80)}`).join("\n") || "(none)"}`,
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
    if (!parsed?.tweets?.length) return NextResponse.json({ error: "Generation failed" }, { status: 502 });
    for (const t of parsed.tweets) {
      await db.execute({
        sql: `INSERT INTO tweets (text, voice, source_note) VALUES (?, ?, ?)`,
        args: [t.text.slice(0, 280), t.voice, t.source_note],
      });
    }
    return NextResponse.json({ added: parsed.tweets.length });
  }

  if (body.action === "update") {
    await db.execute({ sql: `UPDATE tweets SET text = ? WHERE id = ? AND status = 'queued'`, args: [String(body.text).slice(0, 280), body.id] });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    await db.execute({ sql: `DELETE FROM tweets WHERE id = ? AND status = 'queued'`, args: [body.id] });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "post") {
    const r = await db.execute({ sql: `SELECT text FROM tweets WHERE id = ? AND status = 'queued'`, args: [body.id] });
    const t = r.rows[0] as unknown as { text: string } | undefined;
    if (!t) return NextResponse.json({ error: "Not found or already posted" }, { status: 404 });
    try {
      const x = new TwitterApi({
        appKey: process.env.X_API_KEY!,
        appSecret: process.env.X_API_SECRET!,
        accessToken: process.env.X_ACCESS_TOKEN!,
        accessSecret: process.env.X_ACCESS_SECRET!,
      });
      const posted = await x.v2.tweet(t.text);
      await db.execute({
        sql: `UPDATE tweets SET status = 'posted', tweet_id = ?, posted_at = datetime('now') WHERE id = ?`,
        args: [posted.data.id, body.id],
      });
      return NextResponse.json({ ok: true, tweet_id: posted.data.id, url: `https://x.com/i/status/${posted.data.id}` });
    } catch (e) {
      const msg = (e as Error).message;
      await db.execute({ sql: `UPDATE tweets SET status = 'failed', error = ? WHERE id = ?`, args: [msg, body.id] });
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
