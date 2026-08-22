"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import dynamic from "next/dynamic";
const USMap = dynamic(() => import("@/components/USMap"), { ssr: false });
const ContentStudio = dynamic(() => import("@/components/ContentStudio"), { ssr: false });
const EmailStudio = dynamic(() => import("@/components/EmailStudio"), { ssr: false });
const HRStudio = dynamic(() => import("@/components/HRStudio"), { ssr: false });

const C = {
  s1: "var(--series-1)",
  s2: "var(--series-2)",
  s3: "#c9a84c",
  grid: "var(--gridline)",
  muted: "var(--muted)",
};

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;

interface StageView {
  id: string;
  label: string;
  count: number;
  value: number;
  opps: { id: string; lead: string; lead_id: string; value: number; confidence: number; updated: string }[];
}
interface PipelineView {
  id: string;
  name: string;
  totalValue: number;
  totalCount: number;
  stages: StageView[];
}
interface CloseData {
  configured: boolean;
  error?: string;
  pipelines?: PipelineView[];
  leadCounts?: { status: string; count: number }[];
  focus?: { id: string; lead: string; stage: string; value: number; confidence: number; updated: string; stale: boolean }[];
}
interface OrdersData {
  totals: { orders: number; units: number; revenue: number; customers: number };
  topProducts: { product: string; units: number; revenue: number; orders: number }[];
  topBuyers: { customer_name: string; email: string | null; orders: number; spend: number; first_order: string | null; last_order: string | null }[];
  revenueByMonth: { month: string; revenue: number; orders: number }[];
  recent: { order_number: string | null; order_date: string | null; customer_name: string | null; total: number | null; source: string; menu: string | null; products: string | null; units: number; carrier: string | null; tracking_number: string | null; tracking_url: string | null }[];
}
interface TrafficSite {
  key: string;
  label: string;
  daily: { date: string; sessions: number; users: number }[];
  totals: { sessions: number; users: number; pageViews: number; bounceRate: number; avgSessionSec: number; newUsers: number } | null;
  channels: { channel: string; sessions: number; bounceRate: number }[];
  states: { state: string; sessions: number; users: number }[];
  cities: { city: string; sessions: number; users: number }[];
  pages: { page: string; views: number; sessions: number; bounceRate: number }[];
}
interface TrafficData {
  configured: boolean;
  error?: string;
  sites?: TrafficSite[];
}
interface BuyerRow { customer_name: string | null; email: string | null; units: number; spend: number; orders: number }

type View = "overview" | "pipeline" | "orders" | "buyers" | "marketing" | "content" | "email" | "hr" | "traffic";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "pipeline", label: "Pipeline", icon: "◮" },
  { id: "orders", label: "Orders", icon: "▤" },
  { id: "buyers", label: "Buyers", icon: "◉" },
  { id: "marketing", label: "Marketing", icon: "✦" },
  { id: "content", label: "Content", icon: "✎" },
  { id: "email", label: "Email", icon: "✉" },
  { id: "hr", label: "HR", icon: "👥" },
  { id: "traffic", label: "Traffic", icon: "∿" },
];

