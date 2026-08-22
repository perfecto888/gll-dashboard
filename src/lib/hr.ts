import { getDb } from "./db";

let ready: Promise<void> | null = null;
export function ensureHrSchema(): Promise<void> {
  if (!ready) {
    ready = getDb()
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT,
            phone TEXT,
            source TEXT DEFAULT 'indeed',
            status TEXT NOT NULL DEFAULT 'new',   -- new | booked | interviewed | affiliate | rejected
            categories TEXT,                       -- comma-separated: peptide,red_light,proximity
            comm_agreement INTEGER NOT NULL DEFAULT 0,
            ncnda INTEGER NOT NULL DEFAULT 0,
            gusto INTEGER NOT NULL DEFAULT 0,
            training INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            calendly_event_uri TEXT,
            calendly_join_url TEXT,
            appt_start TEXT,
            appt_end TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )`,
          `CREATE INDEX IF NOT EXISTS idx_candidates_appt ON candidates(appt_start)`,
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_calendly_event ON candidates(calendly_event_uri) WHERE calendly_event_uri IS NOT NULL`,
        ],
        "write"
      )
      .then(() => undefined);
  }
  return ready;
}

export const CATEGORY_LABELS: Record<string, string> = {
  peptide: "Peptide",
  red_light: "Red Light Therapy",
  proximity: "Proximity Services",
};
