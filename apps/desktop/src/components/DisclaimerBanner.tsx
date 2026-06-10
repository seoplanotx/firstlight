type DisclaimerBannerProps = {
  disclaimer?: string;
};

const defaultDisclaimer =
  'Firstlight is an information monitoring and summarization tool. It does not determine treatment, trial eligibility, or medical appropriateness. All findings should be reviewed with a licensed oncology team.';

export function DisclaimerBanner({ disclaimer = defaultDisclaimer }: DisclaimerBannerProps) {
  return (
    <div className="disclaimer-banner">
      <div className="disclaimer-banner-label">For clinician review</div>
      <p>{disclaimer}</p>
    </div>
  );
}
