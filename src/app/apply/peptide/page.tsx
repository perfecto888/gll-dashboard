export const metadata = { title: "Peptide Sales Position — Golden Lotus Labs" };

const YOUTUBE_VIDEO_ID = "fG9gfJU6y1c";
const CALENDLY_URL = "https://calendly.com/sharish/gl-jobinterview-30min";

export default function PeptideApplyPage() {
  return (
    <div className="apply-page">
      <div className="apply-wrap apply-wrap-wide">
        <div className="apply-brand">
          <span className="brand-mark">◬</span>
          <div>
            <div className="brand-name">GOLDEN LOTUS LABS</div>
            <div className="brand-sub">JOIN OUR TEAM</div>
          </div>
        </div>

        <p className="apply-eyebrow">Now Hiring — Peptide Sales</p>
        <h1>Sell products clinics are actively asking for.</h1>
        <p className="apply-lead">
          Golden Lotus Labs is a peptide manufacturer that follows FDA guidelines, trusted by med
          spas, metabolic clinics, and functional medicine practices nationwide. We&apos;re looking for a
          driven sales professional to grow our peptide book of business. Watch the two-minute
          overview below to see exactly what the role involves, who you&apos;d be selling to, and
          how compensation works.
        </p>

        <div className="apply-video apply-video-lg">
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=0&modestbranding=1`}
            title="Golden Lotus Labs - Peptide Sales Position Overview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ border: "none" }}
          />
        </div>

        <div className="apply-message">
          <p>
            If this sounds like the right fit, the next step is a quick conversation — no
            application form, no waiting. Grab a time below that works for you and we&apos;ll walk
            through the role, answer your questions, and talk about what you&apos;d bring to the team.
          </p>
          <p>We look forward to meeting you.</p>
        </div>

        <a className="apply-cta" href={CALENDLY_URL} target="_blank" rel="noreferrer">
          Book Your Interview →
        </a>
      </div>
    </div>
  );
}
