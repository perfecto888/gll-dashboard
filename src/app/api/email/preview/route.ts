import { NextRequest } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureEmailSchema, wrapEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// GET ?id= → full rendered HTML (for iframe preview). Not JSON — raw HTML response.
export async function GET(req: NextRequest) {
  await ensureSchema();
  await ensureEmailSchema();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });
  const r = await getDb().execute({ sql: `SELECT * FROM email_campaigns WHERE id = ?`, args: [id] });
  const draft = r.rows[0] as unknown as { brand: string; subject: string; preheader: string | null; body_html: string | null } | undefined;
  if (!draft) return new Response("Not found", { status: 404 });
  const html = wrapEmail(draft.brand, draft.subject ?? "", draft.preheader ?? "", draft.body_html ?? "");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
