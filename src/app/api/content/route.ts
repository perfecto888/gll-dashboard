import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureContentSchema, BRAND_VOICE } from "@/lib/content";
import { ensureEmailSchema } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Article = z.object({
  title: z.string().describe("SEO title, under 65 chars"),
  headline: z.string().describe("On-page H1, may differ slightly from title"),
  slug: z.string().describe("url slug, kebab-case, no dates"),
  description: z.string().describe("meta description, under 155 chars"),
  tag: z.string().describe("short category tag, e.g. 'Research Peptides' or 'Practice Growth'"),
  body_html: z.string().describe("article body as clean HTML using only <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <table>, <thead>, <tbody>, <tr>, <th>, <td> — no <h1>, no inline styles, no scripts"),
});

// GET → list posts
export async function GET() {
  await ensureSchema();
  await ensureContentSchema();
  const posts = await getDb().execute(
    `SELECT id, site, topic, title, slug, tag, status, page_path, created_at, published_at
     FROM content_posts ORDER BY id DESC LIMIT 50`
  );
  const topics = await getDb().execute(
    `SELECT id, site, topic, angle, status FROM content_topics WHERE status = 'proposed' ORDER BY id DESC LIMIT 20`
  );
  const emailed = await ensureEmailSchema()
    .then(() => getDb().execute(`SELECT DISTINCT source_post_id FROM email_campaigns WHERE source_post_id IS NOT NULL`))
    .then((r) => r.rows.map((x) => Number(x.source_post_id)))
    .catch(() => [] as number[]);
  return NextResponse.json({ posts: posts.rows, topics: topics.rows, emailed });
}

// POST { action: "draft", site, topic, topic_id? } → generate article draft
// POST { action: "update", id, title?, body_html?, description? } → edit draft
export async function POST(req: NextRequest) {
  await ensureSchema();
  await ensureContentSchema();
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "Pass { action }" }, { status: 400 });

  if (body.action === "update") {
    const fields: string[] = [];
    const args: (string | number)[] = [];
    for (const k of ["title", "headline", "body_html", "description", "tag"] as const) {
      if (typeof body[k] === "string") { fields.push(`${k === "headline" ? "title" : k} = ?`); args.push(body[k]); }
    }
    if (!fields.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    args.push(body.id);
    await db.execute({ sql: `UPDATE content_posts SET ${fields.join(", ")} WHERE id = ?`, args });
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "draft") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const site = body.site === "quantis" ? "quantis" : "gll";
  if (!body.topic) return NextResponse.json({ error: "Pass { topic }" }, { status: 400 });

  const client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
  let response;
  try {
    response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `Write a complete blog article for this brand:\n\n${BRAND_VOICE[site]}\n\nTopic: ${body.topic}\n\nRequirements:\n- 1200–1800 words, well structured with <h2>/<h3> sections\n- Grounded in published peptide research; cite study types generally (no fabricated citations or fake author names)\n- ${site === "quantis" ? "Research-use-only framing throughout; zero dosing or human-use guidance." : "Speak to clinic owners/practitioners; practical, compliance-aware."}\n- End with a section on quality/purity standards (COAs, HPLC verification)\n- Return clean semantic HTML for the body.`,
      },
    ],
    output_config: { format: zodOutputFormat(Article) },
    });
  } catch (e) {
    const msg = (e as Error).message;
    const busy = msg.includes("529") || msg.includes("overloaded") || msg.includes("timed out");
    return NextResponse.json({ error: busy ? "AI service is busy right now — try again in a minute." : msg }, { status: 503 });
  }

  const a = response.parsed_output;
  if (!a) return NextResponse.json({ error: "Generation failed" }, { status: 502 });

  const r = await db.execute({
    sql: `INSERT INTO content_posts (site, topic, title, slug, description, tag, body_html, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
    args: [site, body.topic, a.headline, a.slug, a.description, a.tag, a.body_html],
  });
  if (body.topic_id) {
    await db.execute({ sql: `UPDATE content_topics SET status = 'drafted' WHERE id = ?`, args: [body.topic_id] });
  }
  return NextResponse.json({ id: Number(r.lastInsertRowid), ...a });
}
