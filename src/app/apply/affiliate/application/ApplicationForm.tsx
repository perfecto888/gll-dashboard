"use client";

import { useState } from "react";
import { AFFILIATE_AUDIENCE, AFFILIATE_BACKGROUND, AFFILIATE_CHANNELS } from "@/lib/affiliateOptions";

function Checks({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="lux-chips">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button type="button" key={o} className={on ? "lux-chip on" : "lux-chip"} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export default function ApplicationForm() {
  const [f, setF] = useState({ name: "", email: "", phone: "", location: "", audience: "", handle: "", promoPlan: "", website: "" });
  const [channels, setChannels] = useState<string[]>([]);
  const [background, setBackground] = useState<string[]>([]);
  const [adult, setAdult] = useState(false);
  const [compliance, setCompliance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!channels.length || !background.length) return setError("Please pick at least one option for each question.");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/hr/affiliate-apply", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, channels, background, adult, compliance }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Something went wrong. Please try again.");
      window.location.href = j.next;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="lux-form" onSubmit={submit}>
      <div className="lux-form-grid">
        <label>Full name<input required value={f.name} onChange={set("name")} autoComplete="name" /></label>
        <label>Email<input required type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
        <label>Phone<input required type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></label>
        <label>City and state<input required value={f.location} onChange={set("location")} placeholder="e.g. Austin, TX" /></label>
      </div>

      <fieldset><legend>Where will you share your link? <span>Select all that apply</span></legend>
        <Checks options={AFFILIATE_CHANNELS} value={channels} onChange={setChannels} />
      </fieldset>

      <label>About how big is your audience or network?
        <select required value={f.audience} onChange={set("audience")}>
          <option value="">Choose one</option>
          {AFFILIATE_AUDIENCE.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>

      <label>Social handle or website <span>Optional</span><input value={f.handle} onChange={set("handle")} placeholder="@yourhandle or yoursite.com" /></label>

      <fieldset><legend>Your background <span>Select all that apply</span></legend>
        <Checks options={AFFILIATE_BACKGROUND} value={background} onChange={setBackground} />
      </fieldset>

      <label>In a sentence or two, how do you plan to promote QuantisPeptides?
        <textarea required rows={4} value={f.promoPlan} onChange={set("promoPlan")} />
      </label>

      {/* honeypot — hidden from people, filled by bots */}
      <input className="lux-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} />

      <label className="lux-agree"><input type="checkbox" required checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        I&apos;m 18 or older.</label>
      <label className="lux-agree"><input type="checkbox" required checked={compliance} onChange={(e) => setCompliance(e.target.checked)} />
        I understand the products are for research use only. I won&apos;t make health claims, and I&apos;ll disclose that I earn a commission on my link.</label>

      {error && <p className="lux-error" role="alert">{error}</p>}

      <button className="lux-cta" type="submit" disabled={busy}>
        {busy ? "Submitting…" : <>Submit &amp; Continue <span aria-hidden="true">→</span></>}
      </button>
      <p className="lux-note">Next you&apos;ll create your affiliate account on quantispeptides.com.</p>
    </form>
  );
}
