import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureEmailSchema, BRAND_LISTS, wrapEmail, brevo } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Row {
  id: number; brand: string; topic: string; subject: string; preheader: string; body_html: string;
}

async function loadDraft(id: number): Promise<Row | undefined> {
  const r = await getDb().execute({ sql: `SELECT * FROM email_campaigns WHERE id = ?`, args: [id] });
  return r.rows[0] as unknown as Row | undefined;
}

// POST { action:"update", id, subject?, preheader?, body_html? }
// POST { action:"test", id, email }             → send one test email
// POST { action:"schedule", id, when? }          → create Brevo campaign to the brand list (draft or scheduled)
export async function POST(req: NextRequest) {
  await ensureSchema();
  await ensureEmailSchema();
  if (!process.env.BREVO_API_KEY) return NextResponse.json({ error: "BREVO_API_KEY not set" }, { status: 500 });
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body?.action || !body?.id) return NextResponse.json({ error: "Pass { action, id }" }, { status: 400 });

  if (body.action === "update") {
    const fields: string[] = [];
    const args: (string | number)[] = [];
    for (const k of ["subject", "preheader", "body_html"] as const) {
      if (typeof body[k] === "string") { fields.push(`${k} = ?`); args.push(body[k]); }
    }
    if (!fields.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    args.push(body.id);
    await db.execute({ sql: `UPDATE email_campaigns SET ${fields.join(", ")} WHERE id = ?`, args });
    return NextResponse.json({ ok: true });
  }

  const draft = await loadDraft(body.id);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const cfg = BRAND_LISTS[draft.brand];
  const html = wrapEmail(draft.brand, draft.subject, draft.preheader ?? "", draft.body_html ?? "");

  if (body.action === "test") {
    if (!body.email) return NextResponse.json({ error: "Pass { email }" }, { status: 400 });
    await brevo("/smtp/email", "POST", {
      sender: cfg.sender,
      to: [{ email: body.email }],
      subject: `[TEST] ${draft.subject}`,
      htmlContent: html.replace("{{ unsubscribe }}", "#"),
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "schedule") {
    // create a Brevo email campaign targeting the brand's signup list
    const campaign = await brevo("/emailCampaigns", "POST", {
      name: `${draft.brand.toUpperCase()} · ${draft.topic} · ${new Date().toISOString().slice(0, 10)}`,
      subject: draft.subject,
      sender: cfg.sender,
      type: "classic",
      htmlContent: html,
      recipients: { listIds: [cfg.signups] },
      ...(body.when ? { scheduledAt: body.when } : {}),
    });
    await db.execute({
      sql: `UPDATE email_campaigns SET status = ?, brevo_campaign_id = ?, list_id = ?, scheduled_at = ? WHERE id = ?`,
      args: [body.when ? "scheduled" : "draft", campaign.id, cfg.signups, body.when ?? null, draft.id],
    });
    return NextResponse.json({
      ok: true,
      campaign_id: campaign.id,
      scheduled: Boolean(body.when),
      dashboard: `https://app.brevo.com/camp/message/${campaign.id}`,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
