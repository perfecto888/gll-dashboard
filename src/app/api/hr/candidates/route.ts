import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureHrSchema } from "@/lib/hr";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  await ensureHrSchema();
  const r = await getDb().execute(
    `SELECT * FROM candidates ORDER BY
       CASE WHEN appt_start IS NOT NULL AND appt_start >= datetime('now') THEN 0 ELSE 1 END,
       appt_start ASC, id DESC`
  );
  return NextResponse.json({ candidates: r.rows });
}

// POST { action: "create", name?, email?, phone?, source? }
// POST { action: "update", id, field, value }   → toggle a doc flag / edit notes / set status / categories
// POST { action: "delete", id }
export async function POST(req: NextRequest) {
  await ensureSchema();
  await ensureHrSchema();
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "Pass { action }" }, { status: 400 });

  if (body.action === "create") {
    const r = await db.execute({
      sql: `INSERT INTO candidates (name, email, phone, source) VALUES (?, ?, ?, ?)`,
      args: [body.name ?? null, body.email ?? null, body.phone ?? null, body.source ?? "indeed"],
    });
    return NextResponse.json({ id: Number(r.lastInsertRowid) });
  }

  if (body.action === "update") {
    const allowed = new Set([
      "name", "email", "phone", "status", "categories", "notes",
      "comm_agreement", "ncnda", "gusto", "training",
    ]);
    if (!body.id || !allowed.has(body.field)) return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    await db.execute({
      sql: `UPDATE candidates SET ${body.field} = ? WHERE id = ?`,
      args: [body.value, body.id],
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    await db.execute({ sql: `DELETE FROM candidates WHERE id = ?`, args: [body.id] });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
