import { LuxPage, LuxVideo } from "../lux";

export const metadata = { title: "Medical Sales Masters — Pre-Interview Session" };

// Calendly redirects here after a candidate books (peptide and NS100 interviews).
// Loom recording of the webinar (loom.com/share/<id>).
const WEBINAR_LOOM_ID = "71e1d6b80faa451b8e69903891d110cc";
// Inner Circle application (Typeform E3nxrY86); the hidden "source" field records where applicants came from.
const INNER_CIRCLE_URL = "https://form.typeform.com/to/E3nxrY86#source=webinar";

export default function WebinarPage() {
  return (
    <LuxPage sub="Medical Sales Masters">
      <p className="lux-eyebrow">You&apos;re Booked &nbsp;·&nbsp; Pre-Interview Session</p>
      <h1 className="lux-title">
        Medical Sales <em>Masters</em>
      </h1>
      <p className="lux-tagline">The network for top-producing medical sales professionals.</p>
      <div className="lux-rule" />
      <p className="lux-lead">
        Your interview is confirmed, and a calendar invite is on its way. Before we talk, watch this
        free session. It covers how the best reps in this space find clinics, open conversations and
        build a book of business that lasts, so you arrive ready to get the most out of our time
        together.
      </p>

      <LuxVideo loomId={WEBINAR_LOOM_ID} title="Medical Sales Masters - Pre-Interview Session" pending="Webinar coming soon" />

      <section className="lux-card">
        <p className="lux-eyebrow">Application Only</p>
        <h2 className="lux-card-title">
          The <em>Inner Circle</em>
        </h2>
        <p>
          The Inner Circle is a small, application-only group for reps already producing $10k a
          month in medical or health sales who want help growing steadily toward $50k&ndash;$100k a
          month. Through hands-on coaching and proven systems, members get weekly strategy calls,
          deal reviews, shared playbooks and a network of people building the same kind of business.
        </p>
        <p className="lux-card-price">By application only</p>
        <a className="lux-cta" href={INNER_CIRCLE_URL} target="_blank" rel="noreferrer">
          Apply to the Inner Circle <span aria-hidden="true">→</span>
        </a>
        <p className="lux-fine">
          Optional. The Inner Circle is separate from our hiring process and has no effect on your
          interview. Acceptance and results are not guaranteed.
        </p>
      </section>
    </LuxPage>
  );
}
