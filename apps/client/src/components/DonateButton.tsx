import { MenButton } from './MenButton.js';

export function DonateButton(): React.JSX.Element {
  return (
    <a href="https://ko-fi.com/retrodadson" target="_blank" rel="noreferrer">
      <MenButton>
        <img loading="lazy" src="/images/kofi_p_logo_nolabel.webp" height={20} width={30} alt="" />
        <span>Support</span>
      </MenButton>
    </a>
  );
}
