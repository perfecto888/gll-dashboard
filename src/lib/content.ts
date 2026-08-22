import { getDb } from "./db";

let ready: Promise<void> | null = null;

export function ensureContentSchema(): Promise<void> {
  if (!ready) {
    ready = getDb()
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS content_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site TEXT NOT NULL CHECK (site IN ('gll','quantis')),
            topic TEXT NOT NULL,
            title TEXT,
            slug TEXT,
            description TEXT,
            tag TEXT,
            body_html TEXT,
            status TEXT NOT NULL DEFAULT 'draft',   -- draft | published
            page_path TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            published_at TEXT
          )`,
          `CREATE TABLE IF NOT EXISTS tweets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',  -- queued | posted | failed
            tweet_id TEXT,
            error TEXT,
            related_post INTEGER,
            source_note TEXT,                        -- what X post/topic inspired it + why it works
            voice TEXT,                              -- 'spartan' | 'professional'
            created_at TEXT DEFAULT (datetime('now')),
            posted_at TEXT
          )`,
          `CREATE TABLE IF NOT EXISTS content_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site TEXT NOT NULL,
            topic TEXT NOT NULL,
            angle TEXT,
            status TEXT NOT NULL DEFAULT 'proposed', -- proposed | drafted | dismissed
            created_at TEXT DEFAULT (datetime('now'))
          )`,
        ],
        "write"
      )
      .then(async () => {
        // Safety net for databases created before source_note/voice existed.
        for (const alter of [
          `ALTER TABLE tweets ADD COLUMN source_note TEXT`,
          `ALTER TABLE tweets ADD COLUMN voice TEXT`,
        ]) {
          try {
            await getDb().execute(alter);
          } catch {
            // column already exists — ignore
          }
        }
      });
  }
  return ready;
}

export const BRAND_VOICE: Record<string, string> = {
  gll: `Golden Lotus Labs (goldenlotuslabs.com) — a peptide manufacturer that follows FDA guidelines and cGMP practices; a B2B clinical distributor of peptides, biologics/stem cells, ProxiGene genetic testing, Proximity Lab Solutions, and AXRAH red light therapy — serving med spas, metabolic clinics, functional-medicine physicians, regenerative medicine practices, and practice owners (not consumers). The goal is for Golden Lotus Labs to become synonymous with providing the best products and solutions that help clinics and clinic owners deliver the highest quality regenerative and preventative health care.

Audience: clinic owners, physicians, nurse practitioners, and med spa owners. Every tweet should speak to a practice-level stake — patient demand, competitive differentiation, compliance/regulatory risk, or revenue — not just consumer-facing science trivia.`,
  quantis: `QuantisPeptides (quantispeptides.com) — a research-peptide supplier. STRICT COMPLIANCE: all content must frame peptides as for in-vitro laboratory research only; never give dosing advice, human-use instructions, or medical claims. Voice: educational, science-forward, literature-based ("research has reported…", "studies have observed…"), always emphasizing purity verification and COAs. Audience: researchers and lab buyers.`,
};

/**
 * Research + copywriting brief used by the tweet generator. Two voices are available:
 *  - "spartan": contrarian, blunt, short-line-pacing — modeled on Dr Trevor Bachmeyer (@smashwerx):
 *      headline + parenthetical clarifier, "it's not X, it's Y" reframe, list-style mechanism dumps,
 *      one-line paragraphs. Best for topics with a clear "common wisdom is wrong" angle.
 *  - "professional": complete sentences, no slang, still headline-driven. Best for regulatory,
 *      clinical-trial, or compliance-driven topics where credibility matters more than punchiness.
 *
 * Both voices are sharpened using Eugene Schwartz's Breakthrough Advertising mechanics:
 *  - Match market sophistication: this audience has seen basic peptide/red-light hype before, so lead
 *    with a mechanism ("it's not the peptide, it's the receptor") or an identification angle ("if your
 *    clinic offers X...") rather than a generic bold claim.
 *  - Hook in the first 6-8 words (what shows before "Show more" on X).
 *  - Specific, falsifiable-sounding claims beat vague benefits.
 *  - Curiosity gaps must have an anchor the reader can picture, not an empty tease.
 *  - Never invent statistics, studies, or dosing claims that weren't in the source material — sharpen
 *    a real claim, don't fabricate one.
 */
export const TWEET_RESEARCH_BRIEF = `Research and draft tweets the way a Breakthrough-Advertising copywriter would after scanning what's actually trending this week on X in: peptides (BPC-157, retatrutide, GLP-1, NAD+), regenerative medicine (stem cell therapy, biologics), preventative/functional health (biomarkers, personalized protocols), red light therapy (photobiomodulation, AXRAH), and longevity science. Use web search to find what's getting real engagement or making news in these spaces this week — not just generic evergreen facts.

For each tweet:
1. Identify a specific, concrete finding, mechanism, or regulatory development (a named compound, a named biomarker, an FDA action, a clinical trial) — avoid vague inspirational claims.
2. Reframe it for a clinic-owner audience: what does this mean for their patients asking about it, their competitive position, or their compliance exposure?
3. Write the tweet in ONE of two voices (alternate across a batch; note which you used):
   - SPARTAN: blunt, short lines, "it's not X, it's Y" contrarian reframes, list-style mechanism dumps. Confident, no hedging filler.
   - PROFESSIONAL: complete sentences, credibility-first, best for regulatory/clinical-trial topics.
4. Do NOT copy any source tweet's exact wording, and do NOT invent statistics, studies, or dosing claims that weren't in your source material.
5. Include a one-line source_note: what topic/finding inspired the tweet and, briefly, why the angle works (e.g. "mechanism reveal", "contrarian reframe", "regulatory urgency").`;

let settingsReady: Promise<void> | null = null;
export function ensureSettings(): Promise<void> {
  if (!settingsReady) {
    settingsReady = getDb()
      .execute(`CREATE TABLE IF NOT EXISTS content_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')))`)
      .then(() => undefined);
  }
  return settingsReady;
}

export async function getSetting(key: string): Promise<string | null> {
  await ensureSettings();
  const r = await getDb().execute({ sql: `SELECT value FROM content_settings WHERE key = ?`, args: [key] });
  return (r.rows[0]?.value as string | null) ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureSettings();
  await getDb().execute({
    sql: `INSERT INTO content_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    args: [key, value],
  });
}
