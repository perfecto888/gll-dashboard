import { getDb } from "./db";

let ready: Promise<void> | null = null;
export function ensureEmailSchema(): Promise<void> {
  if (!ready) {
    ready = getDb()
      .execute(
        `CREATE TABLE IF NOT EXISTS email_campaigns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          brand TEXT NOT NULL CHECK (brand IN ('gll','quantis')),
          topic TEXT NOT NULL,
          subject TEXT,
          preheader TEXT,
          body_html TEXT,          -- inner content HTML (wrapped in brand template at send time)
          status TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | sent
          brevo_campaign_id INTEGER,
          list_id INTEGER,
          scheduled_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          sent_at TEXT
        )`
      )
      .then(() =>
        getDb()
          .execute(`ALTER TABLE email_campaigns ADD COLUMN source_post_id INTEGER`)
          .catch(() => undefined) // column already exists
      )
      .then(() => undefined);
  }
  return ready;
}

export const BRAND_LISTS: Record<string, { signups: number; label: string; sender: { name: string; email: string } }> = {
  gll: {
    signups: 16,
    label: "GLL - Peptide Clinic List",
    sender: { name: "Sam Harish | Golden Lotus Labs", email: "sam@goldenlotuslabs.com" },
  },
  quantis: {
    signups: 18,
    label: "Quantis Peptides Sign Ups",
    sender: { name: "QuantisPeptides", email: "sam@goldenlotuslabs.com" },
  },
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Email-safe wrapper (inline styles, table layout) per brand. */
export function wrapEmail(brand: string, subject: string, preheader: string, inner: string): string {
  const gold = "#c9a84c";
  const navy = brand === "quantis" ? "#0a0f1e" : "#101418";
  const brandName = brand === "quantis" ? "QuantisPeptides" : "Golden Lotus Labs";
  const sub = brand === "quantis" ? "RESEARCH LIBRARY" : "CLINICAL EDUCATION";
  const site = brand === "quantis" ? "https://quantispeptides.com" : "https://www.goldenlotuslabs.com";
  const cta = brand === "quantis"
    ? `<a href="https://quantispeptides.com/register.php?utm_source=email&utm_medium=newsletter" style="display:inline-block;background:${gold};color:${navy};font-weight:700;font-size:14px;padding:14px 32px;border-radius:6px;text-decoration:none;">Create an Account</a>`
    : `<a href="https://www.goldenlotuslabs.com/sign-up?utm_source=email&utm_medium=newsletter" style="display:inline-block;background:${gold};color:${navy};font-weight:700;font-size:14px;padding:14px 32px;border-radius:6px;text-decoration:none;">Access the Partner Portal</a>`;
  const disclaimer = brand === "quantis"
    ? "For Research Use Only. All products are strictly intended for in-vitro laboratory research. Not for human or veterinary use."
    : "This content is for licensed healthcare professionals and practice operators. It is educational and not medical advice.";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f1ec;">
<span style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f1ec;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e2d8;">
  <tr><td style="background:${navy};padding:28px 36px;">
    <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:${gold};">${brandName}</div>
    <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:3px;color:#9ca3af;margin-top:4px;">${sub}</div>
  </td></tr>
  <tr><td style="padding:36px;font-family:Georgia,'Times New Roman',serif;color:#26251f;font-size:16px;line-height:1.75;">
    ${inner}
  </td></tr>
  <tr><td align="center" style="padding:8px 36px 36px;">${cta}</td></tr>
  <tr><td style="background:#faf9f5;border-top:1px solid #e5e2d8;padding:22px 36px;font-family:Arial,sans-serif;font-size:11px;color:#8a877c;line-height:1.6;">
    <p style="margin:0 0 8px;">${disclaimer}</p>
    <p style="margin:0;">${brandName} · <a href="${site}" style="color:#8a877c;">${site.replace("https://", "")}</a> · <a href="{{ unsubscribe }}" style="color:#8a877c;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function brevo(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.brevo.com/v3${path}`, {
    method,
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "content-type": "application/json",
      accept: "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json.message ?? `Brevo ${res.status}`);
  return json;
}
