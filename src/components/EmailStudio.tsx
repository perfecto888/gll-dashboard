"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ListHealth { brand: string; id: number; name: string; subscribers: number | null }
interface Draft {
  id: number; brand: string; topic: string; subject: string | null; status: string;
  list_id: number | null; scheduled_at: string | null; sent_at: string | null;
  brevo_campaign_id: number | null; created_at: string;
}
interface DraftFull extends Draft { preheader: string | null; body_html: string | null }
interface BrevoCampaign {
  id: number; name: string; subject: string; status: string;
  sent: number; opens: number; clicks: number; unsubs: number; when: string | null;
}

function Card({ title, children, right, wide }: { title: string; children: React.ReactNode; right?: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`card${wide ? " wide" : ""}`}>
      <div className="card-head"><h2>{title}</h2>{right}</div>
      {children}
    </section>
  );
}

const brandLabel = (b: string) => (b === "quantis" ? "Quantis" : "GLL");

export default function EmailStudio() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [lists, setLists] = useState<ListHealth[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [campaigns, setCampaigns] = useState<BrevoCampaign[]>([]);
  const [brand, setBrand] = useState<"gll" | "quantis">("gll");
  const [peptide, setPeptide] = useState("");
  const [topic, setTopic] = useState("");
  const [genMode, setGenMode] = useState<"peptide" | "topic">("peptide");
  const [previewKey, setPreviewKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<DraftFull | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [scheduleWhen, setScheduleWhen] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/email").then((r) => r.json()).then((j) => {
      setConfigured(j.configured ?? false);
      setLists(j.lists ?? []);
      setDrafts(j.drafts ?? []);
      setCampaigns(j.campaigns ?? []);
    }).catch(() => setConfigured(false));
  }, []);
  useEffect(load, [load]);

  async function act(label: string, fn: () => Promise<Response>) {
    setBusy(label);
    setMsg("");
    try {
      const res = await fn();
      const j = await res.json();
      if (!res.ok) setMsg(`Error: ${j.error}`);
      else if (j.dashboard) setMsg(j.scheduled ? `Scheduled in Brevo → ${j.dashboard}` : `Campaign created in Brevo (draft) → ${j.dashboard}`);
      else if (label === "test") setMsg("Test email sent — check your inbox.");
      load();
      return j;
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  const generate = () =>
    act("generate", () => fetch("/api/email/generate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(genMode === "topic" ? { brand, mode: "topic", topic } : { brand, mode: "peptide", peptide }),
    })).then(() => { setPeptide(""); setTopic(""); });

  const openEditor = async (id: number) => {
    const full = await fetch(`/api/email/item?id=${id}`).then((r) => r.json()).catch(() => null);
    if (full?.draft) setEditing(full.draft);
    setPreviewKey((k) => k + 1);
  };

  const saveDraft = () =>
    editing && act("save", () => fetch("/api/email/send", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update", id: editing.id, subject: editing.subject, preheader: editing.preheader, body_html: editing.body_html }),
    })).then(() => setPreviewKey((k) => k + 1));

  const sendTest = (id: number) =>
    testEmail && act("test", () => fetch("/api/email/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test", id, email: testEmail }) }));

  const insertImage = (url: string) => {
    if (!editing || !url.trim()) return;
    const tag = `\n<img src="${url.trim()}" alt="" style="display:block;width:100%;max-width:528px;height:auto;border-radius:8px;margin:16px auto;" />\n`;
    const body = editing.body_html ?? "";
    const at = bodyRef.current?.selectionStart ?? body.length;
    setEditing({ ...editing, body_html: body.slice(0, at) + tag + body.slice(at) });
    setImageUrl("");
    setMsg("Image inserted — hit Save, then Refresh preview.");
  };

  const uploadImage = async (file: File) => {
    setBusy("image");
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/email/image", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) setMsg(`Error: ${j.error}`);
      else insertImage(j.url);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const scheduleCampaign = (id: number, when?: string) =>
    act("schedule", () => fetch("/api/email/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "schedule", id, when: when || undefined }) }));

  const draftRows = drafts.filter((d) => d.status === "draft");
  const scheduledRows = drafts.filter((d) => d.status === "scheduled");

  if (configured === false) {
    return (
      <div className="grid">
        <Card title="Email Studio">
          <p className="empty">Add <code>BREVO_API_KEY</code> to connect email marketing.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid">
      {msg && <p className="msg" style={{ gridColumn: "1 / -1" }}>{msg}</p>}

      <Card title="List health · Brevo" wide>
        <table>
          <thead><tr><th>Brand</th><th>List</th><th className="num">Subscribers</th></tr></thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.id}>
                <td>{brandLabel(l.brand)}</td>
                <td>{l.name} <span className="dim">#{l.id}</span></td>
                <td className="num">{l.subscribers ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">GLL and Quantis sign-ups feed separate lists — verified 2026-07-13 (Quantis leads no longer cross into the GLL list).</p>
      </Card>

      <Card
        title="Write a campaign"
        right={
          <div className="tabs">
            {(["gll", "quantis"] as const).map((b) => (
              <button key={b} className={`tab${brand === b ? " active" : ""}`} onClick={() => setBrand(b)}>{brandLabel(b)}</button>
            ))}
          </div>
        }
      >
        <div className="tabs" style={{ marginBottom: 10 }}>
          <button className={`tab${genMode === "peptide" ? " active" : ""}`} onClick={() => setGenMode("peptide")}>By peptide</button>
          <button className={`tab${genMode === "topic" ? " active" : ""}`} onClick={() => setGenMode("topic")}>By topic (researched)</button>
        </div>
        {genMode === "peptide" ? (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {brand === "quantis"
                ? "Enter a peptide — AI writes an easy-to-read research email (research-use framing, ~8th-grade reading level)."
                : "Enter a peptide — AI writes a clinical education email summarizing the published research for practice owners."}
            </p>
            <div className="utm-form">
              <input placeholder="e.g. BPC-157, Semaglutide, PEP R…" value={peptide} onChange={(e) => setPeptide(e.target.value)} />
              <button disabled={!!busy || !peptide.trim()} onClick={generate}>{busy === "generate" ? "Writing…" : "✦ Generate email"}</button>
            </div>
          </>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              Type any topic — AI researches it on the web first, then writes the email (e.g. &quot;new research on GLP-1 combination therapy&quot;, &quot;how clinics should evaluate a new peptide supplier&quot;).
            </p>
            <div className="utm-form">
              <input placeholder="Type a topic to research and write about…" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <button disabled={!!busy || !topic.trim()} onClick={generate}>{busy === "generate" ? "Researching & writing…" : "✦ Research & generate"}</button>
            </div>
          </>
        )}
      </Card>

      <Card title={`Drafts (${draftRows.length})`}>
        {!draftRows.length ? <p className="empty">No drafts yet.</p> : (
          <table>
            <thead><tr><th>Brand</th><th>Subject</th><th></th></tr></thead>
            <tbody>
              {draftRows.map((d) => (
                <tr key={d.id}>
                  <td>{brandLabel(d.brand)}</td>
                  <td>{d.subject ?? d.topic}</td>
                  <td style={{ whiteSpace: "nowrap" }}><button onClick={() => openEditor(d.id)}>Edit &amp; send →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={`Scheduled (${scheduledRows.length})`}>
        {!scheduledRows.length ? <p className="empty">Nothing scheduled.</p> : (
          <table>
            <thead><tr><th>Brand</th><th>Subject</th><th>When</th></tr></thead>
            <tbody>
              {scheduledRows.map((d) => (
                <tr key={d.id}>
                  <td>{brandLabel(d.brand)}</td>
                  <td>{d.subject}</td>
                  <td>{d.scheduled_at?.slice(0, 16).replace("T", " ") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint">Send every other day: generate → review → schedule each one ~48h apart.</p>
      </Card>

      {editing && (
        <Card title={`Editing — ${brandLabel(editing.brand)}`} wide right={<button onClick={() => setEditing(null)}>✕ Close</button>}>
          <div className="editor">
            <input value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="Subject line" />
            <input value={editing.preheader ?? ""} onChange={(e) => setEditing({ ...editing, preheader: e.target.value })} placeholder="Preheader text" />
            <textarea ref={bodyRef} rows={16} value={editing.body_html ?? ""} onChange={(e) => setEditing({ ...editing, body_html: e.target.value })} />
            <div className="upload-row" style={{ flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              <button disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === "image" ? "Uploading…" : "🖼 Upload image"}</button>
              <input
                placeholder="…or paste an image URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text-primary)", minWidth: 220 }}
              />
              <button disabled={!!busy || !imageUrl.trim()} onClick={() => insertImage(imageUrl)}>Insert</button>
              <button onClick={() => setPreviewKey((k) => k + 1)}>↻ Refresh preview</button>
            </div>
            <p className="hint">Images are inserted at your cursor position in the body above.</p>
            <div className="email-preview-frame">
              <iframe key={previewKey} src={`/api/email/preview?id=${editing.id}`} title="Email preview" />
            </div>
            <p className="hint">Preview reflects the last saved version — hit Save, then Refresh preview.</p>
            <div className="upload-row" style={{ flexWrap: "wrap" }}>
              <button disabled={!!busy} onClick={saveDraft}>{busy === "save" ? "Saving…" : "Save"}</button>
              <input
                placeholder="you@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text-primary)" }}
              />
              <button disabled={!!busy || !testEmail} onClick={() => sendTest(editing.id)}>{busy === "test" ? "Sending…" : "Send test"}</button>
              <button disabled={!!busy} onClick={() => scheduleCampaign(editing.id)}>{busy === "schedule" ? "Sending to Brevo…" : "Push to Brevo (draft)"}</button>
              <input
                type="datetime-local"
                value={scheduleWhen}
                onChange={(e) => setScheduleWhen(e.target.value)}
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text-primary)" }}
              />
              <button disabled={!!busy || !scheduleWhen} onClick={() => scheduleCampaign(editing.id, new Date(scheduleWhen).toISOString())}>Schedule send</button>
            </div>
            <p className="hint">
              &quot;Push to Brevo (draft)&quot; creates the campaign in Brevo without sending — review it there and hit send yourself.
              &quot;Schedule send&quot; sets it to go out automatically at the chosen time to the {brandLabel(editing.brand)} list.
            </p>
          </div>
        </Card>
      )}

      <Card title="Sent campaign performance · Brevo" wide>
        {!campaigns.length ? <p className="empty">No campaigns sent yet.</p> : (
          <table>
            <thead><tr><th>Campaign</th><th>Status</th><th className="num">Sent</th><th className="num">Opens</th><th className="num">Clicks</th><th className="num">Unsubs</th><th>When</th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.status}</td>
                  <td className="num">{c.sent.toLocaleString()}</td>
                  <td className="num">{c.opens.toLocaleString()}</td>
                  <td className="num">{c.clicks.toLocaleString()}</td>
                  <td className="num">{c.unsubs.toLocaleString()}</td>
                  <td>{c.when?.slice(0, 10) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
