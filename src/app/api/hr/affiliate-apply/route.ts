import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureHrSchema } from "@/lib/hr";
import { AFFILIATE_AUDIENCE, AFFILIATE_BACKGROUND, AFFILIATE_CHANNELS } from "@/lib/affiliateOptions";
import { brevo } from "@/lib/email";

export const dynamic = "force-dynamic";

// Public (middleware-excluded) endpoint behind /apply/affiliate/application.
// Saves the application to the HR tab, adds the lead to the Brevo list, appends a Google Sheet row, emails Sam a review,
// then the client sends them on to the Quantis affiliate signup.
const BREVO_LIST_ID = 29; // "GLL - Reject Candidates Quantis Affiliates"
const SHEET_ID = "1BOlkizK_HrccSZu3tYF2LRLr3Wr4hJTZuyBn0iv8X2E"; // "GLL - Quantis Affiliate Applications" (sam@ Drive)
const NEXT_URL = "https://quantispeptides.com/affiliate_signup.php?src=gll";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const NOTIFY_TO = "sam@goldenlotuslabs.com";

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

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Review email to Sam with every answer and a link to the applications sheet.
async function notifySam(rows: [string, string][], candidateMatch: boolean) {
  const table = rows
    .map(([q, a]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e2da;color:#6b6457;vertical-align:top;width:38%">${esc(q)}</td>`
      + `<td style="padding:8px 12px;border-bottom:1px solid #e5e2da;color:#111;white-space:pre-wrap">${esc(a || "—")}</td></tr>`)
    .join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px">
    <h2 style="margin:0 0 6px;color:#0e1729">New Quantis affiliate application</h2>
    <p style="margin:0 0 16px;color:#6b6457">${candidateMatch ? "This email matches a candidate in the HR tab (unverified)." : "No matching candidate in the HR tab."}
      They were added to Brevo list #${BREVO_LIST_ID} and sent on to the Quantis affiliate signup.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">${table}</table>
    <p style="margin:20px 0 0"><a href="${SHEET_URL}" style="background:#c9a84c;color:#0b0b0b;padding:12px 20px;text-decoration:none;font-weight:bold;display:inline-block">Open the applications Google Sheet</a></p>
    <p style="margin:12px 0 0;font-size:12px;color:#6b6457">All applications are also in the dashboard HR tab.</p>
  </div>`;
  await brevo("/smtp/email", "POST", {
    sender: { name: "GLL Dashboard", email: "sam@goldenlotuslabs.com" },
    to: [{ email: NOTIFY_TO, name: "Sam Harish" }],
    subject: "NEW QUANTIS AFFILIATE",
    htmlContent: html,
  });
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
  const [brevoRes, sheetRes, notifyRes] = await Promise.allSettled([
    addToBrevoList(email, first, rest.join(" ")),
    appendSheetRow([
      new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
      name, email, phone, location, channels.join(", "), audience, handle, background.join(", "), promoPlan,
      "Yes", "Yes", candidateId ? "Yes (email match)" : "No",
    ]),
    notifySam([
      ["Name", name], ["Email", email], ["Phone", phone], ["City / state", location],
      ["Where they'll share", channels.join(", ")], ["Audience size", audience], ["Handle / website", handle],
      ["Background", background.join(", ")], ["Promotion plan", promoPlan],
      ["18 or older", "Yes"], ["Compliance agreement", "Yes"],
    ], candidateId !== null),
  ]);
  if (notifyRes.status === "rejected") console.error("[affiliate-apply] Notify:", notifyRes.reason);
  if (brevoRes.status === "rejected") console.error("[affiliate-apply] Brevo:", brevoRes.reason);
  if (sheetRes.status === "rejected") console.error("[affiliate-apply] Sheet:", sheetRes.reason);
  await db.execute({
    sql: `UPDATE affiliate_applications SET brevo_ok = ?, sheet_ok = ? WHERE id = ?`,
    args: [brevoRes.status === "fulfilled" ? 1 : 0, sheetRes.status === "fulfilled" ? 1 : 0, appId],
  });

  return NextResponse.json({ ok: true, next: NEXT_URL });
}
