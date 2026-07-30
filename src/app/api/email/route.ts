import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureEmailSchema, BRAND_LISTS, brevo } from "@/lib/email";

export const dynamic = "force-dynamic";

// GET → list health + drafts + Brevo campaign stats
export async function GET() {
  await ensureSchema();
  await ensureEmailSchema();
  if (!process.env.BREVO_API_KEY) return NextResponse.json({ configured: false });

  const [drafts, listsRes, campaignsRes] = await Promise.all([
    getDb().execute(
      `SELECT id, brand, topic, subject, status, list_id, scheduled_at, sent_at, brevo_campaign_id, created_at
       FROM email_campaigns ORDER BY id DESC LIMIT 40`
    ),
    Promise.all(
      Object.entries(BRAND_LISTS).map(async ([brand, cfg]) => {
        try {
          const l = await brevo(`/contacts/lists/${cfg.signups}`);
          return { brand, id: cfg.signups, name: l.name, subscribers: l.totalSubscribers ?? 0 };
        } catch {
          return { brand, id: cfg.signups, name: cfg.label, subscribers: null };
        }
      })
    ),
    brevo(`/emailCampaigns?limit=25&sort=desc&statistics=globalStats`).catch(() => ({ campaigns: [] })),
  ]);

  interface BrevoCampaign {
    id: number; name: string; subject: string; status: string;
    statistics?: { globalStats?: { sent?: number; uniqueViews?: number; uniqueClicks?: number; unsubscriptions?: number } };
    sentDate?: string; scheduledAt?: string;
  }
  const campaigns = ((campaignsRes.campaigns ?? []) as BrevoCampaign[]).map((c) => ({
    id: c.id,
    name: c.name,
    subject: c.subject,
    status: c.status,
    sent: c.statistics?.globalStats?.sent ?? 0,
    opens: c.statistics?.globalStats?.uniqueViews ?? 0,
    clicks: c.statistics?.globalStats?.uniqueClicks ?? 0,
    unsubs: c.statistics?.globalStats?.unsubscriptions ?? 0,
    when: c.sentDate ?? c.scheduledAt ?? null,
  }));

  return NextResponse.json({ configured: true, lists: listsRes, drafts: drafts.rows, campaigns });
}
