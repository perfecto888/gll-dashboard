import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureEmailSchema } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSchema();
  await ensureEmailSchema();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Pass ?id=" }, { status: 400 });
  const r = await getDb().execute({ sql: `SELECT * FROM email_campaigns WHERE id = ?`, args: [id] });
  if (!r.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ draft: r.rows[0] });
}
