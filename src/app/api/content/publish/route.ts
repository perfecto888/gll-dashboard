import { NextRequest, NextResponse } from "next/server";
import { Client as FtpClient } from "basic-ftp";
import { Readable } from "stream";
import tls from "tls";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureContentSchema } from "@/lib/content";
import { QUANTIS_TEMPLATE } from "@/lib/quantisTemplate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderQuantis(p: {
  title: string; description: string; tag: string; body_html: string; slug: string;
}) {
  const words = p.body_html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const date = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return QUANTIS_TEMPLATE
    .replaceAll("{{TITLE}}", esc(p.title))
    .replaceAll("{{DESCRIPTION}}", esc(p.description))
    .replaceAll("{{SHORT_TITLE}}", esc(p.title.split(":")[0].slice(0, 40)))
    .replaceAll("{{TAG}}", esc(p.tag))
    .replaceAll("{{HEADLINE}}", esc(p.title))
    .replaceAll("{{DATE}}", date)
    .replaceAll("{{READ_TIME}}", String(Math.max(3, Math.round(words / 220))))
    .replaceAll("{{HERO_CAPTION}}", esc(p.description))
    .replaceAll("{{BODY}}", p.body_html);
}

function indexCard(p: { title: string; description: string; tag: string; slug: string; body_html: string }) {
  const words = p.body_html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return `    <a href="blog/${p.slug}.html" class="blog-card" data-cat="gh">
      <div class="blog-thumb">
        <img src="https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=800&q=80" alt="${esc(p.title)}" loading="lazy" />
        <span class="blog-tag">${esc(p.tag)}</span>
      </div>
      <div class="blog-body">
        <div class="blog-meta">${esc(p.tag)} &nbsp;&bull;&nbsp; ${Math.max(3, Math.round(words / 220))} min read</div>
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.description)}</p>
        <span class="blog-link">Read Article <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
      </div>
    </a>
`;
}

async function publishToQuantis(post: { title: string; description: string; tag: string; body_html: string; slug: string }) {
  const ftp = new FtpClient(30000);
  await ftp.access({
    host: process.env.QUANTIS_FTP_HOST!,
    user: process.env.QUANTIS_FTP_USER!,
    password: process.env.QUANTIS_FTP_PASSWORD!,
    secure: true,
    secureOptions: {
      // Hostinger's FTP is reached by raw IP, but its cert is issued for
      // *.hstgr.io — checkServerIdentity() normally fails on the IP mismatch.
      // Verify against the known wildcard explicitly instead of disabling
      // certificate validation entirely.
      checkServerIdentity: (_hostname, cert) => tls.checkServerIdentity("hstgr.io", cert),
    },
  });
  try {
    // 1. article page
    const html = renderQuantis(post);
    await ftp.uploadFrom(Readable.from([html]), `/public_html/blog/${post.slug}.html`);

    // 2. add a card to the blog index (first grid) if not already present
    const chunks: Buffer[] = [];
    const { Writable } = await import("stream");
    await ftp.downloadTo(new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } }), "/public_html/blog.html");
    let index = Buffer.concat(chunks).toString("utf-8");
    if (!index.includes(`blog/${post.slug}.html`)) {
      const marker = index.match(/<div class="blog-grid"[^>]*>/);
      if (marker) {
        const at = index.indexOf(marker[0]) + marker[0].length;
        index = index.slice(0, at) + "\n" + indexCard(post) + index.slice(at);
        await ftp.uploadFrom(Readable.from([index]), "/public_html/blog.html");
      }
    }

    // 3. add the article to sitemap.xml so Google discovers it
    const smChunks: Buffer[] = [];
    const { Writable: W2 } = await import("stream");
    await ftp.downloadTo(new W2({ write(c, _e, cb) { smChunks.push(Buffer.from(c)); cb(); } }), "/public_html/sitemap.xml").catch(() => null);
    let sitemap = Buffer.concat(smChunks).toString("utf-8");
    const loc = `https://quantispeptides.com/blog/${post.slug}.html`;
    if (sitemap.includes("</urlset>") && !sitemap.includes(loc)) {
      const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      sitemap = sitemap.replace("</urlset>", `${entry}</urlset>`);
      await ftp.uploadFrom(Readable.from([sitemap]), "/public_html/sitemap.xml");
    }
  } finally {
    ftp.close();
  }
  return `/blog/${post.slug}.html`;
}

// POST { id } → publish a draft
export async function POST(req: NextRequest) {
  await ensureSchema();
  await ensureContentSchema();
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Pass { id }" }, { status: 400 });

  const res = await db.execute({ sql: `SELECT * FROM content_posts WHERE id = ?`, args: [body.id] });
  const post = res.rows[0] as unknown as {
    id: number; site: string; title: string; slug: string; description: string; tag: string; body_html: string;
  } | undefined;
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let pagePath: string;
  if (post.site === "quantis") {
    if (!process.env.QUANTIS_FTP_HOST) return NextResponse.json({ error: "FTP not configured" }, { status: 500 });
    pagePath = await publishToQuantis(post);
  } else {
    // gll: served by goldenlotuslabs.com/blog which reads from /api/content/public
    pagePath = `/blog/${post.slug}`;
  }

  await db.execute({
    sql: `UPDATE content_posts SET status = 'published', page_path = ?, published_at = datetime('now') WHERE id = ?`,
    args: [pagePath, post.id],
  });
  const url = post.site === "quantis"
    ? `https://quantispeptides.com${pagePath}`
    : `https://www.goldenlotuslabs.com${pagePath}`;
  return NextResponse.json({ ok: true, url, page_path: pagePath });
}
