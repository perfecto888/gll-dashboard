import { LuxPage, LuxVideo } from "../lux";

export const metadata = { title: "NS100 Device Sales Position — Golden Lotus Labs" };

// Loom recording of the NS100 position overview (loom.com/share/<id>).
const LOOM_VIDEO_ID = "9168df4569d747818be833d736c0d8a8";
const CALENDLY_URL = "https://calendly.com/sharish/gll-job-interview-30-min-clone";

// Copy stays inside the NS100 practice deck's own framing: provider-directed, outcomes vary.
export default function Ns100ApplyPage() {
  return (
    <LuxPage sub="Join Our Team">
      <p className="lux-eyebrow">Now Hiring &nbsp;·&nbsp; Medical Device Sales</p>
      <h1 className="lux-title">
        Bring practices a new option for <em>diabetic nerve pain.</em>
      </h1>
      <div className="lux-rule" />
      <p className="lux-lead">
        NS100 is a temporary, provider-directed nerve stimulation protocol for painful diabetic
        neuropathy, placed and removed in the office over about 20 days. We&apos;re looking for a
        driven sales professional to introduce it to pain management, primary care, endocrinology
        and neurology practices. Watch the overview below to see what the role involves, who
        you&apos;d be calling on, and how compensation works.
      </p>

      <LuxVideo loomId={LOOM_VIDEO_ID} title="Golden Lotus Labs - NS100 Sales Position Overview" pending="Position overview video coming soon" />

      <div className="lux-points">
        <div className="lux-point">
          <div className="lux-point-num">01</div>
          <h3>A simple in-office protocol</h3>
          <p>Four small electrode arrays placed around the outer ear, worn for about 20 days, then removed by the practice.</p>
        </div>
        <div className="lux-point">
          <div className="lux-point-num">02</div>
          <h3>A clear patient population</h3>
          <p>Adults with painful diabetic neuropathy who still report meaningful pain despite prior care. The clinician decides who is suitable.</p>
        </div>
        <div className="lux-point">
          <div className="lux-point-num">03</div>
          <h3>Support behind every account</h3>
          <p>Benefits verification, staff training and billing coordination, so you open the door and the team helps the practice deliver.</p>
        </div>
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
    </LuxPage>
  );
}
