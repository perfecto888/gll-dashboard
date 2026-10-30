import { LuxPage, LuxVideo } from "../lux";

export const metadata = { title: "QuantisPeptides Affiliate Program — Golden Lotus Labs" };

// Loom walkthrough of the affiliate program (loom.com/share/<id>); recorded at ~2.39:1, not Loom's usual frame.
const LOOM_VIDEO_ID = "a7d18819ce7c41a0916411d0a166cf10";
// Short application first (HR tab + Brevo list #29 + sheet), which then forwards to the Quantis signup.
const SIGNUP_URL = "/apply/affiliate/application";

// For sales applicants who aren't a fit for the B2B clinic role. Copy follows the
// "Quantis Affiliate Quick Start" deck, including its research-use-only and no-health-claims rules.
export default function QuantisAffiliatePage() {
  return (
    <LuxPage brand="QuantisPeptides × Golden Lotus Labs" sub="Affiliate Program" theme="quantis">
      <p className="lux-eyebrow">Affiliate Program &nbsp;·&nbsp; Quick Start</p>
      <h1 className="lux-title">
        Share a trusted research-peptide source. <em>Earn 10% on every confirmed sale.</em>
      </h1>
      <div className="lux-rule" />
      <p className="lux-lead">
        Our B2B clinic channel isn&apos;t the right fit today — but your network still is. The
        Golden Lotus Labs sales role sells to clinics and med spas. If that&apos;s not a match right
        now, the QuantisPeptides affiliate program lets you start earning with no quota, no cold
        calls and no clinic relationships needed. Watch the walkthrough below.
      </p>

      <LuxVideo loomId={LOOM_VIDEO_ID} aspect="1920 / 802" wide title="QuantisPeptides Affiliate Program Overview" pending="Program overview video coming soon" />

      <a className="lux-cta" href={SIGNUP_URL} style={{ marginBottom: 64 }}>
        Become an Affiliate <span aria-hidden="true">→</span>
      </a>

      <section className="lux-section">
        <h2 className="lux-section-title">What <em>QuantisPeptides</em> offers</h2>
        <div className="lux-points lux-cols-2 lux-flush">
          <div className="lux-point"><h3>99% purity</h3><p>HPLC-verified on every compound.</p></div>
          <div className="lux-point"><h3>COA every batch</h3><p>Independent third-party testing, tied to batch numbers.</p></div>
          <div className="lux-point"><h3>Discreet shipping</h3><p>Plain, unmarked packaging.</p></div>
          <div className="lux-point"><h3>Backed by GLL</h3><p>Fulfilled through Golden Lotus Labs.</p></div>
        </div>
      </section>

      <section className="lux-section">
        <h2 className="lux-section-title">Four steps to your <em>first commission</em></h2>
        <div className="lux-points lux-cols-4 lux-flush">
          <div className="lux-point"><div className="lux-point-num">01</div><h3>Apply</h3><p>Fill out the short form on the affiliate signup page.</p></div>
          <div className="lux-point"><div className="lux-point-num">02</div><h3>Get approved</h3><p>We review and email your dashboard link.</p></div>
          <div className="lux-point"><div className="lux-point-num">03</div><h3>Grab your link</h3><p>Copy your unique referral link from the dashboard.</p></div>
          <div className="lux-point"><div className="lux-point-num">04</div><h3>Share &amp; earn</h3><p>Share it and track sales in real time.</p></div>
        </div>
      </section>

      <section className="lux-section">
        <div className="lux-stat">
          <div className="lux-stat-num">10%</div>
          <div>
            <h3>of every confirmed sale through your link</h3>
            <p>Referrals are tracked for 30 days, and your dashboard shows every sale in real time.</p>
          </div>
        </div>
      </section>

      <section className="lux-section">
        <h2 className="lux-section-title">Who to <em>share it with</em></h2>
        <div className="lux-points lux-flush">
          <div className="lux-point"><h3>Your network</h3><p>Researchers, lab professionals and wellness-industry contacts looking for a verified source.</p></div>
          <div className="lux-point"><h3>Your audience</h3><p>Followers on social, newsletters, communities and groups you already run.</p></div>
          <div className="lux-point"><h3>Friends &amp; family</h3><p>Anyone who values purity, COAs and a source they can trust.</p></div>
        </div>
        <p className="lux-note">The pitch is simple: verified purity, a COA on every batch, a source you&apos;d personally vouch for.</p>
      </section>

      <section className="lux-section">
        <h2 className="lux-section-title">The rules that <em>keep your link active</em></h2>
        <div className="lux-rules">
          <div className="lux-rule-item"><strong>Research use only.</strong> Never suggest products are for human or animal use.</div>
          <div className="lux-rule-item"><strong>No health claims.</strong> Don&apos;t say a product treats, cures or improves anything.</div>
          <div className="lux-rule-item"><strong>Disclose the link.</strong> Say you earn a commission (FTC rule), e.g. #affiliate.</div>
          <div className="lux-rule-item"><strong>Adults only.</strong> No promotion to anyone under 18; no spam or paid ads on our brand name.</div>
        </div>
      </section>

      <div className="lux-message">
        <p className="lux-signoff">Ready? Apply in two minutes.</p>
      </div>

      <a className="lux-cta" href={SIGNUP_URL}>
        Become an Affiliate <span aria-hidden="true">→</span>
      </a>

      <p className="lux-note" style={{ maxWidth: 560 }}>
        Questions? Message us on WhatsApp from{" "}
        <a href="https://quantispeptides.com" style={{ color: "var(--lux-gold)" }}>quantispeptides.com</a>. Products are
        for in-vitro research use only.
      </p>
    </LuxPage>
  );
}
