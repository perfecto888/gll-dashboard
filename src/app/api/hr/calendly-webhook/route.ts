import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureHrSchema } from "@/lib/hr";

export const dynamic = "force-dynamic";

// Calendly webhook payload (invitee.created / invitee.canceled) — subset we use.
interface CalendlyPayload {
  event: string;
  payload: {
    email?: string;
    name?: string;
    text_reminder_number?: string | null;
    scheduled_event?: {
      uri: string;
      start_time: string;
      end_time: string;
      location?: { join_url?: string };
    };
    uri?: string; // invitee uri, fallback
  };
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  await ensureHrSchema();
  const body = (await req.json().catch(() => null)) as CalendlyPayload | null;
  if (!body?.event) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  const db = getDb();
  const p = body.payload;
  const eventUri = p.scheduled_event?.uri ?? p.uri ?? null;

  if (body.event === "invitee.canceled") {
    if (eventUri) {
      await db.execute({
        sql: `UPDATE candidates SET status = 'rejected' WHERE calendly_event_uri = ?`,
        args: [eventUri],
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.event === "invitee.created") {
    if (!eventUri) return NextResponse.json({ error: "No event uri" }, { status: 400 });
    const existing = await db.execute({
      sql: `SELECT id FROM candidates WHERE calendly_event_uri = ?`,
      args: [eventUri],
    });
    if (existing.rows[0]) {
      return NextResponse.json({ ok: true, deduped: true });
    }
    // match an existing candidate by email if we already have one (e.g. manually added), else create
    const byEmail = p.email
      ? await db.execute({ sql: `SELECT id FROM candidates WHERE email = ? AND calendly_event_uri IS NULL ORDER BY id DESC LIMIT 1`, args: [p.email] })
      : { rows: [] as unknown[] };
    const existingId = (byEmail.rows[0] as { id: number } | undefined)?.id;

    if (existingId) {
      await db.execute({
        sql: `UPDATE candidates SET status = 'booked', calendly_event_uri = ?, calendly_join_url = ?, appt_start = ?, appt_end = ?, phone = COALESCE(phone, ?)
              WHERE id = ?`,
        args: [
          eventUri, p.scheduled_event?.location?.join_url ?? null,
          p.scheduled_event?.start_time ?? null, p.scheduled_event?.end_time ?? null,
          p.text_reminder_number ?? null, existingId,
        ],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO candidates (name, email, phone, source, status, calendly_event_uri, calendly_join_url, appt_start, appt_end)
              VALUES (?, ?, ?, 'indeed', 'booked', ?, ?, ?, ?)`,
        args: [
          p.name ?? null, p.email ?? null, p.text_reminder_number ?? null,
          eventUri, p.scheduled_event?.location?.join_url ?? null,
          p.scheduled_event?.start_time ?? null, p.scheduled_event?.end_time ?? null,
        ],
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: body.event });
}
