import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureContentSchema } from "@/lib/content";

export const dynamic = "force-dynamic";

// GET ?id= → full post (incl. body) for the editor
export async function GET(req: NextRequest) {
  await ensureSchema();
  await ensureContentSchema();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Pass ?id=" }, { status: 400 });
  const r = await getDb().execute({ sql: `SELECT * FROM content_posts WHERE id = ?`, args: [id] });
  if (!r.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ post: r.rows[0] });
}
