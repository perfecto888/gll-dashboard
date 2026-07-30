import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureEmailSchema } from "@/lib/email";
import { ensureContentSchema } from "@/lib/content";
import { SCHWARTZ_FRAMEWORK } from "@/lib/copywriting";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Email = z.object({
  subject: z.string().describe("subject line under 60 chars — the headline, per the framework: one job, get the next line read"),
  preheader: z.string().describe("preview text under 100 chars, extends the subject's promise"),
  body_html: z.string().describe("email body INNER html only (goes inside a branded wrapper). Use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <blockquote>, <a>. No <html>/<head>/<body>, no <h1>, no images."),
});

function brief(brand: string, subject: string) {
  const compliance = brand === "quantis"
    ? `STRICT COMPLIANCE: frame everything as in-vitro / laboratory research only. Never give dosing, human-use, or treatment guidance. Write at an accessible ~8th-grade reading level while staying scientifically accurate. Audience: research buyers.`
    : `Audience: licensed clinic owners, med spa operators, and practice managers. Professional B2B clinical tone. Do NOT give dosing protocols or treatment instructions — practice/business education only.`;
  return `${SCHWARTZ_FRAMEWORK}

BRAND: ${brand === "quantis" ? "QuantisPeptides — research-peptide supplier" : "Golden Lotus Labs — peptide manufacturer/distributor that follows FDA guidelines"}
${compliance}

EMAIL SUBJECT MATTER: ${subject}

Write the complete email now: subject line, preheader, and body. This is one email in an every-other-day series to an engaged, opted-in list — assume "product-aware but unconvinced" unless the topic clearly implies otherwise. Close with a single momentum line bridging toward learning more (the CTA button is added automatically after your copy — do not write your own CTA button/link, just earn the bridge to it).`;
}

// POST { brand, mode: "peptide"|"topic", peptide? , topic? } → generate email draft
// POST { mode: "article", post_id }               → email digest of a published article
export async function POST(req: NextRequest) {
  await ensureSchema();
  await ensureEmailSchema();
  await ensureContentSchema();
  const body = await req.json().catch(() => null);
  const mode = body?.mode === "topic" ? "topic" : body?.mode === "article" ? "article" : "peptide";

  let brand = body?.brand === "quantis" ? "quantis" : "gll";
  let input = String(mode === "topic" ? body?.topic : body?.peptide ?? "").trim();
  let articleUrl = "";
  let sourcePostId: number | null = null;

  if (mode === "article") {
    if (!body?.post_id) return NextResponse.json({ error: "Pass { post_id }" }, { status: 400 });
    const r = await getDb().execute({ sql: `SELECT * FROM content_posts WHERE id = ?`, args: [body.post_id] });
    const post = r.rows[0] as unknown as {
      id: number; site: string; title: string; description: string | null; body_html: string; page_path: string | null; status: string;
    } | undefined;
    if (!post) return NextResponse.json({ error: "Article not found" }, { status: 404 });
    if (post.status !== "published" || !post.page_path) return NextResponse.json({ error: "Article is not published yet" }, { status: 400 });
    brand = post.site === "quantis" ? "quantis" : "gll";
    sourcePostId = post.id;
    input = post.title;
    const base = brand === "quantis" ? "https://quantispeptides.com" : "https://www.goldenlotuslabs.com";
    articleUrl = `${base}${post.page_path}?utm_source=email&utm_medium=newsletter&utm_campaign=article`;
  }
  if (!input) return NextResponse.json({ error: mode === "topic" ? "Pass { topic }" : "Pass { peptide }" }, { status: 400 });

  const client = new Anthropic({ maxRetries: 2, timeout: 150_000 });
  let response;
  try {
    if (mode === "article") {
      const r = await getDb().execute({ sql: `SELECT title, description, body_html FROM content_posts WHERE id = ?`, args: [sourcePostId] });
      const post = r.rows[0] as unknown as { title: string; description: string | null; body_html: string };
      const articleText = post.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 9000);
      response = await client.messages.parse({
        model: "claude-opus-4-8",
        max_tokens: 6000,
        messages: [{
          role: "user",
          content: `We just published this article and are emailing our list about it.

ARTICLE TITLE: ${post.title}
ARTICLE SUMMARY: ${post.description ?? ""}
ARTICLE TEXT: ${articleText}

${brief(brand, `our new article "${post.title}" — condense its most compelling insights into a short email that makes the reader want to read the full piece`)}

Keep the email SHORT (a teaser, not the whole article): pull the 2-3 strongest insights, don't try to cover everything. Do not link to the article yourself — a "Read the full article" button is appended automatically after your copy.`,
        }],
        output_config: { effort: "medium", format: zodOutputFormat(Email) },
      });
    } else if (mode === "topic") {
      // free-text topic: research first, then write, in one call
      response = await client.messages.parse({
        model: "claude-opus-4-8",
        max_tokens: 6000,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
        messages: [{
          role: "user",
          content: `Research this topic before writing: "${input}". Ground the email in what you find (general findings and study types — never fabricate specific citations).\n\n${brief(brand, input)}`,
        }],
        output_config: { effort: "medium", format: zodOutputFormat(Email) },
      });
    } else {
      response = await client.messages.parse({
        model: "claude-opus-4-8",
        max_tokens: 6000,
        messages: [{ role: "user", content: brief(brand, `the peptide "${input}" — what the published research literature reports about it`) }],
        output_config: { effort: "medium", format: zodOutputFormat(Email) },
      });
    }
  } catch (e) {
    const msg = (e as Error).message;
    const busy = msg.includes("529") || msg.includes("overloaded") || msg.includes("timed out");
    return NextResponse.json({ error: busy ? "AI service is busy — try again shortly." : msg }, { status: 503 });
  }

  const a = response.parsed_output;
  if (!a) return NextResponse.json({ error: "Generation failed" }, { status: 502 });

  let bodyHtml = a.body_html;
  if (articleUrl) {
    bodyHtml += `\n<p style="text-align:center;margin:28px 0 8px;"><a href="${articleUrl}" style="display:inline-block;background:#c9a84c;color:#101418;font-family:Arial,sans-serif;font-weight:700;font-size:14px;padding:13px 30px;border-radius:6px;text-decoration:none;">Read the full article &rarr;</a></p>`;
  }

  const r = await getDb().execute({
    sql: `INSERT INTO email_campaigns (brand, topic, subject, preheader, body_html, status, source_post_id) VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
    args: [brand, input, a.subject, a.preheader, bodyHtml, sourcePostId],
  });
  return NextResponse.json({ id: Number(r.lastInsertRowid), ...a });
}
