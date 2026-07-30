"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push("/");
    else {
      setError("Wrong password");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ justifyContent: "center", paddingBottom: 18 }}>
          <span className="brand-mark">◬</span>
          <div>
            <div className="brand-name">GOLDEN LOTUS</div>
            <div className="brand-sub">COMMAND CENTER</div>
          </div>
        </div>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" disabled={busy || !password}>
          {busy ? "Checking…" : "Enter"}
        </button>
        {error && <p className="login-error">{error}</p>}
      </form>
    </div>
  );
}
