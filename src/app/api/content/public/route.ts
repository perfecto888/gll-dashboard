import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureContentSchema } from "@/lib/content";

export const dynamic = "force-dynamic";

// Public, unauthenticated (middleware excludes this path): published GLL posts,
// consumed by goldenlotuslabs.com/blog at render time.
export async function GET(req: NextRequest) {
  await ensureSchema();
  await ensureContentSchema();
  const slug = req.nextUrl.searchParams.get("slug");
  const db = getDb();
  if (slug) {
    const r = await db.execute({
      sql: `SELECT title, slug, description, tag, body_html, published_at
            FROM content_posts WHERE site = 'gll' AND status = 'published' AND slug = ?`,
      args: [slug],
    });
    if (!r.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ post: r.rows[0] }, { headers: { "Cache-Control": "s-maxage=300" } });
  }
  const r = await db.execute(
    `SELECT title, slug, description, tag, published_at
     FROM content_posts WHERE site = 'gll' AND status = 'published'
     ORDER BY published_at DESC LIMIT 100`
  );
  return NextResponse.json({ posts: r.rows }, { headers: { "Cache-Control": "s-maxage=300" } });
}
