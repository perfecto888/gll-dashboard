export const metadata = { title: "Join Golden Lotus Labs" };

const YOUTUBE_VIDEO_ID = "_c1k-BqMz3c";
const CALENDLY_URL = "https://calendly.com/sharish/gl-jobinterview-30min";

export default function ApplyPage() {
  return (
    <div className="apply-page">
      <div className="apply-wrap">
        <div className="apply-brand">
          <span className="brand-mark">◬</span>
          <div>
            <div className="brand-name">GOLDEN LOTUS LABS</div>
            <div className="brand-sub">JOIN OUR TEAM</div>
          </div>
        </div>

        <h1>See what the role is really about</h1>
        <p className="apply-lead">
          Watch the short overview below to understand the position, what you&apos;d be doing,
          and what we&apos;re looking for.
        </p>

        <div className="apply-video">
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=0&modestbranding=1`}
            title="Golden Lotus Labs Position Overview"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        <div className="apply-message">
          <p>
            If what you just watched sounds like a fit, we&apos;d love to talk. Book a 30-minute
            call directly on our calendar below — pick whatever time works best for you.
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
