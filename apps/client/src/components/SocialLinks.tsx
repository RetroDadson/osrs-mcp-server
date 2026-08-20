export function SocialLinks(): React.JSX.Element {
  return (
    <div className="social-links">
      <a href="https://ko-fi.com/retrodadson" title="Donate" target="_blank" rel="noreferrer">
        <img loading="lazy" src="/images/kofi_p_logo_nolabel.webp" height={20} alt="Donate" />
      </a>
      <a href="https://github.com/RetroDadson/osrs-mcp-tracker-plugin" title="GitHub" target="_blank" rel="noreferrer">
        <img loading="lazy" src="/images/github-light.webp" width={20} height={20} alt="GitHub" />
      </a>
    </div>
  );
}
