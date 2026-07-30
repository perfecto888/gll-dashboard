const BASE = "https://api.close.com/api/v1";

function authHeader() {
  const key = process.env.CLOSE_API_KEY;
  if (!key) return null;
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

async function closeGet(path: string) {
  const auth = authHeader();
  if (!auth) throw new Error("CLOSE_API_KEY not set");
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Close API ${res.status}: ${await res.text()}`);
  return res.json();
}

export function closeConfigured() {
  return Boolean(process.env.CLOSE_API_KEY);
}

interface RawOpp {
  id: string;
  lead_id: string;
  lead_name: string;
  status_id: string;
  status_label: string;
  status_type: string;
  value: number;
  confidence: number;
  date_updated: string;
}

async function fetchAllOpportunities(): Promise<RawOpp[]> {
  const out: RawOpp[] = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = await closeGet(`/opportunity/?_limit=100&_skip=${skip}&_order_by=-date_updated`);
    out.push(...(page.data as RawOpp[]));
    if (!page.has_more) break;
  }
  return out;
}

export interface StageView {
  id: string;
  label: string;
  count: number;
  value: number;
  opps: { id: string; lead: string; lead_id: string; value: number; confidence: number; updated: string }[];
}

export interface PipelineView {
  id: string;
  name: string;
  totalValue: number;
  totalCount: number;
  stages: StageView[];
}

export async function getPipelineData() {
  const [pipelines, statuses, opps] = await Promise.all([
    closeGet("/pipeline/"),
    closeGet("/status/lead/"),
    fetchAllOpportunities(),
  ]);

  // group opportunities by status_id
  const byStatus = new Map<string, RawOpp[]>();
  for (const o of opps) {
    const arr = byStatus.get(o.status_id) ?? [];
    arr.push(o);
    byStatus.set(o.status_id, arr);
  }

  const pipelineViews: PipelineView[] = (
    pipelines.data as { id: string; name: string; statuses: { id: string; label: string }[] }[]
  ).map((p) => {
    const stages: StageView[] = p.statuses.map((s) => {
      const stageOpps = (byStatus.get(s.id) ?? []).map((o) => ({
        id: o.id,
        lead: o.lead_name,
        lead_id: o.lead_id,
        value: (o.value ?? 0) / 100,
        confidence: o.confidence,
        updated: o.date_updated,
      }));
      return {
        id: s.id,
        label: s.label,
        count: stageOpps.length,
        value: stageOpps.reduce((sum, o) => sum + o.value, 0),
        opps: stageOpps,
      };
    });
    return {
      id: p.id,
      name: p.name,
      totalValue: stages.reduce((s, st) => s + st.value, 0),
      totalCount: stages.reduce((s, st) => s + st.count, 0),
      stages,
    };
  });

  // GLL first, GLV second, rest after
  pipelineViews.sort((a, b) => {
    const rank = (n: string) => (n.startsWith("GLL") ? 0 : n === "GLV" ? 1 : 2);
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  });

  // lead counts per lead status (unchanged)
  const leadCounts = await Promise.all(
    (statuses.data as { id: string; label: string }[]).map(async (s) => {
      const r = await closeGet(
        `/lead/?_limit=0&query=${encodeURIComponent(`status:"${s.label}"`)}`
      );
      return { status: s.label, count: r.total_results as number };
    })
  );

  // focus: active opps — stale first, then by value*confidence
  const weekAgo = Date.now() - 7 * 86400_000;
  const focus = opps
    .filter((o) => o.status_type === "active")
    .map((o) => ({
      id: o.id,
      lead: o.lead_name,
      stage: o.status_label,
      value: (o.value ?? 0) / 100,
      confidence: o.confidence,
      updated: o.date_updated,
      stale: new Date(o.date_updated).getTime() < weekAgo,
      score: ((o.value ?? 0) / 100) * (o.confidence ?? 50) / 100,
    }))
    .sort((a, b) => Number(b.stale) - Number(a.stale) || b.score - a.score)
    .slice(0, 10);

  return { pipelines: pipelineViews, leadCounts, focus };
}
