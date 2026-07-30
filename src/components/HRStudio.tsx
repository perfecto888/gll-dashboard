"use client";

import { useCallback, useEffect, useState } from "react";

interface Candidate {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  categories: string | null;
  comm_agreement: number;
  ncnda: number;
  gusto: number;
  training: number;
  notes: string | null;
  calendly_join_url: string | null;
  appt_start: string | null;
  appt_end: string | null;
  created_at: string;
}

function Card({ title, children, right, wide }: { title: string; children: React.ReactNode; right?: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`card${wide ? " wide" : ""}`}>
      <div className="card-head"><h2>{title}</h2>{right}</div>
      {children}
    </section>
  );
}

const CATS: { key: string; label: string }[] = [
  { key: "peptide", label: "Peptide" },
  { key: "red_light", label: "Red Light Therapy" },
  { key: "proximity", label: "Proximity Services" },
];

const STATUS_LABEL: Record<string, string> = {
  new: "New", booked: "Booked", interviewed: "Interviewed", affiliate: "Affiliate team", rejected: "Rejected",
};

function fmtWhen(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function HRStudio() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const load = useCallback(() => {
    fetch("/api/hr/candidates").then((r) => r.json()).then((j) => setCandidates(j.candidates ?? [])).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function update(id: number, field: string, value: string | number) {
    setBusy(`${id}-${field}`);
    try {
      await fetch("/api/hr/candidates", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", id, field, value }),
      });
      load();
    } finally {
      setBusy("");
    }
  }

  async function addCandidate() {
    if (!newName.trim()) return;
    setBusy("add");
    try {
      await fetch("/api/hr/candidates", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", name: newName, email: newEmail || null }),
      });
      setNewName("");
      setNewEmail("");
      load();
    } finally {
      setBusy("");
    }
  }

  function toggleCategory(c: Candidate, key: string) {
    const cur = new Set((c.categories ?? "").split(",").filter(Boolean));
    if (cur.has(key)) cur.delete(key); else cur.add(key);
    update(c.id, "categories", [...cur].join(","));
  }

  const now = Date.now();
  const upcoming = candidates.filter((c) => c.appt_start && new Date(c.appt_start).getTime() >= now);
  const noAppt = candidates.filter((c) => !c.appt_start);
  const past = candidates.filter((c) => c.appt_start && new Date(c.appt_start).getTime() < now);

  const row = (c: Candidate) => {
    const cats = new Set((c.categories ?? "").split(",").filter(Boolean));
    const isOpen = expanded === c.id;
    return (
      <div key={c.id} className="candidate-row">
        <div className="candidate-summary" onClick={() => setExpanded(isOpen ? null : c.id)}>
          <div>
            <div className="candidate-name">{c.name ?? "(no name)"} <span className="dim">{c.email}</span></div>
            {c.appt_start && <div className="dim" style={{ fontSize: 12 }}>{fmtWhen(c.appt_start)}</div>}
          </div>
          <div className="upload-row" onClick={(e) => e.stopPropagation()}>
            {c.calendly_join_url && (
              <a className="close-link" href={c.calendly_join_url} target="_blank" rel="noreferrer">Join call ↗</a>
            )}
            <select value={c.status} onChange={(e) => update(c.id, "status", e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        {isOpen && (
          <div className="candidate-detail">
            <div className="candidate-grid">
              <div>
                <p className="geo-sub" style={{ marginTop: 0 }}>Category (check all that apply)</p>
                <div className="chips">
                  {CATS.map((cat) => (
                    <button
                      key={cat.key}
                      className={`chip-toggle${cats.has(cat.key) ? " on" : ""}`}
                      onClick={() => toggleCategory(c, cat.key)}
                    >
                      {cats.has(cat.key) ? "✓ " : ""}{cat.label}
                    </button>
                  ))}
                </div>
                <p className="geo-sub">Log into affiliate sales team</p>
                <button
                  className={c.status === "affiliate" ? "chip-toggle on" : "chip-toggle"}
                  onClick={() => update(c.id, "status", c.status === "affiliate" ? "interviewed" : "affiliate")}
                >
                  {c.status === "affiliate" ? "✓ On affiliate sales team" : "Add to affiliate sales team"}
                </button>
              </div>
              <div>
                <p className="geo-sub" style={{ marginTop: 0 }}>Onboarding documents sent</p>
                <table>
                  <tbody>
                    {([
                      ["comm_agreement", "Comm agreement"],
                      ["ncnda", "NCNDA"],
                      ["gusto", "Gusto"],
                      ["training", "Training"],
                    ] as const).map(([field, label]) => (
                      <tr key={field}>
                        <td>{label}</td>
                        <td className="num">
                          <button
                            disabled={busy === `${c.id}-${field}`}
                            className={c[field] ? "yn-btn yes" : "yn-btn no"}
                            onClick={() => update(c.id, field, c[field] ? 0 : 1)}
                          >
                            {c[field] ? "YES" : "NO"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <textarea
              className="candidate-notes"
              placeholder="Notes…"
              defaultValue={c.notes ?? ""}
              onBlur={(e) => update(c.id, "notes", e.target.value)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid">
      {msg && <p className="msg" style={{ gridColumn: "1 / -1" }}>{msg}</p>}

      <Card title="Add a candidate manually" wide>
        <p className="hint" style={{ marginTop: 0 }}>
          Candidates who book through the Calendly link on <code>/apply</code> appear automatically below.
          Add someone here if you want to track them before they book.
        </p>
        <div className="utm-form">
          <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input placeholder="Email (optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <button disabled={busy === "add" || !newName.trim()} onClick={addCandidate}>{busy === "add" ? "Adding…" : "+ Add candidate"}</button>
        </div>
      </Card>

      <Card title={`Upcoming interviews (${upcoming.length})`} wide>
        {!upcoming.length ? <p className="empty">Nothing on the calendar yet.</p> : (
          <div className="candidate-list">{upcoming.map(row)}</div>
        )}
      </Card>

      <Card title={`No appointment yet (${noAppt.length})`} wide>
        {!noAppt.length ? <p className="empty">Everyone has a time booked.</p> : (
          <div className="candidate-list">{noAppt.map(row)}</div>
        )}
      </Card>

      <Card title={`Past interviews (${past.length})`} wide>
        {!past.length ? <p className="empty">No past interviews yet.</p> : (
          <div className="candidate-list">{past.map(row)}</div>
        )}
      </Card>
    </div>
  );
}
