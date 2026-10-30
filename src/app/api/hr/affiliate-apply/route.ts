import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureHrSchema } from "@/lib/hr";
import { AFFILIATE_AUDIENCE, AFFILIATE_BACKGROUND, AFFILIATE_CHANNELS } from "@/lib/affiliateOptions";
import { brevo } from "@/lib/email";

export const dynamic = "force-dynamic";

// Public (middleware-excluded) endpoint behind /apply/affiliate/application.
// Saves the application to the HR tab, adds the lead to the Brevo list, appends a Google Sheet row,
// then the client sends them on to the Quantis affiliate signup.
const BREVO_LIST_ID = 29; // "GLL - Reject Candidates Quantis Affiliates"
const SHEET_ID = "1BOlkizK_HrccSZu3tYF2LRLr3Wr4hJTZuyBn0iv8X2E"; // "GLL - Quantis Affiliate Applications" (sam@ Drive)
const NEXT_URL = "https://quantispeptides.com/affiliate_signup.php?src=gll";

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pick = (v: unknown, allowed: string[]) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : []);

async function appendSheetRow(row: string[]) {
  const credsJson = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!credsJson) throw new Error("GA_SERVICE_ACCOUNT_JSON not set");
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets"], credentials: JSON.parse(credsJson) });
  const client = await auth.getClient();
  // RAW so an answer starting with "=" is stored as text, never evaluated as a formula
  await client.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: "POST",
    data: { values: [row] },
  });
}

// Unauthenticated input, so never overwrite an existing Brevo contact's attributes: create new contacts,
// and for an email Brevo already has, only add it to the list.
async function addToBrevoList(email: string, first: string, last: string) {
  try {
    await brevo("/contacts", "POST", { email, attributes: { FIRSTNAME: first, LASTNAME: last }, listIds: [BREVO_LIST_ID] });
  } catch (e) {
    if (!/already exist/i.test((e as Error).message)) throw e;
    await brevo(`/contacts/lists/${BREVO_LIST_ID}/contacts/add`, "POST", { emails: [email] });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (str(b.website)) return NextResponse.json({ ok: true, next: NEXT_URL }); // honeypot: bots fill the hidden field

  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  const phone = str(b.phone, 40);
  const location = str(b.location, 120);
  const channels = pick(b.channels, AFFILIATE_CHANNELS);
  const audience = AFFILIATE_AUDIENCE.includes(b.audience) ? (b.audience as string) : "";
  const handle = str(b.handle, 200);
  const background = pick(b.background, AFFILIATE_BACKGROUND);
  const promoPlan = str(b.promoPlan, 1500);

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || !location || !channels.length || !audience || !background.length || !promoPlan)
    return NextResponse.json({ error: "Please answer every required question." }, { status: 400 });
  if (b.adult !== true || b.compliance !== true)
    return NextResponse.json({ error: "Please confirm both agreements to continue." }, { status: 400 });

  await ensureSchema();
  await ensureHrSchema();
  const db = getDb();
  const match = await db.execute({ sql: `SELECT id FROM candidates WHERE lower(email) = ? ORDER BY id DESC LIMIT 1`, args: [email] });
  const candidateId = match.rows[0] ? Number(match.rows[0].id) : null;

  const ins = await db.execute({
    sql: `INSERT INTO affiliate_applications (candidate_id, name, email, phone, location, channels, audience_size, handle, background, promo_plan)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [candidateId, name, email, phone, location, channels.join(","), audience, handle, background.join(","), promoPlan],
  });
  const appId = Number(ins.lastInsertRowid);

  // Brevo and the sheet are best-effort: the application is already saved, so never block the applicant on them.
  const [first, ...rest] = name.split(/\s+/);
  const [brevoRes, sheetRes] = await Promise.allSettled([
    addToBrevoList(email, first, rest.join(" ")),
    appendSheetRow([
      new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
      name, email, phone, location, channels.join(", "), audience, handle, background.join(", "), promoPlan,
      "Yes", "Yes", candidateId ? "Yes (email match)" : "No",
    ]),
  ]);
  if (brevoRes.status === "rejected") console.error("[affiliate-apply] Brevo:", brevoRes.reason);
  if (sheetRes.status === "rejected") console.error("[affiliate-apply] Sheet:", sheetRes.reason);
  await db.execute({
    sql: `UPDATE affiliate_applications SET brevo_ok = ?, sheet_ok = ? WHERE id = ?`,
    args: [brevoRes.status === "fulfilled" ? 1 : 0, sheetRes.status === "fulfilled" ? 1 : 0, appId],
  });

  return NextResponse.json({ ok: true, next: NEXT_URL });
}
