import { LuxPage } from "../../lux";
import ApplicationForm from "./ApplicationForm";

export const metadata = { title: "Affiliate Application — QuantisPeptides × Golden Lotus Labs" };

// Step between /apply/affiliate and the Quantis signup: answers go to the HR tab, Brevo list #29 and the
// "GLL - Quantis Affiliate Applications" sheet (see /api/hr/affiliate-apply).
export default function AffiliateApplicationPage() {
  return (
    <LuxPage brand="QuantisPeptides × Golden Lotus Labs" sub="Affiliate Application" theme="quantis">
      <p className="lux-eyebrow">Step 1 of 2 &nbsp;·&nbsp; Two minutes</p>
      <h1 className="lux-title">Tell us how you&apos;ll <em>share.</em></h1>
      <div className="lux-rule" />
      <p className="lux-lead">
        A few quick questions so we know where your link will go. When you submit, we&apos;ll take you
        straight to the QuantisPeptides affiliate signup to create your account.
      </p>
      <ApplicationForm />
    </LuxPage>
  );
}