function Card({ title, children, right, wide }: { title: string; children: React.ReactNode; right?: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`card${wide ? " wide" : ""}`}>
      <div className="card-head">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`stat${accent ? " accent" : ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-glow)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--text-primary)",
};

export default function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [close, setClose] = useState<CloseData | null>(null);
  const [orders, setOrders] = useState<OrdersData | null>(null);
  const [traffic, setTraffic] = useState<TrafficData | null>(null);
  const [uploadMsg, setUploadMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [drill, setDrill] = useState<{ product: string; buyers: BuyerRow[] } | null>(null);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [activeSite, setActiveSite] = useState<string | null>(null);
  const [menuFilter, setMenuFilter] = useState<"all" | "GLL" | "Quantis">("all");
  const [monthFilter, setMonthFilter] = useState<string>(""); // "" = overall, else "YYYY-MM"
  const [geoStats, setGeoStats] = useState<{ state: string; orders: number; revenue: number }[]>([]);
  const [geoCoverage, setGeoCoverage] = useState<{
    totalStates: number; coveredCount: number; uncoveredCount: number;
    covered: { code: string; name: string }[]; uncovered: { code: string; name: string }[];
  } | null>(null);
  const [showUncovered, setShowUncovered] = useState(false);
  const [geoState, setGeoState] = useState<{ code: string; name: string } | null>(null);
  const [geoDetail, setGeoDetail] = useState<{
    byMonth: { month: string; orders: number; revenue: number }[];
    topClients: { customer_name: string; city: string | null; orders: number; spend: number }[];
    orders: { order_number: string | null; order_date: string | null; customer_name: string | null; city: string | null; address: string | null; total: number | null; products: string | null }[];
  } | null>(null);
  const [insights, setInsights] = useState<{
    affiliates: { affiliate: string; orders: number; revenue: number; commission: number; commission_unpaid: number; last_order: string | null }[];
    unpaid: { order_number: string | null; order_date: string | null; customer_name: string | null; affiliate: string | null; total: number | null; commission: number | null }[];
    unpaidTotal: number;
    atRisk: { customer_name: string; email: string | null; orders: number; ltv: number; last_order: string; days_quiet: number }[];
    repeatRate: number | null;
    customers: number;
  } | null>(null);
  const [funnel, setFunnel] = useState<{ steps: { label: string; value: number | null; source: string }[] } | null>(null);
  const [utm, setUtm] = useState({ site: "https://www.goldenlotuslabs.com", source: "linkedin", medium: "social", campaign: "" });
  const [utmCopied, setUtmCopied] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);

  const loadOrders = useCallback(() => {
    const monthQ = monthFilter ? `&month=${monthFilter}` : "";
    fetch(`/api/orders?menu=${menuFilter}${monthQ}`).then((r) => r.json()).then(setOrders).catch(() => {});
    fetch(`/api/orders/geo?menu=${menuFilter}`).then((r) => r.json()).then((j) => { setGeoStats(j.states ?? []); setGeoCoverage(j.coverage ?? null); }).catch(() => {});
    fetch(`/api/orders/insights?menu=${menuFilter}`).then((r) => r.json()).then(setInsights).catch(() => {});
  }, [menuFilter, monthFilter]);

  const selectGeoState = useCallback((code: string, name: string) => {
    setGeoState({ code, name });
    setGeoDetail(null);
    fetch(`/api/orders/geo?menu=${menuFilter}&state=${code}`)
      .then((r) => r.json())
      .then(setGeoDetail)
      .catch(() => {});
  }, [menuFilter]);

  useEffect(() => {
    fetch("/api/close").then((r) => r.json()).then(setClose).catch(() => setClose({ configured: false }));
    fetch("/api/traffic").then((r) => r.json()).then(setTraffic).catch(() => setTraffic({ configured: false }));
    fetch("/api/funnel").then((r) => r.json()).then(setFunnel).catch(() => {});
    loadOrders();
  }, [loadOrders]);

  async function upload(kind: "upload" | "screenshot", file: File) {
    setBusy(true);
    setUploadMsg(kind === "screenshot" ? "Extracting order from screenshot with Claude…" : "Parsing spreadsheet…");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/orders/${kind}`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) setUploadMsg(`Error: ${j.error}`);
      else {
        setUploadMsg(`Added ${j.inserted} line item${j.inserted === 1 ? "" : "s"}.`);
        loadOrders();
      }
    } catch (e) {
      setUploadMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const pipelines = close?.pipelines ?? [];
  const currentPipeline =
    pipelines.find((p) => p.id === activePipeline) ?? pipelines[0] ?? null;
  const selectedStage = currentPipeline?.stages.find((s) => s.id === activeStage) ?? null;
  const pipelineValue = pipelines.reduce((s, p) => s + p.totalValue, 0);

  const sites = traffic?.sites ?? [];
  const currentSite = sites.find((s) => s.key === activeSite) ?? sites[0] ?? null;

  const trafficData = (() => {
    if (sites.length === 0) return [];
    const map = new Map<string, Record<string, string | number>>();
    for (const s of sites) {
      for (const r of s.daily) {
        const e = map.get(r.date) ?? { date: r.date };
        e[s.key] = r.sessions;
        map.set(r.date, e);
      }
    }
    return [...map.values()]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((d) => ({ ...d, label: `${String(d.date).slice(4, 6)}/${String(d.date).slice(6, 8)}` }));
  })();

  const fmtDur = (sec: number) => `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  const fmtPct = (r: number) => `${Math.round(r * 100)}%`;

  /* ---------- reusable cards ---------- */

  const uploadButtons = (
    <div className="upload-row">
      <button disabled={busy} onClick={() => csvRef.current?.click()}>⇪ CSV / Excel</button>
      <button disabled={busy} onClick={() => shotRef.current?.click()}>⌗ Screenshot</button>
      <input ref={csvRef} type="file" accept=".csv,.xlsx,.xls" hidden
        onChange={(e) => e.target.files?.[0] && upload("upload", e.target.files[0])} />
      <input ref={shotRef} type="file" accept="image/*" hidden
        onChange={(e) => e.target.files?.[0] && upload("screenshot", e.target.files[0])} />
    </div>
  );

  const pipelineCard = (
    <Card
      title="Sales pipeline · Close"
      wide
      right={
        pipelines.length > 0 ? (
          <div className="tabs">
            {pipelines.map((p) => (
              <button
                key={p.id}
                className={`tab${(currentPipeline?.id === p.id) ? " active" : ""}`}
                onClick={() => { setActivePipeline(p.id); setActiveStage(null); }}
              >
                {p.name.replace(" Pipeline", "")}
                <span className="tab-badge">{p.totalCount}</span>
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      {!close && <p className="empty">Loading…</p>}
      {close && !close.configured && <p className="empty">Add <code>CLOSE_API_KEY</code> to connect Close.</p>}
      {close?.error && <p className="empty">Close error: {close.error}</p>}
      {currentPipeline && (
        <>
          <p className="pipeline-summary">
            {currentPipeline.name}: <b>{currentPipeline.totalCount}</b> opportunities · <b>{fmtMoney(currentPipeline.totalValue)}</b> total value
          </p>
          <div className="stage-list">
            {currentPipeline.stages.map((s) => {
              const max = Math.max(1, ...currentPipeline.stages.map((x) => x.count));
              return (
                <button
                  key={s.id}
                  className={`stage-row${activeStage === s.id ? " active" : ""}`}
                  onClick={() => setActiveStage(activeStage === s.id ? null : s.id)}
                >
                  <span className="stage-label">{s.label}</span>
                  <span className="stage-bar-track">
                    <span className="stage-bar" style={{ width: `${(s.count / max) * 100}%` }} />
                  </span>
                  <span className="stage-count">{s.count}</span>
                  <span className="stage-value">{s.value > 0 ? fmtMoney(s.value) : "—"}</span>
                </button>
              );
            })}
          </div>
          {selectedStage && (
            <div className="stage-detail">
              <h3>{selectedStage.label} — {selectedStage.count} client{selectedStage.count === 1 ? "" : "s"}</h3>
              {selectedStage.opps.length === 0 ? (
                <p className="empty">No opportunities in this stage.</p>
              ) : (
                <table>
                  <thead><tr><th>Client</th><th className="num">Value</th><th className="num">Confidence</th><th>Last activity</th><th></th></tr></thead>
                  <tbody>
                    {selectedStage.opps.map((o) => (
                      <tr key={o.id}>
                        <td>{o.lead}</td>
                        <td className="num">{o.value > 0 ? fmtMoney(o.value) : "—"}</td>
                        <td className="num">{o.confidence != null ? `${o.confidence}%` : "—"}</td>
                        <td>{o.updated?.slice(0, 10) ?? "—"}</td>
                        <td>
                          <a className="close-link" href={`https://app.close.com/lead/${o.lead_id}/`} target="_blank" rel="noreferrer">
                            open in Close ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <p className="hint">Click a stage to see the clients in it.</p>
        </>
      )}
      {close?.leadCounts && close.leadCounts.filter((l) => l.count > 0).length > 0 && (
        <div className="chips">
          {close.leadCounts.filter((l) => l.count > 0).map((l) => (
            <span key={l.status} className="chip">{l.status} <b>{l.count.toLocaleString()}</b></span>
          ))}
        </div>
      )}
    </Card>
  );

  const focusCard = (
    <Card title="Who to focus on">
      {!close?.focus?.length ? (
        <p className="empty">Connect Close to see prioritized opportunities.</p>
      ) : (
        <table>
          <thead><tr><th>Lead</th><th>Stage</th><th className="num">Value</th><th>Why</th></tr></thead>
          <tbody>
            {close.focus.map((f) => (
              <tr key={f.id}>
                <td>{f.lead}</td>
                <td>{f.stage}</td>
                <td className="num">{fmtMoney(f.value)}</td>
                <td>{f.stale ? <span className="flag">no touch 7d+</span> : <span className="ok">high value</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );

  const topPeptidesCard = (
    <Card title="Top peptides by units" right={uploadButtons}>
      {uploadMsg && <p className="msg">{uploadMsg}</p>}
      {!orders?.topProducts?.length ? (
        <p className="empty">No orders yet — upload a spreadsheet or an order screenshot.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, orders.topProducts.length * 44)}>
          <BarChart data={orders.topProducts} layout="vertical" margin={{ left: 8, right: 40 }}>
            <CartesianGrid horizontal={false} stroke={C.grid} />
            <XAxis type="number" tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="product" width={220} tick={{ fill: "var(--text-primary)", fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--gridline)", opacity: 0.4 }} />
            <Bar
              dataKey="units" name="Units" fill={C.s1} radius={[0, 4, 4, 0]} barSize={16}
              cursor="pointer"
              onClick={(d) => {
                const product = (d as { payload?: { product?: string } })?.payload?.product;
                if (!product) return;
                fetch(`/api/orders?menu=${menuFilter}&product=${encodeURIComponent(product)}`)
                  .then((r) => r.json())
                  .then((j) => { setDrill({ product: j.product, buyers: j.buyers }); setView("buyers"); });
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
      <p className="hint">Click a bar to see who buys that peptide.</p>
    </Card>
  );

  const revenueCard = (
    <Card
      title={monthFilter ? `Order revenue by month — viewing ${monthFilter}` : "Order revenue by month"}
      right={monthFilter ? <button onClick={() => setMonthFilter("")}>✕ Show overall</button> : undefined}
    >
      {!orders?.revenueByMonth?.length ? (
        <p className="empty">Upload dated orders to see the trend.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={orders.revenueByMonth} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtMoney} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(Number(v))} />
            <Line
              type="monotone" dataKey="revenue" name="Revenue" stroke={C.s1} strokeWidth={2}
              dot={{ r: 4, fill: C.s1, cursor: "pointer" }}
              activeDot={{ r: 6, cursor: "pointer", onClick: (_e, p) => {
                const m = (p as unknown as { payload?: { month?: string } })?.payload?.month;
                if (m) setMonthFilter(m);
              } }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      <p className="hint">Click a point on the line to drill into that month.</p>
    </Card>
  );

  const monthOptions = [...(orders?.revenueByMonth ?? [])].map((m) => m.month).sort().reverse();

  const recentCard = (
    <Card
      title={monthFilter ? `Orders — ${monthFilter}` : "Recent orders"}
      wide
      right={
        <div className="upload-row">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "var(--text-primary)" }}
          >
            <option value="">Overall (most recent)</option>
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {monthFilter && <button onClick={() => setMonthFilter("")}>✕ Clear</button>}
        </div>
      }
    >
      {!orders?.recent?.length ? (
        <p className="empty">{monthFilter ? `No orders in ${monthFilter}.` : "Nothing uploaded yet."}</p>
      ) : (
        <table>
          <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th className="num">Units</th><th className="num">Total</th><th>Tracking</th><th>Src</th></tr></thead>
          <tbody>
            {orders.recent.map((r, i) => (
              <tr key={i}>
                <td className="mono">
                  {r.order_number ?? "—"}
                  {r.menu === "Quantis" && <span className="menu-badge">Q</span>}
                </td>
                <td>{r.order_date ?? "—"}</td>
                <td>{r.customer_name ?? "—"}</td>
                <td className="items-cell">{r.products ?? "—"}</td>
                <td className="num">{r.units}</td>
                <td className="num">{r.total != null ? fmtMoney(r.total) : "—"}</td>
                <td>
                  {r.tracking_url ? (
                    <a className="close-link" href={r.tracking_url} target="_blank" rel="noreferrer">
                      {r.carrier ? `${r.carrier} ` : ""}{r.tracking_number} ↗
                    </a>
                  ) : (
                    <span className="dim">—</span>
                  )}
                </td>
                <td>{r.source === "screenshot" ? "⌗" : "▤"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );

  const buyersCard = (
    <Card
      title="Customer lifetime value"
      wide
      right={
        <div className="tabs">
          {(["all", "GLL", "Quantis"] as const).map((m) => (
            <button key={m} className={`tab${menuFilter === m ? " active" : ""}`} onClick={() => setMenuFilter(m)}>
              {m === "all" ? "All menus" : m}
            </button>
          ))}
        </div>
      }
    >
      {!orders?.topBuyers?.length ? (
        <p className="empty">Upload orders to see your biggest customers.</p>
      ) : (
        <table>
          <thead><tr><th>#</th><th>Customer</th><th className="num">Orders</th><th className="num">Avg order</th><th>Customer since</th><th>Last order</th><th className="num">Lifetime value</th></tr></thead>
          <tbody>
            {orders.topBuyers.map((b, i) => (
              <tr key={i}>
                <td className="dim">{i + 1}</td>
                <td>{b.customer_name}<span className="dim"> {b.email ?? ""}</span></td>
                <td className="num">{b.orders}</td>
                <td className="num">{fmtMoney(b.spend / b.orders)}</td>
                <td>{b.first_order ?? "—"}</td>
                <td>{b.last_order ?? "—"}</td>
                <td className="num ltv">{fmtMoney(b.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );

  const drillCard = drill && (
    <Card title={`Top buyers — ${drill.product}`} right={<button onClick={() => setDrill(null)}>✕ Close</button>}>
      <table>
        <thead><tr><th>Buyer</th><th>Email</th><th className="num">Units</th><th className="num">Orders</th><th className="num">Spend</th></tr></thead>
        <tbody>
          {drill.buyers.map((b, i) => (
            <tr key={i}>
              <td>{b.customer_name ?? "—"}</td>
              <td className="dim">{b.email ?? "—"}</td>
              <td className="num">{b.units}</td>
              <td className="num">{b.orders}</td>
              <td className="num">{fmtMoney(b.spend)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );

  const trafficView = (
    <>
      {!traffic && <p className="empty">Loading…</p>}
      {traffic && !traffic.configured && (
        <p className="empty">
          Add GA4 env vars (<code>GA_SERVICE_ACCOUNT_JSON</code>, <code>GA_PROPERTY_GLL</code>, <code>GA_PROPERTY_QUANTIS</code>) to connect traffic.
        </p>
      )}
      {traffic?.error && <p className="empty">GA error: {traffic.error}</p>}
      {currentSite && (
        <>
          {sites.length > 1 && (
            <div className="tabs" style={{ marginBottom: 14 }}>
              {sites.map((s) => (
                <button key={s.key} className={`tab${currentSite.key === s.key ? " active" : ""}`} onClick={() => setActiveSite(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {currentSite.totals && (
            <div className="stats">
              <Stat label="Sessions · 30d" value={currentSite.totals.sessions.toLocaleString()} accent />
              <Stat label="Users" value={currentSite.totals.users.toLocaleString()} />
              <Stat label="Page views" value={currentSite.totals.pageViews.toLocaleString()} />
              <Stat label="Bounce rate" value={fmtPct(currentSite.totals.bounceRate)} />
              <Stat label="Avg session" value={fmtDur(currentSite.totals.avgSessionSec)} />
            </div>
          )}
          <div className="grid">
            <Card title="Sessions · last 30 days" wide>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trafficData} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {sites.map((s, i) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={[C.s1, C.s3, C.s2][i] ?? C.s2} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card title={`Daily count · ${currentSite.label}`}>
              {!currentSite.daily.length ? <p className="empty">No daily data yet.</p> : (
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  <table>
                    <thead><tr><th>Date</th><th className="num">Sessions</th><th className="num">Users</th></tr></thead>
                    <tbody>
                      {[...currentSite.daily].reverse().map((d) => (
                        <tr key={d.date}>
                          <td>{`${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`}</td>
                          <td className="num">{d.sessions.toLocaleString()}</td>
                          <td className="num">{d.users.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Where traffic comes from">
              {!currentSite.channels.length ? <p className="empty">No channel data yet.</p> : (
                <table>
                  <thead><tr><th>Channel</th><th className="num">Sessions</th><th className="num">Bounce</th></tr></thead>
                  <tbody>
                    {currentSite.channels.map((c) => (
                      <tr key={c.channel}>
                        <td>{c.channel}</td>
                        <td className="num">{c.sessions.toLocaleString()}</td>
                        <td className="num">{fmtPct(c.bounceRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Top pages">
              {!currentSite.pages.length ? <p className="empty">No page data yet.</p> : (
                <table>
                  <thead><tr><th>Page</th><th className="num">Views</th><th className="num">Bounce</th></tr></thead>
                  <tbody>
                    {currentSite.pages.map((p) => (
                      <tr key={p.page}>
                        <td className="items-cell mono">{p.page}</td>
                        <td className="num">{p.views.toLocaleString()}</td>
                        <td className="num">{fmtPct(p.bounceRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Top 10 states">
              {!currentSite.states.length ? <p className="empty">No US state data yet.</p> : (
                <table>
                  <thead><tr><th>State</th><th className="num">Sessions</th><th className="num">Users</th></tr></thead>
                  <tbody>
                    {currentSite.states.map((s) => (
                      <tr key={s.state}>
                        <td>{s.state}</td>
                        <td className="num">{s.sessions.toLocaleString()}</td>
                        <td className="num">{s.users.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Top 10 cities">
              {!currentSite.cities.length ? <p className="empty">No city data yet.</p> : (
                <table>
                  <thead><tr><th>City</th><th className="num">Sessions</th><th className="num">Users</th></tr></thead>
                  <tbody>
                    {currentSite.cities.map((c) => (
                      <tr key={c.city}>
                        <td>{c.city}</td>
                        <td className="num">{c.sessions.toLocaleString()}</td>
                        <td className="num">{c.users.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );

  const utmUrl = (() => {
    const u = new URL(utm.site);
    if (utm.source) u.searchParams.set("utm_source", utm.source);
    if (utm.medium) u.searchParams.set("utm_medium", utm.medium);
    if (utm.campaign) u.searchParams.set("utm_campaign", utm.campaign.replace(/\s+/g, "-").toLowerCase());
    return u.toString();
  })();

  const funnelCard = (
    <Card title="Conversion funnel · last 30 days" wide>
      {!funnel ? <p className="empty">Loading…</p> : (
        <div className="funnel">
          {funnel.steps.map((st, i) => {
            const first = funnel.steps.find((x) => x.value != null)?.value ?? 1;
            const pct = st.value != null && first ? Math.max(4, (st.value / first) * 100) : 0;
            return (
              <div key={i} className="funnel-step">
                <div className="funnel-meta">
                  <span className="funnel-label">{st.label}</span>
                  <span className="funnel-src">{st.source}</span>
                </div>
                <div className="funnel-bar-track">
                  <div className="funnel-bar" style={{ width: `${pct}%` }} />
                  <span className="funnel-value">{st.value != null ? st.value.toLocaleString() : "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );

  const utmCard = (
    <Card title="Campaign link builder">
      <p className="hint" style={{ marginTop: 0 }}>
        Use these links in emails, posts, and DMs — traffic shows up by source in the Traffic view instead of &quot;Direct&quot;.
      </p>
      <div className="utm-form">
        <select value={utm.site} onChange={(e) => setUtm({ ...utm, site: e.target.value })}>
          <option value="https://www.goldenlotuslabs.com">goldenlotuslabs.com</option>
          <option value="https://quantispeptides.com">quantispeptides.com</option>
        </select>
        <select value={utm.source} onChange={(e) => setUtm({ ...utm, source: e.target.value })}>
          {["linkedin", "email", "twitter", "instagram", "sms", "affiliate"].map((o) => <option key={o}>{o}</option>)}
        </select>
        <input placeholder="campaign name (e.g. july-promo)" value={utm.campaign} onChange={(e) => setUtm({ ...utm, campaign: e.target.value })} />
      </div>
      <div className="utm-result">
        <code>{utmUrl}</code>
        <button onClick={() => { navigator.clipboard.writeText(utmUrl); setUtmCopied(true); setTimeout(() => setUtmCopied(false), 1500); }}>
          {utmCopied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </Card>
  );

  const affiliateCard = (
    <Card title="Affiliate / rep performance">
      {!insights?.affiliates?.length ? <p className="empty">No affiliate data.</p> : (
        <table>
          <thead><tr><th>Rep</th><th className="num">Orders</th><th className="num">Revenue</th><th className="num">Commission</th><th className="num">Comm. owed</th><th>Last order</th></tr></thead>
          <tbody>
            {insights.affiliates.map((a, i) => (
              <tr key={i}>
                <td>{a.affiliate}</td>
                <td className="num">{a.orders}</td>
                <td className="num">{fmtMoney(a.revenue)}</td>
                <td className="num">{fmtMoney(a.commission)}</td>
                <td className="num">{a.commission_unpaid > 0 ? <span className="flag">{fmtMoney(a.commission_unpaid)}</span> : "—"}</td>
                <td>{a.last_order ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );

  const unpaidCard = (
    <Card title={`Marked unpaid (${insights ? fmtMoney(insights.unpaidTotal) : "…"})`}>
      {!insights?.unpaid?.length ? <p className="empty">Nothing marked unpaid.</p> : (
        <div className="geo-orders-scroll">
          <table>
            <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Rep</th><th className="num">Total</th></tr></thead>
            <tbody>
              {insights.unpaid.map((o, i) => (
                <tr key={i}>
                  <td className="mono">{o.order_number ?? "—"}</td>
                  <td>{o.order_date ?? "—"}</td>
                  <td>{o.customer_name ?? "—"}</td>
                  <td>{o.affiliate ?? "—"}</td>
                  <td className="num">{o.total != null ? fmtMoney(o.total) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  const atRiskCard = (
    <Card title="At-risk customers · high LTV, 45+ days quiet" wide>
      {!insights?.atRisk?.length ? <p className="empty">No at-risk customers — everyone valuable has ordered recently.</p> : (
        <table>
          <thead><tr><th>Customer</th><th className="num">Lifetime value</th><th className="num">Orders</th><th>Last order</th><th className="num">Days quiet</th></tr></thead>
          <tbody>
            {insights.atRisk.map((c, i) => (
              <tr key={i}>
                <td>{c.customer_name}<span className="dim"> {c.email ?? ""}</span></td>
                <td className="num ltv">{fmtMoney(c.ltv)}</td>
                <td className="num">{c.orders}</td>
                <td>{c.last_order}</td>
                <td className="num"><span className="flag">{c.days_quiet}d</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );

  const coverageCard = geoCoverage && (
    <Card
      title="State coverage"
      right={<button onClick={() => setShowUncovered(!showUncovered)}>{showUncovered ? "Show states we're in" : "Show states we're not in"}</button>}
    >
      <div className="stats" style={{ margin: "0 0 14px" }}>
        <Stat label="States with orders" value={`${geoCoverage.coveredCount} / ${geoCoverage.totalStates}`} accent />
        <Stat label="States with zero orders" value={String(geoCoverage.uncoveredCount)} />
      </div>
      <div className="chips">
        {(showUncovered ? geoCoverage.uncovered : geoCoverage.covered).map((s) => (
          <span key={s.code} className="chip">{s.name} <b>{s.code}</b></span>
        ))}
      </div>
    </Card>
  );

  const mapCard = (
    <Card title="Orders across the United States" wide>
      <USMap stats={geoStats} selected={geoState?.code ?? null} onSelect={selectGeoState} />
      <p className="hint">Click a state to see its orders by month, order details, and top clients.</p>
      {geoState && (
        <div className="stage-detail">
          <h3>{geoState.name}</h3>
          {!geoDetail ? (
            <p className="empty">Loading…</p>
          ) : (
            <div className="geo-detail-grid">
              <div>
                <h4 className="geo-sub">Orders by month</h4>
                {geoDetail.byMonth.length === 0 ? <p className="empty">No dated orders.</p> : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={geoDetail.byMonth} margin={{ left: 0, right: 8, top: 4 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="orders" name="Orders" fill={C.s1} radius={[4, 4, 0, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <h4 className="geo-sub">Top 5 clients</h4>
                <table>
                  <thead><tr><th>Client</th><th>City</th><th className="num">Orders</th><th className="num">Spend</th></tr></thead>
                  <tbody>
                    {geoDetail.topClients.map((c, i) => (
                      <tr key={i}>
                        <td>{c.customer_name}</td>
                        <td>{c.city ?? "—"}</td>
                        <td className="num">{c.orders}</td>
                        <td className="num">{fmtMoney(c.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h4 className="geo-sub">Orders ({geoDetail.orders.length})</h4>
                <div className="geo-orders-scroll">
                  <table>
                    <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>City</th><th className="num">Total</th></tr></thead>
                    <tbody>
                      {geoDetail.orders.map((o, i) => (
                        <tr key={i}>
                          <td className="mono">{o.order_number ?? "—"}</td>
                          <td>{o.order_date ?? "—"}</td>
                          <td>{o.customer_name ?? "—"}</td>
                          <td>{o.city ?? "—"}</td>
                          <td className="num">{o.total != null ? fmtMoney(o.total) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );

  const stats = (
    <div className="stats">
      <Stat label="Order revenue" value={orders ? fmtMoney(orders.totals.revenue) : "—"} accent />
      <Stat label="Orders" value={orders ? String(orders.totals.orders) : "—"} />
      <Stat label="Units sold" value={orders ? String(Math.round(orders.totals.units)) : "—"} />
      <Stat label="Customers" value={orders ? String(orders.totals.customers) : "—"} />
      <Stat
        label="Avg customer LTV"
        value={orders && orders.totals.customers > 0 ? fmtMoney(orders.totals.revenue / orders.totals.customers) : "—"}
        accent
      />
      <Stat label="Open pipeline" value={pipelines.length ? fmtMoney(pipelineValue) : "—"} accent />
    </div>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◬</span>
          <div>
            <div className="brand-name">GOLDEN LOTUS</div>
            <div className="brand-sub">COMMAND CENTER</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item${view === n.id ? " active" : ""}`} onClick={() => setView(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className={`dot ${close?.configured && !close.error ? "on" : "off"}`} /> Close
          <span className={`dot ${traffic?.configured && !traffic.error ? "on" : "off"}`} /> GA4
        </div>
      </aside>

      <main className="content">
        <header className="page-head">
          <h1>{NAV.find((n) => n.id === view)?.label}</h1>
          <p className="sub">Pipeline · Orders · Traffic — live</p>
        </header>

        {view === "overview" && (
          <>
            {stats}
            <div className="grid">
              {pipelineCard}
              {focusCard}
              {topPeptidesCard}
              {revenueCard}
            </div>
          </>
        )}
        {view === "pipeline" && (
          <div className="grid">
            {pipelineCard}
            {focusCard}
          </div>
        )}
        {view === "orders" && (
          <>
            <div className="tabs" style={{ marginTop: 18 }}>
              {(["all", "GLL", "Quantis"] as const).map((m) => (
                <button key={m} className={`tab${menuFilter === m ? " active" : ""}`} onClick={() => setMenuFilter(m)}>
                  {m === "all" ? "All menus" : m}
                </button>
              ))}
            </div>
            {stats}
            <div className="grid">
              {mapCard}
              {coverageCard}
              {topPeptidesCard}
              {revenueCard}
              {affiliateCard}
              {unpaidCard}
              {recentCard}
            </div>
          </>
        )}
        {view === "buyers" && (
          <div className="grid">
            {insights?.repeatRate != null && (
              <div className="stats wide" style={{ gridColumn: "1 / -1", margin: 0 }}>
                <Stat label="Repeat purchase rate" value={`${Math.round(insights.repeatRate * 100)}%`} accent />
                <Stat label="Customers" value={String(insights.customers)} />
                <Stat label="At-risk (45d+ quiet)" value={insights ? String(insights.atRisk.length) : "—"} />
              </div>
            )}
            {atRiskCard}
            {buyersCard}
            {drillCard || (
              <Card title="Peptide drill-down">
                <p className="empty">Go to Orders and click a peptide bar to see its buyers here.</p>
              </Card>
            )}
          </div>
        )}
        {view === "marketing" && (
          <div className="grid">
            {funnelCard}
            {utmCard}
            {currentSite && (
              <Card title="Traffic by source · 30d">
                <table>
                  <thead><tr><th>Channel</th><th className="num">Sessions</th></tr></thead>
                  <tbody>
                    {currentSite.channels.map((c) => (
                      <tr key={c.channel}><td>{c.channel}</td><td className="num">{c.sessions.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}
        {view === "content" && <ContentStudio />}
        {view === "email" && <EmailStudio />}
        {view === "hr" && <HRStudio />}
        {view === "traffic" && trafficView}
      </main>
    </div>
  );
}
