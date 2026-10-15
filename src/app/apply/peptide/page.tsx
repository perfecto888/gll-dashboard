import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./peptide.css";

export const metadata = { title: "Peptide Sales Position — Golden Lotus Labs" };

// Same type pairing as goldenlotuslabs.com: serif display headline, DM Sans body.
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--lux-display" });
const body = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--lux-body" });

const YOUTUBE_VIDEO_ID = "-FH8Ijyqsxg";
const CALENDLY_URL = "https://calendly.com/sharish/gl-jobinterview-30min";

export default function PeptideApplyPage() {
  return (
    <div className={`lux-page ${display.variable} ${body.variable}`}>
      <header className="lux-header">
        <div className="lux-brand">Golden Lotus Labs</div>
        <div className="lux-brand-sub">Join Our Team</div>
      </header>

      <main className="lux-wrap">
        <p className="lux-eyebrow">Now Hiring &nbsp;·&nbsp; Peptide Sales</p>
        <h1 className="lux-title">
          Sell products clinics are <em>actively asking for.</em>
        </h1>
        <div className="lux-rule" />
        <p className="lux-lead">
          Golden Lotus Labs is a peptide manufacturer that follows FDA guidelines, trusted by med
          spas, metabolic clinics, and functional medicine practices nationwide. We&apos;re looking for a
          driven sales professional to grow our peptide book of business. Watch the two-minute
          overview below to see exactly what the role involves, who you&apos;d be selling to, and
          how compensation works.
        </p>

        <div className="lux-video">
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=0&modestbranding=1&controls=0`}
            title="Golden Lotus Labs - Peptide Sales Position Overview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        <div className="lux-message">
          <p>
            If this sounds like the right fit, the next step is a quick conversation — no
            application form, no waiting. Grab a time below that works for you and we&apos;ll walk
            through the role, answer your questions, and talk about what you&apos;d bring to the team.
          </p>
          <p className="lux-signoff">We look forward to meeting you.</p>
        </div>

        <a className="lux-cta" href={CALENDLY_URL} target="_blank" rel="noreferrer">
          Book Your Interview <span aria-hidden="true">→</span>
        </a>
      </main>

      <footer className="lux-footer">
        Golden Lotus Labs &nbsp;·&nbsp; <a href="https://www.goldenlotuslabs.com">goldenlotuslabs.com</a>
      </footer>
    </div>
  );
}
