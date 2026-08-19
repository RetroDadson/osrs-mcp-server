export function SocialLinks(): React.JSX.Element {
  return (
    <div className="social-links">
      {/* TODO: replace with the real donation link once set up (Ko-fi/PayPal/GitHub Sponsors/etc.) */}
      <a href="#" title="Donate (link coming soon)" target="_blank" rel="noreferrer">
        <img loading="lazy" src="/images/kofi_p_logo_nolabel.webp" height={20} alt="Donate" />
      </a>
      <a href="https://github.com/RetroDadson/osrs-mcp-tracker-plugin" title="GitHub" target="_blank" rel="noreferrer">
        <img loading="lazy" src="/images/github-light.webp" width={20} height={20} alt="GitHub" />
      </a>
    </div>
  );
}
