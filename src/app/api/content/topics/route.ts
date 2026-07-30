import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureContentSchema, BRAND_VOICE } from "@/lib/content";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Topics = z.object({
  topics: z.array(
    z.object({
      topic: z.string().describe("article topic / working title"),
      angle: z.string().describe("one sentence: why this topic, what makes it worth writing now"),
    })
  ),
});

// POST { site } → research + propose 6 topics
export async function POST(req: NextRequest) {
  await ensureSchema();
  await ensureContentSchema();
  const body = await req.json().catch(() => ({}));
  const site = body.site === "quantis" ? "quantis" : "gll";
  const db = getDb();

  const existing = await db.execute({
    sql: `SELECT topic FROM content_posts WHERE site = ?
          UNION SELECT topic FROM content_topics WHERE site = ? AND status != 'dismissed'`,
    args: [site, site],
  });
  const taken = (existing.rows as unknown as { topic: string }[]).map((r) => r.topic).join("; ");

  const client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
  let response;
  try {
    response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are the content strategist for:\n\n${BRAND_VOICE[site]}\n\nPropose 6 blog article topics with strong SEO potential, drawing on the established, ongoing discussion themes and common questions in the peptide space.\n\nAlready covered (do not repeat): ${taken || "nothing yet"}\n\nEach topic must be evergreen enough to stay useful and specific enough to rank.`,
      },
    ],
    output_config: { effort: "medium", format: zodOutputFormat(Topics) },
    });
  } catch (e) {
    const msg = (e as Error).message;
    const busy = msg.includes("529") || msg.includes("overloaded") || msg.includes("timed out");
    return NextResponse.json({ error: busy ? "AI service is busy right now — try again in a minute." : msg }, { status: 503 });
  }

  const parsed = response.parsed_output;
  if (!parsed?.topics?.length) return NextResponse.json({ error: "No topics generated" }, { status: 502 });

  for (const t of parsed.topics) {
    await db.execute({
      sql: `INSERT INTO content_topics (site, topic, angle) VALUES (?, ?, ?)`,
      args: [site, t.topic, t.angle],
    });
  }
  return NextResponse.json({ added: parsed.topics.length, topics: parsed.topics });
}

// DELETE ?id= → dismiss a topic
export async function DELETE(req: NextRequest) {
  await ensureSchema();
  await ensureContentSchema();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Pass ?id=" }, { status: 400 });
  await getDb().execute({ sql: `UPDATE content_topics SET status = 'dismissed' WHERE id = ?`, args: [id] });
  return NextResponse.json({ ok: true });
}
