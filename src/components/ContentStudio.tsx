"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface Topic { id: number; site: string; topic: string; angle: string | null }
interface Post {
  id: number; site: string; topic: string; title: string | null; slug: string | null;
  tag: string | null; status: string; page_path: string | null; created_at: string; published_at: string | null;
}
interface PostFull extends Post { description: string | null; body_html: string | null }
interface Tweet {
  id: number; text: string; status: string; tweet_id: string | null; error: string | null;
  source_note: string | null; voice: string | null; created_at: string; posted_at: string | null;
}

function Card({ title, children, right, wide }: { title: string; children: React.ReactNode; right?: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`card${wide ? " wide" : ""}`}>
      <div className="card-head"><h2>{title}</h2>{right}</div>
      {children}
    </section>
  );
}

const siteLabel = (s: string) => (s === "quantis" ? "Quantis" : "GLL");

export default function ContentStudio() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [site, setSite] = useState<"gll" | "quantis">("gll");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<PostFull | null>(null);
  const [tweetEdit, setTweetEdit] = useState<{ id: number; text: string } | null>(null);
  const [views, setViews] = useState<Record<string, number>>({});
  const [emailed, setEmailed] = useState<number[]>([]);
  const [voiceExamples, setVoiceExamples] = useState("");
  const [voiceGuide, setVoiceGuide] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [deepDive, setDeepDive] = useState<{
    post: Post;
    totals: { views: number; sessions: number; users: number; bounceRate: number; avgSessionSec: number };
    daily: { date: string; views: number }[];
    channels: { channel: string; sessions: number }[];
  } | null>(null);

  const load = useCallback(() => {
    fetch("/api/content").then((r) => r.json()).then((j) => { setTopics(j.topics ?? []); setPosts(j.posts ?? []); setEmailed(j.emailed ?? []); }).catch(() => {});
    fetch("/api/tweets").then((r) => r.json()).then((j) => setTweets(j.tweets ?? [])).catch(() => {});
    fetch("/api/content/analytics").then((r) => r.json()).then((j) => setViews(j.views ?? {})).catch(() => {});
    fetch("/api/tweets/voice").then((r) => r.json()).then((j) => { setVoiceExamples(j.examples ?? ""); setVoiceGuide(j.guide ?? ""); }).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function act(label: string, fn: () => Promise<Response>) {
    setBusy(label);
    setMsg("");
    try {
      const res = await fn();
      const j = await res.json();
      if (!res.ok) setMsg(`Error: ${j.error}`);
      else if (j.url) setMsg(`Published: ${j.url}`);
      load();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  const researchTopics = () =>
    act("topics", () => fetch("/api/content/topics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ site }) }));

  const draftArticle = (t: Topic) =>
    act(`draft-${t.id}`, () => fetch("/api/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", site: t.site, topic: t.topic, topic_id: t.id }) }));

  const openEditor = async (id: number) => {
    const r = await fetch(`/api/content`);
    const j = await r.json();
    const p = (j.posts as Post[]).find((x) => x.id === id);
    if (!p) return;
    // fetch full body via public-style query on the main endpoint: reuse update flow — simplest: dedicated fetch
    const full = await fetch(`/api/content/item?id=${id}`).then((x) => x.json()).catch(() => null);
    setEditing({ ...(p as PostFull), ...(full?.post ?? {}) });
  };

  const saveDraft = () =>
    editing && act("save", () => fetch("/api/content", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", id: editing.id, title: editing.title, description: editing.description, body_html: editing.body_html }),
    }));

  const publish = (id: number) =>
    act(`publish-${id}`, () => fetch("/api/content/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }));

  const genTweets = () =>
    act("tweets", () => fetch("/api/tweets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generate", count: 3 }) }));

  const postTweet = (id: number) =>
    act(`tweet-${id}`, () => fetch("/api/tweets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "post", id }) }));

  const analyzeVoice = () =>
    act("voice", async () => {
      const res = await fetch("/api/tweets/voice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ examples: voiceExamples }) });
      const j = await res.clone().json().catch(() => null);
      if (j?.guide) { setVoiceGuide(j.guide); setShowGuide(true); }
      return res;
    });

  const createEmail = (p: Post) =>
    act(`email-${p.id}`, async () => {
      const res = await fetch("/api/email/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "article", post_id: p.id }) });
      if (res.ok) setMsg("Email draft created — open the Email tab to edit and send it.");
      return res;
    });

  const openDeepDive = async (p: Post) => {
    setDeepDive(null);
    const j = await fetch(`/api/content/analytics?site=${p.site}&path=${encodeURIComponent(p.page_path ?? "")}`).then((r) => r.json()).catch(() => null);
    if (j?.totals) setDeepDive({ post: p, ...j });
  };

  const siteTopics = topics.filter((t) => t.site === site);
  const drafts = posts.filter((p) => p.status === "draft");
  const published = posts.filter((p) => p.status === "published");
  const queuedTweets = tweets.filter((t) => t.status === "queued");
  const tweetHistory = tweets.filter((t) => t.status !== "queued");

  return (
    <div className="grid">
      {msg && <p className="msg" style={{ gridColumn: "1 / -1" }}>{msg}</p>}

      <Card
        title="Topic research"
        right={
          <div className="tabs">
            {(["gll", "quantis"] as const).map((s) => (
              <button key={s} className={`tab${site === s ? " active" : ""}`} onClick={() => setSite(s)}>{siteLabel(s)}</button>
            ))}
            <button disabled={!!busy} onClick={researchTopics}>{busy === "topics" ? "Researching…" : "✦ Research topics"}</button>
          </div>
        }
      >
        {!siteTopics.length ? <p className="empty">No {siteLabel(site)} topics yet — hit “Research topics” and AI proposes article ideas for {siteLabel(site)}.</p> : (
          <table>
            <thead><tr><th>Topic</th><th>Why</th><th></th></tr></thead>
            <tbody>
              {siteTopics.map((t) => (
                <tr key={t.id}>
                  <td>{t.topic}</td>
                  <td className="dim">{t.angle}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button disabled={!!busy} onClick={() => draftArticle(t)}>{busy === `draft-${t.id}` ? "Writing…" : "Write draft →"}</button>{" "}
                    <button disabled={!!busy} onClick={() => act("dismiss", () => fetch(`/api/content/topics?id=${t.id}`, { method: "DELETE" }))}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint">“Write draft →” sends the topic to Drafts, where you can edit and publish.</p>
      </Card>

      <Card title={`Drafts (${drafts.length})`}>
        {!drafts.length ? <p className="empty">No drafts. Draft an article from a topic.</p> : (
          <table>
            <thead><tr><th>Site</th><th>Title</th><th></th></tr></thead>
            <tbody>
              {drafts.map((p) => (
                <tr key={p.id}>
                  <td>{siteLabel(p.site)}</td>
                  <td>{p.title ?? p.topic}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => openEditor(p.id)}>Edit</button>{" "}
                    <button disabled={!!busy} onClick={() => publish(p.id)}>{busy === `publish-${p.id}` ? "Publishing…" : "Publish ↗"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <Card title={`Editing — ${siteLabel(editing.site)}`} wide right={<button onClick={() => setEditing(null)}>✕ Close</button>}>
          <div className="editor">
            <input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Title" />
            <input value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Meta description" />
            <textarea rows={18} value={editing.body_html ?? ""} onChange={(e) => setEditing({ ...editing, body_html: e.target.value })} />
            <div className="upload-row">
              <button disabled={!!busy} onClick={saveDraft}>{busy === "save" ? "Saving…" : "Save"}</button>
              <button disabled={!!busy} onClick={() => publish(editing.id)}>Publish ↗</button>
            </div>
          </div>
        </Card>
      )}

      <Card title={`Published (${published.length})`} wide>
        {!published.length ? <p className="empty">Nothing published yet.</p> : (
          <table>
            <thead><tr><th>Site</th><th>Title</th><th>Published</th><th className="num">Views · 30d</th><th>Analytics</th><th>Email</th><th>Link</th></tr></thead>
            <tbody>
              {published.map((p) => {
                const url = p.site === "quantis" ? `https://quantispeptides.com${p.page_path}` : `https://www.goldenlotuslabs.com${p.page_path}`;
                const v = views[`${p.site}:${p.page_path}`];
                return (
                  <tr key={p.id}>
                    <td>{siteLabel(p.site)}</td>
                    <td>{p.title}</td>
                    <td>{p.published_at?.slice(0, 10)}</td>
                    <td className="num">{v != null ? v.toLocaleString() : "0"}</td>
                    <td><button onClick={() => openDeepDive(p)}>📈 Deep dive</button></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button disabled={!!busy} onClick={() => createEmail(p)}>
                        {busy === `email-${p.id}` ? "Writing…" : emailed.includes(p.id) ? "✓ Created · again?" : "✉ Create email"}
                      </button>
                    </td>
                    <td><a className="close-link" href={url} target="_blank" rel="noreferrer">view ↗</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="hint">Views come from Google Analytics (last 30 days). New posts take up to 24h to show first data.</p>
      </Card>

      {deepDive && (
        <Card title={`Page performance — ${deepDive.post.title}`} wide right={<button onClick={() => setDeepDive(null)}>✕ Close</button>}>
          <div className="stats">
            <div className="stat accent"><div className="stat-value">{deepDive.totals.views.toLocaleString()}</div><div className="stat-label">Views · 30d</div></div>
            <div className="stat"><div className="stat-value">{deepDive.totals.sessions.toLocaleString()}</div><div className="stat-label">Sessions</div></div>
            <div className="stat"><div className="stat-value">{deepDive.totals.users.toLocaleString()}</div><div className="stat-label">Users</div></div>
            <div className="stat"><div className="stat-value">{Math.round(deepDive.totals.bounceRate * 100)}%</div><div className="stat-label">Bounce rate</div></div>
            <div className="stat"><div className="stat-value">{Math.floor(deepDive.totals.avgSessionSec / 60)}m {Math.round(deepDive.totals.avgSessionSec % 60)}s</div><div className="stat-label">Avg time</div></div>
          </div>
          <div className="geo-detail-grid">
            <div>
              <h3 className="geo-sub">Daily views</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={deepDive.daily.map((d) => ({ ...d, label: `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}` }))} margin={{ left: 0, right: 8, top: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--gridline)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-glow)", borderRadius: 10, fontSize: 12 }} />
                  <Line type="monotone" dataKey="views" stroke="var(--series-1)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h3 className="geo-sub">Where readers come from</h3>
              {!deepDive.channels.length ? <p className="empty">No channel data yet.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(120, deepDive.channels.length * 36)}>
                  <BarChart data={deepDive.channels} layout="vertical" margin={{ left: 8, right: 30 }}>
                    <CartesianGrid horizontal={false} stroke="var(--gridline)" />
                    <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="channel" width={110} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-glow)", borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="sessions" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card
        title={`Tweet voice ${voiceGuide ? "· trained ✓" : "· not trained yet"}`}
        wide
        right={voiceGuide ? <button onClick={() => setShowGuide(!showGuide)}>{showGuide ? "Hide guide" : "View guide"}</button> : undefined}
      >
        <p className="hint" style={{ marginTop: 0 }}>
          Paste tweets you admire (business, regenerative &amp; preventative medicine, AI), account handles, and any notes on what you like.
          AI studies them and every future tweet draft follows the derived voice.
        </p>
        <div className="editor">
          <textarea
            rows={8}
            placeholder={"Examples:\n\n@naval — love the short aphorism style\n\n\"Most founders optimize for growth. The best optimize for retention...\"\n\n\"Peptide therapy isn't fringe anymore — 4 in 10 longevity clinics...\"\n\nNotes: punchy first lines, no hashtags, numbers early, contrarian but grounded"}
            value={voiceExamples}
            onChange={(e) => setVoiceExamples(e.target.value)}
          />
          <div className="upload-row">
            <button disabled={!!busy || voiceExamples.trim().length < 20} onClick={analyzeVoice}>
              {busy === "voice" ? "Studying your examples…" : "✦ Analyze & train voice"}
            </button>
          </div>
          {showGuide && voiceGuide && (
            <div className="voice-guide">
              <h3 className="geo-sub">Derived voice guide (used on every tweet draft)</h3>
              <p>{voiceGuide}</p>
            </div>
          )}
        </div>
      </Card>

      <Card
        title={`Tweet queue (${queuedTweets.length})`}
        wide
        right={<button disabled={!!busy} onClick={genTweets}>{busy === "tweets" ? "Drafting…" : "✦ Draft tweets"}</button>}
      >
        {!queuedTweets.length ? <p className="empty">Queue is empty — the daily cron keeps it topped up, or draft now.</p> : (
          <div className="tweet-list">
            {queuedTweets.map((t) => (
              <div key={t.id} className="tweet-item">
                {tweetEdit?.id === t.id ? (
                  <textarea rows={3} value={tweetEdit.text} onChange={(e) => setTweetEdit({ id: t.id, text: e.target.value })} />
                ) : (
                  <p>{t.text}</p>
                )}
                {(t.voice || t.source_note) && (
                  <p className="tweet-source-note">
                    {t.voice && <span className={`voice-tag voice-${t.voice}`}>{t.voice}</span>}
                    {t.source_note}
                  </p>
                )}
                <div className="upload-row">
                  {tweetEdit?.id === t.id ? (
                    <button onClick={() => act("tweet-save", () => fetch("/api/tweets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", id: t.id, text: tweetEdit.text }) })).then(() => setTweetEdit(null))}>Save</button>
                  ) : (
                    <button onClick={() => setTweetEdit({ id: t.id, text: t.text })}>Edit</button>
                  )}
                  <button disabled={!!busy} onClick={() => postTweet(t.id)}>{busy === `tweet-${t.id}` ? "Posting…" : "Post to X ↗"}</button>
                  <button disabled={!!busy} onClick={() => act("tweet-del", () => fetch("/api/tweets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: t.id }) }))}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {tweetHistory.length > 0 && (
          <>
            <h3 className="geo-sub">History</h3>
            <table>
              <thead><tr><th>Tweet</th><th>Status</th><th>When</th><th></th></tr></thead>
              <tbody>
                {tweetHistory.slice(0, 10).map((t) => (
                  <tr key={t.id}>
                    <td className="items-cell">{t.text}</td>
                    <td>{t.status === "posted" ? <span className="ok">posted</span> : <span className="flag">{t.error?.slice(0, 40) ?? "failed"}</span>}</td>
                    <td>{(t.posted_at ?? t.created_at)?.slice(0, 10)}</td>
                    <td>{t.tweet_id && <a className="close-link" href={`https://x.com/i/status/${t.tweet_id}`} target="_blank" rel="noreferrer">view ↗</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
}
