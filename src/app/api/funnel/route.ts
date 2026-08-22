import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { getDb, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

const RANGE = [{ startDate: "30daysAgo", endDate: "today" }];

async function closeCount(query: string): Promise<number | null> {
  const key = process.env.CLOSE_API_KEY;
  if (!key) return null;
  const res = await fetch(
    `https://api.close.com/api/v1/lead/?_limit=0&query=${encodeURIComponent(query)}`,
    { headers: { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") }, cache: "no-store" }
  );
  if (!res.ok) return null;
  return (await res.json()).total_results as number;
}

export async function GET() {
  await ensureSchema();
  const db = getDb();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  // GA: sessions + partner-form page views (GLL property)
  let sessions: number | null = null;
  let formViews: number | null = null;
  if (process.env.GA_SERVICE_ACCOUNT_JSON && process.env.GA_PROPERTY_GLL) {
    try {
      const auth = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        credentials: JSON.parse(process.env.GA_SERVICE_ACCOUNT_JSON),
      });
      const client = await auth.getClient();
      const res = await client.request<{
        reports?: { rows?: { metricValues: { value: string }[] }[] }[];
      }>({
        url: `https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA_PROPERTY_GLL}:batchRunReports`,
        method: "POST",
        data: {
          requests: [
            { dateRanges: RANGE, metrics: [{ name: "sessions" }] },
            {
              dateRanges: RANGE,
              metrics: [{ name: "screenPageViews" }],
              dimensionFilter: {
                filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: "partner" } },
              },
            },
          ],
        },
      });
      sessions = Number(res.data.reports?.[0]?.rows?.[0]?.metricValues?.[0]?.value ?? 0);
      formViews = Number(res.data.reports?.[1]?.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    } catch {
      /* leave nulls */
    }
  }

  // Close: leads created in last 30 days
  const newLeads = await closeCount(`date_created >= "${since}"`).catch(() => null);

  // DB: orders + first-time customers in last 30 days
  const [orders30, newCustomers] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) AS c FROM purchase_orders WHERE order_date >= ?`,
      args: [since],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS c FROM (
              SELECT COALESCE(email, customer_name) AS cust, MIN(order_date) AS first_order
              FROM purchase_orders WHERE customer_name IS NOT NULL GROUP BY cust
            ) WHERE first_order >= ?`,
      args: [since],
    }),
  ]);

  return NextResponse.json({
    since,
    steps: [
      { label: "Website sessions", value: sessions, source: "GA · goldenlotuslabs.com" },
      { label: "Partner form views", value: formViews, source: "GA · pages containing 'partner'" },
      { label: "New leads created", value: newLeads, source: "Close" },
      { label: "Orders placed", value: Number((orders30.rows[0] as { c?: number })?.c ?? 0), source: "Orders DB" },
      { label: "First-time customers", value: Number((newCustomers.rows[0] as { c?: number })?.c ?? 0), source: "Orders DB" },
    ],
  });
}
