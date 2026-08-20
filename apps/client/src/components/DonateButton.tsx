import { MenButton } from './MenButton.js';

export function DonateButton(): React.JSX.Element {
  return (
    <a href="https://ko-fi.com/retrodadson" target="_blank" rel="noreferrer">
      <MenButton>
        <img loading="lazy" src="/images/kofi-logo.webp" height={20} width={20} alt="" />
        <span>Support</span>
      </MenButton>
    </a>
  );
}
